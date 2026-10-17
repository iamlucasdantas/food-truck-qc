import { describe, expect, it } from "vitest";
import { EMPTY_FILTERS, adminDefaultVisible, adminStatus, cityOf, filtersToSearch, matchesFilters, parseFilters, restoreDaysLeft, type FilterRow } from "./filters";

const row = (o: Partial<FilterRow> = {}): FilterRow => ({
  name: "Ana's Tacos", business_name: "Ana Foods", category: "Mexican", menu_search: "carne asada burrito elote", city: "Moline", truck_type: "mobile", ...o,
});

describe("filters", () => {
  it("free text searches truck, business, cuisine and dishes", () => {
    for (const q of ["ana's", "ana foods", "mexican", "burritos"]) expect(matchesFilters(row(), { ...EMPTY_FILTERS, q })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, q: "pizza" })).toBe(false);
  });
  it("dish filter only looks at the menu", () => {
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, dish: "elote" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, dish: "mexican" })).toBe(false);
  });
  it("cuisine is multi-select", () => {
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, cuisines: ["bbq", "tacos"] })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, cuisines: ["bbq"] })).toBe(false);
  });
  it("city, type, status and open now", () => {
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, city: "moline" })).toBe(true);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, city: "Davenport" })).toBe(false);
    expect(matchesFilters(row(), { ...EMPTY_FILTERS, type: "fixed" })).toBe(false);
    expect(matchesFilters(row({ adminStatus: "pending" }), { ...EMPTY_FILTERS, status: ["pending", "deleted"] })).toBe(true);
    expect(matchesFilters(row({ adminStatus: "approved" }), { ...EMPTY_FILTERS, status: ["pending"] })).toBe(false);
    expect(matchesFilters(row({ open: false }), { ...EMPTY_FILTERS, open: true })).toBe(false);
  });
  it("round-trips through the URL and drops unknown values", () => {
    const f = { ...EMPTY_FILTERS, q: "tacos", cuisines: ["tacos", "bbq"] as const, type: "fixed" as const, open: true, status: ["pending"] as const };
    expect(parseFilters(filtersToSearch({ ...f, cuisines: [...f.cuisines], status: [...f.status] }))).toEqual({ ...f, cuisines: ["tacos", "bbq"], status: ["pending"] });
    expect(parseFilters({ cuisine: "tacos,nope", type: "boat", status: "lost" })).toEqual({ ...EMPTY_FILTERS, cuisines: ["tacos"] });
  });
  it("reads the city from an address", () => {
    expect(cityOf("1200 River Dr, Moline, IL 61265")).toBe("Moline");
    expect(cityOf("500 Main St, Rock Island, IL")).toBe("Rock Island");
  });
  it("admin trucks default view shows only approved trucks until a status filter is picked", () => {
    expect(adminDefaultVisible(row({ adminStatus: "approved" }), EMPTY_FILTERS)).toBe(true);
    expect(adminDefaultVisible(row({ adminStatus: "pending" }), EMPTY_FILTERS)).toBe(false);
    expect(adminDefaultVisible(row({ adminStatus: "rejected" }), EMPTY_FILTERS)).toBe(false);
    expect(adminDefaultVisible(row({ adminStatus: "deleted" }), EMPTY_FILTERS)).toBe(false);
    expect(adminDefaultVisible(row({ adminStatus: "pending" }), { ...EMPTY_FILTERS, status: ["pending"] })).toBe(true);
    expect(adminDefaultVisible(row({ adminStatus: "approved" }), { ...EMPTY_FILTERS, status: ["pending"] })).toBe(false);
  });
  it("admin status and 30-day restore window", () => {
    expect(adminStatus({ status: "active" })).toBe("approved");
    expect(adminStatus({ status: "archived" })).toBe("rejected");
    expect(adminStatus({ status: "archived", deleted_at: "2026-10-01" })).toBe("deleted");
    expect(restoreDaysLeft("2026-10-01T00:00:00Z", new Date("2026-10-11T00:00:00Z"))).toBe(20);
    expect(restoreDaysLeft("2026-08-01T00:00:00Z", new Date("2026-10-11T00:00:00Z"))).toBe(0);
  });
});
