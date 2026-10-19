import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { mapApifyCategory, slugify } from "@/data/trucks";
import { profileCategory, approvalIssue } from "@/data/ingestion-review";
import { findDuplicates, normLink, type DupMatch } from "@/data/duplicates";
import { inServiceRegion } from "@/data/coverage";

export type TruckDraft = {
  name: string; category: string; description: string; base_address: string; phone: string; website: string;
  facebook: string; instagram: string; google_place_id: string; found_with: string; notes: string[];
};
type Ctx = { supabase: any; userId: string }; // eslint-disable-line @typescript-eslint/no-explicit-any

async function assertAdmin({ supabase, userId }: Ctx) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}
async function apify<T>(actor: string, input: unknown): Promise<T[]> {
  const token = process.env["APIFY_API_KEY"], lovable = process.env["LOVABLE_API_KEY"];
  if (!token || !lovable) throw new Error("Apify connection is not configured");
  const res = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${actor}/run-sync-get-dataset-items?timeout=90`, {
    method: "POST", headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": token, "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${actor} failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return (await res.json()) as T[];
}
async function existingTrucks(supabase: Ctx["supabase"]) {
  const { data } = await supabase.from("trucks").select("id,name,status,deleted_at,facebook,instagram,website,phone,google_place_id").is("deleted_at", null).limit(5000);
  return (data ?? []) as Parameters<typeof findDuplicates>[1];
}
const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Admin: look a truck up from a Facebook/Instagram link or a name (Google Maps), and report possible duplicates. Nothing is saved. */
export const lookupTruck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { query: string }) => {
    const q = str(d?.query);
    if (q.length < 2 || q.length > 300) throw new Error("Enter a Facebook/Instagram link or a truck name");
    return { query: q };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const q = data.query;
    const draft: TruckDraft = { name: "", category: "", description: "", base_address: "", phone: "", website: "", facebook: "", instagram: "", google_place_id: "", found_with: "", notes: [] };
    let host = "";
    try { host = new URL(/^https?:\/\//i.test(q) ? q : `https://${q}`).hostname.replace(/^(www\.|m\.|web\.)/, ""); } catch { /* a name */ }
    try {
      if (host === "facebook.com" || host === "fb.com") {
        draft.facebook = q.startsWith("http") ? q : `https://${q}`; draft.found_with = "Facebook page";
        const [p] = await apify<Record<string, unknown>>("apify~facebook-pages-scraper", { startUrls: [{ url: draft.facebook }] });
        if (p) {
          const cats = Array.isArray(p["categories"]) ? (p["categories"] as unknown[]).map(String) : [str(p["category"])];
          draft.name = str(p["title"]) || str(p["pageName"]); draft.description = str(p["intro"]) || str(p["info"]);
          draft.base_address = str(p["address"]); draft.phone = str(p["phone"]); draft.website = str(p["website"]);
          draft.instagram = str(p["instagram"]);
          draft.category = mapApifyCategory(profileCategory(cats, `${draft.name} ${draft.description}`) ?? "");
        } else draft.notes.push("Facebook returned no page details (page may be private).");
      } else if (host === "instagram.com") {
        const user = new URL(q.startsWith("http") ? q : `https://${q}`).pathname.split("/").filter(Boolean)[0] ?? "";
        draft.instagram = `https://www.instagram.com/${user}/`; draft.found_with = "Instagram profile";
        const [p] = await apify<Record<string, unknown>>("apify~instagram-profile-scraper", { usernames: [user] });
        if (p) {
          draft.name = str(p["fullName"]) || user; draft.description = str(p["biography"]); draft.website = str(p["externalUrl"]);
          draft.category = mapApifyCategory(profileCategory([str(p["businessCategoryName"])], `${draft.name} ${draft.description}`) ?? "");
        } else draft.notes.push("Instagram returned no profile details.");
      } else {
        draft.name = q; draft.found_with = "Google Maps search";
        const places = await apify<Record<string, unknown>>("compass~crawler-google-places", { searchStringsArray: [q], locationQuery: "Davenport, Iowa, USA", maxCrawledPlacesPerSearch: 3, language: "en", scrapeContacts: true });
        const p = places.find((x) => { const l = x["location"] as { lat: number; lng: number } | undefined; return l && inServiceRegion(l.lat, l.lng); });
        if (p) {
          const cats = [str(p["categoryName"]), ...((p["categories"] as string[] | undefined) ?? [])];
          draft.name = str(p["title"]) || q; draft.base_address = str(p["address"]); draft.phone = str(p["phone"]); draft.website = str(p["website"]);
          draft.google_place_id = str(p["placeId"]); draft.facebook = str((p["facebooks"] as string[] | undefined)?.[0]); draft.instagram = str((p["instagrams"] as string[] | undefined)?.[0]);
          draft.category = mapApifyCategory(profileCategory(cats) ?? "");
        } else draft.notes.push("No Google profile found in our area — fill in the details by hand.");
      }
    } catch (e) {
      console.error("[add-truck] lookup failed", e);
      draft.notes.push(`Lookup failed: ${(e as Error).message.slice(0, 160)}. You can still fill it in by hand.`);
    }
    if (!draft.category) draft.notes.push("No Google/Facebook category found — pick one before saving.");
    if (!draft.base_address) draft.notes.push("No address found — the truck will wait in Pending until it has one.");
    return { draft, duplicates: findDuplicates(draft, await existingTrucks(context.supabase)) };
  });

/** Admin: save the reviewed truck, register its social pages as scan sources. Refuses likely duplicates unless confirmed. */
export const createTruckFromDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { draft: TruckDraft; allowDuplicate?: boolean }) => {
    if (!str(d?.draft?.name)) throw new Error("Name is required");
    return d;
  })
  .handler(async ({ data, context }): Promise<{ id?: string; status?: string; duplicates?: DupMatch[] }> => {
    await assertAdmin(context);
    const { supabase } = context;
    const d = data.draft;
    const duplicates = findDuplicates(d, await existingTrucks(supabase));
    if (duplicates.length && !data.allowDuplicate) return { duplicates };
    let lat: number | null = null, lng: number | null = null;
    if (str(d.base_address)) {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&q=${encodeURIComponent(d.base_address)}`, { headers: { Accept: "application/json", "User-Agent": "FoodTruckQC/1.0 (app.foodtruckqc.com)" } });
      const [hit] = res.ok ? ((await res.json()) as { lat: string; lon: string }[]) : [];
      if (hit) { lat = Number(hit.lat); lng = Number(hit.lon); }
    }
    const category = str(d.category);
    const fields = {
      name: str(d.name), category, description: str(d.description), base_address: str(d.base_address) || null, base_lat: lat, base_lng: lng,
      phone: str(d.phone) || null, website: str(d.website) || null, facebook: str(d.facebook) || null, instagram: str(d.instagram) || null,
      google_place_id: str(d.google_place_id) || null, source: "admin", is_food_truck: true,
    };
    const status = approvalIssue(fields) ? "pending" : "active";
    const id = `${slugify(fields.name)}-${crypto.randomUUID().slice(0, 5)}`;
    const { error } = await supabase.from("trucks").insert({ id, status, ...fields });
    if (error) throw new Error(error.message);
    const sources = [
      fields.facebook && /facebook\.com/i.test(fields.facebook) ? { kind: "page", url: fields.facebook } : null,
      fields.instagram ? { kind: "instagram", url: `https://${normLink(fields.instagram)}/` } : null,
    ].filter(Boolean) as { kind: string; url: string }[];
    for (const s of sources) {
      const { error: e } = await supabase.from("social_sources").upsert({ ...s, name: fields.name, truck_id: id }, { onConflict: "url", ignoreDuplicates: true });
      if (e) console.error("[add-truck] source", e.message);
    }
    return { id, status };
  });
