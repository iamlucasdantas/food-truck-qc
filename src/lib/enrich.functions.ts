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

/**
 * Admin "Enrich", step 1: validate the request and create a run row so the UI can show a
 * progress bar and poll the step log. Accepts any number of custom links (or none).
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
    const { data: t } = await db.from("trucks").select("id").eq("id", data.truckId).maybeSingle();
    if (!t) throw new Error("Truck not found");
    // The validated links ride on the row as a __links seed entry — runEnrich reads them.
    const { data: run, error } = await db.from("enrich_runs").insert({ truck_id: t.id, user_id: context.userId, steps: [{ source: "__links", ok: true, detail: JSON.stringify(links) }] }).select("id").single();
    if (error || !run) throw new Error(error?.message ?? "Couldn't start the run");
    return { runId: run.id };
  });

/**
 * Admin "Enrich", step 2: execute the pipeline. The truck's own sources come first — its
 * Facebook, Instagram, website, calendar links, Google Maps profile and any custom links are the
 * primary sources. Only when they turn up nothing do we fall back to a web search and the shared
 * community groups. Another truck's profile is never scanned for this truck. New stops follow the
 * normal review rules; stops without an address land in Pending trucks. Every step is appended to
 * the run row as it finishes, so the progress bar shows live progress.
 */
export const runEnrich = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<{ steps: EnrichStep[] }> => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: run } = await db.from("enrich_runs").select("id,truck_id,status,steps").eq("id", data.runId).maybeSingle();
    if (!run) throw new Error("Run not found");
    if (run.status !== "running") return { steps: (run.steps as EnrichStep[]).filter((s) => s.source !== "__links") };
    let custom: string[] = [];
    const seed = (run.steps as EnrichStep[]).find((s) => s.source === "__links");
    if (seed) { try { custom = JSON.parse(seed.detail) as string[]; } catch { custom = []; } }
    const { data: t } = await db.from("trucks").select("id,name,claimed_by,phone,instagram,facebook,reddit,website,base_address").eq("id", run.truck_id).maybeSingle();
    if (!t) {
      await db.from("enrich_runs").update({ status: "error", steps: [], updated_at: new Date().toISOString() }).eq("id", run.id);
      throw new Error("Truck not found");
    }

    const steps: EnrichStep[] = [];
    const push = async (s: EnrichStep) => {
      steps.push(s);
      await db.from("enrich_runs").update({ steps, updated_at: new Date().toISOString() }).eq("id", run.id);
    };

    try {
      // 1. Register the truck's own sources so the two-hour scans keep checking them.
      const wanted = [
        t.facebook && /facebook\.com/i.test(t.facebook) ? { kind: "page", url: t.facebook } : null,
        t.instagram ? { kind: "instagram", url: normIg(t.instagram) } : null,
        t.website ? { kind: "website", url: /^https?:/i.test(t.website) ? t.website : `https://${t.website}` } : null,
        ...custom.map((url) => /facebook\.com\/groups\//i.test(url) ? { kind: "group", url } : /facebook\.com/i.test(url) ? { kind: "page", url } : /instagram\.com/i.test(url) ? { kind: "instagram", url } : { kind: "website", url }),
      ].filter((s): s is { kind: string; url: string } => !!s?.url);
      for (const s of wanted) {
        const { error } = await db.from("social_sources").upsert({ ...s, name: t.name, truck_id: t.id, active: true }, { onConflict: "url", ignoreDuplicates: true });
        if (error) console.error("[enrich] source", error.message);
      }
      const { data: srcRows } = await db.from("social_sources").select("id,kind,url").eq("truck_id", t.id).eq("active", true);
      const own = srcRows ?? [];
      const social = own.filter((s) => s.kind === "page" || s.kind === "instagram" || s.kind === "reddit");
      const sites = own.filter((s) => s.kind === "website");
      const calendars = own.filter((s) => s.kind === "calendar");
      const gmaps = own.filter((s) => s.kind === "gmaps");
      await push({ source: "Sources", ok: true, detail: own.length ? `${own.length} source${own.length === 1 ? "" : "s"} linked to this truck` : "No sources on this truck yet — add them in the Sources tab or paste a custom link" });

      let found = 0;

      // 2. The truck's own calendar links, right now.
      if (calendars.length) {
        try {
          const { syncTruckCalendars } = await import("./truck-calendar.server");
          const r = await syncTruckCalendars(db, calendars.map((c) => c.id));
          found += r.stops;
          await push({ source: "Calendar", ok: !r.errors.length, detail: `${r.stops} stop${r.stops === 1 ? "" : "s"} imported${r.review ? ` · ${r.review} waiting for an address in Pending trucks` : ""}${r.errors.length ? ` · ${r.errors[0]}` : ""}` });
        } catch (e) { await push({ source: "Calendar", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
      }

      // 3. The truck's own websites (including custom links), read with context.dev.
      if (sites.length) {
        const { scrapeMarkdown } = await import("./context-dev.server");
        const { ingestPost } = await import("./facebook.server");
        const { chicagoDate } = await import("@/data/trucks");
        const [{ data: trucks }, { data: biz }] = await Promise.all([
          db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived").is("deleted_at", null),
          db.from("businesses").select("owner_id, facebook, instagram, reddit"),
        ]);
        const ctx = { db, trucks: trucks ?? [], bizByOwner: new Map((biz ?? []).map((b) => [b.owner_id, b])), today: chicagoDate(), runId: null };
        for (const s of sites.slice(0, 5)) {
          const page = await scrapeMarkdown(s.url);
          if ("error" in page) { await push({ source: `Website ${new URL(s.url).hostname}`, ok: false, detail: page.error }); continue; }
          try {
            const out = await ingestPost(ctx, "page", { url: s.url, text: page.markdown.slice(0, 8000), time: new Date().toISOString(), author: t.name, inputUrl: s.url }, t);
            const added = out.filter((r) => r.status === "published" || r.status === "suggested").length;
            const noAddr = out.filter((r) => r.status === "no-address" || r.checkAddress).length;
            found += added;
            await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: 1, last_stops: added }).eq("id", s.id);
            await push({ source: `Website ${new URL(s.url).hostname}`, ok: true, detail: `${added} stop${added === 1 ? "" : "s"} found${noAddr ? ` · ${noAddr} need an address` : ""}` });
          } catch (e) { await push({ source: `Website ${new URL(s.url).hostname}`, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
        }
      }

      // 4. Google Maps profile: confirm the address from the saved link. Only trust a hit whose
      // name actually matches the truck — a bare text search can return the venue instead.
      if (gmaps.length) {
        try {
          const { mapsLocation } = await import("./screenshot-location.server");
          const { truckNameScore } = await import("@/data/agent-food");
          const hits = await mapsLocation(`${t.name}, ${t.base_address || "Quad Cities IA IL"}`);
          const hit = hits.find((h) => truckNameScore(t.name, h.name) > 0);
          if (hit) {
            await push({ source: "Google Maps", ok: true, detail: `Found ${hit.name}, ${hit.address} — confirm it in the location section` });
          } else await push({ source: "Google Maps", ok: false, detail: hits.length ? "Google returned a different business — not using it" : "No matching Google profile found" });
        } catch (e) { await push({ source: "Google Maps", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
      }

      // 5. Facebook / Instagram: a scan just for this truck (finishes in the background, a few minutes).
      if (social.length) {
        try {
          const { startFacebookRun } = await import("./facebook.server");
          await startFacebookRun(db, social.map((s) => s.id));
          await push({ source: "Facebook / Instagram", ok: true, detail: `Scan started for ${social.length} page${social.length === 1 ? "" : "s"} — new stops show up in a few minutes (Admin → Facebook shows progress)` });
        } catch (e) { await push({ source: "Facebook / Instagram", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
      }

      // 6. Venue calendars that list this truck.
      const [{ data: viaStops }, { data: viaTitles }] = await Promise.all([
        db.from("stops").select("calendar_source_id").eq("truck_id", t.id).not("calendar_source_id", "is", null).limit(200),
        db.from("venue_calendar_titles").select("source_id").eq("truck_id", t.id),
      ]);
      const cals = [...new Set([...(viaStops ?? []).map((r) => r.calendar_source_id!), ...(viaTitles ?? []).map((r) => r.source_id)])];
      if (cals.length) {
        const { syncVenueCalendar } = await import("./venue-calendar.server");
        let ok = 0;
        for (const id of cals.slice(0, 5)) { try { await syncVenueCalendar(db, id); ok++; } catch (e) { console.error("[enrich] calendar", e); } }
        await push({ source: "Venue calendars", ok: ok > 0, detail: `${ok} of ${cals.length} calendar${cals.length === 1 ? "" : "s"} re-synced` });
      }

      // 7. Fallback, only when the truck's own sources turned up nothing: web search, then the shared groups.
      if (found === 0) {
        try {
          const { researchTruckWeb } = await import("./truck-research.server");
          const web = await researchTruckWeb(t.name, t.base_address ?? "");
          if (web.urls.length) {
            const { scrapeMarkdown } = await import("./context-dev.server");
            const { ingestPost } = await import("./facebook.server");
            const { chicagoDate } = await import("@/data/trucks");
            const [{ data: trucks }, { data: biz }] = await Promise.all([
              db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived").is("deleted_at", null),
              db.from("businesses").select("owner_id, facebook, instagram, reddit"),
            ]);
            const ctx = { db, trucks: trucks ?? [], bizByOwner: new Map((biz ?? []).map((b) => [b.owner_id, b])), today: chicagoDate(), runId: null };
            let webStops = 0;
            for (const url of web.urls.slice(0, 2)) {
              const page = await scrapeMarkdown(url);
              if ("error" in page) continue;
              const out = await ingestPost(ctx, "page", { url, text: page.markdown.slice(0, 8000), time: new Date().toISOString(), author: t.name, inputUrl: url }, t).catch(() => []);
              webStops += out.filter((r) => r.status === "published" || r.status === "suggested").length;
            }
            await push({ source: "Web search", ok: true, detail: webStops ? `${webStops} stop${webStops === 1 ? "" : "s"} found on public pages` : web.summary ? `Found: ${web.summary.slice(0, 140)}` : "Nothing recent found on the web" });
          } else {
            await push({ source: "Web search", ok: true, detail: web.summary ? `Found: ${web.summary.slice(0, 140)}` : "Nothing recent found on the web" });
          }
        } catch (e) { await push({ source: "Web search", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
        const { data: groups } = await db.from("social_sources").select("id").eq("kind", "group").eq("active", true).limit(10);
        if (groups?.length) {
          try {
            const { startFacebookRun } = await import("./facebook.server");
            await startFacebookRun(db, groups.map((g) => g.id));
            await push({ source: "Community groups", ok: true, detail: `Scanning ${groups.length} shared group${groups.length === 1 ? "" : "s"} for mentions of ${t.name} — results in a few minutes` });
          } catch (e) { await push({ source: "Community groups", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
        }
      }

      await db.from("enrich_runs").update({ status: "done", steps, updated_at: new Date().toISOString() }).eq("id", run.id);
      return { steps };
    } catch (e) {
      const detail = e instanceof Error ? e.message.slice(0, 160) : "error";
      await push({ source: "Enrich", ok: false, detail });
      await db.from("enrich_runs").update({ status: "error", steps, updated_at: new Date().toISOString() }).eq("id", run.id);
      throw e;
    }
  });

/** Admin: poll a run's progress (status + step log so far). */
export const getEnrichRun = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ runId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<EnrichRunState> => {
    await requireAdmin(context.supabase, context.userId);
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: run } = await db.from("enrich_runs").select("id,truck_id,status,steps,created_at").eq("id", data.runId).maybeSingle();
    if (!run) throw new Error("Run not found");
    return { id: run.id, truck_id: run.truck_id, status: run.status as EnrichRunState["status"], steps: (run.steps as EnrichStep[]).filter((s) => s.source !== "__links"), created_at: run.created_at };
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
