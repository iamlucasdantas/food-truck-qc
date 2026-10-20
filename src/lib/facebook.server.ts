import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { splitVenues, resolvePostDate, mergeHints, isUnknownTruckName, reviewTruckName, type ExtractedStop } from "@/data/posts";
import { postMenuToSections, menuSearchText, type PostMenu } from "@/data/menu";
import { resolveVenue } from "@/lib/venues.server";
import { completeAddress, discoveredTruckId, profileCategory } from "@/data/ingestion-review";
import { authorIsTruck, ownerHandles, centralToUtc, chicagoDate, keepExtraction, matchTruckByName, slugify, groupStops } from "@/data/trucks";

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

function apifyHeaders() {
  const t = process.env['APIFY_API_KEY'], lovable = process.env['LOVABLE_API_KEY'];
  if (!t || !lovable) throw new Error('Apify connection is not configured');
  return { Authorization:`Bearer ${lovable}`, 'X-Connection-Api-Key':t };
}

/** Every truck with a social URL/handle is also a source of that kind. */
async function syncTruckSources(db: DB) {
  const { data: rawTrucks } = await db.from("trucks").select("id, name, claimed_by, created_by, status, facebook, instagram, reddit, website")
    .is("deleted_at", null).or("status.eq.active,and(status.eq.pending,or(claimed_by.not.is.null,created_by.not.is.null))");
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
    // The truck's own website is read with context.dev in the same scans.
    if (t.website && /^https?:\/\//i.test(t.website) && !/(facebook|instagram|reddit|linktr)\./i.test(t.website) && !have.has(normUrl(t.website)))
      rows.push({ kind: "website", url: t.website, name: t.name, truck_id: t.id });
  }
  // One bad row must not drop the whole batch, so insert per row and log failures.
  for (const r of rows) {
    const { error } = await db.from("social_sources").upsert(r, { onConflict: "url", ignoreDuplicates: true });
    if (error) console.error(`[facebook] source ${r.url} skipped: ${error.message}`);
  }
  // Category check: list trucks whose category is missing/Other so Admin can fix them from Google/Facebook evidence.
  return trucks.filter((t) => t.status === "active").length ? (await db.from("trucks").select("id").eq("status", "active").eq("is_food_truck", true).is("deleted_at", null).or("category.is.null,category.eq.,category.ilike.other,category.ilike.unknown")).data?.map((t) => t.id) ?? [] : [];
}

function cleanUrl(raw: string): string | null {
  const s = raw.trim().replace(/^\/\//, "");
  try { const u = new URL(/^https?:\/\//i.test(s) ? s : `https://${s}`); return u.hostname.includes(".") ? u.toString() : null; } catch { return null; }
}

/** Facebook session cookies (JSON array exported from a dedicated account) or null when the secret is unset/invalid. */
function facebookCookies(): unknown[] | null {
  const raw = process.env["FACEBOOK_COOKIES_JSON"];
  if (!raw) return null;
  try { const v = JSON.parse(raw); return Array.isArray(v) && v.length ? v : null; } catch { console.error("[facebook] FACEBOOK_COOKIES_JSON is not valid JSON"); return null; }
}
export const facebookSessionConfigured = () => !!facebookCookies();

async function startActor(kind: Kind, all: Source[]): Promise<string> {
  // Apify rejects the whole job if one link is malformed, so fix or skip bad ones.
  const sources = all.flatMap((s) => { const url = cleanUrl(s.url); return url ? [{ ...s, url }] : []; });
  const input =
    kind === "page" ? { startUrls: sources.map((s) => ({ url: s.url })), resultsLimit: 5, onlyPostsNewerThan: "14 days" }
    : kind === "group" ? { startUrls: sources.map((s) => ({ url: s.url })), resultsLimit: 40, viewOption: "CHRONOLOGICAL", onlyPostsNewerThan: "7 days" }
    : kind === "reddit" ? { startUrls: sources.map((s) => ({ url: s.url })), maxItems: 30, sort: "new" }
    : { directUrls: sources.map((s) => s.url), resultsType: "posts", resultsLimit: 10 };
  // Optional logged-in session for private/blocked groups: Admin explains the FACEBOOK_COOKIES_JSON secret (never pasted in chat).
  const cookies = (kind === "group" || kind === "page") ? facebookCookies() : null;
  if (cookies) Object.assign(input, { cookies });
  const hooks = btoa(JSON.stringify([{ eventTypes: ["ACTOR.RUN.SUCCEEDED", "ACTOR.RUN.FAILED", "ACTOR.RUN.TIMED_OUT", "ACTOR.RUN.ABORTED"], requestUrl: `${PUBLIC_ORIGIN}/api/public/apify-webhook` }]));
  const res = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${ACTORS[kind]}/runs?webhooks=${hooks}`, {
    method: "POST", headers: { ...apifyHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(input),
  });
  if (!res.ok) throw new Error(`Apify ${kind} start failed [${res.status}]: ${(await res.text()).slice(0, 200)}`);
  return ((await res.json()) as { data: { id: string } }).data.id;
}

/** Create a run and start one Apify job per source kind. Fast — safe for cron. */
export async function startFacebookRun(db: DB) {
  const categoryReview = await syncTruckSources(db);
  const { data: sources = [] } = await db.from("social_sources").select("*").eq("active", true);
  const list = sources ?? [];
  if (!list.length) throw new Error("No active social sources");
  const meta: Meta = { runs: {}, total: list.length };
  for (const kind of KINDS) {
    const s = list.filter((x) => x.kind === kind);
    if (s.length) meta.runs![kind] = await startActor(kind, s);
  }
  const catNote = categoryReview.length ? ` · ${categoryReview.length} categories need review` : "";
  const { data: run, error } = await db.from("ingestion_runs").insert({
    source: "apify_facebook", notes: `Social update · 0/${list.length} sources${catNote}`, cities_total: list.map((s) => s.id), meta: { ...meta, categoryReview } as Meta,
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
export type Post = { url: string; text: string; time: string; author: string; inputUrl: string };

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
  type: "object", additionalProperties: false, required: ["stops", "menu"],
  properties: { menu: { type: "array", description: "Menu items the post lists (dishes, prices). Empty when the post shows no menu.", items: { type: "object", additionalProperties: false,
    required: ["section", "items"], properties: { section: { type: "string" }, items: { type: "array", items: { type: "object", additionalProperties: false,
      required: ["name", "price", "description"], properties: { name: { type: "string" }, price: { type: ["number", "null"] }, description: { type: "string" } } } } } } },
  stops: { type: "array", items: { type: "object", additionalProperties: false,
    required: ["truck_name", "is_food_truck", "date", "start", "end", "venue", "address", "city", "confidence"],
    properties: {
      truck_name: { type: "string" }, is_food_truck: { type: "boolean" }, date: { type: "string", description: "YYYY-MM-DD" },
      start: { type: "string", description: "HH:MM 24h Central" }, end: { type: "string", description: "HH:MM 24h Central" },
      venue: { type: "string" }, address: { type: "string" }, city: { type: "string" }, confidence: { type: "number" },
    } } } },
};

class AiStop extends Error {}

const SYSTEM = `Extract food truck stops from a social media post within 75 miles of Davenport, Iowa (Iowa/Illinois).
Return ONE entry per venue + time range: "Jumpin Joey's 11-2 & Adventurous Brewing LLC 4-8pm" is two stops (11:00-14:00 and 16:00-20:00).
Venue names are often Facebook place tags (a business name with no address): put that name in venue and leave address empty unless a street address is written.
Dates: use the post date unless the post says tomorrow, today/tonight or a weekday name (next one on/after the post date). Times are local Central time, 24h HH:MM.
Short ranges without am/pm: "11-2" = 11:00-14:00; "4-8" = 16:00-20:00. If no end time, assume 3 hours after start.
truck_name = the truck the post is about (the poster when they write in first person). confidence 0-1 = how sure the truck will be at that place at that time.
If the post announces no specific stop, return an empty list. is_food_truck = clearly a mobile food truck/trailer/cart.
menu = dishes/items the post says will be served (with prices if written), grouped in sections; empty list when the post lists no menu items. Never invent items.`;

/** Central-time date of a post timestamp (falls back to today). */
function postDay(time: string, today: string): string {
  const t = Date.parse(time);
  return Number.isFinite(t) ? chicagoDate(new Date(t)) : today;
}

async function extract(text: string, postTime: string, url: string, pageOwner: string | null, today: string): Promise<{ stops: Extracted[]; menu: PostMenu }> {
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
  let ai: Extracted[] = [], menu: PostMenu = [];
  try { const o = JSON.parse(j.choices?.[0]?.message?.content ?? "{}") as { stops?: Extracted[]; menu?: PostMenu }; ai = o.stops ?? []; menu = o.menu ?? []; } catch { ai = []; }
  return { stops: mergeHints(ai, hints, date, pageOwner ?? ""), menu };
}


export type TruckLite = Pick<TruckRow, "id" | "name" | "claimed_by" | "phone" | "instagram" | "facebook" | "reddit">;
type Biz = { owner_id: string; facebook: string | null; instagram: string | null; reddit: string | null };
export type IngestCtx = { db: DB; trucks: TruckLite[]; bizByOwner: Map<string, Biz>; today: string; runId: string | null; dryRun?: boolean };
export type StopResult = {
  truckName: string; truckId: string | null; newTruck: boolean; venue: string; address: string | null; city: string;
  date: string; start: string; end: string; own: boolean; checkAddress: boolean;
  status: "published" | "suggested" | "history" | "duplicate" | "no-address" | "no-category" | "no-truck" | "owner-has-stop" | "low-confidence" | "preview";
};

/** Why a source produced no posts — shown in Admin → Facebook. */
function blockedReason(kind: Kind, items: Item[], url: string): string {
  const err = items.find((it) => typeof it["error"] === "string" && (!it.inputUrl || normUrl(it.inputUrl) === normUrl(url)));
  const msg = String(err?.["errorDescription"] ?? err?.["error"] ?? "");
  if (/login|log in|private|join|permission|checkpoint/i.test(msg)) return `Facebook asked for a login (private group or blocked): ${msg.slice(0, 120)}`;
  if (msg) return msg.slice(0, 160);
  return kind === "group" ? "No posts returned — the group is private, Facebook blocked the scraper, or nothing new was posted" : "No posts returned";
}

/** Extract stops from one post, match the truck, resolve each venue's address, then publish (own post) or suggest. */
export async function ingestPost(ctx: IngestCtx, kind: Kind | "paste", p: Post, owner: TruckLite | null): Promise<StopResult[]> {
  const { db, trucks, today } = ctx;
  const handlesOf = (t: TruckLite) => ownerHandles(t, t.claimed_by ? ctx.bizByOwner.get(t.claimed_by) : null);
  const sameBusiness = (a: TruckLite, b: TruckLite) => a.id === b.id || (!!a.claimed_by && a.claimed_by === b.claimed_by);
  const out: StopResult[] = [];
  const { stops: ex, menu } = await extract(p.text, p.time, p.url, owner?.name ?? null, today);
  let menuTruck: TruckLite | null = null;
  for (const e of ex) {
    const base = { venue: e.venue, address: e.address || null, city: e.city, date: e.date, start: e.start, end: e.end, own: false, checkAddress: false, newTruck: false };
    // A business page can post for any of its trucks: prefer the named truck of the same business.
    // Placeholder names ("Unknown") never match or create a truck by name.
    const named = !isUnknownTruckName(e.truck_name);
    const sibling = named && owner?.claimed_by ? matchTruckByName(e.truck_name, trucks.filter((t) => sameBusiness(t, owner))) : null;
    let truck = sibling ?? owner ?? (named ? matchTruckByName(e.truck_name, trucks) : null)
      ?? (p.author ? trucks.find((t) => authorIsTruck(p.author, handlesOf(t))) ?? matchTruckByName(p.author, trucks) : null);
    const own = !!truck && (authorIsTruck(p.author, handlesOf(truck)) || (owner != null && sameBusiness(truck, owner) && kind !== "group" && kind !== "reddit" && kind !== "paste"));
    if (own && truck) menuTruck = truck;
    const geo = await resolveVenue(db, e.venue, e.city, e.address);
    const r = { ...base, truckName: truck?.name ?? e.truck_name, truckId: truck?.id ?? null, own, venue: geo?.name ?? e.venue, address: geo?.address ?? base.address, city: geo?.city || e.city, checkAddress: geo?.check ?? true };
    if (/^\d{4}-\d{2}-\d{2}$/.test(e.date) && e.date < today) { out.push({ ...r, status: "history" }); continue; }
    if (!keepExtraction(e, today)) { out.push({ ...r, status: "low-confidence" }); continue; }
    if (!geo || !completeAddress(geo.address, geo.lat, geo.lng)) { out.push({ ...r, status: "no-address" }); continue; }
    // A dated venue is evidence of a stop location, not a stationary base.
    const facebookProfile = (() => { try { const u = new URL(p.inputUrl); return /^(www\.|m\.|web\.)?facebook\.com$/.test(u.hostname) && !u.pathname.startsWith('/groups/') ? u.toString() : null; } catch { return null; } })();
    const category = kind === 'page' || (kind === 'paste' && facebookProfile) ? profileCategory([], p.text) : null;
    if (!truck && e.is_food_truck && !category) { out.push({ ...r, status: 'no-category' }); continue; }
    if (ctx.dryRun) { out.push({ ...r, newTruck: !truck, status: "preview" }); continue; }
    if (!truck && e.is_food_truck) {
      // Unnamed in the post: still goes to admin approval, named after the post author, with the original post attached.
      const newName = named ? e.truck_name.trim() : reviewTruckName(p.author);
      const id = discoveredTruckId(newName);
      const { data: saved, error } = await db.from("trucks").upsert({ id, name: newName, status: "pending", source: kind === "paste" ? "admin_paste" : `apify_${kind}`,
        category: category ?? '', base_address: geo.address, base_lat: geo.lat, base_lng: geo.lng, truck_type: 'mobile', facebook: facebookProfile,
        description: `${named ? '' : 'Truck name not stated — please confirm before approving.\n'}Location from scheduled stop, not a permanent base.\nOriginal post: ${p.url}` }, { onConflict: 'id', ignoreDuplicates: true }).select('id');
      if (!error) {
        const { postOwnerWebhook } = await import("@/lib/owner-webhook.server");
        if (saved?.length) await postOwnerWebhook({ source: "scraper", isNewBusiness: true, contact: { name: "", email: "", phone: "" }, businessName: "",
          truckId: id, truckName: newName, truckType: "mobile", cuisine: category ?? "", city: geo.city || e.city || "", description: p.url });
        truck = { id, name: newName, claimed_by: null, phone: null, instagram: null, facebook: facebookProfile, reddit: null };
        trucks.push(truck);
        r.newTruck = !!saved?.length; r.truckId = id; r.truckName = truck.name;
      }
    }
    if (!truck) { out.push({ ...r, status: "no-truck" }); continue; }
    const starts = centralToUtc(e.date, e.start || "11:00");
    let ends = centralToUtc(e.date, e.end || "14:00");
    if (ends <= starts) ends = new Date(starts.getTime() + 3 * 3_600_000);
    // Never overwrite owner stops: skip if the owner already has a stop overlapping this time.
    const { count } = await db.from("stops").select("id", { count: "exact", head: true }).eq("truck_id", truck.id).eq("source", "owner")
      .eq("cancelled", false).lt("starts_at", ends.toISOString()).gt("ends_at", starts.toISOString());
    if (count) { out.push({ ...r, status: "owner-has-stop" }); continue; }
    const venueName = geo.name || e.venue || e.address || "From their own post";
    if (own && !geo.check) {
      // The truck posted it itself and the address is trusted: auto-approved, straight onto the public calendar.
      const { data: dupe } = await db.from("stops").select("id").eq("truck_id", truck.id).eq("source_url", p.url).eq("starts_at", starts.toISOString()).limit(1);
      if (dupe?.length) { out.push({ ...r, status: "duplicate" }); continue; }
      // Same outing announced in another post (same venue, overlapping time): don't add a second row.
      const { data: near } = await db.from("stops").select("truck_id, venue_name, starts_at, ends_at, created_at").eq("truck_id", truck.id)
        .eq("cancelled", false).lt("starts_at", ends.toISOString()).gt("ends_at", starts.toISOString());
      const probe = { truck_id: truck.id, venue_name: venueName, starts_at: starts.toISOString(), ends_at: ends.toISOString(), created_at: "" };
      if ((near ?? []).some((n) => groupStops([n, probe]).length === 1)) { out.push({ ...r, status: "duplicate" }); continue; }
      const { error } = await db.from("stops").insert({
        truck_id: truck.id, venue_name: venueName, address: geo.address, city: geo.city || e.city || "",
        lat: geo.lat, lng: geo.lng, starts_at: starts.toISOString(), ends_at: ends.toISOString(), source: "own_post", confidence: e.confidence, source_url: p.url || null,
      });
      out.push({ ...r, status: error ? "duplicate" : "published" });
    } else {
      // Someone else posted it, or the address needs checking: pending until the owner (or admin, for unclaimed trucks) approves.
      const q = db.from("suggested_stops").select("id").eq("truck_id", truck.id).eq("starts_at", starts.toISOString()).eq("venue_name", venueName).neq("status", "rejected").limit(1);
      const { data: dup } = await q;
      if (dup?.length) { out.push({ ...r, status: "duplicate" }); continue; }
      const { error } = await db.from("suggested_stops").insert({
        truck_id: truck.id, source: kind, source_url: p.url || null, author: p.author || null, excerpt: p.text.slice(0, 500),
        venue_name: venueName, address: geo.address, city: geo.city || e.city || "", needs_address_check: geo.check,
        lat: geo.lat, lng: geo.lng, starts_at: starts.toISOString(), ends_at: ends.toISOString(),
      });
      out.push({ ...r, status: error ? "duplicate" : "suggested" });
    }
  }
  // Menu in the truck's own post replaces the published menu; no menu in the post leaves it untouched.
  const sections = postMenuToSections(menu);
  if (!menuTruck && owner && (authorIsTruck(p.author, handlesOf(owner)) || (kind !== "group" && kind !== "reddit" && kind !== "paste"))) menuTruck = owner;
  if (sections && menuTruck && !ctx.dryRun) {
    await db.from("trucks").update({ menu_sections: sections, menu_search: menuSearchText(sections), menu_updated_at: new Date().toISOString() }).eq("id", menuTruck.id);
  }
  return out;
}

async function fetchRun(id: string) {
  const res = await fetch(`https://connector-gateway.lovable.dev/apify/actor-runs/${id}`, { headers: apifyHeaders() });
  if (!res.ok) throw Error(`Apify run read failed [${res.status}]: ${await res.text()}`);
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
  const trucks = (allTrucks ?? []) as TruckLite[];
  const { data: bizRows } = await db.from("businesses").select("owner_id, facebook, instagram, reddit");
  const bizByOwner = new Map((bizRows ?? []).map((b) => [b.owner_id, b]));
  const today = chicagoDate();
  const ctx: IngestCtx = { db, trucks, bizByOwner, today, runId };

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

    const itemsRes = await fetch(`https://connector-gateway.lovable.dev/apify/datasets/${ar.defaultDatasetId}/items?clean=true&limit=2000`, { headers: apifyHeaders() });
    if (!itemsRes.ok) throw Error(`Apify dataset read failed [${itemsRes.status}]: ${await itemsRes.text()}`);
    const items = (await itemsRes.json()) as Item[];
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
        const reason = blockedReason(kind, items, src.url);
        if (kind === "group") errors.push(`Group skipped (${reason}): ${src.url}`);
        done.add(src.id);
        await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: kind === "group" ? "blocked" : "empty", last_posts: 0, last_stops: 0, last_reason: reason }).eq("id", src.id);
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
      let left = 0, srcStops = 0, srcPosts = 0;
      for (const p of posts) {
        if (seen.has(p.url)) continue;
        if (Date.now() - t0 > budgetMs || meta.aiPaused) { left++; continue; }
        found++;
        let stopsMade = 0;
        try {
          const res = await ingestPost(ctx, kind, p, owner);
          for (const r of res.filter(r => r.status === 'no-address' || r.status === 'no-category')) errors.push(`${r.truckName}: ${r.status === 'no-address' ? 'Address missing' : 'Google/Facebook category missing'} — original post: ${p.url}`);
          stopsMade = res.filter((r) => r.status === "published" || r.status === "suggested").length;
          created += stopsMade;
          srcPosts++; srcStops += stopsMade;
          await db.from("social_posts").upsert({ url: p.url, source_id: src.id, run_id: runId, stops_created: stopsMade });
          seen.add(p.url);
        } catch (e) {
          if (e instanceof AiStop) { meta.aiPaused = e.message; errors.push(e.message); left++; }
          else errors.push(`${p.url}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }
      if (left) remaining += left;
      else {
        done.add(src.id);
        await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_posts: srcPosts, last_stops: srcStops, last_reason: srcPosts ? null : "No new posts since the last run" }).eq("id", src.id);
      }
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
