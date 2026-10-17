import { describe, expect, it } from "vitest";

// Opt-in authenticated HTTP regressions against the running app; never log the key.
const key = process.env["CHAT_AGENT_API_KEY"];
const base = process.env["AGENT_API_TEST_ORIGIN"] ?? "http://localhost:8080";
const headers = { "content-type": "application/json", "x-api-key": key ?? "" };

describe.skipIf(!key)("chat-agent camelCase HTTP requests", () => {
  it.each(["chat-search-trucks", "chat-upcoming-stops"])("%s ranks Tony's Smoking Grill as Toni's Smokin' Grill", async endpoint => {
    const response = await fetch(`${base}/api/public/${endpoint}?query=${encodeURIComponent("Tony's Smoking Grill")}&days=7`, { headers });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results[0]?.truck_id).toBe("toni-s-smokin-grill-e8mrk");
    expect(body.results[0]?.matched_on).toContain("name");
  }, 30000);
  it("POST blank optional aliases returns 200 with open_now applied", async () => {
    const response = await fetch(`${base}/api/public/chat-search-trucks`, {
      method: "POST", headers,
      body: JSON.stringify({ openNow: "true", location: "", radiusMiles: "", limit: "5" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.filters.open_now).toBe(true);
    expect(body.results.length).toBeLessThanOrEqual(5);
    for (const truck of body.results) expect(truck.open_now).toBe(true);
  }, 30000);

  it("POST truckId and seven days returns only the selected real truck", async () => {
    const discovery = await fetch(`${base}/api/public/chat-upcoming-stops?days=7&limit=50`, { headers });
    expect(discovery.status).toBe(200);
    const available = await discovery.json();
    const selected = available.results.find((truck: { stop: unknown }) => truck.stop != null);
    expect(selected).toBeDefined();
    if (!selected) throw new Error("No real upcoming stop available for the truckId regression");
    const response = await fetch(`${base}/api/public/chat-upcoming-stops`, {
      method: "POST", headers, body: JSON.stringify({ truckId: selected.truck_id, days: "7" }),
    });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.results.length).toBeGreaterThan(0);
    for (const truck of body.results) expect(truck.truck_id).toBe(selected.truck_id);
    for (const stop of body.stops) expect(stop.truck_id).toBe(selected.truck_id);
    if (body.next_available) expect(body.next_available.truck_id).toBe(selected.truck_id);
  }, 30000);
});