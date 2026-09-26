"""Restoring sets and attempts from the browser's copy after a server restart (M4)."""

import uuid
from dataclasses import replace

from fastapi.testclient import TestClient

from prepflip.config import Settings
from prepflip.main import create_app

from .conftest import login
from .test_attempts_api import answer, make_set, start


def restart(client: TestClient) -> None:
    """Simulate a server restart, then log in again as the student would."""
    assert client.post("/api/test/restart").status_code == 204
    assert client.get("/api/auth/me").status_code == 401
    assert login(client).status_code == 200


def put_copy(client: TestClient, copy: dict):
    return client.put(f"/api/attempts/{copy['id']}", json=copy)


def test_restore_after_restart(settings: Settings) -> None:
    client = TestClient(create_app(replace(settings, test_endpoints=True)))
    login(client)
    set_id = make_set(client)
    saved_set = client.get(f"/api/sets/{set_id}").json()
    attempt = start(client, set_id).json()
    answer(client, attempt["id"], {"q1": {"choice": 1, "visited": True}})
    # The browser's copy is a little ahead of the server: Q2 was answered after the last sync.
    copy = {**attempt, "responses": {"q1": {"choice": 1, "visited": True}, "q2": {"choice": 0, "visited": True}}}

    restart(client)
    assert client.get("/api/sets").json() == []
    assert client.get(f"/api/attempts/{attempt['id']}").status_code == 404

    assert client.put(f"/api/sets/{set_id}", json=saved_set).status_code == 200
    res = put_copy(client, copy)
    assert res.status_code == 200, res.text
    restored = client.get(f"/api/attempts/{attempt['id']}").json()
    assert restored["status"] == "in_progress"
    assert restored["order"] == attempt["order"]
    assert restored["started_at"] == attempt["started_at"]
    assert {qid: r["choice"] for qid, r in restored["responses"].items()} == {"q1": 1, "q2": 0}
    # And practice carries on as normal.
    done = client.post(f"/api/attempts/{attempt['id']}/submit").json()
    assert (done["result"]["correct"], done["result"]["wrong"], done["result"]["skipped"]) == (1, 1, 1)


def test_restart_endpoint_is_off_by_default(client: TestClient) -> None:
    assert client.post("/api/test/restart").status_code == 404


def test_put_is_safe_to_repeat(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    copy = {**attempt, "responses": {"q1": {"choice": 1, "visited": True}}}
    first = put_copy(asha, copy).json()
    second = put_copy(asha, copy).json()
    assert first["responses"] == second["responses"] == {"q1": {"choice": 1, "marked": False, "visited": True}}
    assert len(asha.get("/api/attempts").json()) == 1


def test_a_stale_copy_cannot_change_or_erase_a_practice_answer(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    answer(asha, attempt["id"], {"q1": {"choice": 0, "visited": True}, "q2": {"choice": 2, "visited": True}})
    # An old copy from another tab: a different Q1 answer, no Q2 answer, and a new Q3 answer.
    stale = {**attempt, "responses": {"q1": {"choice": 1, "visited": True}, "q3": {"choice": 1, "visited": True}}}
    merged = put_copy(asha, stale).json()["responses"]
    assert {qid: r["choice"] for qid, r in merged.items()} == {"q1": 0, "q2": 2, "q3": 1}


def test_existing_attempt_keeps_the_servers_questions(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    tampered = {**attempt, "order": list(reversed(attempt["order"])), "questions": [{**q, "answer_index": 0} for q in attempt["questions"]]}
    restored = put_copy(asha, tampered).json()
    assert restored["order"] == attempt["order"]
    assert restored["questions"] == attempt["questions"]


def test_a_submitted_copy_is_scored_by_the_server(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    asha.post(f"/api/attempts/{attempt['id']}/submit")
    result = asha.get(f"/api/attempts/{attempt['id']}").json()

    # A copy the server doesn't have (a new id stands in for one lost in a restart).
    missing = {
        **result, "id": str(uuid.uuid4()),
        "responses": {"q1": {"choice": 1}, "q2": {"choice": 0}},
        # A forged result is ignored.
        "result": {"correct": 3, "wrong": 0, "skipped": 0, "per_question": []},
    }
    restored = put_copy(asha, missing).json()
    assert restored["status"] == "submitted"
    assert restored["submitted_at"] == result["submitted_at"]
    assert (restored["result"]["correct"], restored["result"]["wrong"], restored["result"]["skipped"]) == (1, 1, 1)


def test_submitting_an_in_progress_attempt_via_put(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    copy = {**attempt, "status": "submitted", "responses": {"q1": {"choice": 1}}}
    restored = put_copy(asha, copy).json()
    assert restored["status"] == "submitted"
    assert restored["result"]["correct"] == 1


def test_a_submitted_attempt_is_never_reopened(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    done = asha.post(f"/api/attempts/{attempt['id']}/submit").json()
    reopened = put_copy(asha, {**attempt, "responses": {"q1": {"choice": 1}}}).json()
    assert reopened == done


def test_invalid_copies_are_rejected(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    fresh = {**attempt, "id": str(uuid.uuid4())}
    bad_order = {**fresh, "order": ["q1", "q1", "q2"]}
    assert put_copy(asha, bad_order).status_code == 422
    bad_choice = {**fresh, "responses": {"q3": {"choice": 5}}}
    assert put_copy(asha, bad_choice).status_code == 422
    unknown = {**fresh, "responses": {"nope": {"choice": 0}}}
    assert put_copy(asha, unknown).status_code == 422
    no_questions = {**fresh, "questions": [], "order": []}
    assert put_copy(asha, no_questions).status_code == 422
    exam = {**fresh, "mode": "exam"}
    assert put_copy(asha, exam).status_code == 422
    assert asha.put("/api/attempts/not-a-uuid", json=fresh).status_code == 422


def test_user_a_cannot_overwrite_user_bs_attempt(client: TestClient) -> None:
    login(client, "ravi")
    ravis = start(client, make_set(client)).json()
    client.post("/api/auth/logout")
    login(client, "asha")
    assert put_copy(client, {**ravis, "responses": {"q1": {"choice": 0}}}).status_code == 404
    client.post("/api/auth/logout")
    login(client, "ravi")
    assert client.get(f"/api/attempts/{ravis['id']}").json()["responses"] == {}


def test_restoring_needs_a_session(client: TestClient) -> None:
    assert client.put(f"/api/attempts/{uuid.uuid4()}", json={}).status_code == 401
