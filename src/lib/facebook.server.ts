import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { splitVenues, resolvePostDate, mergeHints, type ExtractedStop } from "@/data/posts";
import { resolveVenue } from "@/lib/venues.server";
import { authorIsTruck, ownerHandles, centralToUtc, chicagoDate, keepExtraction, matchTruckByName, slugify } from "@/data/trucks";

type DB = SupabaseClient<Database>;
type Kind = "page" | "group" | "reddit" | "instagram";
type Source = Database["public"]["Tables"]["social_sources"]["Row"];
type TruckRow = Database["public"]["Tables"]["trucks"]["Row"];
type Meta = { runs?: Partial<Record<Kind, string>>; total?: number; aiPaused?: string };

/** Webhooks must reach the published app. */
export const PUBLIC_ORIGIN = "https://app.foodtruckqc.com";
const ACTORS: Record<Kind, string> = {
  page: "apify~facebook-posts-scraper",
  group: "apify~facebook-groups-scraper",
  reddit: "apify~reddit-scraper-lite",
  instagram: "apify~instagram-scraper",
};
const MODEL = "google/gemini-2.5-flash";
const KINDS: Kind[] = ["page", "group", "reddit", "instagram"];

const normUrl = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\/(www\.|m\.|web\.)?/, "").replace(/[?#].*$/, "").replace(/\/+$/, "");

function apifyToken() {
  const t = process.env["APIFY_TOKEN"];
  if (!t) throw new Error("APIFY_TOKEN is not configured");
  return t;
}

/** Every truck with a social URL/handle is also a source of that kind. */
async function syncTruckSources(db: DB) {
  const { data: rawTrucks } = await db.from("trucks").select("id, name, claimed_by, facebook, instagram, reddit").eq("status", "active");
  const { data: bizRows } = await db.from("businesses").select("owner_id, facebook, instagram, reddit");
  const biz = new Map((bizRows ?? []).map((b) => [b.owner_id, b]));
  // Business handles win over legacy per-truck values; one source per handle (first truck of the business).
  const trucks = (rawTrucks ?? []).map((t) => ({ ...t, ...ownerHandles(t, t.claimed_by ? biz.get(t.claimed_by) : null) }));
  const { data: existing } = await db.from("social_sources").select("url");
  const have = new Set((existing ?? []).map((s) => normUrl(s.url)));
  const rows: { kind: string; url: string; name: string; truck_id: string }[] = [];
  for (const t of trucks) {
    if (t.facebook && /facebook\.com/i.test(t.facebook) && !have.has(normUrl(t.facebook)))
      rows.push({ kind: "page", url: t.facebook, name: t.name, truck_id: t.id });
    if (t.instagram) {
      const url = /^https?:\/\//i.test(t.instagram) ? t.instagram : `https://www.instagram.com/${t.instagram.replace(/^@/, "")}/`;
      if (/instagram\.com/i.test(url) && !have.has(normUrl(url))) rows.push({ kind: "instagram", url, name: t.name, truck_id: t.id });
    }
    if (t.reddit) {
      const url = /^https?:\/\//i.test(t.reddit) ? t.reddit : `https://www.reddit.com/user/${t.reddit.replace(/^@/, "")}/`;
      if (/reddit\.com/i.test(url) && !have.has(normUrl(url))) rows.push({ kind: "reddit", url, name: t.name, truck_id: t.id });
    }
  }
  if (rows.length) await db.from("social_sources").upsert(rows, { onConflict: "url", ignoreDuplicates: true });
}

function cleanUrl(raw: string): string | null {
  const s = raw.trim().replace(/^\/\//, "");
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); return u.hostname.includes(".") ? u.toString() : null; } catch { return null; }
}

async function startActor(kind: Kind, all: Source[]): Promise<string> {
  // Apify rejects the whole job if one link is malformed, so fix or skip bad ones.
  const sources = all.flatMap((s) => { const url = cleanUrl(s.url); return url ? [{ ...s, url }] : []; });
  const input =
    kind === "page" ? { startUrls: sources.map((s) => ({ url: s.url })), resultsLimit: 5, onlyPostsNewerThan: "14 days" }
    : kind === "group" ? { startUrls: sources.map((s) => ({ url: s.url })), resultsLimit: 40, viewOption: "CHRONOLOGICAL", onlyPostsNewerThan: "7 days" }
    : kind === "reddit" ? { startUrls: sources.map((s) => ({ url: s.url })), maxItems: 30, sort: "new" }
    : { directUrls: sources.map((s) => s.url), resultsType: "posts", resultsLimit: 10 };
  const hooks = btoa(JSON.stringify([{ eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"], requestUrl: `${PUBLIC_ORIGIN}/api/public/apify-webhook` }]));
  const res = await fetch(`https://api.apify.com/v2/acts/${ACTORS[kind]}/runs?webhooks=${hooks}`, {
    method: "POST", headers: { Authorization: `Bearer ${apifyToken()}`, "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${kind} start failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

/** Create a run and start one Apify job per source kind. Fast — safe for cron. */
export async function startFacebookRun(db: DB) {
  await syncTruckSources(db);
  const { data: sources = [] } = await db.from("social_sources").select("*").eq("active", true);
  const list = sources ?? [];
  if (!list.length) throw new Error("No active social sources");
  const meta: Meta = { runs: {}, total: list.length };
  for (const kind of KINDS) {
    const s = list.filter((x) => x.kind === kind);
    if (s.length) meta.runs![kind] = await startActor(kind, s);
  }
  const { data: run, error } = await db.from("ingestion_runs").insert({
    source: "apify_facebook", notes: `Social update · 0/${list.length} sources`, cities_total: list.map((s) => s.id), meta,
  }).select().single();
  if (error) throw new Error(error.message);
  return run;
}

/** Raw dataset item from any of the four actors. */
type Item = Record<string, unknown> & {
  url?: string; postUrl?: string; topLevelUrl?: string; text?: string; time?: string; inputUrl?: string; facebookUrl?: string;
  pageName?: string; groupTitle?: string; user?: { name?: string }; phone?: string; instagram?: string;
  title?: string; body?: string; createdAt?: string; username?: string; author?: string; communityName?: string;
  caption?: string; timestamp?: string; ownerUsername?: string;
};

/** Normalized post across Facebook, Reddit and Instagram items. */
type Post = { url: string; text: string; time: string; author: string; inputUrl: string };

function normalizeItem(kind: Kind, it: Item): Post | null {
  if (kind === "reddit") {
    const text = [it.title, it.body].filter(Boolean).join("\n").trim();
    const url = it.url ?? it.postUrl;
    if (!url || !text) return null;
    return { url, text, time: it.createdAt ?? "", author: String(it.username ?? it.author ?? ""), inputUrl: it.inputUrl ?? "" };
  }
  if (kind === "instagram") {
    const text = (it.caption ?? "").trim();
    const url = it.url ?? it.postUrl;
    if (!url || !text) return null;
    return { url, text, time: it.timestamp ?? "", author: it.ownerUsername ?? "", inputUrl: it.inputUrl ?? "" };
  }
  const url = it.url ?? it.postUrl ?? it.topLevelUrl;
  const text = (it.text ?? "").trim();
  if (!url || !text) return null;
  return { url, text, time: it.time ?? "", author: it.user?.name ?? it.pageName ?? "", inputUrl: it.inputUrl ?? it.facebookUrl ?? "" };
}

type Extracted = ExtractedStop;

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

const SYSTEM = `Extract food truck stops from a Quad Cities (Iowa/Illinois) social media post.
Return ONE entry per venue + time range: "Jumpin Joey's 11-2 & Adventurous Brewing LLC 4-8pm" is two stops (11:00-14:00 and 16:00-20:00).
Venue names are often Facebook place tags (a business name with no address): put that name in venue and leave address empty unless a street address is written.
Dates: use the post date unless the post says tomorrow, today/tonight or a weekday name (next one on/after the post date). Times are local Central time, 24h HH:MM.
Short ranges without am/pm: "11-2" = 11:00-14:00; "4-8" = 16:00-20:00. If no end time, assume 3 hours after start.
truck_name = the truck the post is about (the poster when they write in first person). confidence 0-1 = how sure the truck will be at that place at that time.
If the post announces no specific stop, return an empty list. is_food_truck = clearly a mobile food truck/trailer/cart.`;

/** Central-time date of a post timestamp (falls back to today). */
function postDay(time: string, today: string): string {
  const t = Date.parse(time);
  return Number.isFinite(t) ? chicagoDate(new Date(t)) : today;
}

async function extract(text: string, postTime: string, url: string, pageOwner: string | null, today: string): Promise<Extracted[]> {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new AiStop("LOVABLE_API_KEY is not configured");
  const day = postDay(postTime, today);
  const hints = splitVenues(text);
  const date = resolvePostDate(text, day);
  const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST", headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: MODEL,
      response_format: { type: "json_schema", json_schema: { name: "stops", strict: true, schema: SCHEMA } },
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: `Today: ${today}\nPost date: ${day}\nPost URL: ${url}\n${pageOwner ? `Posted by the truck: ${pageOwner}\n` : ""}${hints.length ? `Venue/time pairs found: ${hints.map((h) => `${h.venue} ${h.start}-${h.end}`).join("; ")}\n` : ""}Post:\n${text.slice(0, 4000)}` },
      ],
    }),
  });
  if (res.status === 402 || res.status === 403) throw new AiStop(`AI paused [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  if (!res.ok) throw new Error(`AI failed [${res.status}]`);
  const j = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  let ai: Extracted[] = [];
  try { ai = (JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { stops?: Extracted[] }).stops ?? []; } catch { ai = []; }
  return mergeHints(ai, hints, date, pageOwner ?? "");
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

  const { data: allTrucks } = await db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived");
  const trucks = (allTrucks ?? []) as Pick<TruckRow, "id" | "name" | "claimed_by" | "phone" | "instagram" | "facebook" | "reddit">[];
  const { data: bizRows } = await db.from("businesses").select("owner_id, facebook, instagram, reddit");
  const bizByOwner = new Map((bizRows ?? []).map((b) => [b.owner_id, b]));
  /** Handles that identify this truck's own posts: its owner's business handles (shared by all their trucks), else legacy truck values. */
  const handlesOf = (t: (typeof trucks)[number]) => ownerHandles(t, t.claimed_by ? bizByOwner.get(t.claimed_by) : null);
  const sameBusiness = (a: (typeof trucks)[number], b: (typeof trucks)[number]) => a.id === b.id || (!!a.claimed_by && a.claimed_by === b.claimed_by);
  const today = chicagoDate();

  for (const kind of KINDS) {
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
    const bySource = new Map<string, Post[]>();
    const allPosts: { src: Source; post: Post }[] = [];
    for (const it of items) {
      const post = normalizeItem(kind, it);
      if (!post) continue;
      const u = normUrl(post.inputUrl);
      const s = kindSources.find((x) => u && (normUrl(x.url) === u || u.startsWith(normUrl(x.url)) || normUrl(x.url).startsWith(u)));
      const src = s ?? (kindSources.length === 1 ? kindSources[0] : undefined);
      if (!src) continue;
      bySource.set(src.id, [...(bySource.get(src.id) ?? []), post]);
      allPosts.push({ src, post });
    }
    const urls = allPosts.map((p) => p.post.url);
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
      // A page/instagram/reddit source tied to a truck is that truck's own profile.
      const owner = kind !== "group" ? (trucks.find((t) => t.id === src.truck_id) ?? matchTruckByName(posts[0]?.author ?? src.name, trucks)) : null;
      // Fill missing contact info on the page owner's truck (never on claimed trucks).
      if (owner && !owner.claimed_by && kind === "page") {
        const raw = items.find((it) => (it.url ?? it.postUrl ?? it.topLevelUrl) === posts[0]?.url);
        const fill: { facebook?: string; phone?: string; instagram?: string } = {};
        if (!owner.facebook) fill.facebook = src.url;
        if (!owner.phone && raw?.phone) fill.phone = raw.phone;
        if (!owner.instagram && raw?.instagram) fill.instagram = raw.instagram;
        if (Object.keys(fill).length) { await db.from("trucks").update(fill).eq("id", owner.id); Object.assign(owner, fill); }
      }
      let left = 0;
      for (const p of posts) {
        if (seen.has(p.url)) continue;
        if (Date.now() - t0 > budgetMs || meta.aiPaused) { left++; continue; }
        found++;
        let stopsMade = 0;
        try {
          const ex = await extract(p.text, p.time, p.url, owner?.name ?? null);
          for (const e of ex) {
            if (!keepExtraction(e, today)) continue;
            // A business page can post for any of its trucks: prefer the named truck of the same business.
            const sibling = owner?.claimed_by ? matchTruckByName(e.truck_name, trucks.filter((t) => sameBusiness(t, owner))) : null;
            let truck = sibling ?? owner ?? matchTruckByName(e.truck_name, trucks);
            if (!truck && (kind === "group" || kind === "reddit") && e.is_food_truck && e.truck_name.trim().length >= 3) {
              const id = `${slugify(e.truck_name)}-${Math.random().toString(36).slice(2, 7)}`;
              const { error } = await db.from("trucks").insert({ id, name: e.truck_name.trim(), status: "pending", source: `apify_${kind}` });
              if (!error) {
                const { postOwnerWebhook } = await import("@/lib/owner-webhook.server");
                await postOwnerWebhook({ source: "scraper", isNewBusiness: true, contact: { name: "", email: "", phone: "" }, businessName: "",
                  truckId: id, truckName: e.truck_name.trim(), truckType: "mobile", cuisine: "", city: e.city || "", description: p.url });
              }
              if (!error) { truck = { id, name: e.truck_name.trim(), claimed_by: null, phone: null, instagram: null, facebook: null, reddit: null }; trucks.push(truck); }
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
            const own = authorIsTruck(p.author, handlesOf(truck)) || (owner != null && sameBusiness(truck, owner) && kind !== "group" && kind !== "reddit");
            if (own) {
              // The truck posted it itself: auto-approved, straight onto the public calendar.
              const { error } = await db.from("stops").insert({
                truck_id: truck.id, venue_name: e.venue || e.address || "From their own post", address: e.address || null, city: e.city || geo.city || "",
                lat: geo.lat, lng: geo.lng, starts_at: starts.toISOString(), ends_at: ends.toISOString(), source: "own_post", confidence: e.confidence, source_url: p.url,
              });
              if (!error) { stopsMade++; created++; }
            } else {
              // Someone else posted it: pending suggestion for the owner (or the admin queue for unclaimed trucks).
              const { data: dup } = await db.from("suggested_stops").select("id").eq("truck_id", truck.id).eq("source_url", p.url)
                .gte("starts_at", starts.toISOString()).lte("starts_at", ends.toISOString()).neq("status", "rejected").limit(1);
              if (!dup?.length) {
                const { error } = await db.from("suggested_stops").insert({
                  truck_id: truck.id, source: kind, source_url: p.url, author: p.author || null, excerpt: p.text.slice(0, 500),
                  venue_name: e.venue || e.address || "", address: e.address || null, city: e.city || geo.city || "",
                  lat: geo.lat, lng: geo.lng, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
                });
                if (!error) { stopsMade++; created++; }
              }
            }
          }
          await db.from("social_posts").upsert({ url: p.url, source_id: src.id, run_id: runId, stops_created: stopsMade });
          seen.add(p.url);
        } catch (e) {
          if (e instanceof AiStop) { meta.aiPaused = e.message; errors.push(e.message); left++; }
          else errors.push(`${p.url}: ${e instanceof Error ? e.message : String(e)}`);
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
    notes: `Social update · ${done.size}/${total} sources`,
    ...(finished ? { status: errs.length ? "partial" : "success", finished_at: new Date().toISOString() } : {}),
  }).eq("id", runId);
  return { done: finished, remaining, pending, sourcesDone: done.size, total };
}
