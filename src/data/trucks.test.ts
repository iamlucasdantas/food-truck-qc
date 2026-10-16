import { describe, it, expect } from "vitest";
import { getTrucks, milesBetween, stopFor, QC_CENTER } from "./trucks";

describe("trucks", () => {
  it("seeds at least 50 trucks", () => expect(getTrucks().length).toBeGreaterThanOrEqual(50));
  it("computes distance in miles", () => {
    expect(milesBetween(QC_CENTER, { lat: QC_CENTER.lat + 1, lng: QC_CENTER.lng })).toBeCloseTo(69.1, 0);
  });
  it("marks a truck open during its stop hours today", () => {
    const t = getTrucks().find((x) => x.weekly[3])!;
    const s = t.weekly[3]!;
    const now = new Date(2026, 9, 14, s.start, 30); // a Wednesday
    expect(stopFor(t, now, "now", now).status).toBe("open");
  });
});
