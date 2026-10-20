import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type DB = SupabaseClient<Database>;
const API = "https://api.context.dev/v1/web/scrape";

/** Reads one page as Markdown through context.dev (handles JS sites, proxies and bot checks). */
export async function scrapeMarkdown(url: string): Promise<{ markdown: string; title: string } | { error: string }> {
  const key = process.env["CONTEXT_DEV_API_KEY"];
  if (!key) return { error: "context.dev is not connected yet" };
  const res = await fetch(API, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ url, formats: { markdown: true }, sharedParams: { mainContentOnly: true } }),
    signal: AbortSignal.timeout(45_000),
  }).catch((e: unknown) => ({ ok: false, status: 0, text: async () => String(e) }) as const);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[context.dev] ${url} failed [${res.status}]: ${body.slice(0, 300)}`);
    return { error: `context.dev failed [${res.status}]: ${body.slice(0, 160)}` };
  }
  const j = (await (res as Response).json()) as { markdown?: { success?: boolean; data?: string | null }; metadata?: { title?: string } };
  const markdown = j.markdown?.data ?? "";
  if (!markdown.trim()) return { error: "No readable text on the page" };
  return { markdown, title: j.metadata?.title ?? "" };
}

/**
 * Website / directory sources (kind "website"): each page is read with context.dev and run through the same
 * post extractor and review rules as social posts. A truck's own site counts as its own post; directories are third-party.
 */
export async function scanWebsiteSources(db: DB, max = 6, budgetMs = 50_000): Promise<{ scanned: number; stops: number; error?: string }> {
  if (!process.env["CONTEXT_DEV_API_KEY"]) return { scanned: 0, stops: 0, error: "context.dev is not connected yet" };
  const { data: sources } = await db.from("social_sources").select("*").eq("kind", "website").eq("active", true)
    .order("last_run_at", { ascending: true, nullsFirst: true }).limit(max);
  if (!sources?.length) return { scanned: 0, stops: 0 };
  const { ingestPost } = await import("./facebook.server");
  const { chicagoDate } = await import("@/data/trucks");
  const [{ data: trucks }, { data: biz }] = await Promise.all([
    db.from("trucks").select("id, name, claimed_by, phone, instagram, facebook, reddit").neq("status", "archived").is("deleted_at", null),
    db.from("businesses").select("owner_id, facebook, instagram, reddit"),
  ]);
  const ctx = { db, trucks: trucks ?? [], bizByOwner: new Map((biz ?? []).map((b) => [b.owner_id, b])), today: chicagoDate(), runId: null };
  const started = Date.now();
  let scanned = 0, stops = 0;
  for (const s of sources) {
    if (Date.now() - started > budgetMs) break;
    const page = await scrapeMarkdown(s.url);
    scanned++;
    if ("error" in page) {
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "blocked", last_reason: page.error, last_posts: 0, last_stops: 0 }).eq("id", s.id);
      continue;
    }
    const owner = s.truck_id ? ctx.trucks.find((t) => t.id === s.truck_id) ?? null : null;
    try {
      const out = await ingestPost(ctx, owner ? "page" : "group", { url: s.url, text: page.markdown.slice(0, 8000), time: new Date().toISOString(), author: owner?.name ?? page.title, inputUrl: s.url }, owner);
      const added = out.filter((r) => r.status === "published" || r.status === "pending" || r.status === "suggested").length;
      stops += added;
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "ok", last_reason: null, last_posts: 1, last_stops: added }).eq("id", s.id);
    } catch (e) {
      await db.from("social_sources").update({ last_run_at: new Date().toISOString(), last_status: "error", last_reason: e instanceof Error ? e.message.slice(0, 200) : "error" }).eq("id", s.id);
    }
  }
  return { scanned, stops };
}
