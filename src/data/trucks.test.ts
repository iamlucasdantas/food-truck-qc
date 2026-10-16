import { describe, it, expect } from "vitest";
import { milesBetween, pickStop, closingTime, slugify, QC_CENTER, type Stop } from "./trucks";

const stop = (start: Date, end: Date, extra: Partial<Stop> = {}): Stop => ({
  id: "s", truck_id: "t", venue_name: "Park", address: null, city: "Moline", lat: 0, lng: 0,
  starts_at: start.toISOString(), ends_at: end.toISOString(), source: "owner", confidence: 1,
  is_live: false, cancelled: false, repeat_group: null, source_url: null, note: null, series_id: null, occurrence_date: null, created_at: start.toISOString(), ...extra,
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

import { pickStop as ps } from "./trucks";
t2("Google Maps base stops show gray and lose to real stops", () => {
  const now = new Date(2026, 9, 16, 12);
  const mk = (source: string, h1: number, h2: number) => ({ id: source, truck_id: "x", venue_name: "", address: null, city: "", lat: 0, lng: 0,
    starts_at: new Date(2026, 9, 16, h1).toISOString(), ends_at: new Date(2026, 9, 16, h2).toISOString(), source, confidence: 1, is_live: false, cancelled: false, repeat_group: null, created_at: "" }) as never;
  e2(ps([mk("apify_maps", 11, 19)], now, "now", now).status).toBe("none");
  e2(ps([mk("apify_maps", 11, 19)], now, "now", now).stop).not.toBeNull();
  e2(ps([mk("apify_maps", 11, 19), mk("owner", 11, 14)], now, "now", now)).toMatchObject({ status: "open", stop: { id: "owner" } });
});

import { isFoodTruckPlace, mapApifyCategory } from "./trucks";
t2("Apify filter keeps food trucks and drops dealers", () => {
  e2(isFoodTruckPlace("Food truck")).toBe(true);
  e2(isFoodTruckPlace("Truck dealer", ["Truck repair shop"], "QC Trucks")).toBe(false);
  e2(mapApifyCategory("Mexican restaurant")).toBe("Mexican");
  e2(mapApifyCategory("Food truck")).toBe("Other");
});

import { placeTruck, byStatusThenDistance, chooseCenter, QC_CENTER as QC } from "./trucks";
describe("map placement", () => {
  it("shows a truck with no stop as gray at its base", () => {
    expect(placeTruck({ base_lat: 41.5, base_lng: -90.5 }, { stop: null, status: "none" })).toMatchObject({ lat: 41.5, status: "none" });
  });
  it("sorts live, then scheduled, then gray, then distance", () => {
    const r = [{ status: "none" as const, dist: 1 }, { status: "today" as const, dist: 5 }, { status: "open" as const, dist: 9 }, { status: "today" as const, dist: 2 }].sort(byStatusThenDistance);
    expect(r.map((x) => x.status + x.dist)).toEqual(["open9", "today2", "today5", "none1"]);
  });
  it("falls back to Quad Cities when user is far away", () => {
    expect(chooseCenter({ lat: 40.7, lng: -74 })).toEqual(QC);
    expect(chooseCenter(null)).toEqual(QC);
  });
});

import { normalizeTruckName, matchTruckByName, centralToUtc, keepExtraction } from "./trucks";
describe("facebook post rules", () => {
  it("matches names loosely", () => {
    expect(normalizeTruckName("The Bragg BBQ Food Truck, LLC")).toBe("bragg bbq");
    expect(matchTruckByName("Bragg BBQ", [{ name: "Bragg BBQ Truck" }])?.name).toBe("Bragg BBQ Truck");
    expect(matchTruckByName("Tacos", [{ name: "Bragg BBQ" }])).toBeNull();
  });
  it("converts Central time to UTC with DST", () => {
    expect(centralToUtc("2026-07-01", "11:00").toISOString()).toBe("2026-07-01T16:00:00.000Z");
    expect(centralToUtc("2026-12-01", "11:00").toISOString()).toBe("2026-12-01T17:00:00.000Z");
  });
  it("keeps only confidence >= 0.7 within today..+30 days", () => {
    expect(keepExtraction({ confidence: 0.7, date: "2026-10-16" }, "2026-10-16")).toBe(true);
    expect(keepExtraction({ confidence: 0.69, date: "2026-10-16" }, "2026-10-16")).toBe(false);
    expect(keepExtraction({ confidence: 0.9, date: "2026-10-15" }, "2026-10-16")).toBe(false);
    expect(keepExtraction({ confidence: 0.9, date: "2026-11-16" }, "2026-10-16")).toBe(false);
  });
});
