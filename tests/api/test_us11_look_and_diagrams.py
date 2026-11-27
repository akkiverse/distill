"""US-11 (CR-0008): the theme choice in the account, and the AI's cover theme and diagram."""

from conftest import NOW, MockCurator, article, iso
from distill import prompts
from distill.models import Card, UserState
from distill.rules import merge_states
from distill.visuals import checked_cover, checked_visual

GOLD = article(
    1, "Gold rate climbs to a record 74,100 per 10 g", snippet="It was 72,300 last week; 73,050 on Monday and 73,600 on Wednesday."
)


def verdict(**extra) -> dict:
    return {"relevance": 0.9, "summary": "Gold rose.", "key_points": ["a", "b"], "key_figures": [], "story_key": "gold", **extra}


def curate(client, env, **extra) -> dict:
    env.curator = MockCurator(verdicts={GOLD.id: verdict(**extra)})
    return client.post("/api/feed/curate", json={"article": GOLD.model_dump()}).json()["card"]


# ---------- AC-11.3: the theme chosen last wins ----------


def state(theme: str, changed: str | None) -> UserState:
    settings = {"last_refreshed_at": None, "theme": theme}
    if changed is not None:
        settings["theme_changed_at"] = changed
    return UserState.model_validate({"settings": settings})


def test_ac_11_3_the_theme_chosen_last_wins():
    """AC-11.3: two devices with different theme choices: the newer choice is kept, whichever device syncs last."""
    older, newer = state("light", "2026-11-27T01:00:00Z"), state("dark", "2026-11-27T02:00:00Z")
    assert merge_states(older, newer, NOW).settings.theme == "dark"
    kept = merge_states(newer, older, NOW).settings
    assert kept.theme == "dark" and kept.theme_changed_at == "2026-11-27T02:00:00Z"


def test_ac_11_3_a_v0_5_1_device_cannot_overwrite_a_newer_choice():
    """AC-11.3: a device on v0.5.1 sends no theme time, so it never flips a choice made on v0.6.0 back."""
    chosen = state("dark", "2026-11-27T02:00:00Z")
    from_old_device = state("system", None)
    assert merge_states(chosen, from_old_device, NOW).settings.theme == "dark"
    # Before anyone chose on v0.6.0 (no times on either side), the incoming copy wins as it did in v0.5.1.
    assert merge_states(state("light", None), state("dark", None), NOW).settings.theme == "dark"


def test_ac_11_1_the_choice_is_kept_in_the_account(client, env):
    """AC-11.1, AC-11.3: a theme saved through /api/me/state comes back on the next read, and an older device can't undo it."""
    put = {"topics": {}, "cards": [], "settings": {"theme": "dark", "theme_changed_at": iso(NOW)}}
    assert client.put("/api/me/state", json=put).status_code == 200
    old = client.put("/api/me/state", json={"topics": {}, "cards": [], "settings": {"theme": "system"}}).json()["state"]
    assert old["settings"]["theme"] == "dark"
    assert client.get("/api/me/state").json()["state"]["settings"]["theme"] == "dark"


# ---------- AC-11.4: the AI's cover theme ----------


def test_ac_11_4_cover_theme_from_the_ai(client, env):
    """AC-11.4: a 2 to 5 word theme is kept on the card."""
    assert curate(client, env, cover="Gold hits a new high")["cover"] == "Gold hits a new high"


def test_ac_11_4_cover_theme_rules():
    """AC-11.4: 2 to 5 words and at most 40 characters; otherwise no theme (the cover shows the topic's name)."""
    assert checked_cover("  The   AI chip rush ") == "The AI chip rush"
    assert checked_cover("Gold") == ""  # one word
    assert checked_cover("One two three four five six") == ""  # six words
    assert checked_cover("Extraordinarily unprecedented gold-price developments") == ""  # over 40 characters
    assert checked_cover(None) == "" and checked_cover(42) == ""


def test_ac_11_4_no_cover_means_an_empty_theme(client, env):
    """AC-11.4: an answer without a cover (or a bad one) gives an empty theme, never a crash."""
    assert curate(client, env)["cover"] == ""
    assert curate(client, env, cover=["not", "text"])["cover"] == ""


# ---------- AC-11.5: the AI's diagram, checked against the story ----------


def test_ac_11_5_change_with_numbers_from_the_text(client, env):
    """AC-11.5: a before-and-after change whose numbers are in the text is kept."""
    v = {
        "kind": "change",
        "title": "24-carat gold",
        "unit": "Rs per 10 g",
        "points": [{"label": "Last week", "value": 72300}, {"label": "Today", "value": 74100}],
    }
    c = curate(client, env, visual=v)
    assert c["visual"] == {**v, "steps": []}


def test_ac_11_5_trend_and_bars_from_the_text():
    """AC-11.5: a trend of 3 to 8 values and bars of 2 to 6 values, all written in the text, are kept."""
    trend = {
        "kind": "trend",
        "points": [
            {"label": "Last week", "value": 72300},
            {"label": "Mon", "value": 73050},
            {"label": "Wed", "value": 73600},
            {"label": "Now", "value": 74100},
        ],
    }
    assert checked_visual(trend, GOLD).kind == "trend"
    bars = {"kind": "bars", "unit": "Rs", "points": [{"label": "Mon", "value": 73050}, {"label": "Wed", "value": 73600}]}
    assert [p.value for p in checked_visual(bars, GOLD).points] == [73050, 73600]


def test_ac_11_5_an_invented_number_drops_the_diagram(client, env):
    """AC-11.5: one number not in the text drops the whole diagram, and the card keeps its key figures instead (AC-4.2)."""
    v = {"kind": "bars", "points": [{"label": "Today", "value": 74100}, {"label": "Next year", "value": 90000}]}
    c = curate(
        client,
        env,
        visual=v,
        key_figures=[{"label": "Today", "value": 74100, "unit": "Rs"}, {"label": "Last week", "value": 72300, "unit": "Rs"}],
    )
    assert c["visual"] is None
    assert [f["value"] for f in c["key_figures"]] == [74100, 72300]


def test_ac_11_5_too_few_or_too_many_points_are_dropped():
    """AC-11.5: bars need 2 to 6 points, a change exactly 2 (and different), a trend 3 to 8."""
    p = [{"label": "x", "value": 74100}]
    assert checked_visual({"kind": "bars", "points": p}, GOLD) is None
    assert checked_visual({"kind": "bars", "points": p * 7}, GOLD) is None
    assert checked_visual({"kind": "change", "points": [{"label": "a", "value": 74100}] * 2}, GOLD) is None
    assert checked_visual({"kind": "trend", "points": [{"label": "a", "value": 72300}, {"label": "b", "value": 74100}]}, GOLD) is None


def test_ac_11_5_steps_rules():
    """AC-11.5: steps need 2 to 5 stages of at most 60 characters each; numbers in steps are words, not plotted."""
    ok = checked_visual(
        {"kind": "steps", "title": "What happens next", "steps": ["Rupee weakens", "Importers buy early", "Price sets a record"]}, GOLD
    )
    assert ok.kind == "steps" and ok.steps == ["Rupee weakens", "Importers buy early", "Price sets a record"]
    assert checked_visual({"kind": "steps", "steps": ["Only one"]}, GOLD) is None
    assert checked_visual({"kind": "steps", "steps": ["a", "b", "c", "d", "e", "f"]}, GOLD) is None
    assert checked_visual({"kind": "steps", "steps": ["fine", "x" * 61]}, GOLD) is None


def test_ac_11_5_none_and_malformed_answers_give_no_diagram(client, env):
    """AC-11.5: kind "none", an unknown kind or a malformed answer gives no diagram, and the card is still made."""
    for bad in (
        {"kind": "none"},
        {"kind": "pie", "points": []},
        "bars",
        {"kind": "bars", "points": [{"label": "a", "value": "lots"}]},
        None,
    ):
        c = curate(client, env, visual=bad)
        assert c["visual"] is None and c["summary"] == "Gold rose."


def test_ac_11_5_the_prompt_asks_for_a_cover_and_a_diagram():
    """AC-11.4, AC-11.5: the schema sent to Studio AI asks for both, with the four kinds (or none)."""
    assert {"cover", "visual"} <= set(prompts.SCHEMA["required"])
    assert prompts.SCHEMA["properties"]["visual"]["properties"]["kind"]["enum"] == ["bars", "change", "trend", "steps", "none"]
    assert "Use only numbers written in the text" in prompts.SYSTEM


# ---------- AC-11.7: data saved by v0.5.1 ----------


V051_CARD = {
    "id": "old1",
    "topic_section": "finance",
    "title": "Gold climbs on rate hopes",
    "source_name": "Mock Times",
    "source_url": "https://news.example.com/gold",
    "published_at": "2026-11-26T06:00:00Z",
    "fetched_at": "2026-11-26T07:00:00Z",
    "summary": "Gold rose 1.2% as markets priced in a rate cut.",
    "key_points": ["Gold up 1.2%.", "Rate cut priced in."],
    "key_figures": [{"label": "Gold", "value": 1.2, "unit": "%"}],
    "story_key": "gold-rate-hopes",
    "relevance": 0.9,
    "saved": True,
    "saved_changed_at": "2026-11-26T07:05:00Z",
    "ai_status": "ok",
}


def test_ac_11_7_cards_and_settings_saved_by_v0_5_1_read_unchanged(client, env):
    """AC-11.7: a v0.5.1 card (no cover, no diagram) and settings (no theme time) load and sync unchanged."""
    c = Card.model_validate(V051_CARD)
    assert c.cover == "" and c.visual is None and c.key_figures[0].value == 1.2
    body = {"topics": {}, "cards": [V051_CARD], "settings": {"last_refreshed_at": "2026-11-26T07:00:00Z", "theme": "light"}}
    st = client.put("/api/me/state", json=body).json()["state"]
    assert st["settings"]["theme"] == "light" and st["settings"]["theme_changed_at"] is None
    (back,) = st["cards"]
    assert {k: back[k] for k in V051_CARD} == V051_CARD


def test_ac_11_7_what_v0_6_0_saves_stays_readable_by_v0_5_1():
    """AC-11.7: only optional fields are added, so v0.5.1's models (which ignore unknown fields) read a v0.6.0 card."""
    new = Card.model_validate({**V051_CARD, "cover": "Gold on the move", "visual": {"kind": "steps", "steps": ["a b", "c d"]}}).model_dump(
        mode="json"
    )
    old_fields = set(V051_CARD) | {"replaced_at"}
    later = {"detail_status", "detail_summary", "detail_points", "detail_tries"}  # added by CR-0011 (US-13), also optional
    assert set(new) - old_fields - later == {"cover", "visual"}
    assert Card.model_validate({k: new[k] for k in old_fields}).title == V051_CARD["title"]
