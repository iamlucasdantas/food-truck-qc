import { apifyHeaders, facebookCookies, type Post } from "./facebook.server";
import { normalizeSocialItem, followUpUrl, itemError, type RawItem } from "@/data/social-read";

const ACTOR = { facebook: "apify~facebook-posts-scraper", instagram: "apify~instagram-scraper" } as const;

async function runSync(service: "facebook" | "instagram", urls: string[]): Promise<{ items: RawItem[] } | { error: string }> {
  const input: Record<string, unknown> = service === "facebook"
    ? { startUrls: urls.map((url) => ({ url })), resultsLimit: 3 }
    : { directUrls: urls, resultsType: "posts", resultsLimit: 3 };
  const cookies = service === "facebook" ? facebookCookies() : null;
  if (cookies) input["cookies"] = cookies;
  // Gateway calls longer than ~90s fail, so Apify is asked to stop at 70s.
  const res = await fetch(`https://connector-gateway.lovable.dev/apify/acts/${ACTOR[service]}/run-sync-get-dataset-items?timeout=70&clean=true`, {
    method: "POST", headers: { ...apifyHeaders(), "Content-Type": "application/json" }, body: JSON.stringify(input), signal: AbortSignal.timeout(85_000),
  }).catch((e: unknown) => ({ ok: false, status: 0, text: async () => (e instanceof Error ? e.message : String(e)) }) as const);
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[social-direct] ${service} ${urls[0]} failed [${res.status}]: ${body.slice(0, 300)}`);
    return { error: `Apify ${res.status === 0 ? "timeout" : `[${res.status}]`}: ${body.slice(0, 140)}` };
  }
  const items = (await (res as Response).json().catch(() => [])) as RawItem[];
  return { items: Array.isArray(items) ? items : [] };
}

/**
 * Reads ONE Facebook/Instagram page, profile, share link or single post right now (small synchronous Apify job,
 * newest 3 posts). Photo/reel links are followed to the post that holds the caption and all photos.
 * Used by Enrich so the admin sees the result in the log instead of "scan started, check later".
 */
export async function readSocialNow(service: "facebook" | "instagram", url: string): Promise<{ posts: Post[]; error?: string }> {
  const first = await runSync(service, [url]);
  if ("error" in first) return { posts: [], error: first.error };
  const kind = service === "facebook" ? "page" : "instagram";
  let posts = first.items.map((it) => normalizeSocialItem(kind, it)).filter((p): p is Post => !!p);
  const follow = [...new Set(first.items.map(followUpUrl).filter((u): u is string => !!u))].slice(0, 2);
  if (follow.length) {
    const more = await runSync(service, follow);
    if (!("error" in more)) {
      const full = more.items.map((it) => normalizeSocialItem(kind, it)).filter((p): p is Post => !!p);
      if (full.length) posts = [...full, ...posts.filter((p) => !follow.includes(p.url))];
    }
  }
  const seen = new Set<string>();
  posts = posts.filter((p) => !seen.has(p.url) && !!seen.add(p.url))
    .sort((a, b) => (Date.parse(b.time) || 0) - (Date.parse(a.time) || 0)).slice(0, 3)
    .map((p) => ({ ...p, inputUrl: p.inputUrl || url }));
  if (!posts.length) {
    const err = first.items.map(itemError).find(Boolean);
    return { posts, error: err ? `Apify: ${err}` : "Apify returned no posts" };
  }
  return { posts };
}
