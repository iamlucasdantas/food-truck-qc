import { describe, expect, it } from "vitest";
import { searchTrucks, type ApiStop, type ApiTruck } from "./api-search";

const now = new Date("2026-10-17T17:00:00Z"); // noon Central
const T = (o: Partial<ApiTruck>): ApiTruck => ({ id: "x", name: "X", category: "", menu_search: "", truck_type: "mobile", base_address: null, base_lat: null, base_lng: null, ...o });
const S = (o: Partial<ApiStop>): ApiStop => ({ truck_id: "x", venue_name: "V", address: "1 Main St, Moline, IL", city: "Moline", lat: 41.5, lng: -90.5, starts_at: "2026-10-17T16:00:00Z", ends_at: "2026-10-17T20:00:00Z", source: "owner", created_at: "2026-10-01T00:00:00Z", ...o });
const trucks = [
  T({ id: "taco", name: "Ana's Tacos", category: "Mexican", menu_search: "birria quesadilla" }),
  T({ id: "bbq", name: "Smoke Pit", category: "BBQ", menu_search: "brisket ribs" }),
];
const stops = [
  S({ truck_id: "taco" }),
  S({ truck_id: "bbq", city: "Davenport", address: "2 Brady St, Davenport, IA", lat: 41.55, lng: -90.6, starts_at: "2026-10-18T18:00:00Z", ends_at: "2026-10-18T22:00:00Z" }),
];
const base = { days: 3, limit: 25 };
const ids = (p: Parameters<typeof searchTrucks>[2]) => searchTrucks(trucks, stops, p, now).map((h) => h.truck.id);

describe("API search", () => {
  it("filters by cuisine", () => expect(ids({ ...base, cuisine: "bbq" })).toEqual(["bbq"]));
  it("filters by menu item", () => expect(ids({ ...base, dish: "birria" })).toEqual(["taco"]));
  it("filters by location (city)", () => expect(ids({ ...base, location: "davenport" })).toEqual(["bbq"]));
  it("open_now keeps only trucks open right now", () => expect(ids({ ...base, open_now: true })).toEqual(["taco"]));
  it("radius keeps trucks within the miles from the address, nearest first", () => {
    expect(ids({ ...base, lat: 41.5, lng: -90.5, radius_miles: 2 })).toEqual(["taco"]);
    const hits = searchTrucks(trucks, stops, { ...base, lat: 41.5, lng: -90.5, radius_miles: 20 }, now);
    expect(hits.map((h) => h.truck.id)).toEqual(["taco", "bbq"]);
    expect(hits[0]!.distance_miles).toBe(0);
  });
  it("ignores stops outside the day window", () => expect(ids({ ...base, days: 1, location: "davenport" })).toEqual([]));
});
