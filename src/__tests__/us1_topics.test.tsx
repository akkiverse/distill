import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { deviceOnly, fakeServer, renderApp } from "./helpers";

describe("US-1: Choose topics", () => {
  it("AC-1.1: offers at least 10 sections and more than one can be selected", async () => {
    fakeServer(deviceOnly);
    renderApp("#/topics");
    const boxes = screen.getAllByRole("checkbox");
    expect(boxes.length).toBeGreaterThanOrEqual(10);
    for (const name of ["World", "India", "Business", "Finance", "Technology", "Science", "Health", "Sports", "Entertainment", "Politics", "Environment", "Education"]) {
      expect(screen.getByRole("checkbox", { name })).toBeInTheDocument();
    }
    await userEvent.click(screen.getByRole("checkbox", { name: "Finance" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Sports" }));
    expect(screen.getByRole("checkbox", { name: "Finance" })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: "Sports" })).toBeChecked();
  });

  it("AC-1.2: Finance + Sports + \"gold rate\" are saved to the account and shown as chips after a reload", async () => {
    const server = fakeServer({ ...deviceOnly, "PUT /api/me/state": (b) => ({ json: { state: b, synced_at: "now" } }), "POST /api/feed/refresh": () => ({ json: { articles: [], failed_sources: [], fetched_at: "now" } }) });
    const first = renderApp("#/topics");
    await userEvent.click(screen.getByRole("checkbox", { name: "Finance" }));
    await userEvent.click(screen.getByRole("checkbox", { name: "Sports" }));
    await userEvent.type(screen.getByLabelText(/Keywords/), "gold rate{enter}");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(server.calls.some((c) => c.method === "PUT" && c.body.topics.sections.includes("sports"))).toBe(true));
    const put = server.calls.filter((c) => c.method === "PUT" && c.body.topics.sections.length).at(-1)!;
    expect(put.body.topics).toMatchObject({ sections: ["finance", "sports"], keywords: ["gold rate"] });
    first.unmount();
    renderApp("#/");
    const chips = await screen.findByRole("list", { name: "Your topics" });
    expect(chips).toHaveTextContent("Finance");
    expect(chips).toHaveTextContent("Sports");
    expect(chips).toHaveTextContent("gold rate");
  });

  it("AC-1.3: with no section selected, Save shows \"Pick at least one section\" and saves nothing", async () => {
    const server = fakeServer(deviceOnly);
    renderApp("#/topics");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Pick at least one section");
    const raw = localStorage.getItem("distill.v1");
    expect(raw === null || JSON.parse(raw).state.topics.sections.length === 0).toBe(true);
    expect(server.calls.filter((c) => c.method === "PUT" && c.body.topics.sections.length)).toHaveLength(0);
  });
});
