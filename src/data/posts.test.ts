import { describe, expect, it } from "vitest";
import { matchVenue, mergeHints, needsAddressCheck, parseTimeRange, resolvePostDate, splitVenues } from "./posts";
import { postedToDate } from "@/lib/post-reader.server";

const SKINNYS = "Jumpin Joey's 11-2 & Adventurous Brewing LLC 4-8pm. Armadillo Egg - sausage & bacon wrapped jalapeno stuffed with brisket cream cheese. Smoked & Fried to order just like the Smoked Chicken Wings. Brisket - Pork - Pastrami - Chicken Wings";

describe("time ranges", () => {
  it("reads short food-truck ranges", () => {
    expect(parseTimeRange("11-2")).toEqual({ start: "11:00", end: "14:00" });
    expect(parseTimeRange("4-8pm")).toEqual({ start: "16:00", end: "20:00" });
    expect(parseTimeRange("11-2pm")).toEqual({ start: "11:00", end: "14:00" });
    expect(parseTimeRange("11am-2pm")).toEqual({ start: "11:00", end: "14:00" });
    expect(parseTimeRange("11:30-1:30")).toEqual({ start: "11:30", end: "13:30" });
    expect(parseTimeRange("5 to 8 pm")).toEqual({ start: "17:00", end: "20:00" });
    expect(parseTimeRange("4-8")).toEqual({ start: "16:00", end: "20:00" });
  });
  it("ignores text without a range", () => {
    expect(parseTimeRange("Brisket - Pork")).toBeNull();
  });
});

describe("several venues in one post", () => {
  it("gives one stop per venue with its own time", () => {
    expect(splitVenues(SKINNYS)).toEqual([
      { venue: "Jumpin Joey's", start: "11:00", end: "14:00" },
      { venue: "Adventurous Brewing LLC", start: "16:00", end: "20:00" },
    ]);
  });
  it("handles 'and' and '@' separators", () => {
    expect(splitVenues("Today @ Wake Brewing 11am-2pm and 5ive Cities Brewing 5-8").map((v) => v.venue)).toEqual(["Wake Brewing", "5ive Cities Brewing"]);
  });
  it("adds stops the AI missed, without duplicating ones it found", () => {
    const ai = [{ truck_name: "Skinny's Fiya Truck", is_food_truck: true, date: "2026-10-14", start: "11:00", end: "14:00", venue: "Jumpin Joey's", address: "", city: "", confidence: 0.9 }];
    const out = mergeHints(ai, splitVenues(SKINNYS), "2026-10-14", "Skinny's Fiya Truck");
    expect(out.map((e) => [e.venue, e.start, e.end])).toEqual([["Jumpin Joey's", "11:00", "14:00"], ["Adventurous Brewing LLC", "16:00", "20:00"]]);
    expect(out[1]!.truck_name).toBe("Skinny's Fiya Truck");
  });
});

describe("post date", () => {
  it("uses the post date, tomorrow, or the next named weekday", () => {
    expect(resolvePostDate(SKINNYS, "2026-10-14")).toBe("2026-10-14");
    expect(resolvePostDate("See you tomorrow at Wake!", "2026-10-14")).toBe("2026-10-15");
    expect(resolvePostDate("Saturday at the market 9-1", "2026-10-14")).toBe("2026-10-17"); // Wed → Sat
    expect(resolvePostDate("Wednesday 11-2", "2026-10-14")).toBe("2026-10-14");
  });
  it("reads Facebook post times from screenshots", () => {
    expect(postedToDate("2d", "2026-10-16")).toBe("2026-10-14");
    expect(postedToDate("Yesterday at 9:14 AM", "2026-10-16")).toBe("2026-10-15");
    expect(postedToDate("5 hrs", "2026-10-16")).toBe("2026-10-16");
    expect(postedToDate("October 14", "2026-10-16")).toBe("2026-10-14");
    expect(postedToDate("December 30", "2026-10-16")).toBe("2025-12-30");
  });
});

describe("address matching", () => {
  const venues = [{ name: "Adventurous Brewing" }, { name: "Jumpin Joey's" }];
  it("matches saved venues ignoring LLC and apostrophes", () => {
    expect(matchVenue("Adventurous Brewing LLC", venues)?.name).toBe("Adventurous Brewing");
    expect(matchVenue("Jumpin Joeys", venues)?.name).toBe("Jumpin Joey's");
    expect(matchVenue("Wake Brewing", venues)).toBeNull();
  });
  it("trusts a lookup only when the name matches and it is in the Quad Cities", () => {
    expect(needsAddressCheck("Adventurous Brewing LLC", { name: "Adventurous Brewing", lat: 41.5256, lng: -90.5182 })).toBe(false);
    expect(needsAddressCheck("Jumpin Joey's", { name: "Joey's Pizza", lat: 41.55, lng: -90.6 })).toBe(true);
    expect(needsAddressCheck("Adventurous Brewing", { name: "Adventurous Brewing", lat: 39.7, lng: -104.9 })).toBe(true);
  });
});

import { isUnknownTruckName, reviewTruckName } from "./posts";
describe("unknown truck names", () => {
  it("treats placeholder names as unknown", () => {
    for (const n of ["Unknown", "unknown truck", "N/A", "", "  ", "Food Truck", "TBD", "Unnamed"]) expect(isUnknownTruckName(n)).toBe(true);
  });
  it("keeps real names", () => {
    for (const n of ["Skinny's Fiya Truck", "Toni's Smokin' Grill", "Tacos"]) expect(isUnknownTruckName(n)).toBe(false);
  });
  it("names review trucks after the post author, never Unknown", () => {
    expect(reviewTruckName("Jane Doe")).toBe("Jane Doe");
    expect(reviewTruckName("")).toBe("Unnamed truck (needs review)");
    expect(reviewTruckName("Unknown")).toBe("Unnamed truck (needs review)");
  });
});
