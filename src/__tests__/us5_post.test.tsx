import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { H, card, deviceOnly, fakeServer, iso, renderApp, seed } from "./helpers";

describe("US-5: Read a post in detail", () => {
  it("AC-5.1: the detail view shows summary, all key points, any chart and a safe link to the original", async () => {
    fakeServer(deviceOnly);
    seed({ topics: { sections: ["finance"], keywords: [], updated_at: iso(H) }, cards: [card("p1", {
      title: "Gold rate rises", source_name: "Mint", key_points: ["One", "Two", "Three"],
      key_figures: [{ label: "Today", value: 76200, unit: "INR" }, { label: "Yesterday", value: 75075, unit: "INR" }],
    })] });
    renderApp("#/post/p1");
    expect(await screen.findByRole("heading", { level: 1, name: "Gold rate rises" })).toBeInTheDocument();
    expect(screen.getByText("Summary of p1.")).toBeInTheDocument();
    for (const p of ["One", "Two", "Three"]) expect(screen.getByText(p)).toBeInTheDocument();
    expect(screen.getByTestId("chart")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /Read the full article at Mint/ });
    expect(link).toHaveAttribute("href", "https://news.example.com/p1");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("AC-5.2: a post id that no longer exists shows \"This post has expired\" and Back to feed", async () => {
    fakeServer(deviceOnly);
    renderApp("#/post/gone");
    expect(await screen.findByRole("heading", { name: "This post has expired" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Back to feed" })).toHaveAttribute("href", "#/");
  });
});
