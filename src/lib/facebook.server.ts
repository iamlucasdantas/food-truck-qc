import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { centralToUtc, chicagoDate, keepExtraction, matchTruckByName, slugify } from "@/data/trucks";

type DB = SupabaseClient<Database>;
type Kind = "page" | "group";
type Source = Database["public"]["Tables"]["social_sources"]["Row"];
type Meta = { runs?: Partial<Record<Kind, string>>; total?: number; aiPaused?: string };

/** Webhooks must reach the published app. */
export const PUBLIC_ORIGIN = "https://app.foodtruckqc.com";
const ACTORS: Record<Kind, string> = { page: "apify~facebook-posts-scraper", group: "apify~facebook-groups-scraper" };
const MODEL = "google/gemini-2.5-flash";

const normUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.|web\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

function apifyToken() {
  const t = process.env["APIFY_TOKEN"];
  if (!t) throw new Error("APIFY_TOKEN is not configured");
  return t;
}

/** Every truck with a Facebook URL is also a page source. */
async function syncTruckPages(db: DB) {
  const { data: trucks } = await db.from("trucks").select("id, name, facebook").eq("status", "active").not("facebook", "is", null);
  const { data: existing } = await db.from("social_sources").select("url");
  const have = new Set((existing ?? []).map((s) => normUrl(s.url)));
  const rows = (trucks ?? []).filter((t) => t.facebook && /facebook\.com/i.test(t.facebook) && !have.has(normUrl(t.facebook)))
    .map((t) => ({ kind: "page", url: t.facebook!, name: t.name, truck_id: t.id }));
  if (rows.length) await db.from("social_sources").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
}

async function startActor(kind: Kind, sources: Source[]): Promise<string> {
  const input = kind === "page"
    ? { startUrls: sources.map((s) => ({ url: s.url })), resultsLimit: 5, onlyPostsNewerThan: "14 days" }
    : { startUrls: sources.map((s) => ({ url: s.url })), resultsLimit: 40, viewOption: "CHRONOLOGICAL", onlyPostsNewerThan: "7 days" };
  const hooks = btoa(JSON.stringify([{ eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"], requestUrl: `${PUBLIC_ORIGIN}/api/public/apify-webhook` }]));
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTORS[kind]}/runs?webhooks=${hooks}`, {
    method: "POST", headers: { Authorization: `Bearer ${apifyToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${kind} start failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

/** Create a run and start (at most) two Apify jobs: one for pages, one for groups. Fast — safe for cron. */
export async function startFacebookRun(db: DB) {
  await syncTruckPages(db);
  const { data: sources = [] } = await db.from("social_sources").select("*").eq("active", true);
  const list = sources ?? [];
  if (!list.length) throw new Error("No active Facebook sources");
  const meta: Meta = { runs: {}, total: list.length };
  for (const kind of ["page", "group"] as Kind[]) {
    const s = list.filter((x) => x.kind === kind);
    if (s.length) meta.runs![kind] = await startActor(kind, s);
  }
  const { data: run, error } = await db.from("ingestion_runs").insert({
    source: "apify_facebook", notes: `Facebook update · 0/${list.length} sources`, cities_total: list.map((s) => s.id), meta,
  }).select().single();
  if (error) throw new Error(error.message);
  return run;
}

type Item = { url?: string; postUrl?: string; topLevelUrl?: string; text?: string; time?: string; inputUrl?: string; facebookUrl?: string; pageName?: string; groupTitle?: string; user?: { name?: string }; phone?: string; instagram?: string };
type Extracted = { truck_name: string; is_food_truck: boolean; date: string; start: string; end: string; venue: string; address: string; city: string; confidence: number };

const SCHEMA = {
  type: "object", additionalProperties: false, required: ["stops"],
  properties: { stops: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["truck_name", "is_food_truck", "date", "start", "end", "venue", "address", "city", "confidence"],
    properties: {
      truck_name: { type: "string" }, is_food_truck: { type: "boolean" }, date: { type: "string", description: "YYYY-MM-DD" },
      start: { type: "string", description: "HH:MM 24h Central" }, end: { type: "string", description: "HH:MM 24h Central" },
      venue: { type: "string" }, address: { type: "string" }, city: { type: "string" }, confidence: { type: "number" },
    } } } },
};

class AiStop extends Error {}

async function extract(text: string, postDate: string, url: string, pageOwner: string | null): Promise<Extracted[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiStop("LOVABLE_API_KEY is not configured");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_schema", json_schema: { name: "stops", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: "Extract upcoming food truck stops from a Quad Cities (Iowa/Illinois) Facebook post. Return one entry per date/location announced. Resolve relative dates (today, tomorrow, Friday) against the post date. Times are local Central time, 24h HH:MM; if no end time, assume 3 hours after start. confidence 0-1 = how sure you are the truck will be at that place at that time. If the post announces no specific stop, return an empty list. is_food_truck = the truck is clearly a mobile food truck/trailer/cart." },
        { role: "user", content: `Today: ${chicagoDate()}\nPost date: ${postDate}\nPost URL: ${url}\n${pageOwner ? `Posted by the truck: ${pageOwner}\n` : ""}Post:\n${text.slice(0, 4000)}` },
      ],
    }),
  });
  if (res.status === 402 || res.status === 403) throw new AiStop(`AI paused [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  if (!res.ok) throw new Error(`AI failed [${res.status}]`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  try { return (JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { stops?: Extracted[] }).stops ?? []; } catch { return []; }
}

let lastNominatim = 0;
async function geocodeCached(db: DB, q: string) {
  const key = q.trim().toLowerCase();
  const { data: hit } = await db.from("geocode_cache").select("*").eq("query", key).maybeSingle();
  if (hit) return hit.lat != null && hit.lng != null ? { lat: hit.lat, lng: hit.lng, city: hit.city ?? "" } : null;
  const wait = lastNominatim + 1100 - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastNominatim = Date.now();
  const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=us&q=${encodeURIComponent(q)}`, { headers: { "User-Agent": "FoodTruckQC/1.0 (app.foodtruckqc.com)" } });
  const [h] = res.ok ? ((await res.json()) as { lat: string; lon: string; address?: Record<string, string> }[]) : [];
  const out = h ? { lat: Number(h.lat), lng: Number(h.lon), city: h.address?.["city"] ?? h.address?.["town"] ?? h.address?.["village"] ?? "" } : null;
  await db.from("geocode_cache").upsert({ query: key, lat: out?.lat ?? null, lng: out?.lng ?? null, city: out?.city ?? null });
  return out;
}

async function fetchRun(id: string) {
  const res = await fetch(`https://api.apify.com/v2/actor-runs/${id}`, { headers: { Authorization: `Bearer ${apifyToken()}` } });
  if (!res.ok) return null;
  return ((await res.json()) as { data: { id: string; status: string; defaultDatasetId: string } }).data;
}

/** Process unseen posts from finished Apify jobs within a time budget; restart failed jobs for unfinished sources. */
export async function processFacebookRun(db: DB, runId: string, budgetMs = 20_000) {
  const t0 = Date.now();
  const { data: run } = await db.from("ingestion_runs").select("*").eq("id", runId).single();
  if (!run || run.status !== "running") return { done: true, remaining: 0 };
  const meta = (run.meta ?? {}) as Meta;
  const { data: srcRows } = await db.from("social_sources").select("*").in("id", run.cities_total);
  const sources = srcRows ?? [];
  const done = new Set(run.cities_done);
  const errors = run.error ? run.error.split("\n") : [];
  let found = run.items_found, created = run.items_created, remaining = 0, pending = false;

  const { data: allTrucks } = await db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook").neq("status", "archived");
  const trucks = allTrucks ?? [];
  const today = chicagoDate();

  for (const kind of ["page", "group"] as Kind[]) {
    const kindSources = sources.filter((s) => s.kind === kind);
    if (!kindSources.length || kindSources.every((s) => done.has(s.id))) continue;
    const apifyId = meta.runs?.[kind];
    const ar = apifyId ? await fetchRun(apifyId) : null;
    if (!ar || ["FAILED", "TIMED-OUT", "ABORTED"].includes(ar.status)) {
      const todo = kindSources.filter((s) => !done.has(s.id));
      try { meta.runs = { ...meta.runs, [kind]: await startActor(kind, todo) }; errors.push(`${kind} scrape ${ar?.status ?? "missing"} — restarted for ${todo.length} sources`); }
      catch (e) { errors.push(String(e instanceof Error ? e.message : e)); }
      pending = true; continue;
    }
    if (ar.status !== "SUCCEEDED") { pending = true; continue; }

    const itemsRes = await fetch(`https://api.apify.com/v2/datasets/${ar.defaultDatasetId}/items?clean=true&limit=2000`, { headers: { Authorization: `Bearer ${apifyToken()}` } });
    const items = itemsRes.ok ? ((await itemsRes.json()) as Item[]) : [];
    const bySource = new Map<string, Item[]>();
    for (const it of items) {
      const u = normUrl(it.inputUrl ?? it.facebookUrl ?? "");
      const s = kindSources.find((x) => u && (normUrl(x.url) === u || u.startsWith(normUrl(x.url))));
      if (s) bySource.set(s.id, [...(bySource.get(s.id) ?? []), it]);
    }
    const urls = items.map((i) => i.url ?? i.postUrl ?? i.topLevelUrl).filter(Boolean) as string[];
    const seen = new Set<string>();
    for (let i = 0; i < urls.length; i += 200) {
      const { data } = await db.from("social_posts").select("url").in("url", urls.slice(i, i + 200));
      (data ?? []).forEach((r) => seen.add(r.url));
    }

    for (const src of kindSources) {
      if (done.has(src.id)) continue;
      const posts = bySource.get(src.id) ?? [];
      if (!posts.length) {
        if (kind === "group") errors.push(`Group skipped (private/blocked or no posts): ${src.url}`);
        done.add(src.id);
        await db.from("social_sources").update({ last_run_at: new Date().toISOString() }).eq("id", src.id);
        continue;
      }
      const owner = kind === "page" ? (trucks.find((t) => t.id === src.truck_id) ?? matchTruckByName(posts[0]?.pageName ?? src.name, trucks)) : null;
      // Fill missing contact info on the page owner's truck (never on claimed trucks).
      if (owner && !owner.claimed_by) {
        const p = posts[0]!;
        const fill: Record<string, string> = {};
        if (!owner.facebook) fill["facebook"] = src.url;
        if (!owner.phone && p.phone) fill["phone"] = p.phone;
        if (!owner.instagram && p.instagram) fill["instagram"] = p.instagram;
        if (Object.keys(fill).length) { await db.from("trucks").update(fill).eq("id", owner.id); Object.assign(owner, fill); }
      }
      let left = 0;
      for (const p of posts) {
        const url = p.url ?? p.postUrl ?? p.topLevelUrl;
        if (!url || seen.has(url) || !p.text?.trim()) continue;
        if (Date.now() - t0 > budgetMs || meta.aiPaused) { left++; continue; }
        found++;
        let stopsMade = 0;
        try {
          const ex = await extract(p.text, p.time ?? "", url, owner?.name ?? null);
          for (const e of ex) {
            if (!keepExtraction(e, today)) continue;
            let truck: { id: string } | null = owner ?? matchTruckByName(e.truck_name, trucks);
            if (!truck && kind === "group" && e.is_food_truck && e.truck_name.trim().length >= 3) {
              const id = `${slugify(e.truck_name)}-${Math.random().toString(36).slice(2, 7)}`;
              const { error } = await db.from("trucks").insert({ id, name: e.truck_name.trim(), status: "pending", source: "apify_facebook" });
              if (!error) { truck = { id }; trucks.push({ id, name: e.truck_name.trim(), claimed_by: null, phone: null, instagram: null, facebook: null }); }
            }
            if (!truck) continue;
            const q = [e.address || e.venue, e.city || "Quad Cities"].filter(Boolean).join(", ");
            const geo = q ? await geocodeCached(db, q) : null;
            if (!geo) continue;
            const starts = centralToUtc(e.date, e.start || "11:00");
            let ends = centralToUtc(e.date, e.end || "14:00");
            if (ends <= starts) ends = new Date(starts.getTime() + 3 * 3_600_000);
            // Never overwrite owner stops: skip if the owner already has a stop overlapping this time.
            const { count } = await db.from("stops").select("id", { count: "exact", head: true }).eq("truck_id", truck.id).eq("source", "owner")
              .eq("cancelled", false).lt("starts_at", ends.toISOString()).gt("ends_at", starts.toISOString());
            if (count) continue;
            const { error } = await db.from("stops").insert({
              truck_id: truck.id, venue_name: e.venue || e.address || "Posted on Facebook", address: e.address || null, city: e.city || geo.city || "",
              lat: geo.lat, lng: geo.lng, starts_at: starts.toISOString(), ends_at: ends.toISOString(), source: "apify_post", confidence: e.confidence, source_url: url,
            });
            if (!error) { stopsMade++; created++; }
          }
          await db.from("social_posts").upsert({ url, source_id: src.id, run_id: runId, stops_created: stopsMade });
          seen.add(url);
        } catch (e) {
          if (e instanceof AiStop) { meta.aiPaused = e.message; errors.push(e.message); left++; }
          else errors.push(`${url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (left) remaining += left;
      else { done.add(src.id); await db.from("social_sources").update({ last_run_at: new Date().toISOString() }).eq("id", src.id); }
    }
  }

  const total = run.cities_total.length;
  const finished = done.size >= total || (!pending && remaining === 0);
  const errs = errors.slice(-30);
  await db.from("ingestion_runs").update({
    cities_done: [...done], items_found: found, items_created: created, meta, error: errs.join("\n") || null,
    notes: `Facebook update · ${done.size}/${total} sources`,
    ...(finished ? { status: errs.length ? "partial" : "success", finished_at: new Date().toISOString() } : {}),
  }).eq("id", runId);
  return { done: finished, remaining, pending, sourcesDone: done.size, total };
}
