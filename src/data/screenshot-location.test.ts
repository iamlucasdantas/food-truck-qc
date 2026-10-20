import { expect, it } from "vitest";
import { applyStopLocation, editableStopLocation, trustedStopLocation } from "./screenshot-location";

const row = { venue: "Lindquist Ford", address: "", city: "Bettendorf", date: "2026-10-24", start: "11:00", end: "14:00" };
const hit = { name: "Lindquist Ford", address: "3950 Middle Rd, Bettendorf, IA", city: "Bettendorf", lat: 41.55, lng: -90.49, source: "Google Maps" };
it("fills a named venue's address and coordinates without changing its date or time", () => {
  expect(applyStopLocation(row, hit)).toMatchObject({ address: "3950 Middle Rd, Bettendorf, IA", date: "2026-10-24", start: "11:00", end: "14:00", location: { lat: 41.55, lng: -90.49 } });
});
it("does not trust a different venue, an empty address or invalid coordinates", () => {
  expect(trustedStopLocation(row.venue, { ...hit, name: "Other shop" })).toBe(false);
  expect(trustedStopLocation(row.venue, { ...hit, address: "" })).toBe(false);
  expect(trustedStopLocation(row.venue, { ...hit, lat: NaN })).toBe(false);
});
it("invalidates a researched pin when the address is edited, not when time is edited", () => {
  const draft = applyStopLocation(row, hit);
  expect(editableStopLocation(draft, "address", "911 11th St").location).toBeUndefined();
  expect(editableStopLocation(draft, "start", "12:00").location).toEqual(hit);
});