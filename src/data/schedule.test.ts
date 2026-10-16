import { describe, it, expect } from "vitest";
import { expandSeries, occursOn, parseIcs, rruleToSeries, buildIcs, type Series } from "./schedule";

const rule = (x: Partial<Series>): Series => ({
  id: "r", truck_id: "t", venue_name: "Park", address: null, city: "Moline", lat: 1, lng: 2, note: null,
  start_time: "11:00", end_time: "14:00", freq: "weekly", weekdays: [5], month_nth: null,
  start_date: "2026-10-01", end_date: null, skip_dates: [], external_uid: null, created_at: "2026-10-01T00:00:00Z", ...x,
});

describe("owner schedule rules", () => {
  it("weekly Friday rule yields every Friday in October 2026", () => {
    const occ = expandSeries([rule({})], new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(occ.map((o) => o.occurrence_date)).toEqual(["2026-10-02", "2026-10-09", "2026-10-16", "2026-10-23", "2026-10-30"]);
  });
  it("skipping one Friday removes only that occurrence", () => {
    const occ = expandSeries([rule({ skip_dates: ["2026-10-16"] })], new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(occ).toHaveLength(4);
    expect(occ.some((o) => o.occurrence_date === "2026-10-16")).toBe(false);
  });
  it("every 2 weeks skips alternate weeks", () => {
    const occ = expandSeries([rule({ freq: "biweekly" })], new Date(2026, 9, 1), new Date(2026, 10, 1));
    expect(occ.map((o) => o.occurrence_date)).toEqual(["2026-10-02", "2026-10-16", "2026-10-30"]);
  });
  it("monthly first Friday", () => {
    expect(occursOn(rule({ freq: "monthly", month_nth: 1 }), new Date(2026, 10, 6))).toBe(true);
    expect(occursOn(rule({ freq: "monthly", month_nth: 1 }), new Date(2026, 10, 13))).toBe(false);
  });
  it("end date stops the series", () => {
    expect(occursOn(rule({ end_date: "2026-10-10" }), new Date(2026, 9, 16))).toBe(false);
  });
  it("occurrences use local start/end times", () => {
    const [o] = expandSeries([rule({})], new Date(2026, 9, 2), new Date(2026, 9, 3));
    expect(new Date(o!.starts_at).getHours()).toBe(11);
    expect(new Date(o!.ends_at).getHours()).toBe(14);
  });
  it("parses iCal events and maps weekly recurrence", () => {
    const ics = "BEGIN:VCALENDAR\r\nBEGIN:VEVENT\r\nUID:a1\r\nSUMMARY:Lunch at\r\n  the park\r\nDTSTART:20261016T160000Z\r\nDTEND:20261016T190000Z\r\nLOCATION:1200 River Dr\\, Moline\r\nRRULE:FREQ=WEEKLY;INTERVAL=2;BYDAY=FR\r\nEND:VEVENT\r\nEND:VCALENDAR";
    const [e] = parseIcs(ics);
    expect(e!.title).toBe("Lunch at the park");
    expect(e!.location).toBe("1200 River Dr, Moline");
    expect(rruleToSeries(e!.rrule!, e!.start)).toEqual({ freq: "biweekly", weekdays: [5], month_nth: null, end_date: null });
  });
  it("exports rules as RRULE", () => {
    expect(buildIcs("Taco", [], [rule({})])).toContain("RRULE:FREQ=WEEKLY;BYDAY=FR");
  });
});
