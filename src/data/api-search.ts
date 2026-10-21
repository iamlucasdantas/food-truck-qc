import { matchesSearch } from "@/data/menu";
import { groupStops, milesBetween } from "@/data/trucks";

// Pure search rules shared by the public API endpoints (chat agent + personal-key v1), unit-tested.

export type SearchParams = {
  query?: string | undefined; location?: string | undefined; cuisine?: string | undefined; dish?: string | undefined; open_now?: boolean | undefined;
  lat?: number | undefined; lng?: number | undefined; radius_miles?: number | undefined; days: number; limit: number;
};
export type ApiTruck = {
  id: string; name: string; category: string; menu_search: string | null; truck_type: string;
  base_address: string | null; base_lat: number | null; base_lng: number | null;
};
export type ApiStop = {
  truck_id: string; venue_name: string; address: string | null; city: string | null;
  lat: number | null; lng: number | null; starts_at: string; ends_at: string; source: string; created_at: string; note?: string | null; source_url?: string | null; series_id?: string | null; calendar_source_id?: string | null;
};
export type SearchHit<T extends ApiTruck, S extends ApiStop> = {
  truck: T; stops: (S & { merged: number; open_now: boolean | null })[];
  open_now: boolean; distance_miles: number | null; is_base_location: boolean;
};

export const DEFAULT_RADIUS_MILES = 10;
/** Google Maps base listings carry fake "all day" hours: treat as a location, not a schedule. */
const isBase = (s: ApiStop) => s.source === "apify_maps";

export function searchTrucks<T extends ApiTruck, S extends ApiStop>(trucks: T[], stops: S[], p: SearchParams, now = new Date()): SearchHit<T, S>[] {
  const until = now.getTime() + p.days * 86400_000;
  const near = p.lat != null && p.lng != null ? { lat: p.lat, lng: p.lng } : null;
  const radius = p.radius_miles ?? DEFAULT_RADIUS_MILES;
  const loc = p.location?.trim().toLowerCase() ?? "";
  const inWindow = groupStops(stops.filter((s) => new Date(s.ends_at).getTime() > now.getTime() && new Date(s.starts_at).getTime() <= until))
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const out: SearchHit<T, S>[] = [];
  for (const t of trucks) {
    const hay = [t.name, t.category, t.menu_search ?? ""].join(" ");
    if (p.query?.trim() && !matchesSearch(p.query, hay)) continue;
    if (p.cuisine?.trim() && !matchesSearch(p.cuisine, [t.category, t.name].join(" "))) continue;
    if (p.dish?.trim() && !matchesSearch(p.dish, t.menu_search ?? "")) continue;
    let mine = inWindow.filter((s) => s.truck_id === t.id).map((s) => ({
      ...s, open_now: isBase(s) ? null : new Date(s.starts_at) <= now && new Date(s.ends_at) > now,
    }));
    const hasBase = t.base_lat != null && t.base_lng != null && (t.truck_type === "fixed" || mine.some(isBase));
    if (loc) {
      const match = (txt: string | null | undefined) => !!txt && txt.toLowerCase().includes(loc);
      mine = mine.filter((s) => match(s.city) || match(s.address) || match(s.venue_name));
      if (!mine.length && !match(t.base_address)) continue;
    }
    const open = mine.some((s) => s.open_now === true);
    if (p.open_now && !open) continue;
    let distance: number | null = null;
    if (near) {
      const pts = mine.filter((s) => s.lat != null && s.lng != null).map((s) => ({ lat: s.lat!, lng: s.lng! }));
      if (hasBase) pts.push({ lat: t.base_lat!, lng: t.base_lng! });
      if (!pts.length) continue;
      distance = Math.min(...pts.map((x) => milesBetween(near, x)));
      if (distance > radius) continue;
      distance = Math.round(distance * 10) / 10;
    }
    out.push({ truck: t, stops: mine.filter((s) => !isBase(s)), open_now: open, distance_miles: distance, is_base_location: !mine.some((s) => !isBase(s)) });
  }
  return out.sort((a, b) =>
    (a.distance_miles ?? 0) - (b.distance_miles ?? 0)
    || Number(b.open_now) - Number(a.open_now)
    || (a.stops[0]?.starts_at ?? "9").localeCompare(b.stops[0]?.starts_at ?? "9")
    || a.truck.name.localeCompare(b.truck.name)).slice(0, p.limit);
}
