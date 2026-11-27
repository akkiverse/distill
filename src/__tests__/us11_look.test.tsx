import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { visualText } from "../components/Diagram";
import themeSource from "../theme.ts?raw";
import type { Visual } from "../types";
import indexHtml from "../../index.html?raw";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

const topics = { sections: ["finance", "technology"], keywords: [], updated_at: iso(H) };
const settings = { last_refreshed_at: iso(60_000), theme: "system" as const }; // no refresh on open

const bars: Visual = { kind: "bars", title: "Planned new capacity", unit: "wafers a month", points: [{ label: "Taiwan", value: 120000 }, { label: "Arizona", value: 60000 }], steps: [] };
const change: Visual = { kind: "change", title: "24-carat gold", unit: "Rs", points: [{ label: "Last week", value: 72300 }, { label: "Today", value: 74100 }], steps: [] };
const trend: Visual = { kind: "trend", title: "Rainfall against normal", unit: "%", points: [{ label: "June", value: -11 }, { label: "July", value: 9 }, { label: "Aug", value: 15 }], steps: [] };
const steps: Visual = { kind: "steps", title: "How the Test turned", unit: "", points: [], steps: ["Rain wipes out day four", "Bumrah takes four wickets", "Australia all out for 212", "India chase it down"] };

afterEach(() => {
  delete document.documentElement.dataset.theme;
  document.documentElement.style.colorScheme = "";
  document.head.querySelectorAll('meta[name="theme-color"]').forEach((m) => m.remove());
});

describe("US-11: A smoother look, a theme switch and AI-drawn story diagrams (CR-0008)", () => {
  it("AC-11.1: the header offers System, Light and Dark; a choice applies at once, on every screen, and is kept", async () => {
    const { calls } = fakeServer(deviceOnly);
    seed({ topics, settings, cards: [card("a")] });
    renderApp("#/");
    const group = await screen.findByRole("radiogroup", { name: "Theme" });
    const option = (name: string) => within(group).getByRole("radio", { name });
    expect(option("System")).toHaveAttribute("aria-checked", "true");
    await userEvent.click(option("Dark"));
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(option("Dark")).toHaveAttribute("aria-checked", "true");
    const saved = JSON.parse(localStorage.getItem("distill.v1")!).state.settings;
    expect(saved.theme).toBe("dark");
    expect(Date.parse(saved.theme_changed_at)).toBeGreaterThan(Date.now() - 60_000);
    // sent to the account with the rest of the settings
    await waitFor(() => expect(calls.some((c) => c.method === "PUT" && c.path === "/api/me/state" && c.body.settings.theme === "dark")).toBe(true));
    // every screen: the switch is in the header, and the choice stays when moving on
    window.location.hash = "#/topics";
    expect(await screen.findByRole("heading", { name: "Topics" })).toBeInTheDocument();
    expect(document.documentElement.dataset.theme).toBe("dark");
    await userEvent.click(within(screen.getByRole("radiogroup", { name: "Theme" })).getByRole("radio", { name: "System" }));
    expect(document.documentElement.dataset.theme).toBeUndefined(); // System follows the device's setting
  });

  it("AC-11.1: a theme kept in the account is applied when the app opens", async () => {
    fakeServer({ ...deviceOnly, "PUT /api/me/state": (b) => ({ json: { state: { ...b, settings: { ...b.settings, theme: "light", theme_changed_at: iso(1000) } } } }) });
    seed({ topics, settings, cards: [] });
    renderApp("#/");
    await waitFor(() => expect(document.documentElement.dataset.theme).toBe("light"));
    expect(screen.getByRole("radio", { name: "Light" })).toHaveAttribute("aria-checked", "true");
  });

  it("AC-11.2: the saved theme is applied before the app draws, and the browser bar colour matches", () => {
    const html = indexHtml;
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1];
    const head = html.match(/<meta name="theme-color"[^>]*>/g)!.join("");
    document.head.innerHTML = head;
    seed({ settings: { last_refreshed_at: null, theme: "dark", theme_changed_at: iso(H) } });
    new Function(script)();
    expect(document.documentElement.dataset.theme).toBe("dark");
    for (const m of document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')) expect(m.content).toBe("#070b12");
    // the module that runs once the app starts uses the same colours
    expect(themeSource).toContain('{ light: "#eef2f6", dark: "#070b12" }');
    // a damaged or empty device copy is ignored
    delete document.documentElement.dataset.theme;
    localStorage.setItem("distill.v1", "{not json");
    new Function(script)();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("AC-11.4: an AI card has a cover band with the AI's theme; without one, the topic's name; headline-only cards have none", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings, cards: [
      card("a", { cover: "Gold hits a new high", published_at: iso(H) }),
      card("b", { topic_section: "technology", published_at: iso(2 * H) }),
      card("c", { ai_status: "offline", summary: "", key_points: [], published_at: iso(3 * H) }),
    ] });
    renderApp("#/");
    const cards = await screen.findAllByTestId("card");
    expect(within(cards[0]).getByTestId("cover")).toHaveTextContent("Gold hits a new high");
    expect(within(cards[1]).getByTestId("cover").querySelector(".cover-theme")).toHaveTextContent("Technology");
    expect(within(cards[2]).queryByTestId("cover")).toBeNull();
  });

  it("AC-11.5, AC-4.2 (changed CR-0008): a card with a diagram shows it instead of the key-figure chart; without one, the chart stays", async () => {
    fakeServer(deviceOnly);
    const figures = [{ label: "Today", value: 74100, unit: "Rs" }, { label: "Last week", value: 72300, unit: "Rs" }];
    seed({ topics, settings, cards: [card("a", { key_figures: figures, visual: change, published_at: iso(H) }), card("b", { key_figures: figures, published_at: iso(2 * H) })] });
    renderApp("#/");
    const cards = await screen.findAllByTestId("card");
    expect(within(cards[0]).getByTestId("diagram")).toBeInTheDocument();
    expect(within(cards[0]).queryByTestId("chart")).toBeNull();
    expect(within(cards[1]).queryByTestId("diagram")).toBeNull();
    expect(within(cards[1]).getByTestId("chart")).toBeInTheDocument();
  });

  it("AC-11.6: each kind draws on the card and the post, with a text version for screen readers", async () => {
    fakeServer(deviceOnly);
    seed({ topics, settings, cards: [
      card("b", { visual: bars, published_at: iso(H) }), card("c", { visual: change, published_at: iso(2 * H) }),
      card("t", { visual: trend, published_at: iso(3 * H) }), card("s", { visual: steps, published_at: iso(4 * H) }),
    ] });
    renderApp("#/");
    const cards = await screen.findAllByTestId("card");
    expect(cards).toHaveLength(4);
    for (const c of cards) {
      const d = within(c).getByTestId("diagram");
      expect(d).toHaveClass("compact");
      expect(within(d).getByRole("img")).toHaveAttribute("aria-label");
    }
    expect(within(cards[0]).getByRole("img")).toHaveAccessibleName("Planned new capacity. Comparison: Taiwan: 1,20,000 wafers a month; Arizona: 60,000 wafers a month");
    expect(within(cards[1]).getByRole("img")).toHaveAccessibleName("24-carat gold. Change: from 72,300 Rs (Last week) to 74,100 Rs (Today), up 1,800 Rs (+2.49%)");
    expect(within(cards[3]).getByText("+1 more in the post")).toBeInTheDocument(); // the card shows 3 steps

    window.location.hash = "#/post/s";
    expect(await screen.findByRole("heading", { level: 1, name: "Story s" })).toBeInTheDocument();
    const full = screen.getByTestId("diagram");
    expect(full).not.toHaveClass("compact");
    expect(screen.getByRole("heading", { name: "How it unfolds" })).toBeInTheDocument();
    for (const s of steps.steps) expect(within(full).getByText(s)).toBeInTheDocument();
    expect(within(full).getByRole("img")).toHaveAccessibleName(visualText(steps));
    expect(screen.getByText("How the Test turned")).toBeInTheDocument();
  });

  it("AC-11.6: the text version says which way a change went and lists a trend in order", () => {
    expect(visualText({ ...change, points: [{ label: "", value: 200 }, { label: "", value: 150 }] })).toBe("24-carat gold. Change: from 200 Rs to 150 Rs, down 50 Rs (-25%)");
    expect(visualText(trend)).toBe("Rainfall against normal. Trend: June: -11 %; July: 9 %; Aug: 15 %");
  });

  it("AC-11.7: cards and settings saved by v0.5.1 load and look as before, and a damaged diagram is simply not drawn", async () => {
    fakeServer(deviceOnly);
    const v051 = card("old", { key_figures: [{ label: "Q1", value: 12, unit: "%" }, { label: "Q2", value: 18, unit: "%" }] });
    delete (v051 as Partial<typeof v051>).cover;
    delete (v051 as Partial<typeof v051>).visual;
    const broken = card("bad", { published_at: iso(2 * H), visual: { kind: "trend", title: "", unit: "", points: [{ label: "a", value: 1 }], steps: [] } });
    seed({ topics, settings: { last_refreshed_at: iso(60_000), theme: "dark" }, cards: [v051, broken] });
    renderApp("#/");
    const cards = await screen.findAllByTestId("card");
    expect(within(cards[0]).getByTestId("cover")).toHaveTextContent("Finance");
    expect(within(cards[0]).getByTestId("chart")).toBeInTheDocument();
    expect(within(cards[1]).queryByTestId("diagram")).toBeNull();
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
