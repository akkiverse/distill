"""US-1: Choose topics (server side; the screen is tested in src/*.test.tsx)."""

from conftest import NOW, iso


def test_ac_1_1_offers_at_least_ten_sections(client):
    """AC-1.1: at least 10 sections are offered, including the twelve the spec names."""
    r = client.get("/api/sections")
    assert r.status_code == 200
    names = [s["name"] for s in r.json()]
    assert len(names) >= 10
    for expected in [
        "World",
        "India",
        "Business",
        "Finance",
        "Technology",
        "Science",
        "Health",
        "Sports",
        "Entertainment",
        "Politics",
        "Environment",
        "Education",
    ]:
        assert expected in names


def test_ac_1_2_topics_saved_to_account_and_read_back(client, env):
    """AC-1.2: Finance + Sports with "gold rate" are saved to the account and come back on another load."""
    state = {"topics": {"sections": ["finance", "sports"], "keywords": ["gold rate"], "updated_at": iso(NOW)}, "cards": [], "settings": {}}
    r = client.put("/api/me/state", json=state)
    assert r.status_code == 200
    again = client.get("/api/me/state").json()["state"]["topics"]
    assert again["sections"] == ["finance", "sports"]
    assert again["keywords"] == ["gold rate"]


def test_ac_1_3_refresh_without_sections_is_refused(client):
    """AC-1.3: with no section chosen nothing is fetched and the answer says to pick one."""
    r = client.post("/api/feed/refresh", json={"sections": ["not-a-section"], "keywords": []})
    assert r.status_code == 422
    assert r.json()["error"]["message"] == "Pick at least one section."
    assert client.post("/api/feed/refresh", json={"sections": [], "keywords": []}).status_code == 422
