import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { checkLine } from "../screens/AdminSources";
import type { AdminSource } from "../types";
import { deviceOnly, fakeServer, renderApp, seed } from "./helpers";

const PERSON = [
  { id: "rss-hindu", name: "The Hindu", sections: ["india"], kind: "rss" },
  { id: "rss-bbc", name: "BBC World", sections: ["world"], kind: "rss" },
  { id: "google-news", name: "Google News", sections: ["world", "india", "business", "keyword"], kind: "google-news" },
  { id: "gdelt", name: "GDELT", sections: ["keyword"], kind: "gdelt" },
];

const signedIn = (role = "user") => ({
  ...deviceOnly,
  "GET /auth/me": () => ({ json: { signed_in: true, user: { name: "Akki", role } } }),
  "PUT /api/me/state": (b: any) => ({ json: { state: b, synced_at: "now" } }),
  "GET /api/sources": () => ({ json: { sources: PERSON } }),
});

function admin(over: Partial<AdminSource> = {}): AdminSource {
  return {
    id: "rss-hindu", name: "The Hindu", url: "https://www.thehindu.com/feeder/default.rss", sections: ["india"], kind: "rss",
    paused: false, builtin: true, note: "", check: null, can_remove: true, missing_key: false, key_name: null, ...over,
  };
}

const ADMIN_LIST = () => ({
  sources: [
    admin({ check: { at: "2026-11-27T02:00:00Z", ok: true, stories: 18, error: "", failing_since: null } }),
    admin({ id: "rss-bbc", name: "BBC World", url: "https://feeds.bbci.co.uk/news/world/rss.xml", sections: ["world"],
      check: { at: "2026-11-27T02:00:00Z", ok: false, stories: 0, error: "The site answered with an error (500).", failing_since: "2026-11-26T03:30:00Z" } }),
    admin({ id: "google-news", name: "Google News", url: "https://news.google.com/rss", sections: ["world", "india"], kind: "google-news", can_remove: false }),
    admin({ id: "guardian", name: "The Guardian", url: "", sections: [], kind: "guardian", missing_key: true, key_name: "GUARDIAN_API_KEY" }),
  ],
  checked_at: new Date().toISOString(),
  saved_in_database: true,
});

describe("US-12: News sources (CR-0010)", () => {
  it("AC-12.6: Settings → Sources lists the active sources by section, all on, and a switch is saved to the account", async () => {
    seed({ topics: { sections: ["world", "india"], keywords: [], updated_at: null } });
    const server = fakeServer(signedIn());
    renderApp("#/settings");
    const world = await screen.findByRole("group", { name: /World/ });
    expect(within(world).getByRole("switch", { name: /BBC World/ })).toBeChecked();
    expect(within(world).getByRole("switch", { name: /Google News/ })).toBeChecked();
    expect(screen.getByRole("group", { name: /Your keywords/ })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("4 of 4 sources on");

    await userEvent.click(within(world).getByRole("switch", { name: /BBC World/ }));
    await waitFor(() => expect(server.calls.some((c) => c.method === "PUT" && c.body.settings.sources_off?.includes("rss-bbc"))).toBe(true));
    const put = server.calls.filter((c) => c.method === "PUT").at(-1)!;
    expect(put.body.settings.sources_changed_at).toBeTruthy();
    expect(within(world).getByRole("switch", { name: /BBC World/ })).not.toBeChecked();
    // a multi-section source has one switch, shown in each of its sections
    await userEvent.click(within(screen.getByRole("group", { name: /India/ })).getByRole("switch", { name: /Google News/ }));
    expect(within(world).getByRole("switch", { name: /Google News/ })).not.toBeChecked();
  });

  it("AC-12.7: a refresh sends the sources this person switched off", async () => {
    seed({
      topics: { sections: ["world"], keywords: [], updated_at: null },
      settings: { last_refreshed_at: null, theme: "system", sources_off: ["gdelt"], sources_changed_at: "2026-11-27T01:00:00Z" },
    });
    const server = fakeServer({ ...signedIn(), "POST /api/feed/refresh": () => ({ json: { articles: [], failed_sources: [], fetched_at: "now" } }) });
    renderApp("#/");
    await waitFor(() => expect(server.calls.some((c) => c.path === "/api/feed/refresh")).toBe(true));
    expect(server.calls.find((c) => c.path === "/api/feed/refresh")!.body.sources_off).toEqual(["gdelt"]);
  });

  it("AC-12.8: signed-out visitors see that every active source is used, with no switches", async () => {
    fakeServer({ ...deviceOnly, "GET /api/sources": () => ({ json: { sources: PERSON } }) });
    renderApp("#/settings");
    expect(await screen.findByText(/Sign in to choose your sources/)).toBeInTheDocument();
    expect(screen.queryAllByRole("switch")).toHaveLength(0);
  });

  it("AC-12.9: turning off every source in a section warns that the section will be empty", async () => {
    seed({ settings: { last_refreshed_at: null, theme: "system", sources_off: ["google-news"], sources_changed_at: "2026-11-27T01:00:00Z" } });
    fakeServer(signedIn());
    renderApp("#/settings");
    const world = await screen.findByRole("group", { name: /World/ });
    expect(within(world).queryByRole("alert")).toBeNull();
    await userEvent.click(within(world).getByRole("switch", { name: /BBC World/ }));
    expect(within(world).getByRole("alert")).toHaveTextContent("your World section will be empty");
  });

  it("AC-12.1: the News sources screen is for the Distill admin only", async () => {
    fakeServer(signedIn("user"));
    renderApp("#/admin/sources");
    expect(await screen.findByText(/This screen is for the Distill admin/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Add a source" })).toBeNull();
  });

  it("AC-12.1, AC-12.2: the admin sees each source with its address, sections, state and last check", async () => {
    fakeServer({ ...signedIn("admin"), "GET /api/admin/sources": () => ({ json: ADMIN_LIST() }) });
    renderApp("#/admin/sources");
    const rows = await screen.findAllByRole("listitem");
    const hindu = rows.find((r) => r.textContent?.includes("The Hindu"))!;
    expect(hindu).toHaveTextContent("https://www.thehindu.com/feeder/default.rss");
    expect(hindu).toHaveTextContent("India");
    expect(hindu).toHaveTextContent("On");
    expect(hindu).toHaveTextContent("OK · 18 stories");
    const bbc = rows.find((r) => r.textContent?.includes("BBC World"))!;
    expect(bbc).toHaveTextContent("Failing since 26 Nov");
    expect(bbc).toHaveTextContent("answered with an error (500)");
    const guardian = rows.find((r) => r.textContent?.includes("The Guardian"))!;
    expect(guardian).toHaveTextContent("Needs a key");
    const gn = rows.find((r) => r.textContent?.includes("Google News"))!;
    expect(within(gn).queryByRole("button", { name: "Remove" })).toBeNull();
    expect(within(gn).getByRole("button", { name: "Pause" })).toBeInTheDocument();
  });

  it("AC-12.3: adding a source shows the server's plain reason when the check fails, and adds it when it passes", async () => {
    let tries = 0;
    const server = fakeServer({
      ...signedIn("admin"),
      "GET /api/admin/sources": () => ({ json: ADMIN_LIST() }),
      "POST /api/admin/sources": (b) => {
        tries += 1;
        if (tries === 1) return { status: 422, json: { error: { code: "not_a_feed", message: "This is a web page, not a news feed." } } };
        const list = ADMIN_LIST();
        list.sources.push(admin({ id: "rss-new", name: b.name, url: b.url, sections: b.sections, builtin: false,
          check: { at: "2026-11-27T02:40:00Z", ok: true, stories: 2, error: "", failing_since: null } }));
        return { status: 201, json: list };
      },
    });
    renderApp("#/admin/sources");
    await userEvent.click(await screen.findByRole("button", { name: "Add a source" }));
    const form = screen.getByRole("form", { name: "Add a source" });
    await userEvent.type(within(form).getByLabelText("Name"), "Example News");
    await userEvent.type(within(form).getByLabelText("Feed address"), "https://example.org/");
    await userEvent.click(within(form).getByRole("checkbox", { name: "India" }));
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await within(form).findByRole("alert")).toHaveTextContent("This is a web page, not a news feed.");
    expect(screen.queryByText("Example News", { selector: "strong" })).toBeNull();

    await userEvent.clear(within(form).getByLabelText("Feed address"));
    await userEvent.type(within(form).getByLabelText("Feed address"), "https://example.org/feed.xml");
    await userEvent.click(within(form).getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Example News", { selector: "strong" })).toBeInTheDocument();
    const post = server.calls.filter((c) => c.method === "POST" && c.path === "/api/admin/sources").at(-1)!;
    expect(post.body).toEqual({ name: "Example News", url: "https://example.org/feed.xml", sections: ["india"] });
  });

  it("AC-12.5: Pause sends the change, and Remove asks to confirm first", async () => {
    const server = fakeServer({
      ...signedIn("admin"),
      "GET /api/admin/sources": () => ({ json: ADMIN_LIST() }),
      "PATCH /api/admin/sources/rss-bbc": () => {
        const l = ADMIN_LIST();
        l.sources[1].paused = true;
        return { json: l };
      },
      "DELETE /api/admin/sources/rss-hindu": () => {
        const l = ADMIN_LIST();
        l.sources.shift();
        return { json: l };
      },
    });
    renderApp("#/admin/sources");
    const rows = await screen.findAllByRole("listitem");
    await userEvent.click(within(rows.find((r) => r.textContent?.includes("BBC World"))!).getByRole("button", { name: "Pause" }));
    await waitFor(() => expect(server.calls.some((c) => c.method === "PATCH" && c.body.paused === true)).toBe(true));
    expect(await screen.findByText("BBC World paused.")).toBeInTheDocument();

    const hindu = screen.getAllByRole("listitem").find((r) => r.textContent?.includes("The Hindu"))!;
    await userEvent.click(within(hindu).getByRole("button", { name: "Remove" }));
    expect(server.calls.some((c) => c.method === "DELETE")).toBe(false);
    const dialog = screen.getByRole("alertdialog", { name: "Remove The Hindu?" });
    await userEvent.click(within(dialog).getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(server.calls.some((c) => c.method === "DELETE")).toBe(true));
    expect(await screen.findByText("The Hindu removed.")).toBeInTheDocument();
  });

  it("AC-12.2: the screen checks every source by itself when the last full check is old", async () => {
    const server = fakeServer({
      ...signedIn("admin"),
      "GET /api/admin/sources": () => ({ json: { ...ADMIN_LIST(), checked_at: null } }),
      "POST /api/admin/sources/check": () => ({ json: ADMIN_LIST() }),
    });
    renderApp("#/admin/sources");
    await waitFor(() => expect(server.calls.some((c) => c.path === "/api/admin/sources/check")).toBe(true));
    expect(checkLine(admin())).toBe("Not checked yet");
    expect(checkLine(admin({ paused: true }))).toBe("Not checked while paused");
  });
});
