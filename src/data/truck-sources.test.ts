import { describe, expect, it } from "vitest";
import { truckSourceUrl, truckTypeLabel } from "./truck-sources";

describe("truckSourceUrl", () => {
  it("accepts Facebook pages and rejects groups (groups stay global)", () => {
    expect(truckSourceUrl("https://www.facebook.com/coffeeandcrumbtruck", "page")).toBe("https://www.facebook.com/coffeeandcrumbtruck");
    expect(truckSourceUrl("https://www.facebook.com/groups/qcfoodtrucks", "page")).toBeNull();
  });
  it("normalizes Instagram handles", () => {
    expect(truckSourceUrl("@ruralrumpsbbq", "instagram")).toBe("https://www.instagram.com/ruralrumpsbbq/");
    expect(truckSourceUrl("https://instagram.com/ruralrumpsbbq/", "instagram")).toBe("https://www.instagram.com/ruralrumpsbbq/");
  });
  it("accepts any https website", () => {
    expect(truckSourceUrl("example.com/schedule", "website")).toBe("https://example.com/schedule");
    expect(truckSourceUrl("ftp://example.com", "website")).toBeNull();
  });
  it("restricts calendars to trusted providers", () => {
    expect(truckSourceUrl("https://calendar.google.com/calendar/ical/abc/basic.ics", "calendar")).toContain("calendar.google.com");
    expect(truckSourceUrl("https://p01-caldav.icloud.com/published/2/abc", "calendar")).toContain("caldav.icloud.com");
    expect(truckSourceUrl("https://evil.example.com/cal.ics", "calendar")).toBeNull();
  });
  it("accepts only Google Maps links for gmaps", () => {
    expect(truckSourceUrl("https://maps.app.goo.gl/abc123", "gmaps")).toBe("https://maps.app.goo.gl/abc123");
    expect(truckSourceUrl("https://www.google.com/maps/place/Bonbon", "gmaps")).toContain("google.com/maps");
    expect(truckSourceUrl("https://www.google.com/search?q=bonbon", "gmaps")).toBeNull();
    expect(truckSourceUrl("https://bing.com/maps", "gmaps")).toBeNull();
  });
});

describe("truckTypeLabel", () => {
  it("labels all three types", () => {
    expect(truckTypeLabel("fixed")).toBe("Fixed location");
    expect(truckTypeLabel("hybrid")).toBe("Hybrid (fixed spot, also moves)");
    expect(truckTypeLabel("mobile")).toBe("Mobile");
    expect(truckTypeLabel(null)).toBe("Mobile");
  });
});
