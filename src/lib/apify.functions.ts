import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapApifyCategory, isFoodTruckPlace, slugify } from "@/data/trucks";
import { mobileEvidence } from '@/data/google-hours';
import { DISCOVERY_CITIES, inServiceRegion } from '@/data/coverage';
import { googleStatusPatch } from '@/data/google-profile';
import { completeAddress, profileCategory } from '@/data/ingestion-review';

export const SEED_CITIES = DISCOVERY_CITIES;

type Place = {
  title?: string; categoryName?: string; categories?: string[]; phone?: string; website?: string; address?: string; city?: string;
  location?: { lat: number; lng: number }; placeId?: string; imageUrl?: string; instagrams?: string[]; facebooks?: string[];
  temporarilyClosed?: boolean; permanentlyClosed?: boolean;
};

/** Admin-only: scrape one city from Google Maps via Apify and upsert trucks + 30 days of gray base stops. */
export const seedCity = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { city: string; runId?: string | undefined }) => {
    if (!SEED_CITIES.includes(d.city)) throw new Error("Unknown city");
    return d;
  })
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const token = process.env['APIFY_API_KEY'], lovable = process.env['LOVABLE_API_KEY'];
    if (!token || !lovable) throw new Error('Apify connection is not configured');

    const res = await fetch("https://connector-gateway.lovable.dev/apify/acts/compass~crawler-google-places/run-sync-get-dataset-items", {
      method: "POST",
      headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key':token, "Content-Type": "application/json" },
      body: JSON.stringify({ searchStringsArray: ["food truck"], locationQuery: `${data.city}, USA`, maxCrawledPlacesPerSearch: 25, language: "en", scrapeContacts: true, skipClosedPlaces: false }),
    });
    if (!res.ok) throw new Error(`Apify request failed [${res.status}]: ${(await res.text()).slice(0, 300)}`);
    const places = ((await res.json()) as Place[]).filter((p) => p.placeId && p.title && p.location && inServiceRegion(p.location.lat,p.location.lng) && isFoodTruckPlace(p.categoryName, p.categories, p.title));

    const ids = places.map((p) => p.placeId!);
    const { data: existing } = ids.length ? await supabase.from("trucks").select("id, google_place_id, claimed_by, is_food_truck, truck_type").in("google_place_id", ids) : { data: [] };
    const byPlace = new Map((existing ?? []).map((t) => [t.google_place_id!, t]));
    let created = 0, updated = 0;
    const errors: string[] = [];

    for (const p of places) {
      if (!p.placeId || !p.title || !p.location) continue;
      const categoryEvidence = profileCategory([p.categoryName ?? '', ...(p.categories ?? [])]);
      if (!completeAddress(p.address, p.location.lat, p.location.lng) || !categoryEvidence) { errors.push(`${p.title}: address or Google category missing — not imported`); continue; }
      const profileStatus = p.permanentlyClosed === true ? 'CLOSED_PERMANENTLY' : p.temporarilyClosed === true ? 'CLOSED_TEMPORARILY' : p.permanentlyClosed === false && p.temporarilyClosed === false ? 'OPERATIONAL' : null;
      const fields = {
        name: p.title!, category: mapApifyCategory(categoryEvidence), phone: p.phone ?? null, website: p.website ?? null,
        base_address: p.address ?? null, base_lat: p.location!.lat, base_lng: p.location!.lng, logo_url: p.imageUrl ?? null,
        instagram: p.instagrams?.[0] ?? null, facebook: p.facebooks?.[0] ?? null, source: "apify", google_place_id: p.placeId!,
        google_types: [...new Set([p.categoryName ?? '', ...(p.categories ?? [])].filter(Boolean))],
        is_food_truck: mobileEvidence(p.title ?? '', '', [p.categoryName ?? '', ...(p.categories ?? [])]),
        ...googleStatusPatch(profileStatus),
      };
      const ex = byPlace.get(p.placeId!);
      if (ex?.is_food_truck) fields.is_food_truck = true;
      if (!fields.is_food_truck) continue; // unrelated restaurants/stores never become new listings
      let truckId: string;
      if (ex) {
        if (ex.claimed_by) {
          const {error} = await supabase.from('trucks').update(googleStatusPatch(profileStatus)).eq('id',ex.id);
          if(error) errors.push(`${p.title}: ${error.message}`);
          if (ex.truck_type === 'fixed' && p.address?.trim()) {
            const {error: confirmError} = await supabase.rpc('confirm_truck_location',{_truck_id:ex.id,_google_verified:false});
            if(confirmError) errors.push(`${p.title} address: ${confirmError.message}`);
          }
          continue; // keep owner business fields unchanged
        }
        const { error } = await supabase.from("trucks").update(fields).eq("id", ex.id);
        if (error) { errors.push(`${p.title}: ${error.message}`); continue; }
        truckId = ex.id; updated++;
      } else {
        truckId = `${slugify(p.title!)}-${p.placeId!.slice(-5).toLowerCase()}`;
        const { error } = await supabase.from("trucks").insert({ id: truckId, status: "active", ...fields });
        if (error) { errors.push(`${p.title}: ${error.message}`); continue; }
        created++;
      }
      if (ex?.truck_type === 'fixed' && fields.is_food_truck && p.address?.trim()) {
        const {error} = await supabase.rpc('confirm_truck_location',{_truck_id:truckId,_google_verified:false});
        if(error) errors.push(`${p.title} address: ${error.message}`);
      }
      if(fields.is_food_truck) {
        const rows = [...(p.facebooks ?? []).map(url=>({kind:'page',url})), ...(p.instagrams ?? []).map(url=>({kind:'instagram',url}))].filter(s=>{try{const u=new URL(s.url);return ['facebook.com','www.facebook.com','instagram.com','www.instagram.com'].includes(u.hostname)&&u.pathname!=='/';}catch{return false;}}).map(s=>({...s,name:p.title ?? truckId,truck_id:truckId}));
        if(rows.length) { const {error} = await supabase.from('social_sources').upsert(rows,{onConflict:'url',ignoreDuplicates:true}); if(error) errors.push(`${p.title} sources: ${error.message}`); }
      }
      // Replace future base-location stops (only apify_maps rows; owner stops untouched).
      const now = new Date();
      await supabase.from("stops").delete().eq("truck_id", truckId).eq("source", "apify_maps").gte("starts_at", now.toISOString());
      const rows = Array.from({ length: 30 }, (_, i) => {
        const day = new Date(now); day.setUTCDate(day.getUTCDate() + i);
        const d = day.toISOString().slice(0, 10);
        return {
          truck_id: truckId, venue_name: "Base location (Google Maps)", address: p.address ?? null, city: p.city ?? data.city.split(",")[0]!,
          lat: p.location!.lat, lng: p.location!.lng, starts_at: `${d}T05:00:00Z`, ends_at: new Date(Date.parse(`${d}T05:00:00Z`) + 86_340_000).toISOString(), // all day, Central
          source: "apify_maps" as const, confidence: 0.3,
        };
      });
      const { error } = await supabase.from("stops").insert(rows);
      if (error) errors.push(`${p.title} stops: ${error.message}`);
    }
    // Record per-city progress server-side so a page reload never loses finished cities.
    if (data.runId) {
      const { data: run } = await supabase.from("ingestion_runs").select("*").eq("id", data.runId).single();
      if (run) {
        const done = Array.from(new Set([...(run.cities_done ?? []), data.city]));
        const total = run.cities_total?.length ? run.cities_total : SEED_CITIES;
        const allDone = total.every((c) => done.includes(c));
        const prevErr = run.error ? run.error.split("\n") : [];
        const errs = [...prevErr, ...errors].slice(0, 20);
        await supabase.from("ingestion_runs").update({
          cities_done: done, items_found: run.items_found + places.length, items_created: run.items_created + created,
          notes: `Google Maps seed · ${done.length}/${total.length} cities`, error: errs.join("\n") || null,
          ...(allDone ? { status: errs.length ? "partial" : "success", finished_at: new Date().toISOString() } : {}),
        }).eq("id", data.runId);
      }
    }
    return { city: data.city, found: places.length, created, updated, errors };
  });
