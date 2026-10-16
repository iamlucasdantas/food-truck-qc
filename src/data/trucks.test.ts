import { describe, it, expect } from "vitest";
import { milesBetween, pickStop, closingTime, slugify, QC_CENTER, type Stop } from "./trucks";

const stop = (start: Date, end: Date, extra: Partial<Stop> = {}): Stop => ({
  id: "s", truck_id: "t", venue_name: "Park", address: null, city: "Moline", lat: 0, lng: 0,
  starts_at: start.toISOString(), ends_at: end.toISOString(), source: "owner", confidence: 1,
  is_live: false, cancelled: false, repeat_group: null, created_at: start.toISOString(), ...extra,
});

describe("truck rules", () => {
  it("computes distance in miles", () => {
    expect(milesBetween(QC_CENTER, { lat: QC_CENTER.lat + 1, lng: QC_CENTER.lng })).toBeCloseTo(69.1, 0);
  });
  it("marks a truck open during its stop hours", () => {
    const now = new Date(2026, 9, 14, 12, 30);
    const s = stop(new Date(2026, 9, 14, 11), new Date(2026, 9, 14, 14));
    expect(pickStop([s], now, "now", now).status).toBe("open");
  });
  it("ignores cancelled stops", () => {
    const now = new Date(2026, 9, 14, 12, 30);
    const s = stop(new Date(2026, 9, 14, 11), new Date(2026, 9, 14, 14), { cancelled: true });
    expect(pickStop([s], now, "now", now).status).toBe("none");
  });
  it("shows a later stop today as scheduled", () => {
    const now = new Date(2026, 9, 14, 9, 0);
    const s = stop(new Date(2026, 9, 14, 17), new Date(2026, 9, 14, 20));
    expect(pickStop([s], now, "now", now).status).toBe("today");
  });
  it("closing chips: +2h, and 9pm capped at 6 hours", () => {
    const noon = new Date(2026, 9, 14, 12, 0);
    expect(closingTime("+2h", noon).getHours()).toBe(14);
    expect(closingTime("+4h", noon).getHours()).toBe(16);
    expect(closingTime("9pm", noon).getHours()).toBe(18);
    expect(closingTime("9pm", new Date(2026, 9, 14, 17, 0)).getHours()).toBe(21);
  });
  it("slugifies truck names", () => expect(slugify("Cluckin' Good!")).toBe("cluckin-good"));
});

import { parseCsv } from "./trucks";
import { test as t2, expect as e2 } from "vitest";
t2("parseCsv handles quoted commas", () => {
  e2(parseCsv('name,address\n"Taco, Inc",1 Main St\n')).toEqual([{ name: "Taco, Inc", address: "1 Main St" }]);
});
