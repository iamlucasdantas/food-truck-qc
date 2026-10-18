import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { inQuadCities, matchVenue, needsAddressCheck, normVenue } from "@/data/posts";
import { DAVENPORT_CENTER } from '@/data/coverage';

type DB = SupabaseClient<Database>;
export type ResolvedVenue = { name: string; address: string | null; city: string; lat: number; lng: number; check: boolean };

const GATEWAY = "https://connector-gateway.lovable.dev/google_maps";
const QC = { latitude: DAVENPORT_CENTER.lat, longitude: DAVENPORT_CENTER.lng };

function cityFromAddress(a: string): string {
  const parts = a.split(",").map((s) => s.trim());
  return parts.length >= 3 ? parts[parts.length - 3]! : "";
}

/** Google Places text search, biased to the Quad Cities. Returns null when not configured or nothing found. */
async function placesLookup(name: string, cityHint: string) {
  const lovable = process.env["LOVABLE_API_KEY"], maps = process.env["GOOGLE_MAPS_API_KEY"];
  if (!lovable || !maps) return null;
  const res = await fetch(`${GATEWAY}/places/v1/places:searchText`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps, "Content-Type": "application/json",
      "X-Goog-FieldMask": "places.displayName,places.formattedAddress,places.location",
    },
    body: JSON.stringify({ textQuery: [name, cityHint || "Davenport Iowa region"].join(", "), pageSize: 3, locationBias: { circle: { center: QC, radius: 50000 } } }),
  });
  if (!res.ok) { console.error(`[venues] Places lookup failed [${res.status}]: ${(await res.text()).slice(0, 300)}`); return null; }
  const j = (await res.json()) as { places?: { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number } }[] };
  const hits = (j.places ?? []).filter((p) => p.location).map((p) => ({ name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", lat: p.location!.latitude, lng: p.location!.longitude }));
  return hits.find((h) => inQuadCities(h.lat, h.lng)) ?? null;
}

/**
 * Address + coordinates for a venue name: saved venues first, then confirmed owner stops at that venue,
 * then Google Places (Quad Cities bias). New lookups are saved so the next post reuses them.
 * `check` = low confidence: the stop stays out of public view until the owner/admin confirms it.
 */
export async function resolveVenue(db: DB, name: string, cityHint = "", address = ""): Promise<ResolvedVenue | null> {
  const clean = name.trim();
  if (!clean && !address) return null;
  const key = normVenue(clean || address);
  const { data: venues } = await db.from("venues").select("*").limit(2000);
  const saved = clean ? matchVenue(clean, venues ?? []) : null;
  if (saved) return { name: saved.name, address: saved.address, city: saved.city, lat: saved.lat, lng: saved.lng, check: !saved.confirmed };

  if (clean) {
    const { data: stops } = await db.from("stops").select("venue_name, address, city, lat, lng").eq("source", "owner").ilike("venue_name", clean.replace(/[%_]/g, "")).limit(1);
    const s = stops?.[0];
    if (s && inQuadCities(s.lat, s.lng)) {
      await db.from("venues").upsert({ name: clean, norm_name: key, address: s.address, city: s.city, lat: s.lat, lng: s.lng, confirmed: true, source: "owner_stop" }, { onConflict: "norm_name", ignoreDuplicates: true });
      return { name: clean, address: s.address, city: s.city, lat: s.lat, lng: s.lng, check: false };
    }
  }

  const hit = await placesLookup(address || clean, cityHint);
  if (!hit) return null;
  const check = needsAddressCheck(clean || address, hit);
  const row = { name: clean || hit.name, norm_name: key, address: hit.address, city: cityFromAddress(hit.address) || cityHint, lat: hit.lat, lng: hit.lng, confirmed: !check, source: "places" };
  if (key) await db.from("venues").upsert(row, { onConflict: "norm_name", ignoreDuplicates: true });
  return { name: row.name, address: row.address, city: row.city, lat: row.lat, lng: row.lng, check };
}
