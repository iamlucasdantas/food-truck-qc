import { describe, expect, it } from "vitest";
import { summarizeUsage } from "./usage";

describe("admin usage stats", () => {
  it("counts unique visitors and direction clicks per location", () => {
    const s = summarizeUsage([
      { kind: "page_view", truck_id: null, venue: null, visitor: "a" },
      { kind: "page_view", truck_id: null, venue: null, visitor: "a" },
      { kind: "truck_view", truck_id: "t1", venue: null, visitor: "b" },
      { kind: "direction_click", truck_id: "t1", venue: "Lindquist Ford", visitor: "a" },
      { kind: "direction_click", truck_id: "t2", venue: "Lindquist Ford", visitor: "b" },
    ]);
    expect(s.visitors).toBe(2);
    expect(s.pageViews).toBe(2);
    expect(s.topVenues).toEqual([["Lindquist Ford", 2]]);
    expect(s.topTrucks).toEqual([["t1", 1]]);
  });
});
