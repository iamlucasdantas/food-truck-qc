import { describe, it, expect } from "vitest";
import { profileView, readNotifications, foodieLevel } from "./profile";
import { completeness } from "./onboarding";
describe("role-aware profile", () => {
  it("opens diners in Foodie mode", () => expect(profileView(["consumer"], false, "owner")).toBe("foodie"));
  it("opens owners in owner mode", () => expect(profileView(["owner"], false)).toBe("owner"));
  it("lets owners also use Foodie mode", () => expect(profileView(["owner"], true, "foodie")).toBe("foodie"));
  it("recognizes a creator with a pending truck", () => expect(profileView(["consumer"], true)).toBe("owner"));
});
describe("notification preferences", () => {
  it("retains explicit opt-outs", () => expect(readNotifications({ favorite_open: false }).favorite_open).toBe(false));
  it("limits radius to 1–50 miles", () => { expect(readNotifications({ radius: 0 }).radius).toBe(1); expect(readNotifications({ radius: 90 }).radius).toBe(50); });
  it("validates quiet times", () => expect(readNotifications({ quiet_start: "26:90" }).quiet_start).toBe("22:00"));
});
describe("Foodie milestones", () => {
  it("has no fabricated progress", () => expect(foodieLevel(0, []).score).toBe(0));
  it("awards first favorite", () => expect(foodieLevel(1, []).score).toBe(33));
  it("counts five distinct tried trucks", () => { const v = Array.from({ length: 5 }, (_, i) => ({ truck_id: String(i), visited_at: "2026-10-16T18:00:00Z" })); expect(foodieLevel(1, v).badges[1]?.earned).toBe(true); expect(foodieLevel(1, [v[0], v[0]].filter(x => x !== undefined)).badges[1]?.earned).toBe(false); });
  it("awards early bird before 11 in Central time", () => { expect(foodieLevel(0, [{truck_id:"a",visited_at:"2026-10-16T14:00:00Z"}]).badges[2]?.earned).toBe(true); expect(foodieLevel(0, [{truck_id:"a",visited_at:"2026-10-16T18:00:00Z"}]).badges[2]?.earned).toBe(false); });
});
it("owner completeness is exactly 100 with all sections", () => expect(completeness({businessName:"QC",truckName:"Taco",cuisine:"Mexican",description:"A local truck serving fresh tacos.",logoUrl:"logo",paymentMethods:["Cash"],hasMenu:true,photoCount:1,hasSchedule:true}).score).toBe(100));