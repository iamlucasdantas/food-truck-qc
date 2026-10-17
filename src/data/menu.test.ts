import { describe, expect, it } from "vitest";
import { matchesSearch, menuSearchText, normalizeMenu, parsePrice } from "./menu";

describe("menu parsing", () => {
  it("reads prices in common formats", () => {
    expect(parsePrice("$8.50")).toBe(8.5);
    expect(parsePrice("8,50")).toBe(8.5);
    expect(parsePrice(12)).toBe(12);
    expect(parsePrice("Market price")).toBeNull();
  });

  it("keeps sections, items, tags and the low-confidence flag", () => {
    const m = normalizeMenu({
      sections: [{ name: "Tacos", items: [
        { name: " Al pastor ", description: "Pork, pineapple", price: "$4", tags: ["Spicy", "GF", "unknown"], confidence: "low" },
        { name: "", price: 3 },
      ] }],
    });
    expect(m.readable).toBe(true);
    expect(m.sections).toEqual([{ name: "Tacos", items: [
      { name: "Al pastor", description: "Pork, pineapple", price: 4, tags: ["spicy", "gluten-free"], lowConfidence: true },
    ] }]);
  });

  it("merges duplicate sections and names unnamed ones 'Menu'", () => {
    const m = normalizeMenu({ sections: [{ name: "", items: [{ name: "Fries", price: 3 }] }, { name: "menu", items: [{ name: "Soda", price: 2 }] }] });
    expect(m.sections).toHaveLength(1);
    expect(m.sections[0]!.items.map((i) => i.name)).toEqual(["Fries", "Soda"]);
  });

  it("reports a friendly problem when nothing could be read (blurry / no text)", () => {
    expect(normalizeMenu({ sections: [], problem: "The photo is too blurry to read." })).toEqual({ sections: [], readable: false, problem: "The photo is too blurry to read." });
    expect(normalizeMenu(null).problem).toBe("No menu items could be read from these photos.");
  });

  it("search finds a truck by a dish on its menu, plural tolerant", () => {
    const text = menuSearchText([{ name: "Mains", items: [{ name: "Birria taco", description: "", price: 4, tags: [], lowConfidence: false }] }]);
    expect(matchesSearch("tacos", text)).toBe(true);
    expect(matchesSearch("birria", text)).toBe(true);
    expect(matchesSearch("pizza", text)).toBe(false);
  });
});

import { postMenuToSections } from "./menu";
describe("menu from a social post", () => {
  it("returns null when the post has no menu (keep the current one)", () => {
    expect(postMenuToSections([])).toBeNull();
    expect(postMenuToSections([{ section: "Specials", items: [{ name: " ", price: null, description: "" }] }])).toBeNull();
  });
  it("turns a post menu into sections that replace the current menu", () => {
    expect(postMenuToSections([{ section: "", items: [{ name: "Brisket plate", price: 14, description: "" }] }]))
      .toEqual([{ name: "Menu", items: [{ name: "Brisket plate", description: "", price: 14, tags: [], lowConfidence: false }] }]);
  });
});
