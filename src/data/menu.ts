/** Structured truck menus: shared by the AI menu reader (server), owner review screen and public truck page. */
export const MENU_TAGS = ["vegan", "vegetarian", "spicy", "gluten-free"] as const;
export type MenuTag = (typeof MENU_TAGS)[number];
export type MenuItem = { name: string; description: string; price: number | null; tags: MenuTag[]; lowConfidence: boolean };
export type MenuSection = { name: string; items: MenuItem[] };
export type MenuRead = { sections: MenuSection[]; readable: boolean; problem: string };

/** "$8.50", "8,50", "8" → 8.5; anything without a number → null. */
export function parsePrice(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) && v >= 0 ? Math.round(v * 100) / 100 : null;
  if (typeof v !== "string") return null;
  const m = v.replace(/,(\d{2})\b/, ".$1").match(/\d+(?:\.\d+)?/);
  return m ? Math.round(parseFloat(m[0]) * 100) / 100 : null;
}

function normTag(t: unknown): MenuTag | null {
  const s = String(t ?? "").toLowerCase().replace(/[\s_]+/g, "-");
  if (s === "gf" || s.startsWith("gluten")) return "gluten-free";
  if (s === "v" || s === "vegan") return "vegan";
  if (s.startsWith("vegetarian") || s === "veggie") return "vegetarian";
  if (s.startsWith("spic") || s === "hot") return "spicy";
  return null;
}

/** Clean and validate whatever the AI returned so the UI and DB only ever see a well-formed menu. */
export function normalizeMenu(raw: unknown): MenuRead {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const sections: MenuSection[] = [];
  for (const s of Array.isArray(r["sections"]) ? r["sections"] : []) {
    const so = (s ?? {}) as Record<string, unknown>;
    const items: MenuItem[] = [];
    for (const it of Array.isArray(so["items"]) ? so["items"] : []) {
      const io = (it ?? {}) as Record<string, unknown>;
      const name = String(io["name"] ?? "").trim().slice(0, 120);
      if (!name) continue;
      const tags = [...new Set((Array.isArray(io["tags"]) ? io["tags"] : []).map(normTag).filter((t): t is MenuTag => !!t))];
      items.push({
        name,
        description: String(io["description"] ?? "").trim().slice(0, 300),
        price: parsePrice(io["price"]),
        tags,
        lowConfidence: io["confidence"] === "low" || io["lowConfidence"] === true,
      });
    }
    if (items.length) {
      const name = String(so["name"] ?? "").trim().slice(0, 80) || "Menu";
      const existing = sections.find((x) => x.name.toLowerCase() === name.toLowerCase());
      if (existing) existing.items.push(...items); else sections.push({ name, items });
    }
  }
  const count = sections.reduce((n, s) => n + s.items.length, 0);
  const problem = count ? "" : String(r["problem"] ?? "").trim() || "No menu items could be read from these photos.";
  return { sections, readable: count > 0, problem };
}

/** Lowercase text of every section, item, description and tag — stored on the truck so search can find dishes. */
export function menuSearchText(sections: MenuSection[]): string {
  return sections.flatMap((s) => [s.name, ...s.items.flatMap((i) => [i.name, i.description, ...i.tags])]).join(" ").toLowerCase().replace(/\s+/g, " ").trim();
}

/** True when every word of the query appears in the truck's name, cuisine or menu (simple plural tolerant: "tacos" ~ "taco"). */
export function matchesSearch(query: string, haystack: string): boolean {
  const h = haystack.toLowerCase();
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  return words.every((w) => h.includes(w) || (w.length > 3 && w.endsWith("s") && h.includes(w.slice(0, -1))));
}
