import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function assertAdmin(context: { supabase: any; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (!data) throw new Error("Forbidden");
}

/** Admin-only: start a Facebook update (one Apify job for pages, one for groups). */
export const startFacebookUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { startFacebookRun } = await import("./facebook.server");
    const run = await startFacebookRun(context.supabase);
    return { runId: run.id as string, total: run.cities_total.length as number };
  });

/** Admin-only: process the next batch of posts for a run (resumes only unfinished sources). */
export const continueFacebookUpdate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { runId: string }) => d)
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { processFacebookRun } = await import("./facebook.server");
    return processFacebookRun(context.supabase, data.runId, 25_000);
  });

type PasteIn = { text?: string; image?: string; author?: string; postDate?: string; url?: string; save?: boolean };

/**
 * Admin-only fallback when Facebook blocks the scraper: paste a post's text or a screenshot.
 * Runs the same extraction, address lookup and truck match. save=false previews; save=true publishes/suggests by the usual rules.
 */
export const processPastedPost = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: PasteIn) => {
    const text = typeof d?.text === "string" ? d.text.slice(0, 6000) : "";
    const image = typeof d?.image === "string" && /^data:image\/(jpeg|png|webp);base64,/.test(d.image) && d.image.length < 6_000_000 ? d.image : "";
    if (!text.trim() && !image) throw new Error("Paste the post text or add a screenshot.");
    const postDate = typeof d?.postDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d.postDate) ? d.postDate : "";
    return { text, image, author: String(d?.author ?? "").slice(0, 120), postDate, url: String(d?.url ?? "").slice(0, 500), save: !!d?.save };
  })
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { chicagoDate } = await import("@/data/trucks");
    const today = chicagoDate();
    let { text, author, postDate } = data;
    if (data.image) {
      const { readPostScreenshot, postedToDate } = await import("./post-reader.server");
      const r = await readPostScreenshot(data.image);
      if (r.error || !r.readable) return { error: r.error ?? "That image doesn't look like a post.", read: null, stops: [] };
      text = text.trim() || r.text;
      author = author.trim() || r.author;
      postDate = postDate || postedToDate(r.posted, today) || "";
    }
    const { ingestPost } = await import("./facebook.server");
    const db = context.supabase;
    const [{ data: trucks }, { data: biz }] = await Promise.all([
      db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived"),
      db.from("businesses").select("owner_id, facebook, instagram, reddit"),
    ]);
    const url = data.url || `paste:${crypto.randomUUID()}`;
    try {
      const stops = await ingestPost(
        { db, trucks: trucks ?? [], bizByOwner: new Map((biz ?? []).map((b) => [b.owner_id, b])), today, runId: null, dryRun: !data.save },
        "paste", { url, text, time: postDate ? `${postDate}T17:00:00Z` : "", author, inputUrl: "" }, null,
      );
      return { error: null, read: { text, author, postDate: postDate || today }, stops };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e), read: { text, author, postDate }, stops: [] };
    }
  });

/** Admin-only: whether the optional logged-in Facebook session secret is set (never returns its value). */
export const facebookSessionStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { facebookSessionConfigured } = await import("./facebook.server");
    return { configured: facebookSessionConfigured() };
  });
