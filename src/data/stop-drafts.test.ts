import { describe, expect, it } from "vitest";
import { inDateRange, parseStopDrafts, stopStatus } from "./stop-drafts";

describe("schedule screenshot drafts", () => {
  it("skips private events and past dates", () => {
    const r = parseStopDrafts([
      { venue: "Smilee's Ice Cream", date: "2026-10-21", start: "16:00", end: "" },
      { venue: "PRIVATE EVENT", date: "2026-10-28", start: "11:00" },
      { venue: "Clinton fest", date: "2026-10-17", start: "11:00" },
      { venue: "Booked party", date: "2026-10-29", private: true },
    ], "2026-10-20");
    expect(r.skipped).toBe(3);
    expect(r.stops).toEqual([{ venue: "Smilee's Ice Cream", address: "", city: "", date: "2026-10-21", start: "16:00", end: "19:00" }]);
  });
});

describe("stop log", () => {
  it("filters by Chicago calendar day, inclusive", () => {
    const s = { starts_at: "2026-10-24T16:00:00Z", ends_at: "2026-10-24T19:00:00Z" };
    expect(inDateRange(s, "2026-10-24", "2026-10-24")).toBe(true);
    expect(inDateRange(s, "2026-10-25", "")).toBe(false);
    expect(inDateRange(s, "", "2026-10-23")).toBe(false);
  });
  it("labels past, live, upcoming and cancelled", () => {
    const now = Date.parse("2026-10-24T17:00:00Z");
    expect(stopStatus({ starts_at: "2026-10-24T16:00:00Z", ends_at: "2026-10-24T19:00:00Z", cancelled: false }, now)).toBe("live");
    expect(stopStatus({ starts_at: "2026-10-23T16:00:00Z", ends_at: "2026-10-23T19:00:00Z", cancelled: false }, now)).toBe("past");
    expect(stopStatus({ starts_at: "2026-10-25T16:00:00Z", ends_at: "2026-10-25T19:00:00Z", cancelled: true }, now)).toBe("cancelled");
  });
});
