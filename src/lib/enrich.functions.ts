import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type EnrichStep = { source: string; ok: boolean; detail: string };

const normIg = (v: string) => {
  const h = v.trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").split(/[/?#]/)[0];
  return h ? `https://www.instagram.com/${h}/` : null;
};

/**
 * Admin "Enrich": looks for this truck in every source we have — registers its Facebook/Instagram/website
 * (plus an optional custom link) as scan sources, reads websites now with context.dev, starts a Facebook/Instagram
 * scan just for this truck, and re-syncs venue calendars that list it. New stops follow the normal review rules;
 * stops without an address land in Pending trucks.
 */
export const enrichTruck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ truckId: z.string().min(1).max(150), customUrl: z.string().trim().max(1000).optional() }).parse(input))
  .handler(async ({ data, context }): Promise<{ steps: EnrichStep[] }> => {
    const { data: admin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin) throw new Error("Forbidden");
    let custom: string | null = null;
    if (data.customUrl) {
      try { const u = new URL(/^https?:\/\//i.test(data.customUrl) ? data.customUrl : `https://${data.customUrl}`); if (!/^https?:$/.test(u.protocol)) throw 0; custom = u.toString(); }
      catch { throw new Error("That custom link isn't a valid web address."); }
    }
    const { supabaseAdmin: db } = await import("@/integrations/supabase/client.server");
    const { data: t } = await db.from("trucks").select("id,name,claimed_by,phone,instagram,facebook,reddit,website").eq("id", data.truckId).maybeSingle();
    if (!t) throw new Error("Truck not found");
    const steps: EnrichStep[] = [];

    // 1. Register sources so the two-hour scans keep checking this truck.
    const wanted = [
      t.facebook && /facebook\.com/i.test(t.facebook) ? { kind: "page", url: t.facebook } : null,
      t.instagram ? { kind: "instagram", url: normIg(t.instagram) } : null,
      t.website ? { kind: "website", url: /^https?:/i.test(t.website) ? t.website : `https://${t.website}` } : null,
      custom && /facebook\.com\/groups\//i.test(custom) ? { kind: "group", url: custom } : custom && /facebook\.com/i.test(custom) ? { kind: "page", url: custom } : custom && /instagram\.com/i.test(custom) ? { kind: "instagram", url: custom } : custom ? { kind: "website", url: custom } : null,
    ].filter((s): s is { kind: string; url: string } => !!s?.url);
    for (const s of wanted) {
      const { error } = await db.from("social_sources").upsert({ ...s, name: t.name, truck_id: t.id, active: true }, { onConflict: "url", ignoreDuplicates: true });
      if (error) console.error("[enrich] source", error.message);
    }
    const { data: srcRows } = await db.from("social_sources").select("id,kind,url").in("url", wanted.map((w) => w.url));
    const social = (srcRows ?? []).filter((s) => s.kind !== "website");
    const sites = (srcRows ?? []).filter((s) => s.kind === "website");
    steps.push({ source: "Sources", ok: true, detail: wanted.length ? `${wanted.length} link${wanted.length === 1 ? "" : "s"} saved for the two-hour scans` : "No Facebook, Instagram or website on this truck yet — add one or paste a custom link" });

    // 2. Websites now, via context.dev.
    if (sites.length) {
      const { scrapeMarkdown } = await import("./context-dev.server");
      const { ingestPost } = await import("./facebook.server");
      const { chicagoDate } = await import("@/data/trucks");
      const [{ data: trucks }, { data: biz }] = await Promise.all([
        db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived").is("deleted_at", null),
        db.from("businesses").select("owner_id, facebook, instagram, reddit"),
      ]);
      const ctx = { db, trucks: trucks ?? [], bizByOwner: new Map((biz ?? []).map((b) => [b.owner_id, b])), today: chicagoDate(), runId: null };
      for (const s of sites.slice(0, 3)) {
        const page = await scrapeMarkdown(s.url);
        if ("error" in page) { steps.push({ source: `Website ${new URL(s.url).hostname}`, ok: false, detail: page.error }); continue; }
        try {
          const out = await ingestPost(ctx, "page", { url: s.url, text: page.markdown.slice(0, 8000), time: new Date().toISOString(), author: t.name, inputUrl: s.url }, t);
          const added = out.filter((r) => r.status === "published" || r.status === "suggested").length;
          const noAddr = out.filter((r) => r.status === "no-address" || r.checkAddress).length;
          await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: 1, last_stops: added }).eq("id", s.id);
          steps.push({ source: `Website ${new URL(s.url).hostname}`, ok: true, detail: `${added} stop${added === 1 ? "" : "s"} found${noAddr ? ` · ${noAddr} need an address` : ""}` });
        } catch (e) { steps.push({ source: `Website ${new URL(s.url).hostname}`, ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
      }
    }

    // 3. Facebook / Instagram: a scan just for this truck (finishes in the background, a few minutes).
    if (social.length) {
      try {
        const { startFacebookRun } = await import("./facebook.server");
        await startFacebookRun(db, social.map((s) => s.id));
        steps.push({ source: "Facebook / Instagram", ok: true, detail: `Scan started for ${social.length} page${social.length === 1 ? "" : "s"} — new stops show up in a few minutes (Admin → Facebook shows progress)` });
      } catch (e) { steps.push({ source: "Facebook / Instagram", ok: false, detail: e instanceof Error ? e.message.slice(0, 160) : "error" }); }
    }

    // 4. Venue calendars that list this truck.
    const [{ data: viaStops }, { data: viaTitles }] = await Promise.all([
      db.from("stops").select("calendar_source_id").eq("truck_id", t.id).not("calendar_source_id", "is", null).limit(200),
      db.from("venue_calendar_titles").select("source_id").eq("truck_id", t.id),
    ]);
    const cals = [...new Set([...(viaStops ?? []).map((r) => r.calendar_source_id!), ...(viaTitles ?? []).map((r) => r.source_id)])];
    if (cals.length) {
      const { syncVenueCalendar } = await import("./venue-calendar.server");
      let ok = 0;
      for (const id of cals.slice(0, 5)) { try { await syncVenueCalendar(db, id); ok++; } catch (e) { console.error("[enrich] calendar", e); } }
      steps.push({ source: "Venue calendars", ok: ok > 0, detail: `${ok} of ${cals.length} calendar${cals.length === 1 ? "" : "s"} re-synced` });
    } else steps.push({ source: "Venue calendars", ok: true, detail: "Not listed on any venue calendar" });

    return { steps };
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
