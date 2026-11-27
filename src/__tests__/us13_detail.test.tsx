import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { slidesOf } from "../components/PointSlides";
import { localMerge, withDetail } from "../state";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

const topics = { sections: ["finance"], keywords: [], updated_at: iso(H) };
const fresh = { last_refreshed_at: iso(5 * 60_000), theme: "system" as const }; // no refresh on open
const TEN = Array.from({ length: 10 }, (_, i) => `Detailed point ${i + 1}.`);
const LONG = "First sentence of the longer summary. Second one. Third one. Fourth one. Fifth one.";
const detailed = (id: string, over = {}) => card(id, { detail_status: "ready", detail_summary: LONG, detail_points: TEN, ...over });
const ready = (points = TEN) => () => ({ json: { status: "ready", summary: LONG, points } });

describe("US-13: Detailed story summaries in bullet points (CR-0011)", () => {
  it("AC-13.6: slides hold 3 to 4 points each, spread evenly, at most 10 points", () => {
    expect(slidesOf(TEN).map((s) => s.length)).toEqual([4, 3, 3]);
    expect(slidesOf(TEN.slice(0, 7)).map((s) => s.length)).toEqual([4, 3]);
    expect(slidesOf(TEN.slice(0, 5)).map((s) => s.length)).toEqual([3, 2]);
    expect(slidesOf(TEN.slice(0, 4)).map((s) => s.length)).toEqual([4]);
    expect(slidesOf([...TEN, "Eleven.", "Twelve."]).flat()).toHaveLength(10);
  });

  it("AC-13.6: a feed card shows its summary as bullet points only, the first 3 to 4 on the card, with dots", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [detailed("a")] });
    renderApp();
    const c = within((await screen.findAllByTestId("card"))[0]);
    const slides = c.getByTestId("slides");
    expect(within(slides).getAllByRole("listitem").map((li) => li.textContent)).toEqual(TEN.slice(0, 4));
    expect(c.queryByText("Summary of a.")).toBeNull(); // bullet points only
    expect(c.queryByText(LONG)).toBeNull();
    expect(c.queryByText("Point one")).toBeNull();
    expect(within(c.getByTestId("dots")).getAllByText("", { selector: ".dot" })).toHaveLength(3);
    expect(slides).toHaveAccessibleName(/1 of 3/);
  });

  it("AC-13.6: the right arrow moves to the next points and the left arrow back", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [detailed("a")] });
    renderApp();
    const slides = (await screen.findAllByTestId("slides"))[0];
    const prev = within(slides).getByRole("button", { name: "Previous points" });
    const next = within(slides).getByRole("button", { name: "Next points" });
    expect(prev).toBeDisabled();
    fireEvent.click(next);
    expect(within(slides).getAllByRole("listitem").map((li) => li.textContent)).toEqual(TEN.slice(4, 7));
    expect(slides).toHaveAccessibleName(/2 of 3/);
    fireEvent.click(next);
    expect(within(slides).getAllByRole("listitem").map((li) => li.textContent)).toEqual(TEN.slice(7));
    expect(next).toBeDisabled();
    fireEvent.click(prev);
    expect(slides).toHaveAccessibleName(/2 of 3/);
    expect(window.location.hash).toBe("#/"); // the arrows don't open the story
  });

  it("AC-13.6: on phones a swipe moves between slides without opening the story", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [detailed("a")] });
    renderApp();
    const slides = (await screen.findAllByTestId("slides"))[0];
    fireEvent.touchStart(slides, { touches: [{ clientX: 300, clientY: 100 }] });
    fireEvent.touchEnd(slides, { changedTouches: [{ clientX: 180, clientY: 108 }] });
    expect(slides).toHaveAccessibleName(/2 of 3/);
    fireEvent.touchStart(slides, { touches: [{ clientX: 100, clientY: 100 }] });
    fireEvent.touchEnd(slides, { changedTouches: [{ clientX: 220, clientY: 104 }] });
    expect(slides).toHaveAccessibleName(/1 of 3/);
    expect(window.location.hash).toBe("#/");
  });

  it("AC-13.7: keyboard users move between slides with the arrow keys", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [detailed("a")] });
    renderApp();
    const slides = (await screen.findAllByTestId("slides"))[0];
    expect(slides).toHaveAttribute("tabindex", "0");
    fireEvent.keyDown(slides, { key: "ArrowRight" });
    expect(slides).toHaveAccessibleName(/2 of 3/);
    fireEvent.keyDown(slides, { key: "ArrowLeft" });
    expect(slides).toHaveAccessibleName(/1 of 3/);
  });

  it("AC-13.7: tapping the card opens the full view with headline, source, time and every point, and the full-article link at the bottom", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [detailed("a", { title: "RBI holds rates", source_name: "Mint" })] });
    renderApp();
    const slides = (await screen.findAllByTestId("slides"))[0];
    fireEvent.click(within(slides).getAllByRole("listitem")[0]);
    expect(window.location.hash).toBe("#/post/a");
    const title = await screen.findByRole("heading", { name: "RBI holds rates", level: 1 });
    const post = title.closest("article")!;
    expect(within(post).getByText("Mint")).toBeInTheDocument();
    expect(within(post).getByText(/ago|just now/)).toBeInTheDocument();
    expect(within(within(post).getByRole("list", { name: "Every point" })).getAllByRole("listitem").map((li) => li.textContent)).toEqual(TEN);
    const link = within(post).getByRole("link", { name: /Read the full article at Mint/ });
    expect(link).toHaveAttribute("href", "https://news.example.com/a");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
    const items = within(post).getAllByRole("listitem");
    expect(items.at(-1)!.compareDocumentPosition(link) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("AC-13.5: on the Saved screen cards look as before, with the longer summary from the article", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [detailed("a", { saved: true })] });
    renderApp("#/saved");
    const c = within((await screen.findAllByTestId("card"))[0]);
    expect(c.getByText(LONG)).toBeInTheDocument();
    expect(c.getByText("Point one")).toBeInTheDocument();
    expect(c.queryByTestId("slides")).toBeNull();
  });

  it("AC-13.8: detailed summaries are made in the background, one at a time, kept in the card and not asked again", async () => {
    let open = 0;
    let most = 0;
    const server = fakeServer({
      ...deviceOnly,
      "POST /api/feed/detail": (b) => {
        open++;
        most = Math.max(most, open);
        queueMicrotask(() => open--);
        return ready([`About ${b.title}.`, "Second fact."])();
      },
    });
    seed({ topics, settings: fresh, cards: [card("a", { title: "Story A" }), card("b", { title: "Story B", published_at: iso(2 * H) }), card("h", { ai_status: "offline", summary: "", key_points: [] })] });
    renderApp();
    await waitFor(() => expect(screen.getAllByTestId("slides")).toHaveLength(2));
    const asked = server.calls.filter((c) => c.path === "/api/feed/detail");
    expect(asked.map((c) => c.body.title)).toEqual(["Story A", "Story B"]); // newest first; headline-only cards wait
    expect(asked[0].body).toEqual({ url: "https://news.example.com/a", title: "Story A", source_name: "Mint" });
    expect(most).toBe(1);
    const kept = JSON.parse(localStorage.getItem("distill.v1")!).state.cards.find((c: { id: string }) => c.id === "a");
    expect(kept.detail_status).toBe("ready");
    expect(kept.detail_points).toEqual(["About Story A.", "Second fact."]);
    expect(JSON.stringify(kept)).not.toMatch(/article_text|"text"/);
  });

  it("AC-13.8: a card already detailed opens at once and is never sent again", async () => {
    const server = fakeServer({ ...deviceOnly, "POST /api/feed/detail": ready() });
    seed({ topics, settings: fresh, cards: [detailed("a")] });
    renderApp();
    await screen.findAllByTestId("slides");
    await new Promise((r) => setTimeout(r, 30));
    expect(server.calls.some((c) => c.path === "/api/feed/detail")).toBe(false);
  });

  it("AC-13.8: while a story's points aren't ready, its card shows the short summary and \"Detailed points are being prepared\"", async () => {
    fakeServer({ ...deviceOnly, "POST /api/feed/detail": () => ({ status: 502, json: {} }) }); // the server is busy: points stay pending
    seed({ topics, settings: fresh, cards: [card("a")] });
    renderApp();
    const c = within((await screen.findAllByTestId("card"))[0]);
    expect(c.getByText("Summary of a.")).toBeInTheDocument();
    expect(c.getByText("Detailed points are being prepared")).toBeInTheDocument();
  });

  it("AC-13.4: when the page can't be read, the card keeps its short summary with \"Detailed summary not available for this source\", and isn't asked again", async () => {
    const server = fakeServer({ ...deviceOnly, "POST /api/feed/detail": () => ({ json: { status: "unavailable", summary: "", points: [] } }) });
    seed({ topics, settings: fresh, cards: [card("a")] });
    renderApp();
    expect(await screen.findByText("Detailed summary not available for this source")).toBeInTheDocument();
    expect(screen.getByText("Summary of a.")).toBeInTheDocument();
    await new Promise((r) => setTimeout(r, 30));
    expect(server.calls.filter((c) => c.path === "/api/feed/detail")).toHaveLength(1);
  });

  it("AC-13.4: an unusable AI answer is tried twice at most, then the story keeps its short summary", () => {
    const c0 = card("a");
    const once = withDetail(c0, { status: "error", summary: "", points: [] });
    expect(once.detail_status).toBeUndefined();
    expect(once.detail_tries).toBe(1);
    const twice = withDetail(once, { status: "error", summary: "", points: [] });
    expect(twice.detail_status).toBe("unavailable");
  });

  it("AC-13.9: with the AI offline, cards work as today with the short summary and nothing says points are coming", async () => {
    const server = fakeServer({ ...deviceOnly, "GET /api/ai/status": () => ({ json: { configured: true, online: false } }), "POST /api/feed/detail": ready() });
    seed({ topics, settings: fresh, cards: [card("a")] });
    renderApp();
    const c = within((await screen.findAllByTestId("card"))[0]);
    await waitFor(() => expect(c.queryByText("Detailed points are being prepared")).toBeNull());
    expect(c.getByText("Summary of a.")).toBeInTheDocument();
    expect(c.getByText("Point one")).toBeInTheDocument();
    const before = server.calls.filter((x) => x.path === "/api/feed/detail").length;
    await new Promise((r) => setTimeout(r, 30));
    expect(server.calls.filter((x) => x.path === "/api/feed/detail").length).toBe(before); // nothing more is asked while offline
  });

  it("AC-13.9: when the server says the AI is offline, the card stays as it is and nothing is stored", async () => {
    fakeServer({ ...deviceOnly, "POST /api/feed/detail": () => ({ json: { status: "offline", summary: "", points: [] } }) });
    seed({ topics, settings: fresh, cards: [card("a")] });
    renderApp();
    await waitFor(() => expect(screen.queryByText("Detailed points are being prepared")).toBeNull());
    expect(screen.getByText("Summary of a.")).toBeInTheDocument();
    const kept = JSON.parse(localStorage.getItem("distill.v1")!).state.cards[0];
    expect(kept.detail_status).toBeUndefined();
  });

  it("AC-13.8: syncing two copies of a card keeps the detailed summary from either device", () => {
    const plain = card("a", { fetched_at: iso(0.5 * H) });
    const rich = card("a", { fetched_at: iso(H), detail_status: "ready", detail_points: ["One.", "Two."], detail_summary: LONG });
    for (const [x, y] of [[[plain], [rich]], [[rich], [plain]]]) {
      expect(localMerge(x, y)[0].detail_points).toEqual(["One.", "Two."]);
    }
  });

  it("AC-13.10: cards and saved cards from v0.7.0 (no detailed points) still show their short summary", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings: fresh, cards: [card("a", { saved: true, saved_changed_at: iso(H) })] });
    renderApp("#/saved");
    const c = within((await screen.findAllByTestId("card"))[0]);
    expect(c.getByText("Summary of a.")).toBeInTheDocument();
    expect(c.getByText("Point one")).toBeInTheDocument();
    fireEvent.click(c.getByRole("link", { name: "Story a" }));
    expect(await screen.findByRole("heading", { name: "Story a", level: 1 })).toBeInTheDocument();
    expect(screen.getByText("Summary of a.")).toBeInTheDocument();
  });
});
