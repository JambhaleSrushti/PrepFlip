import uuid

import pytest
from fastapi.testclient import TestClient

from .conftest import login

SAMPLE = """1. Which organelle is known as the powerhouse of the cell?
(A) Nucleus
(B) Mitochondria
(C) Ribosome
(D) Golgi body
Answer: B

2. The SI unit of electric charge is
(1) Volt (2) Ampere (3) Coulomb (4) Ohm
Answer: 3

4. Which of the following is a noble gas?
(A) Nitrogen
(B) Argon
(C) Oxygen"""


def import_sample(client: TestClient, **extra) -> dict:
    res = client.post("/api/imports/text", json={"text": SAMPLE, **extra})
    assert res.status_code == 201, res.text
    return res.json()


def issue_codes(qs: dict) -> list[list[str]]:
    return [[i["code"] for i in q["issues"]] for q in qs["questions"]]


def save(client: TestClient, qs: dict):
    return client.put(f"/api/sets/{qs['id']}", json={"title": qs["title"], "questions": qs["questions"]})


# ---------- Text import ----------


def test_text_import_creates_a_flagged_draft(asha: TestClient) -> None:
    qs = import_sample(asha, title="Biology mock 1")
    assert qs["title"] == "Biology mock 1"
    assert qs["status"] == "draft"
    assert qs["source"]["kind"] == "text"
    assert [q["printed_number"] for q in qs["questions"]] == [1, 2, 4]
    assert [q["answer_index"] for q in qs["questions"]] == [1, 2, None]
    assert issue_codes(qs) == [[], [], ["MISSING_ANSWER", "NUMBERING_GAP"]]


def test_text_import_with_answer_key(asha: TestClient) -> None:
    qs = import_sample(asha, answer_key="4-2")
    assert qs["questions"][2]["answer_index"] == 1
    assert qs["questions"][2]["answer_source"] == "paper_key"


def test_text_import_gets_a_default_title(asha: TestClient) -> None:
    assert import_sample(asha)["title"].startswith("Pasted questions, ")


def test_text_with_no_questions_is_rejected(asha: TestClient) -> None:
    res = asha.post("/api/imports/text", json={"text": "   \n  "})
    assert res.status_code == 422


# ---------- The M2 journey: paste, fix the flags, save, reload ----------


def test_fix_flags_save_and_reload(asha: TestClient) -> None:
    qs = import_sample(asha)
    noble_gas = qs["questions"][2]
    noble_gas["answer_index"] = 1  # Argon
    noble_gas["acknowledged"] = ["NUMBERING_GAP"]  # "I've checked it": Q3 isn't in this paper

    saved = save(asha, qs)
    assert saved.status_code == 200, saved.text
    assert saved.json()["status"] == "ready"
    assert saved.json()["questions"][2]["answer_source"] == "student"

    reloaded = asha.get(f"/api/sets/{qs['id']}").json()
    assert reloaded == saved.json()
    assert asha.get("/api/sets").json()[0] | {"updated_at": None} == {
        "id": qs["id"], "title": qs["title"], "status": "ready", "question_count": 3,
        "flagged_count": 0, "source_kind": "text", "updated_at": None,
    }


def test_removing_the_flagged_question_also_makes_it_ready(asha: TestClient) -> None:
    qs = import_sample(asha)
    qs["questions"] = qs["questions"][:2]
    assert save(asha, qs).json()["status"] == "ready"


def test_editing_a_ready_set_can_flag_it_again(asha: TestClient) -> None:
    qs = import_sample(asha)
    qs["questions"] = qs["questions"][:2]
    qs = save(asha, qs).json()
    qs["questions"][0]["options"][1] = ""
    saved = save(asha, qs).json()
    assert saved["status"] == "draft"
    assert issue_codes(saved)[0] == ["EMPTY_OPTION"]


def test_save_keeps_created_at_and_source(asha: TestClient) -> None:
    qs = import_sample(asha)
    saved = asha.put(f"/api/sets/{qs['id']}", json={
        "title": "Renamed", "questions": qs["questions"], "source": {"kind": "pdf", "filename": "sneaky.pdf"},
    }).json()
    assert saved["title"] == "Renamed"
    assert saved["created_at"] == qs["created_at"]
    assert saved["source"] == qs["source"]


def test_put_creates_a_set_with_a_browser_chosen_id(asha: TestClient) -> None:
    """How sets are restored from the browser after a server restart. Repeating it is harmless."""
    set_id = str(uuid.uuid4())
    body = {"title": "Restored", "questions": [
        {"id": "a", "text": "2 + 2?", "options": ["3", "4"], "answer_index": 1, "answer_source": "paper_key"},
    ]}
    first = asha.put(f"/api/sets/{set_id}", json=body)
    second = asha.put(f"/api/sets/{set_id}", json=body)
    assert first.status_code == second.status_code == 200
    assert second.json()["status"] == "ready"
    assert second.json()["created_at"] == first.json()["created_at"]
    assert len(asha.get("/api/sets").json()) == 1


def test_list_is_newest_first(asha: TestClient) -> None:
    first = import_sample(asha, title="first")
    import_sample(asha, title="second")
    save(asha, first)
    assert [s["title"] for s in asha.get("/api/sets").json()] == ["first", "second"]


def test_delete(asha: TestClient) -> None:
    qs = import_sample(asha)
    assert asha.delete(f"/api/sets/{qs['id']}").status_code == 204
    assert asha.get(f"/api/sets/{qs['id']}").status_code == 404
    assert asha.get("/api/sets").json() == []


# ---------- Input validation ----------


def test_answer_outside_the_options_is_rejected(asha: TestClient) -> None:
    qs = import_sample(asha)
    qs["questions"][0]["answer_index"] = 9
    assert save(asha, qs).status_code == 422


def test_duplicate_question_ids_are_rejected(asha: TestClient) -> None:
    qs = import_sample(asha)
    qs["questions"][1]["id"] = qs["questions"][0]["id"]
    assert save(asha, qs).status_code == 422


def test_set_id_must_be_a_uuid(asha: TestClient) -> None:
    assert asha.get("/api/sets/not-a-uuid").status_code == 422


# ---------- Answer-key paste ----------


def test_answer_key_endpoint_matches_printed_numbers_and_reports_leftovers(asha: TestClient) -> None:
    qs = import_sample(asha)
    res = asha.post(f"/api/sets/{qs['id']}/answer-key", json={"text": "1-1, 4-2, 3-1, 2-9"})
    assert res.status_code == 200
    body = res.json()
    assert (body["applied"], body["unmatched"], body["invalid"]) == (2, [3], [])
    assert [q["answer_index"] for q in body["set"]["questions"]] == [0, 2, 1]
    assert asha.get(f"/api/sets/{qs['id']}").json() == body["set"]


# ---------- Ownership ----------


@pytest.fixture
def ravis_set(client: TestClient) -> dict:
    login(client, "ravi")
    qs = import_sample(client)
    client.post("/api/auth/logout")
    login(client, "asha")
    return qs


def test_user_a_gets_404_for_user_bs_set(asha: TestClient, ravis_set: dict) -> None:
    url = f"/api/sets/{ravis_set['id']}"
    missing = f"/api/sets/{uuid.uuid4()}"
    assert asha.get(url).status_code == asha.get(missing).status_code == 404
    assert asha.get(url).json() == asha.get(missing).json()
    assert asha.delete(url).status_code == 404
    assert asha.post(f"{url}/answer-key", json={"text": "1-1"}).status_code == 404
    assert save(asha, ravis_set).status_code == 404  # can't overwrite it either
    assert asha.get("/api/sets").json() == []


def test_sets_need_a_session(client: TestClient) -> None:
    assert client.get("/api/sets").status_code == 401
    assert client.post("/api/imports/text", json={"text": SAMPLE}).status_code == 401
