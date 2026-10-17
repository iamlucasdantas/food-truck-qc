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
  it("shows a fixed truck with no stop as gray at its base", () => {
    expect(placeTruck({ base_lat: 41.5, base_lng: -90.5, truck_type: "fixed" }, { stop: null, status: "none" })).toMatchObject({ lat: 41.5, status: "none" });
  });
  it("hides a mobile truck with no stop", () => {
    expect(placeTruck({ base_lat: 41.5, base_lng: -90.5, truck_type: "mobile" }, { stop: null, status: "none" })).toBeNull();
  });
  it("shows a mobile truck at its stop", () => {
    const stop = { lat: 41.6, lng: -90.6 } as never;
    expect(placeTruck({ base_lat: 41.5, base_lng: -90.5, truck_type: "mobile" }, { stop, status: "open" })).toMatchObject({ lat: 41.6, status: "open" });
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

import { socialHandle, authorIsTruck, stopBadge } from "./trucks";
describe("detected post rules", () => {
  it("extracts handles from URLs and raw handles", () => {
    expect(socialHandle("https://www.facebook.com/BraggBBQ/")).toBe("braggbbq");
    expect(socialHandle("@braggbbq")).toBe("braggbbq");
    expect(socialHandle("https://reddit.com/u/braggbbq")).toBe("braggbbq");
    expect(socialHandle("https://www.instagram.com/bragg.bbq?ig=1")).toBe("bragg.bbq");
    expect(socialHandle(null)).toBe("");
  });
  it("matches a post author to the truck's own handles", () => {
    const t = { facebook: "https://facebook.com/braggbbq", instagram: "@braggbbq", reddit: null };
    expect(authorIsTruck("braggbbq", t)).toBe(true);
    expect(authorIsTruck("https://instagram.com/braggbbq", t)).toBe(true);
    expect(authorIsTruck("someoneelse", t)).toBe(false);
    expect(authorIsTruck("", t)).toBe(false);
  });
  it("maps stops to source badges", () => {
    expect(stopBadge({ source: "own_post" })).toBe("own post");
    expect(stopBadge({ source: "apify_post" })).toBe("community");
    expect(stopBadge({ source: "apify_event" })).toBe("community");
    expect(stopBadge({ source: "owner" })).toBe("manual");
    expect(stopBadge({ source: "owner" }, { external_uid: "abc@google" })).toBe("calendar");
    expect(stopBadge({ source: "owner" }, { external_uid: null })).toBe("manual");
  });
});

import { effectivePayments, ownerHandles, authorIsTruck as authorIsTruck2, publicDescription } from "./trucks";
describe("business vs truck data", () => {
  const biz = { payment_methods: ["Cash", "Venmo"], payment_other: "", facebook: "https://facebook.com/tacoco", instagram: null, reddit: null };
  it("truck inherits business payment methods when 'Same as business' is on", () => {
    expect(effectivePayments({ payments_same_as_business: true, payment_methods: ["Zelle"], payment_other: "" }, biz)).toEqual(["Cash", "Venmo"]);
  });
  it("truck override replaces business methods and adds the free 'other' text", () => {
    expect(effectivePayments({ payments_same_as_business: false, payment_methods: ["Zelle"], payment_other: "Bitcoin" }, biz)).toEqual(["Zelle", "Bitcoin"]);
  });
  it("own-post matching uses the business handle for every truck of that business", () => {
    const h = ownerHandles({ facebook: null, instagram: null, reddit: null }, biz);
    expect(authorIsTruck2("tacoco", h)).toBe(true);
    expect(authorIsTruck2("someone-else", h)).toBe(false);
  });
  it("legacy truck handle still matches when the business has none", () => {
    expect(authorIsTruck2("oldpage", ownerHandles({ facebook: "facebook.com/oldpage", instagram: null, reddit: null }, null))).toBe(true);
  });
  it("public description hides owner contact lines", () => {
    expect(publicDescription("Great tacos\n\nBusiness: Taco Co\n\nOwner contact: Jo · jo@x.com")).toBe("Great tacos");
  });
});

import { liveEnd, fmtCentral } from "./trucks";
describe("I'm here duration", () => {
  const now = new Date("2026-10-16T17:00:00Z"); // 12:00 Central (CDT)
  it("chips add hours from now", () => {
    const r = liveEnd({ kind: "minutes", minutes: 120 }, now);
    expect(r.ok && r.end.toISOString()).toBe("2026-10-16T19:00:00.000Z");
  });
  it("rejects under 15 minutes and over 12 hours", () => {
    expect(liveEnd({ kind: "minutes", minutes: 10 }, now).ok).toBe(false);
    expect(liveEnd({ kind: "minutes", minutes: 15 }, now).ok).toBe(true);
    expect(liveEnd({ kind: "minutes", minutes: 720 }, now).ok).toBe(true);
    expect(liveEnd({ kind: "minutes", minutes: 721 }, now).ok).toBe(false);
  });
  it("an end time is read in Central time", () => {
    const r = liveEnd({ kind: "until", time: "15:30" }, now);
    expect(r.ok && r.end.toISOString()).toBe("2026-10-16T20:30:00.000Z");
    expect(r.ok && fmtCentral(r.end)).toBe("3:30 PM");
  });
  it("an end time earlier than now means tomorrow, which must still be within 12h", () => {
    expect(liveEnd({ kind: "until", time: "11:00" }, now).ok).toBe(false);
    const late = new Date("2026-10-17T03:00:00Z"); // 10pm Central
    const r = liveEnd({ kind: "until", time: "01:00" }, late);
    expect(r.ok && r.end.toISOString()).toBe("2026-10-17T06:00:00.000Z");
  });
});

import { groupStops as _group } from "./trucks";
describe("groupStops", () => {
  const row = (venue: string, s: string, e: string, created: string, truck = "t1") =>
    ({ truck_id: truck, venue_name: venue, starts_at: s, ends_at: e, created_at: created });
  it("merges repeated posts for the same venue with overlapping times, keeping the newest", () => {
    const g = _group([
      row("Bent River Brewing Company", "2026-10-17T16:00:00Z", "2026-10-17T19:00:00Z", "2026-10-16T10:00:00Z"),
      row("Bent River Brewing Company", "2026-10-17T17:00:00Z", "2026-10-17T20:00:00Z", "2026-10-17T10:00:00Z"),
      row("Bent River Brewing", "2026-10-17T17:00:00Z", "2026-10-17T20:00:00Z", "2026-10-16T12:00:00Z"),
    ]);
    expect(g).toHaveLength(1);
    expect(g[0]!.merged).toBe(3);
    expect(g[0]!.starts_at).toBe("2026-10-17T17:00:00Z");
  });
  it("keeps different days, venues and trucks apart", () => {
    const g = _group([
      row("Bent River", "2026-10-17T16:00:00Z", "2026-10-17T19:00:00Z", "a"),
      row("Bent River", "2026-10-18T16:00:00Z", "2026-10-18T19:00:00Z", "a"),
      row("Other Place", "2026-10-17T16:00:00Z", "2026-10-17T19:00:00Z", "a"),
      row("Bent River", "2026-10-17T16:00:00Z", "2026-10-17T19:00:00Z", "a", "t2"),
    ]);
    expect(g).toHaveLength(4);
  });
});
