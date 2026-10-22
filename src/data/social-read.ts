/**
 * Pure rules for reading Facebook / Instagram links: what a pasted link is (page, group or single post),
 * how a raw scraper item becomes a post (normal posts, photo pages, reels), when a page read is only
 * Facebook's login wall, and how each post's outcome is described in the Enrich log.
 */

export type SocialService = "facebook" | "instagram" | "web";
export type SocialLinkType = { service: SocialService; type: "page" | "group" | "post" | "website" };

const FB_HOST = /^(www\.|m\.|web\.|mbasic\.)?facebook\.com$|^fb\.(com|watch)$/;
const IG_HOST = /^(www\.)?instagram\.com$/;

/** Classifies a link: a single post is read once; pages/profiles become the truck's scan sources. */
export function socialLinkType(raw: string): SocialLinkType {
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw.trim()) ? raw.trim() : `https://${raw.trim()}`); } catch { return { service: "web", type: "website" }; }
  const host = u.hostname.toLowerCase(), path = u.pathname.toLowerCase(), q = u.search.toLowerCase();
  if (FB_HOST.test(host)) {
    if (host.startsWith("fb.")) return { service: "facebook", type: "post" };
    if (/^\/groups\/[^/]+\/(posts|permalink)\//.test(path)) return { service: "facebook", type: "post" };
    if (path.startsWith("/groups/")) return { service: "facebook", type: "group" };
    if (/\/(posts|videos|photos|reel|reels|events)\//.test(path) || /^\/(photo|photo\.php|permalink\.php|story\.php|watch)\b/.test(path)
      || /^\/share\/(p|r|v)\//.test(path) || /story_fbid=|fbid=/.test(q)) return { service: "facebook", type: "post" };
    return { service: "facebook", type: "page" };
  }
  if (IG_HOST.test(host)) return { service: "instagram", type: /^\/(p|reel|reels|tv)\//.test(path) ? "post" : "page" };
  return { service: "web", type: "website" };
}

/** Normalized post across Facebook, Reddit and Instagram items. */
export type Post = { url: string; text: string; time: string; author: string; inputUrl: string; images?: string[] };
export type RawItem = Record<string, unknown>;

const str = (v: unknown) => (typeof v === "string" ? v : "");
const obj = (v: unknown) => (v && typeof v === "object" ? (v as Record<string, unknown>) : {});

/** Photo URLs attached to a scraped post (schedule flyers are usually images, not text). */
export function postImages(it: RawItem): string[] {
  const out: string[] = [];
  const add = (v: unknown) => { if (typeof v === "string" && /^https:\/\//.test(v) && !out.includes(v)) out.push(v); };
  for (const m of (Array.isArray(it["media"]) ? it["media"] : []) as RawItem[]) { add(obj(m["photo_image"])["uri"]); add(obj(m["image"])["uri"]); add(m?.["thumbnail"]); }
  add(it["displayUrl"]); for (const u of (Array.isArray(it["images"]) ? it["images"] : [])) add(u);
  add(obj(it["image"])["uri"]);
  return out.slice(0, 3);
}

const unixIso = (v: unknown) => (typeof v === "number" && v > 1e9 ? new Date(v * 1000).toISOString() : "");

/** Raw dataset item → post. Handles feed posts, single photo pages (album) and reels from the Facebook actor. */
export function normalizeSocialItem(kind: string, it: RawItem): Post | null {
  if (kind === "reddit") {
    const text = [str(it["title"]), str(it["body"])].filter(Boolean).join("\n").trim();
    const url = str(it["url"]) || str(it["postUrl"]);
    if (!url || !text) return null;
    return { url, text, time: str(it["createdAt"]), author: str(it["username"]) || str(it["author"]), inputUrl: str(it["inputUrl"]) };
  }
  if (kind === "instagram") {
    const text = str(it["caption"]).trim();
    const url = str(it["url"]) || str(it["postUrl"]);
    const images = postImages(it);
    if (!url || (!text && !images.length)) return null;
    return { url, text, time: str(it["timestamp"]), author: str(it["ownerUsername"]), inputUrl: str(it["inputUrl"]), images };
  }
  const story = obj(it["container_story"]);
  const url = str(it["url"]) || str(it["postUrl"]) || str(it["topLevelUrl"]) || str(story["url"]) || str(it["facebookUrl"]);
  const text = (str(it["text"]) || str(obj(it["message"])["text"]) || str(it["accessibility_caption"])).trim();
  const images = postImages(it);
  if (!url || (!text && !images.length)) return null;
  const owner = obj(it["owner"]), user = obj(it["user"]);
  return {
    url, text, time: str(it["time"]) || unixIso(it["created_time"]) || unixIso(it["creation_time"]),
    author: str(user["name"]) || str(it["pageName"]) || str(owner["name"]),
    inputUrl: str(it["inputUrl"]) || str(it["facebookUrl"]), images,
  };
}

/** A photo/reel page whose real post (full caption + all photos) lives at another URL. */
export function followUpUrl(it: RawItem): string | null {
  if (str(it["text"]).trim()) return null;
  const u = str(obj(it["container_story"])["url"]);
  return /^https:\/\/(www\.)?facebook\.com\//.test(u) ? u : null;
}

/** Scraper error rows (e.g. "not_available") carry no post. */
export function itemError(it: RawItem): string | null {
  const e = str(it["errorDescription"]) || str(it["error"]);
  return e ? e.slice(0, 200) : null;
}

/** Facebook without login shows only the page header (name, followers, category) — no posts to read. */
export function isLoginWallText(markdown: string): boolean {
  const t = markdown.replace(/\s+/g, " ").trim();
  return t.length < 600 || /you must log in|log in to continue|log into facebook/i.test(t);
}

export function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

type Outcome = { status: string; venue: string; date: string; start: string; end: string };
const WHY: Record<string, string> = {
  published: "on the map", suggested: "sent to Pending trucks for review", duplicate: "already saved",
  history: "date already passed", "no-address": "address not found", "no-category": "category missing",
  "low-confidence": "too vague to use", "owner-has-stop": "owner already set this time", "no-truck": "truck not matched", preview: "preview",
};

/** One log line per post: date, a short quote and what happened to each stop found in it. */
export function describePostOutcome(post: Pick<Post, "time" | "text">, results: Outcome[]): string {
  const d = Date.parse(post.time);
  const when = Number.isFinite(d) ? new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", month: "short", day: "numeric" }).format(new Date(d)) : "undated";
  const quote = post.text.replace(/\s+/g, " ").trim().slice(0, 70);
  const head = `${when} post${quote ? ` “${quote}${post.text.length > 70 ? "…" : ""}”` : " (photo only)"}`;
  if (!results.length) return `${head} → no date/place announced`;
  return `${head} → ${results.map((r) => `${r.venue || "?"} ${r.date} ${r.start}–${r.end}: ${WHY[r.status] ?? r.status}`).join("; ")}`;
}
