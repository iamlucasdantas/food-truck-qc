import { describe, expect, it } from "vitest";
import { checkInEnd, missingFor, ownsTruck, pickMyTruck, stopWindow, weekdayOf } from "./owner-tools";

const me = "user-1";
const mine = [
  { id: "taco-one-ab12", name: "Taco One", status: "active", claimed_by: me, created_by: null },
  { id: "taco-two-cd34", name: "Taco Two", status: "pending", claimed_by: null, created_by: me },
];

describe("ownership", () => {
  it("claimed or created trucks are mine, nothing else is", () => {
    expect(ownsTruck(mine[0]!, me)).toBe(true);
    expect(ownsTruck(mine[1]!, me)).toBe(true);
    expect(ownsTruck({ ...mine[0]!, claimed_by: "someone-else" }, me)).toBe(false);
  });
  it("picks the only truck when none is named", () => {
    const r = pickMyTruck([mine[0]!]);
    expect(r.ok && r.truck.id).toBe("taco-one-ab12");
  });
  it("asks which truck when there are several", () => {
    const r = pickMyTruck(mine);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("Taco Two (taco-two-cd34)");
  });
  it("refuses a truck id that isn't mine", () => {
    const r = pickMyTruck(mine, "big-boyz-pizza");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("isn't linked to your account");
  });
  it("tells a new owner to register", () => {
    const r = pickMyTruck([]);
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toContain("register_my_truck");
  });
});

describe("stop windows (Central time)", () => {
  it("converts a Central window to UTC", () => {
    const r = stopWindow("2026-11-06", "11:00", "14:00");
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.starts_at).toBe("2026-11-06T17:00:00.000Z"); // CST = UTC-6
      expect(r.ends_at).toBe("2026-11-06T20:00:00.000Z");
    }
  });
  it("rolls an end before the start to the next day (late-night trucks)", () => {
    const r = stopWindow("2026-11-06", "21:00", "01:00");
    expect(r.ok).toBe(true);
    if (r.ok) expect(new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()).toBe(4 * 3_600_000);
  });
  it("rejects malformed input", () => {
    expect(stopWindow("11/06/2026", "11:00", "14:00").ok).toBe(false);
    expect(stopWindow("2026-11-06", "11am", "2pm").ok).toBe(false);
  });
  it("weekday of a date is the same the schedule editor stores", () => {
    expect(weekdayOf("2026-11-06")).toBe(5); // Friday
    expect(weekdayOf("2026-11-08")).toBe(0); // Sunday
  });
});

describe("check-in end time", () => {
  const now = new Date("2026-11-06T18:00:00Z"); // noon Central
  it("defaults to two hours", () => {
    const r = checkInEnd({}, now);
    expect(r.ok && r.end.toISOString()).toBe("2026-11-06T20:00:00.000Z");
  });
  it("accepts an until time in Central", () => {
    const r = checkInEnd({ until: "14:00" }, now);
    expect(r.ok && r.end.toISOString()).toBe("2026-11-06T20:00:00.000Z");
  });
  it("keeps the dashboard limits", () => {
    expect(checkInEnd({ minutes: 5 }, now).ok).toBe(false);
    expect(checkInEnd({ minutes: 13 * 60 }, now).ok).toBe(false);
    expect(checkInEnd({ minutes: 60, until: "14:00" }, now).ok).toBe(false);
  });
});

describe("what's missing", () => {
  const base = { phone: null, description: "", base_address: null, truck_type: "mobile", menu_sections: null };
  it("lists photos, menu, schedule and phone for a bare truck", () => {
    expect(missingFor(base, { photos: 0, upcomingStops: 0 })).toEqual(["truck photos", "menu", "upcoming stops (schedule)", "phone"]);
  });
  it("fixed trucks need an address, not a schedule", () => {
    const m = missingFor({ ...base, truck_type: "fixed", phone: "563", menu_sections: [{}] }, { photos: 2, upcomingStops: 0 });
    expect(m).toEqual(["address (fixed trucks need one to show on the map)"]);
  });
});
