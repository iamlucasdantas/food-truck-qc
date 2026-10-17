import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { searchTrucks, type SearchParams } from "@/data/api-search";

// Shared query parsing + data loading for every public API search endpoint.

const bool = z.enum(["true", "false", "1", "0", "yes", "no"]).transform((v) => ["true", "1", "yes"].includes(v));
export const SearchQuery = z.object({
  query: z.string().max(100).optional(),
  location: z.string().max(80).optional(),
  city: z.string().max(80).optional(),
  cuisine: z.string().max(60).optional(),
  dish: z.string().max(80).optional(),
  menu_item: z.string().max(80).optional(),
  open_now: bool.optional(),
  near: z.string().max(200).optional(),
  address: z.string().max(200).optional(),
  lat: z.coerce.number().min(-90).max(90).optional(),
  lng: z.coerce.number().min(-180).max(180).optional(),
  radius_miles: z.coerce.number().min(0.1).max(100).optional(),
  truck_id: z.string().max(120).regex(/^[a-z0-9-]+$/i).optional(),
  days: z.coerce.number().int().min(1).max(14).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});
export type SearchInput = z.infer<typeof SearchQuery>;

/** Address → coordinates (OpenStreetMap, biased to the Quad Cities). */
export async function geocodeAddress(address: string): Promise<{ lat: number; lng: number; label: string } | null> {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&viewbox=-91.0,41.8,-90.0,41.3&q=${encodeURIComponent(address)}`;
  const res = await fetch(u, { headers: { Accept: "application/json", "User-Agent": "FoodTruckQC/1.0 (app.foodtruckqc.com)" } });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string }[];
  return hit ? { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name } : null;
}

export async function runSearch(input: SearchInput, defaults: { days: number; limit: number }) {
  const sb = createClient<Database>(process.env["SUPABASE_URL"]!, process.env["SUPABASE_PUBLISHABLE_KEY"]!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const addr = (input.near ?? input.address ?? "").trim();
  let origin: { lat: number; lng: number; label: string } | null = null;
  if (input.lat != null && input.lng != null) origin = { lat: input.lat, lng: input.lng, label: "" };
  else if (addr) {
    origin = await geocodeAddress(addr);
    if (!origin) return { error: "address not found" as const };
  }
  const p: SearchParams = {
    query: input.query, location: input.location ?? input.city, cuisine: input.cuisine, dish: input.dish ?? input.menu_item,
    open_now: input.open_now, lat: origin?.lat, lng: origin?.lng, radius_miles: input.radius_miles,
    days: input.days ?? defaults.days, limit: input.limit ?? defaults.limit,
  };
  const now = new Date();
  let tq = sb.from("trucks").select("id, name, business_name, category, description, truck_type, website, menu_search, menu_sections, menu, base_address, base_lat, base_lng")
    .eq("status", "active").is("deleted_at", null).limit(1000);
  let sq = sb.from("stops").select("truck_id, venue_name, address, city, lat, lng, starts_at, ends_at, source, created_at")
    .eq("cancelled", false).gte("ends_at", now.toISOString()).lte("starts_at", new Date(now.getTime() + p.days * 86400_000).toISOString())
    .order("starts_at").limit(2000);
  if (input.truck_id) { tq = tq.eq("id", input.truck_id); sq = sq.eq("truck_id", input.truck_id); }
  const [{ data: trucks, error: e1 }, { data: stops, error: e2 }] = await Promise.all([tq, sq]);
  if (e1 || e2) return { error: "lookup failed" as const };
  const hits = searchTrucks(trucks ?? [], stops ?? [], p, now);
  return { hits, origin, radius: origin ? (p.radius_miles ?? 10) : null };
}
