from pathlib import Path

from fastapi.testclient import TestClient

from prepflip.config import Settings
from prepflip.main import create_app


def test_health(client: TestClient) -> None:
    res = client.get("/api/health")
    assert res.status_code == 200
    assert res.json() == {"status": "ok"}


def test_config_reports_ai_off(asha: TestClient) -> None:
    assert asha.get("/api/config").json()["ai_enabled"] is False


def test_unknown_api_path_is_json_404_not_the_spa(client: TestClient) -> None:
    res = client.get("/api/nope")
    assert res.status_code == 404
    assert res.headers["content-type"].startswith("application/json")


def test_serves_built_spa_with_client_side_route_fallback(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    (dist / "assets").mkdir(parents=True)
    (dist / "index.html").write_text("<div id=root></div>")
    (dist / "assets" / "app.js").write_text("console.log('hi')")
    client = TestClient(create_app(Settings(users_file=tmp_path / "u.json", static_dir=dist)))

    assert client.get("/").text == "<div id=root></div>"
    assert client.get("/sets/123").text == "<div id=root></div>"  # React Router path
    assert "console.log" in client.get("/assets/app.js").text


def test_spa_does_not_serve_files_outside_the_build(tmp_path: Path) -> None:
    dist = tmp_path / "dist"
    dist.mkdir()
    (dist / "index.html").write_text("index")
    (tmp_path / "secret.txt").write_text("secret")
    client = TestClient(create_app(Settings(users_file=tmp_path / "u.json", static_dir=dist)))

    assert "secret" not in client.get("/../secret.txt").text
    assert "secret" not in client.get("/%2e%2e/secret.txt").text


def test_missing_build_gives_helpful_404(client: TestClient) -> None:
    res = client.get("/")
    assert res.status_code == 404
    assert "npm run build" in res.json()["detail"]
