import uuid

import pytest
from fastapi.testclient import TestClient

from .conftest import login

READY_SET = [
    {"id": "q1", "printed_number": 1, "text": "Powerhouse of the cell?", "options": ["Nucleus", "Mitochondria", "Ribosome"], "answer_index": 1},
    {"id": "q2", "printed_number": 2, "text": "SI unit of charge?", "options": ["Volt", "Ampere", "Coulomb"], "answer_index": 2},
    {"id": "q3", "printed_number": 3, "text": "A noble gas?", "options": ["Nitrogen", "Argon"], "answer_index": 1},
]


def make_set(client: TestClient, questions: list[dict] = READY_SET) -> str:
    set_id = str(uuid.uuid4())
    res = client.put(f"/api/sets/{set_id}", json={"title": "Mock 1", "questions": questions})
    assert res.status_code == 200, res.text
    return set_id


def start(client: TestClient, set_id: str, **extra):
    return client.post("/api/attempts", json={"set_id": set_id, "mode": "practice", **extra})


def answer(client: TestClient, attempt_id: str, responses: dict):
    return client.put(f"/api/attempts/{attempt_id}/responses", json={"responses": responses})


def test_practice_journey(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    assert attempt["status"] == "in_progress"
    assert attempt["order"] == ["q1", "q2", "q3"]
    # Practice mode shows feedback straight away, so answers are included.
    assert [q["answer_index"] for q in attempt["questions"]] == [1, 2, 1]

    res = answer(asha, attempt["id"], {"q1": {"choice": 1, "visited": True}, "q2": {"choice": 0, "visited": True}})
    assert res.status_code == 200

    done = asha.post(f"/api/attempts/{attempt['id']}/submit").json()
    assert done["status"] == "submitted"
    result = done["result"]
    assert (result["correct"], result["wrong"], result["skipped"]) == (1, 1, 1)
    assert [p["outcome"] for p in result["per_question"]] == ["correct", "wrong", "skipped"]
    assert asha.get(f"/api/attempts/{attempt['id']}").json() == done


def test_shuffled_attempt_with_seed(asha: TestClient) -> None:
    set_id = make_set(asha)
    first = start(asha, set_id, order="shuffle", seed=3).json()
    second = start(asha, set_id, order="shuffle", seed=3).json()
    assert first["order"] == second["order"]
    assert sorted(first["order"]) == ["q1", "q2", "q3"]
    assert first["order"] != ["q1", "q2", "q3"]


def test_answer_cannot_be_changed_in_practice_mode(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    assert answer(asha, attempt["id"], {"q1": {"choice": 0}}).status_code == 200
    res = answer(asha, attempt["id"], {"q1": {"choice": 1}})
    assert res.status_code == 409
    assert "can't be changed" in res.json()["detail"]
    assert asha.get(f"/api/attempts/{attempt['id']}").json()["responses"]["q1"]["choice"] == 0


def test_draft_set_cannot_be_started(asha: TestClient) -> None:
    draft = make_set(asha, [{**READY_SET[0], "answer_index": None}])
    res = start(asha, draft)
    assert res.status_code == 409
    assert "flagged" in res.json()["detail"]


def test_exam_mode_is_not_available_yet(asha: TestClient) -> None:
    assert start(asha, make_set(asha), mode="exam").status_code == 422


def test_editing_the_set_later_does_not_change_the_attempt(asha: TestClient) -> None:
    set_id = make_set(asha)
    attempt = start(asha, set_id).json()
    make_questions = [{**q, "text": "changed"} for q in READY_SET]
    asha.put(f"/api/sets/{set_id}", json={"title": "Mock 1", "questions": make_questions})
    assert asha.get(f"/api/attempts/{attempt['id']}").json()["questions"][0]["text"] == "Powerhouse of the cell?"


def test_list_in_progress_and_submitted(asha: TestClient) -> None:
    set_id = make_set(asha)
    open_attempt = start(asha, set_id).json()
    answer(asha, open_attempt["id"], {"q1": {"choice": 1}})
    finished = start(asha, set_id).json()
    asha.post(f"/api/attempts/{finished['id']}/submit")

    in_progress = asha.get("/api/attempts", params={"status": "in_progress"}).json()
    assert [(a["id"], a["answered_count"], a["question_count"], a["set_title"]) for a in in_progress] == [
        (open_attempt["id"], 1, 3, "Mock 1"),
    ]
    submitted = asha.get("/api/attempts", params={"status": "submitted"}).json()
    assert [(a["id"], a["correct"]) for a in submitted] == [(finished["id"], 0)]
    assert len(asha.get("/api/attempts").json()) == 2


def test_submit_twice_gives_the_same_result(asha: TestClient) -> None:
    attempt = start(asha, make_set(asha)).json()
    first = asha.post(f"/api/attempts/{attempt['id']}/submit").json()
    assert asha.post(f"/api/attempts/{attempt['id']}/submit").json() == first
    assert answer(asha, attempt["id"], {"q1": {"choice": 1}}).status_code == 409


@pytest.fixture
def ravis_attempt(client: TestClient) -> dict:
    login(client, "ravi")
    attempt = start(client, make_set(client)).json()
    client.post("/api/auth/logout")
    login(client, "asha")
    return attempt


def test_user_a_gets_404_for_user_bs_attempt_and_set(asha: TestClient, ravis_attempt: dict) -> None:
    aid = ravis_attempt["id"]
    assert asha.get(f"/api/attempts/{aid}").status_code == 404
    assert answer(asha, aid, {"q1": {"choice": 1}}).status_code == 404
    assert asha.post(f"/api/attempts/{aid}/submit").status_code == 404
    assert start(asha, ravis_attempt["set_id"]).status_code == 404
    assert asha.get("/api/attempts").json() == []


def test_attempts_need_a_session(client: TestClient) -> None:
    assert client.get("/api/attempts").status_code == 401
