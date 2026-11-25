"""Health, errors and the shared kits."""


def test_health(client):
    r = client.get("/api/health")
    assert r.status_code == 200 and r.json()["status"] == "ok"


def test_ai_status_endpoint_exists_and_says_not_configured(client, monkeypatch):
    monkeypatch.delenv("AI_ENDPOINTS", raising=False)
    r = client.get("/api/ai/status")
    assert r.status_code == 200 and r.json() == {"configured": False, "online": False}


def test_invalid_request_uses_the_standard_error_shape(client):
    r = client.post("/api/feed/curate", json={"article": {"title": "no url"}})
    assert r.status_code == 422 and r.json()["error"]["code"] == "invalid_request"


def test_signed_in_user_id_comes_from_the_studio_session(monkeypatch):
    """The API knows whose data to sync from the Studio Accounts token (verified by the kit)."""
    from distill import app as app_mod
    from distill import studio_auth
    from starlette.requests import Request

    monkeypatch.setattr(studio_auth, "_verify", lambda token: {"sub": "u_42"} if token == "good" else None)
    req = Request({"type": "http", "headers": [(b"cookie", b"studio_session=good")]})
    assert app_mod.get_user_id(req) == "u_42"
    assert app_mod.get_user_id(Request({"type": "http", "headers": []})) is None
