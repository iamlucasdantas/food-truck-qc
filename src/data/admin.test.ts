import { describe, expect, it } from "vitest";
import { badgeText, buildCommands, filterCommands, isPaletteShortcut, sectionFromSearch, sidebarCounts } from "./admin";

describe("sidebar counters", () => {
  it("counts only non-deleted pending trucks", () => {
    const trucks = [
      { status: "pending", deleted_at: null },
      { status: "pending", deleted_at: "2026-10-01T00:00:00Z" },
      { status: "active", deleted_at: null },
      { status: "pending", deleted_at: null },
    ];
    expect(sidebarCounts(trucks, []).pending).toBe(2);
  });
  it("counts only claims waiting for review", () => {
    expect(sidebarCounts([], [{ status: "pending" }, { status: "approved" }, { status: "rejected" }, { status: "pending" }]).claims).toBe(2);
  });
  it("hides the badge at zero and caps it at 99+", () => {
    expect(badgeText(0)).toBe("");
    expect(badgeText(7)).toBe("7");
    expect(badgeText(99)).toBe("99");
    expect(badgeText(150)).toBe("99+");
  });
});

describe("admin sections", () => {
  it("defaults to Overview and keeps old tab links working", () => {
    expect(sectionFromSearch(undefined)).toBe("overview");
    expect(sectionFromSearch("Claims")).toBe("claims");
    expect(sectionFromSearch("CSV import")).toBe("csv");
    expect(sectionFromSearch("pending")).toBe("pending");
  });
});

describe("command palette", () => {
  const cmds = buildCommands(
    [
      { id: "skinnys", name: "Skinny's Fiya Truck", business_name: "Skinny's BBQ", status: "active" },
      { id: "tacos", name: "Taco Loco", status: "pending" },
    ],
    [{ id: "c1", truck_id: "tacos", truck_name: "Taco Loco", status: "pending", user_email: "a@b.com" }, { id: "c2", truck_id: "x", status: "approved" }],
  );

  it("opens with Cmd+K or Ctrl+K only", () => {
    expect(isPaletteShortcut({ key: "k", metaKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "K", ctrlKey: true })).toBe(true);
    expect(isPaletteShortcut({ key: "k" })).toBe(false);
  });
  it("shows navigation and actions when empty, not trucks", () => {
    const out = filterCommands(cmds, "");
    expect(out.some((c) => c.group === "Trucks")).toBe(false);
    expect(out[0]!.target.tab).toBe("overview");
  });
  it("jumps to a truck by name and opens its panel", () => {
    const hit = filterCommands(cmds, "fiya")[0]!;
    expect(hit.label).toBe("Skinny's Fiya Truck");
    expect(hit.target).toEqual({ tab: "trucks", truck: "skinnys" });
  });
  it("finds a truck by its business name", () => {
    expect(filterCommands(cmds, "bbq")[0]!.target.truck).toBe("skinnys");
  });
  it("lists only open claims", () => {
    const claims = cmds.filter((c) => c.group === "Claims");
    expect(claims.map((c) => c.id)).toEqual(["claim:c1"]);
    expect(filterCommands(cmds, "a@b.com")[0]!.target.tab).toBe("claims");
  });
  it("ranks label prefix matches first", () => {
    expect(filterCommands(cmds, "taco")[0]!.label).toBe("Taco Loco");
  });
});
