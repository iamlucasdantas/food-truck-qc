import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export type EnrichStep = { source: string; ok: boolean; detail: string };
export type EnrichRunState = { id: string; truck_id: string; status: "running" | "done" | "error"; steps: EnrichStep[]; created_at: string };

type DB = SupabaseClient<Database>;

const normIg = (v: string) => {
  const h = v.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").split(/[/?#]/)[0];
  return h ? `https://www.instagram.com/${h}/` : null;
};

function validCustomLink(raw: string): string | null {
  try {
    const u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    if (!/^https?:$/.test(u.protocol) || u.username || u.password) return null;
    return u.toString();
  } catch { return null; }
}

async function requireAdmin(supabase: SupabaseClient<Database>, userId: string) {
  const { data: admin } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (!admin) throw new Error("Forbidden");
}

type Task =
  | { t: "social"; service: "facebook" | "instagram"; url: string; id: string | null; post: boolean; group: boolean }
  | { t: "background"; ids: string[] }
  | { t: "calendar"; ids: string[] }
  | { t: "site"; id: string; url: string }
  | { t: "gmaps" }
  | { t: "venues" }
  | { t: "fallback" };
type Plan = { queue: Task[]; found: number };

const PLAN = "__plan";
const visible = (steps: EnrichStep[]) => steps.filter((s) => !s.source.startsWith("__"));
const readPlan = (steps: EnrichStep[]): Plan => {
  const seed = steps.find((s) => s.source === PLAN);
  try { return seed ? (JSON.parse(seed.detail) as Plan) : { queue: [], found: 0 }; } catch { return { queue: [], found: 0 }; }
};
const planStep = (plan: Plan): EnrichStep => ({ source: PLAN, ok: true, detail: JSON.stringify(plan) });
const host = (u: string) => { try { return new URL(u).hostname.replace(/^www\./, ""); } catch { return u.slice(0, 40); } };
const shortUrl = (u: string) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, "")}${x.pathname.slice(0, 28)}${x.pathname.length > 28 ? "…" : ""}`; } catch { return u.slice(0, 50); } };
const plural = (n: number, w: string) => `${n} ${w}${n === 1 ? "" : "s"}`;

async function ingestContext(db: DB) {
  const { chicagoDate } = await import("@/data/trucks");
  const [{ data: trucks }, { data: biz }] = await Promise.all([
    db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived").is("deleted_at", null),
    db.from("businesses").select("owner_id, facebook, instagram, reddit"),
  ]);
  return { db, trucks: trucks ?? [], bizByOwner: new Map((biz ?? []).map((b) => [b.owner_id, b])), today: chicagoDate(), runId: null };
}

/**
 * Admin "Enrich", step 1: validate, register the truck's sources and plan the work as a queue of small tasks
 * (one per source). Pasted single-post links are read once and never become scan sources.
 * Order: pasted posts → Facebook/Instagram profiles → calendars → websites → Google Maps → venue calendars →
 * fallback (web search + shared groups, only when nothing was found).
 */
export const startEnrich = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({
    truckId: z.string().min(1).max(150),
    customUrls: z.array(z.string().trim().min(3).max(1000)).max(5).optional(),
  }).parse(input))
  .handler(async ({ data, context }): Promise<{ runId: string }> => {
    await requireAdmin(context.supabase, context.userId);
    const links = (data.customUrls ?? []).map((l) => {
      const u = validCustomLink(l);
      if (!u) throw new Error(`That custom link isn't a valid web address: ${l.slice(0, 60)}`);
      return u;
    });
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { socialLinkType } = await import("@/data/social-read");
    // A run whose page was closed mid-way never finishes on its own; close it so the log is honest.
    await db.from("enrich_runs").update({ status: "error", updated_at: new Date().toISOString() }).eq("status", "running").lt("updated_at", new Date(Date.now() - 10 * 60_000).toISOString());
    const { data: t } = await db.from("trucks").select("id,name,facebook,instagram,website").eq("id", data.truckId).maybeSingle();
    if (!t) throw new Error("Truck not found");

    const typed = links.map((url) => ({ url, ...socialLinkType(url) }));
    const posts = typed.filter((l) => l.type === "post" && l.service !== "web");
    const wanted = [
      t.facebook && /facebook\.com/i.test(t.facebook) ? { kind: "page", url: t.facebook } : null,
      t.instagram ? { kind: "instagram", url: normIg(t.instagram) } : null,
      t.website ? { kind: "website", url: /^https?:/i.test(t.website) ? t.website : `https://${t.website}` } : null,
      ...typed.filter((l) => l.type !== "post").map((l) => ({ kind: l.type === "group" ? "group" : l.service === "facebook" ? "page" : l.service === "instagram" ? "instagram" : "website", url: l.url })),
    ].filter((s): s is { kind: string; url: string } => !!s?.url);
    for (const s of wanted) {
      const { error } = await db.from("social_sources").upsert({ ...s, name: t.name, truck_id: t.id, active: true }, { onConflict: "url", ignoreDuplicates: true });
      if (error) console.error("[enrich] source", error.message);
    }
    const { data: srcRows } = await db.from("social_sources").select("id,kind,url").eq("truck_id", t.id).eq("active", true);
    const own = srcRows ?? [];
    const queue: Task[] = [
      ...posts.map((p): Task => ({ t: "social", service: p.service as "facebook" | "instagram", url: p.url, id: null, post: true, group: /facebook\.com\/groups\//i.test(p.url) })),
      ...own.filter((s) => s.kind === "page").map((s): Task => ({ t: "social", service: "facebook", url: s.url, id: s.id, post: false, group: false })),
      ...own.filter((s) => s.kind === "instagram").map((s): Task => ({ t: "social", service: "instagram", url: s.url, id: s.id, post: false, group: false })),
    ];
    const bg = own.filter((s) => s.kind === "reddit" || s.kind === "group").map((s) => s.id);
    if (bg.length) queue.push({ t: "background", ids: bg });
    const cals = own.filter((s) => s.kind === "calendar").map((s) => s.id);
    if (cals.length) queue.push({ t: "calendar", ids: cals });
    queue.push(...own.filter((s) => s.kind === "website").slice(0, 5).map((s): Task => ({ t: "site", id: s.id, url: s.url })));
    if (own.some((s) => s.kind === "gmaps")) queue.push({ t: "gmaps" });
    queue.push({ t: "venues" }, { t: "fallback" });

    const first: EnrichStep = { source: "Sources", ok: true, detail: own.length || posts.length
      ? `${plural(own.length, "source")} linked to this truck${posts.length ? ` + ${plural(posts.length, "post link")} to read now` : ""} · ${plural(queue.length - 2, "check")} planned`
      : "No sources on this truck yet — add them in the Sources tab or paste a custom link" };
    const { data: run, error } = await db.from("enrich_runs").insert({ truck_id: t.id, user_id: context.userId, steps: [planStep({ queue, found: 0 }), first] }).select("id").single();
    if (error || !run) throw new Error(error?.message ?? "Couldn't start the run");
    return { runId: run.id };
  });

/**
 * Admin "Enrich", step 2: run the NEXT task of the queue and return. The progress bar calls this repeatedly until
 * done, so each request stays short (no single long request that can be cut off and leave the run "running").
 * Each task's findings are appended to the log as it finishes.
 */
export const runEnrich = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ done: boolean; steps: EnrichStep[] }> => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: run } = await db.from("enrich_runs").select("id,truck_id,status,steps,updated_at").eq("id", data.runId).maybeSingle();
    if (!run) throw new Error("Run not found");
    const all = run.steps as EnrichStep[];
    const steps = visible(all);
    if (run.status !== "running") return { done: true, steps };
    const plan = readPlan(all);
    const task = plan.queue[0];
    const finish = async (status: "done" | "error") => { await db.from("enrich_runs").update({ status, steps: [planStep(plan), ...steps], updated_at: new Date().toISOString() }).eq("id", run.id); };
    if (!task) { await finish("done"); return { done: true, steps }; }
    plan.queue = plan.queue.slice(1);
    // Claim the task: if another request already took it, the row's updated_at moved on and nothing is updated.
    const { data: claimed } = await db.from("enrich_runs").update({ steps: [planStep(plan), ...steps], updated_at: new Date().toISOString() })
      .eq("id", run.id).eq("updated_at", run.updated_at).select("id");
    if (!claimed?.length) return { done: false, steps };

    const { data: t } = await db.from("trucks").select("id,name,claimed_by,phone,instagram,facebook,reddit,website,base_address").eq("id", run.truck_id).maybeSingle();
    if (!t) { steps.push({ source: "Enrich", ok: false, detail: "Truck not found" }); await finish("error"); return { done: true, steps }; }
    const push = async (s: EnrichStep) => {
      steps.push(s);
      await db.from("enrich_runs").update({ steps: [planStep(plan), ...steps], updated_at: new Date().toISOString() }).eq("id", run.id);
    };
    try {
      plan.found += await runTask(db, t, task, plan.found, push);
    } catch (e) {
      await push({ source: "Enrich", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" });
    }
    const done = plan.queue.length === 0;
    if (done) await finish("done");
    else await db.from("enrich_runs").update({ steps: [planStep(plan), ...steps], updated_at: new Date().toISOString() }).eq("id", run.id);
    return { done, steps };
  });

type T = { id: string; name: string; claimed_by: string | null; phone: string | null; instagram: string | null; facebook: string | null; reddit: string | null; website: string | null; base_address: string | null };

/** Runs one task and returns how many stops it added (published or sent to review). */
async function runTask(db: DB, t: T, task: Task, foundSoFar: number, push: (s: EnrichStep) => Promise<void>): Promise<number> {
  const counted = (rs: { status: string }[]) => rs.filter((r) => r.status === "published" || r.status === "suggested").length;

  if (task.t === "social") {
    const { readSocialNow } = await import("./social-direct.server");
    const { ingestPost } = await import("./facebook.server");
    const { describePostOutcome, isLoginWallText } = await import("@/data/social-read");
    const label = `${task.service === "facebook" ? "Facebook" : "Instagram"}${task.post ? " post" : ""}`;
    const ctx = await ingestContext(db);
    const r = await readSocialNow(task.service, task.url);
    let added = 0;
    if (r.posts.length) {
      await push({ source: label, ok: true, detail: `Apify read ${plural(r.posts.length, "recent post")} from ${shortUrl(task.url)}` });
      const kind = task.group ? "group" : task.service === "facebook" ? "page" : "instagram";
      const results = await Promise.all(r.posts.map((p) => ingestPost(ctx, kind, p, t).then((res) => ({ p, res }), (e: unknown) => ({ p, res: null, err: e instanceof Error ? e.message : String(e) }))));
      for (const x of results) {
        if (!x.res) { await push({ source: label, ok: false, detail: `Couldn't read post ${shortUrl(x.p.url)}: ${("err" in x ? x.err : "").slice(0, 120)}` }); continue; }
        const n = counted(x.res);
        added += n;
        await push({ source: label, ok: true, detail: describePostOutcome(x.p, x.res) });
        await db.from("social_posts").upsert({ url: x.p.url, source_id: task.id, stops_created: n });
      }
      if (task.id) await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: r.posts.length, last_stops: added }).eq("id", task.id);
      return added;
    }
    await push({ source: label, ok: false, detail: `${r.error ?? "No posts returned"} — ${shortUrl(task.url)}` });
    // Second scraper: context.dev reads the public page. Facebook usually shows only its header without login — reported honestly.
    const { scrapeMarkdown } = await import("./context-dev.server");
    const page = await scrapeMarkdown(task.url);
    if ("error" in page) await push({ source: `${label} (context.dev)`, ok: false, detail: page.error });
    else if (isLoginWallText(page.markdown)) await push({ source: `${label} (context.dev)`, ok: false, detail: `Only the public page header is visible without login (${page.markdown.replace(/\s+/g, " ").length} characters, no posts)` });
    else {
      const res = await ingestPost(ctx, task.service === "facebook" ? "page" : "instagram", { url: task.url, text: page.markdown.slice(0, 9000), time: new Date().toISOString(), author: t.name, inputUrl: task.url }, t);
      added = counted(res);
      await push({ source: `${label} (context.dev)`, ok: true, detail: describePostOutcome({ time: new Date().toISOString(), text: page.title || "page" }, res) });
    }
    if (task.id) await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: added ? "ok" : "empty", last_reason: r.error?.slice(0, 300) ?? "No posts returned", last_posts: 0, last_stops: added }).eq("id", task.id);
    return added;
  }

  if (task.t === "background") {
    const { startFacebookRun } = await import("./facebook.server");
    await startFacebookRun(db, task.ids);
    await push({ source: "Reddit / groups", ok: true, detail: `Background scan started for ${plural(task.ids.length, "source")} — results in a few minutes (Admin → Facebook)` });
    return 0;
  }

  if (task.t === "calendar") {
    const { syncTruckCalendars } = await import("./truck-calendar.server");
    const r = await syncTruckCalendars(db, task.ids);
    await push({ source: "Calendar", ok: !r.errors.length, detail: `${plural(r.stops, "stop")} imported${r.review ? ` · ${r.review} waiting for an address in Pending trucks` : ""}${r.errors.length ? ` · ${r.errors[0]}` : ""}` });
    return r.stops + r.review;
  }

  if (task.t === "site") {
    const { scrapeMarkdown } = await import("./context-dev.server");
    const { ingestPost } = await import("./facebook.server");
    const { describePostOutcome } = await import("@/data/social-read");
    const page = await scrapeMarkdown(task.url);
    if ("error" in page) { await push({ source: `Website ${host(task.url)}`, ok: false, detail: page.error }); return 0; }
    const ctx = await ingestContext(db);
    const out = await ingestPost(ctx, "page", { url: task.url, text: page.markdown.slice(0, 8000), time: new Date().toISOString(), author: t.name, inputUrl: task.url }, t);
    const added = counted(out);
    await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: 1, last_stops: added }).eq("id", task.id);
    await push({ source: `Website ${host(task.url)}`, ok: true, detail: describePostOutcome({ time: new Date().toISOString(), text: page.title || host(task.url) }, out) });
    return added;
  }

  if (task.t === "gmaps") {
    // Only trust a hit whose name matches the truck — a bare text search can return the venue instead.
    const { mapsLocation } = await import("./screenshot-location.server");
    const { truckNameScore } = await import("@/data/agent-food");
    const hits = await mapsLocation(`${t.name}, ${t.base_address || "Quad Cities IA IL"}`);
    const hit = hits.find((h) => truckNameScore(t.name, h.name) > 0);
    await push(hit ? { source: "Google Maps", ok: true, detail: `Found ${hit.name}, ${hit.address} — confirm it in the location section` }
      : { source: "Google Maps", ok: false, detail: hits.length ? "Google returned a different business — not using it" : "No matching Google profile found" });
    return 0;
  }

  if (task.t === "venues") {
    const [{ data: viaStops }, { data: viaTitles }] = await Promise.all([
      db.from("stops").select("calendar_source_id").eq("truck_id", t.id).not("calendar_source_id", "is", null).limit(200),
      db.from("venue_calendar_titles").select("source_id").eq("truck_id", t.id),
    ]);
    const cals = [...new Set([...(viaStops ?? []).map((r) => r.calendar_source_id!), ...(viaTitles ?? []).map((r) => r.source_id)])];
    if (!cals.length) return 0;
    const { syncVenueCalendar } = await import("./venue-calendar.server");
    let ok = 0;
    for (const id of cals.slice(0, 5)) { try { await syncVenueCalendar(db, id); ok++; } catch (e) { console.error("[enrich] calendar", e); } }
    await push({ source: "Venue calendars", ok: ok > 0, detail: `${ok} of ${plural(cals.length, "calendar")} re-synced` });
    return 0;
  }

  // Fallback, only when the truck's own sources turned up nothing: web search, then the shared groups.
  if (foundSoFar > 0) { await push({ source: "Fallback", ok: true, detail: `Skipped — the truck's own sources already gave ${plural(foundSoFar, "stop")}` }); return 0; }
  let added = 0;
  try {
    const { researchTruckWeb } = await import("./truck-research.server");
    const web = await researchTruckWeb(t.name, t.base_address ?? "");
    if (web.urls.length) {
      const { scrapeMarkdown } = await import("./context-dev.server");
      const { ingestPost } = await import("./facebook.server");
      const ctx = await ingestContext(db);
      for (const url of web.urls.slice(0, 2)) {
        const page = await scrapeMarkdown(url);
        if ("error" in page) continue;
        const out = await ingestPost(ctx, "page", { url, text: page.markdown.slice(0, 8000), time: new Date().toISOString(), author: t.name, inputUrl: url }, t).catch(() => []);
        added += counted(out);
      }
    }
    await push({ source: "Web search", ok: true, detail: added ? `${plural(added, "stop")} found on public pages` : web.summary ? `Found: ${web.summary.slice(0, 140)}` : "Nothing recent found on the web" });
  } catch (e) { await push({ source: "Web search", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
  const { data: groups } = await db.from("social_sources").select("id").eq("kind", "group").eq("active", true).limit(10);
  if (groups?.length) {
    try {
      const { startFacebookRun } = await import("./facebook.server");
      await startFacebookRun(db, groups.map((g) => g.id));
      await push({ source: "Community groups", ok: true, detail: `Scanning ${plural(groups.length, "shared group")} for mentions of ${t.name} — results in a few minutes` });
    } catch (e) { await push({ source: "Community groups", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
  }
  return added;
}

/** Admin: poll a run's progress (status + step log so far). */
export const getEnrichRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EnrichRunState> => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: run } = await db.from("enrich_runs").select("id,truck_id,status,steps,created_at").eq("id", data.runId).maybeSingle();
    if (!run) throw new Error("Run not found");
    return { id: run.id, truck_id: run.truck_id, status: run.status as EnrichRunState["status"], steps: visible(run.steps as EnrichStep[]), created_at: run.created_at };
  });

/** Admin/owner: turn a Google Places suggestion into an address + pin. */
export const placeLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ placeId: z.string().min(3).max(300) }).parse(input))
  .handler(async ({ data }) => {
    const lovable = process.env["LOVABLE_API_KEY"], maps = process.env["GOOGLE_MAPS_API_KEY"];
    if (!lovable || !maps) throw new Error("Google Maps is not connected");
    const res = await fetch(`https://connector-gateway.lovable.dev/google_maps/places/v1/places/${encodeURIComponent(data.placeId)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { Authorization: `Bearer ${lovable}`, "X-Connection-Api-Key": maps, "X-Goog-FieldMask": "displayName,formattedAddress,location,addressComponents" },
    });
    if (!res.ok) { const b = await res.text(); console.error(`[places] details [${res.status}]: ${b.slice(0, 300)}`); throw new Error(`Google place lookup failed [${res.status}]`); }
    const p = (await res.json()) as { displayName?: { text?: string }; formattedAddress?: string; location?: { latitude: number; longitude: number }; addressComponents?: { longText?: string; types?: string[] }[] };
    if (!p.location) throw new Error("Google has no location for that place");
    const city = p.addressComponents?.find((c) => c.types?.includes("locality"))?.longText ?? "";
    return { name: p.displayName?.text ?? "", address: p.formattedAddress ?? "", lat: p.location.latitude, lng: p.location.longitude, city };
  });
