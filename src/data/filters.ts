import { matchesSearch } from "@/data/menu";

export const CUISINES = [
  { key: "tacos", label: "Tacos", emoji: "🌮", re: /mexic|taco|latin/i },
  { key: "bbq", label: "BBQ", emoji: "🍖", re: /bbq|barbe|smoke/i },
  { key: "burgers", label: "Burgers", emoji: "🍔", re: /burger|hot dog|sandwich|chicken|grill/i },
  { key: "asian", label: "Asian", emoji: "🍜", re: /asian|thai|korean|japan|chinese|indian|viet|fusion/i },
  { key: "pizza", label: "Pizza", emoji: "🍕", re: /pizza|italian/i },
  { key: "dessert", label: "Dessert", emoji: "🍦", re: /dessert|ice cream|sweet|bak|donut|cupcake/i },
  { key: "coffee", label: "Coffee", emoji: "☕", re: /coffee|espresso|cafe/i },
  { key: "other", label: "Other", emoji: "🍽", re: null },
] as const;
export type CuisineKey = (typeof CUISINES)[number]["key"];
export function cuisineOf(category: string): CuisineKey {
  return CUISINES.find((c) => c.re?.test(category))?.key ?? "other";
}

export const CITIES = ["Davenport", "Bettendorf", "Moline", "Rock Island", "East Moline", "Silvis", "Milan", "Le Claire", "Eldridge"] as const;

/** City name from a free-text address ("123 Main St, Moline, IL 61265" → "Moline"). */
export function cityOf(address: string | null | undefined): string {
  const a = address ?? "";
  const known = CITIES.find((c) => new RegExp(`\\b${c}\\b`, "i").test(a));
  if (known) return known;
  const parts = a.split(",").map((s) => s.trim()).filter((s) => s && !/^(USA|United States|[A-Z]{2}(\s+\d{5})?)$/.test(s));
  return parts.length >= 2 ? parts[parts.length - 1]!.replace(/\s+[A-Z]{2}(\s+\d{5})?$/, "") : "";
  // eslint-disable-next-line no-unreachable
  return parts.length >= 3 ? parts[parts.length - 2]! : parts.length === 2 ? parts[1]!.replace(/\s+[A-Z]{2}(\s+\d{5})?$/, "") : "";
}

export type AdminStatus = "approved" | "pending" | "rejected" | "deleted";
export type Filters = {
  q: string; cuisines: CuisineKey[]; dish: string; city: string;
  type: "" | "fixed" | "mobile"; status: AdminStatus[]; open: boolean;
};
export const EMPTY_FILTERS: Filters = { q: "", cuisines: [], dish: "", city: "", type: "", status: [], open: false };

const list = (v: unknown) => (Array.isArray(v) ? v.map(String) : typeof v === "string" && v ? v.split(",") : []);
/** Read filters from URL search params; unknown values are dropped. */
export function parseFilters(s: Record<string, unknown>): Filters {
  const keys = CUISINES.map((c) => c.key) as string[];
  const sts = ["approved", "pending", "rejected", "deleted"];
  const type = String(s["type"] ?? "");
  return {
    q: typeof s["q"] === "string" ? s["q"] : "",
    cuisines: list(s["cuisine"]).filter((c) => keys.includes(c)) as CuisineKey[],
    dish: typeof s["dish"] === "string" ? s["dish"] : "",
    city: typeof s["city"] === "string" ? s["city"] : "",
    type: type === "fixed" || type === "mobile" ? type : "",
    status: list(s["status"]).filter((x) => sts.includes(x)) as AdminStatus[],
    open: s["open"] === true || s["open"] === "1" || s["open"] === 1 || s["open"] === "true",
  };
}
/** Filters → URL search params (defaults left out so links stay short). */
export function filtersToSearch(f: Filters): Record<string, string | undefined> {
  return {
    q: f.q || undefined, cuisine: f.cuisines.join(",") || undefined, dish: f.dish || undefined, city: f.city || undefined,
    type: f.type || undefined, status: f.status.join(",") || undefined, open: f.open ? "1" : undefined,
  };
}

export type FilterRow = {
  name: string; business_name?: string | null; category: string; menu_search?: string | null;
  city: string; truck_type: string; adminStatus?: AdminStatus; open?: boolean;
};
export function matchesFilters(r: FilterRow, f: Filters): boolean {
  const q = f.q.trim().toLowerCase();
  if (q && !matchesSearch(q, [r.name, r.business_name ?? "", r.category, r.menu_search ?? "", r.city].join(" "))) return false;
  const dish = f.dish.trim().toLowerCase();
  if (dish && !matchesSearch(dish, r.menu_search ?? "")) return false;
  if (f.cuisines.length && !f.cuisines.includes(cuisineOf(r.category))) return false;
  if (f.city && r.city.toLowerCase() !== f.city.toLowerCase()) return false;
  if (f.type && r.truck_type !== f.type) return false;
  if (f.status.length && (!r.adminStatus || !f.status.includes(r.adminStatus))) return false;
  if (f.open && !r.open) return false;
  return true;
}

/**
 * Map "Open now" rule: the live view starts filtered to trucks open right now; when the
 * visitor clicks the chip it goes grey and every truck in range shows again.
 * `explicitOpen` = chip/URL asked for open-only, `showAll` = visitor clicked to see everything.
 */
export function openNowApplied(f: { explicitOpen: boolean; showAll: boolean; inNowView: boolean; openCount: number }): boolean {
  if (f.showAll) return false;
  if (f.explicitOpen) return true;
  return f.inNowView;
}

/** Admin trucks default view: with no status filter selected, only approved (active) trucks are listed. */
export function adminDefaultVisible(r: FilterRow, f: Filters): boolean {
  if (!matchesFilters(r, f)) return false;
  return f.status.length > 0 || r.adminStatus === "approved";
}

/** Status shown to admins: active → approved, archived → rejected, soft-deleted → deleted. */
export function adminStatus(t: { status: string; deleted_at?: string | null }): AdminStatus {
  if (t.deleted_at) return "deleted";
  return t.status === "active" ? "approved" : t.status === "pending" ? "pending" : "rejected";
}
/** Days left before a deleted truck is removed for good (30-day restore window). */
export function restoreDaysLeft(deletedAt: string, now = new Date()): number {
  return Math.max(0, 30 - Math.floor((now.getTime() - Date.parse(deletedAt)) / 86_400_000));
}
