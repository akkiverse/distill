import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

const topics = { sections: ["finance"], keywords: [], updated_at: iso(H) };
const settings = { last_refreshed_at: iso(H), theme: "system" as const };
const offline = { status: 503, json: { error: { code: "data_offline", message: "Saved on this device, will sync later." } } };

describe("US-6: Save, expire and replace (on the device)", () => {
  it("AC-6.1: an unsaved card fetched more than 24 hours ago is gone when the app loads, even offline", async () => {
    fakeServer({}); // nothing answers
    seed({ topics, settings, cards: [card("old", { fetched_at: iso(25 * H), title: "Old news" }), card("new", { title: "Today's news" })] });
    renderApp();
    expect(await screen.findByText("Today's news")).toBeInTheDocument();
    expect(screen.queryByText("Old news")).toBeNull();
  });

  it("AC-6.2: a saved card older than 24 hours stays and is in the Saved tab", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings, cards: [card("kept", { fetched_at: iso(50 * H), saved: true, title: "Kept story" })] });
    renderApp("#/saved");
    expect(await screen.findByText("Kept story")).toBeInTheDocument();
  });

  it("AC-6.2: Saved says what to do when empty", async () => {
    fakeServer(deviceOnly);
    renderApp("#/saved");
    expect(await screen.findByText("Nothing saved yet. Tap the bookmark on any post.")).toBeInTheDocument();
  });

  it("AC-6.6: with the data server offline, saving keeps the change here, says it will sync later, and syncs on the next request", async () => {
    let up = false;
    const server = fakeServer({ ...deviceOnly, "PUT /api/me/state": (b) => (up ? { json: { state: b, synced_at: "now" } } : offline) });
    seed({ topics, settings, cards: [card("c1", { title: "Budget highlights" })] });
    const view = renderApp();
    await userEvent.click(await screen.findByRole("button", { name: /Save “Budget highlights”/ }));
    expect(await screen.findByText("Saved on this device, will sync later")).toBeInTheDocument();
    const local = JSON.parse(localStorage.getItem("distill.v1")!);
    expect(local.state.cards[0].saved).toBe(true);
    expect(local.pendingSync).toBe(true);
    // the data server comes back: the next load sends the saved card
    up = true;
    view.unmount();
    renderApp();
    await waitFor(() => expect(JSON.parse(localStorage.getItem("distill.v1")!).pendingSync).toBe(false));
    const last = server.calls.filter((c) => c.method === "PUT").at(-1)!;
    expect(last.body.cards[0]).toMatchObject({ id: "c1", saved: true });
  });

  it("AC-6.4: unsaving a card keeps its fetch time, so normal expiry applies", async () => {
    fakeServer(deviceOnly);
    const fetched = iso(5 * H);
    seed({ topics, settings, cards: [card("c2", { title: "Was saved", saved: true, fetched_at: fetched })] });
    renderApp();
    await userEvent.click(await screen.findByRole("button", { name: /Unsave “Was saved”/ }));
    const saved = JSON.parse(localStorage.getItem("distill.v1")!).state.cards[0];
    expect(saved.saved).toBe(false);
    expect(saved.fetched_at).toBe(fetched);
  });
});
