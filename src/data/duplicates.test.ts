import { describe, expect, it } from "vitest";
import { findDuplicates, normLink } from "./duplicates";

const trucks = [
  { id: "toni", name: "Toni's Smokin' Grill", facebook: "https://www.facebook.com/tonissmokingrill/", phone: "(563) 555-0101" },
  { id: "floyd", name: "Floyd's Burgers", instagram: "@qcafloyds" },
  { id: "schaab", name: "Schaab's Street Eats", facebook: "https://www.facebook.com/profile.php?id=61571644514628" },
  { id: "gone", name: "Deleted Tacos", deleted_at: "2026-10-01" },
];

describe("duplicate detection", () => {
  it("normalizes links", () => {
    expect(normLink("http://m.facebook.com/TonisSmokinGrill?ref=x")).toBe("facebook.com/tonissmokingrill");
    expect(normLink("@qcafloyds")).toBe("instagram.com/qcafloyds");
  });
  it("same Facebook page is a strong duplicate", () => {
    const [m] = findDuplicates({ name: "Something else", facebook: "facebook.com/TonisSmokinGrill" }, trucks);
    expect(m).toMatchObject({ id: "toni", strong: true });
  });
  it("profile.php id links match only on the same id", () => {
    expect(findDuplicates({ facebook: "https://facebook.com/profile.php?id=61571644514628&sk=about" }, trucks)[0]?.id).toBe("schaab");
    expect(findDuplicates({ facebook: "https://facebook.com/profile.php?id=1" }, trucks)).toEqual([]);
  });
  it("same Instagram handle and phone count", () => {
    expect(findDuplicates({ instagram: "https://instagram.com/qcafloyds/" }, trucks)[0]?.id).toBe("floyd");
    expect(findDuplicates({ phone: "+1 563-555-0101" }, trucks)[0]?.id).toBe("toni");
  });
  it("similar spelling is flagged as a possible duplicate", () => {
    const [m] = findDuplicates({ name: "Tony's Smoking Grill" }, trucks);
    expect(m).toMatchObject({ id: "toni", strong: false });
  });
  it("unrelated or deleted trucks are not duplicates", () => {
    expect(findDuplicates({ name: "Big Boyz Pizza" }, trucks)).toEqual([]);
    expect(findDuplicates({ name: "Deleted Tacos" }, trucks)).toEqual([]);
  });
});
