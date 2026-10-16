import { describe, expect, it } from "vitest";
import { isSocialScanTime } from "./social-schedule";

describe("automated Facebook scans", () => {
  it.each(["2026-10-16", "2026-12-16", "2026-03-08", "2026-11-01"])(
    "runs six times every day, every two hours from 10 through 20 Chicago on %s", (date) => {
      const localHours: number[] = [];
      for (let hour = 0; hour < 48; hour++) {
        const now = new Date(Date.parse(`${date}T00:00:00Z`) + hour * 3_600_000);
        const localDate = new Intl.DateTimeFormat("en-CA", {
          timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit",
        }).format(now);
        if (localDate === date && isSocialScanTime(now)) localHours.push(Number(new Intl.DateTimeFormat("en-US", {
          timeZone: "America/Chicago", hour: "numeric", hourCycle: "h23",
        }).format(now)));
      }
      expect(localHours.sort((a, b) => a - b)).toEqual([10, 12, 14, 16, 18, 20]);
    },
  );
  it("accepts the scheduler's short delivery spread", () => {
    expect(isSocialScanTime(new Date("2026-10-16T15:00:30Z"))).toBe(true);
    expect(isSocialScanTime(new Date("2026-10-16T14:59:59Z"))).toBe(false);
    expect(isSocialScanTime(new Date("2026-10-17T02:00:00Z"))).toBe(false);
  });
});