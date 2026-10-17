import type { Tables } from "@/integrations/supabase/types";

export type Truck = Tables<"trucks">;
export type Stop = Tables<"stops">;
export type Source = Stop["source"];
export type Window = "now" | "lunch" | "dinner" | "all";
export type Status = "open" | "today" | "none";

export const QC_CENTER = { lat: 41.52, lng: -90.55 };

export const WINDOWS: Record<Exclude<Window, "now">, [number, number]> = {
  lunch: [11, 14], dinner: [17, 21], all: [0, 24],
};

export const SOURCE_LABEL: Record<Source, string> = {
  owner: "Confirmed by owner",
  own_post: "From their own post",
  apify_event: "Imported from Facebook Events",
  apify_post: "Imported from a social post",
  apify_maps: "Imported from Google Maps",
  estimated: "Estimated (weekly pattern)",
};

export type StopBadge = "own post" | "community" | "calendar" | "manual";
/** Short source badge for a stop. Calendar = imported from the owner's connected calendar feed. */
export function stopBadge(stop: Pick<Stop, "source">, series?: { external_uid?: string | null } | null): StopBadge {
  if (series?.external_uid) return "calendar";
  if (stop.source === "own_post") return "own post";
  if (stop.source === "apify_post" || stop.source === "apify_event") return "community";
  return "manual";
}

/** Extract a comparable handle from a social URL or raw @handle. */
export function socialHandle(v: string | null | undefined): string {
  if (!v) return "";
  const s = v.trim().toLowerCase().replace(/^@/, "");
  const m = s.match(/(?:facebook\.com|instagram\.com|reddit\.com\/(?:user|u|r))\/([^/?#]+)/);
  return (m?.[1] ?? s.replace(/^https?:\/\/(www\.)?/, "")).replace(/\/+$/, "");
}
/** True when a post author matches one of the truck's saved social handles (Facebook, Instagram or Reddit). */
export function authorIsTruck(author: string | null | undefined, truck: { facebook?: string | null; instagram?: string | null; reddit?: string | null }): boolean {
  const a = socialHandle(author);
  if (!a) return false;
  return [truck.facebook, truck.instagram, truck.reddit].some((h) => {
    const x = socialHandle(h);
    return !!x && (x === a || x.endsWith("/" + a) || a.endsWith("/" + x));
  });
}

const hours = (d: Date) => d.getHours() + d.getMinutes() / 60;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Best stop for one truck on a date/time window, with status relative to now. */
/** Google Maps base-location stops are low-confidence: shown gray ("none"), only when no real stop matches. */
export function pickStop(stops: Stop[], date: Date, win: Window, now: Date): { stop: Stop | null; status: Status } {
  const real = pickReal(stops.filter((s) => s.source !== "apify_maps" || s.note === "Google opening hours"), date, win, now);
  if (real.stop) return real;
  const base = stops.find((s) => !s.cancelled && s.source === "apify_maps" && sameDay(new Date(s.starts_at), date));
  return base ? { stop: base, status: "none" } : real;
}

function pickReal(stops: Stop[], date: Date, win: Window, now: Date): { stop: Stop | null; status: Status } {
  const live = stops.filter((s) => !s.cancelled);
  if (win === "now") {
    if (!sameDay(date, now)) return { stop: null, status: "none" };
    const open = live.find((s) => new Date(s.starts_at) <= now && new Date(s.ends_at) > now);
    if (open) return { stop: open, status: "open" };
    const later = live
      .filter((s) => sameDay(new Date(s.starts_at), now) && new Date(s.starts_at) > now)
      .sort((a, b) => a.starts_at.localeCompare(b.starts_at))[0];
    return later ? { stop: later, status: "today" } : { stop: null, status: "none" };
  }
  const [a, b] = WINDOWS[win];
  const hit = live.find((s) => {
    const st = new Date(s.starts_at), en = new Date(s.ends_at);
    if (!sameDay(st, date)) return false;
    const eh = sameDay(st, en) ? hours(en) : 24;
    return eh > a && hours(st) < b;
  });
  if (!hit) return { stop: null, status: "none" };
  const isOpen = new Date(hit.starts_at) <= now && new Date(hit.ends_at) > now;
  return { stop: hit, status: isOpen ? "open" : "today" };
}

export function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const R = 3958.8, rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad, dLng = (b.lng - a.lng) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

export function fmtTime(iso: string | Date) {
  return new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" }).replace(":00", "").replace(" ", "").toLowerCase();
}

export function fmtRange(s: Stop) {
  if (s.note === 'Google opening hours') {
    const time = (iso: string) => new Date(iso).toLocaleTimeString('en-US', { timeZone: 'America/Chicago', hour: 'numeric', minute: '2-digit' });
    return `${time(s.starts_at)}–${time(s.ends_at)}`;
  }
  return `${fmtTime(s.starts_at)}–${fmtTime(s.ends_at)}`;
}

/** Closing time for the owner's "I'm here" chips. Never more than 6h out (live stops auto-expire). */
export function closingTime(choice: "+2h" | "+4h" | "9pm", now: Date): Date {
  const d = new Date(now);
  if (choice === "+2h") d.setHours(d.getHours() + 2);
  else if (choice === "+4h") d.setHours(d.getHours() + 4);
  else { d.setHours(21, 0, 0, 0); if (d <= now) d.setTime(now.getTime() + 60 * 60 * 1000); }
  const cap = now.getTime() + 6 * 60 * 60 * 1000;
  return d.getTime() > cap ? new Date(cap) : d;
}

export const LIVE_MIN_MINUTES = 15;
export const LIVE_MAX_MINUTES = 12 * 60;
export const LIVE_DEFAULT_MINUTES = 120;
export type LiveChoice = { kind: "minutes"; minutes: number } | { kind: "until"; time: string };

/**
 * End time for an "I'm here" check-in. Durations are minutes from now; "until" is a Central (America/Chicago)
 * wall-clock HH:MM — if that time already passed today it means tomorrow. Must be 15 min to 12 h away.
 */
export function liveEnd(choice: LiveChoice, now: Date): { ok: true; end: Date } | { ok: false; error: string } {
  let end: Date;
  if (choice.kind === "minutes") {
    if (!Number.isFinite(choice.minutes)) return { ok: false, error: "Enter how long you'll be there." };
    end = new Date(now.getTime() + Math.round(choice.minutes) * 60_000);
  } else {
    if (!/^\d{1,2}:\d{2}$/.test(choice.time)) return { ok: false, error: "Pick an end time." };
    end = centralToUtc(chicagoDate(now), choice.time);
    if (end <= now) end = centralToUtc(chicagoDate(new Date(now.getTime() + 86_400_000)), choice.time);
  }
  const mins = (end.getTime() - now.getTime()) / 60_000;
  if (mins < LIVE_MIN_MINUTES - 0.01) return { ok: false, error: "Pick at least 15 minutes." };
  if (mins > LIVE_MAX_MINUTES + 0.01) return { ok: false, error: "The longest check-in is 12 hours." };
  return { ok: true, end };
}

/** Clock time in Quad Cities (Central) time, e.g. "3:45 PM". */
export function fmtCentral(iso: string | Date): string {
  return new Date(iso).toLocaleTimeString("en-US", { timeZone: "America/Chicago", hour: "numeric", minute: "2-digit" });
}

export function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/** Minimal CSV parser (quoted fields, commas, newlines) → array of header-keyed rows. */
export function parseCsv(text: string): Record<string, string>[] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') q = false;
      else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell); cell = "";
      if (row.some((c) => c.trim())) rows.push(row);
      row = [];
    } else cell += ch;
  }
  row.push(cell);
  if (row.some((c) => c.trim())) rows.push(row);
  const [head, ...body] = rows;
  if (!head) return [];
  const keys = head.map((h) => h.trim().toLowerCase());
  return body.map((r) => Object.fromEntries(keys.map((k, i) => [k, (r[i] ?? "").trim()])));
}

const FOOD_WORDS = /food truck|food stand|food cart|mobile|caterer|catering|taco|bbq|barbecue|burger|hot dog|pizza|restaurant|ice cream|dessert|coffee|snack|sandwich|grill|kitchen|street food/i;
const NON_FOOD = /repair|dealer|rental|auto|parking|storage|wash|towing|moving|supply|insurance|bank|school|church/i;

/** Keep Google Maps results that are food trucks / food businesses; drop dealers, repair shops, etc. */
export function isFoodTruckPlace(categoryName?: string, categories?: string[], title?: string): boolean {
  const cats = [categoryName ?? "", ...(categories ?? [])].join(" | ");
  if ([categoryName ?? '', ...(categories ?? [])].some(c => /^(food[ _]truck|food[ _]stand|mobile[ _]caterer)$/i.test(c.trim()))) return true;
  if (NON_FOOD.test(cats)) return false;
  if (/\b(?:truck|trailer|cart)s?\b/i.test(title ?? '')) return true;
  return FOOD_WORDS.test(cats);
}

const CAT_MAP: [RegExp, string][] = [
  [/mexican|taco/i, "Mexican"], [/bbq|barbecue/i, "BBQ"], [/burger/i, "Burgers"], [/hot dog/i, "Hot Dogs"], [/pizza/i, "Pizza"],
  [/ice cream|dessert|bakery|donut/i, "Desserts"], [/coffee|cafe/i, "Coffee"], [/thai/i, "Thai"], [/korean/i, "Korean"],
  [/japanese|sushi/i, "Japanese"], [/indian/i, "Indian"], [/italian/i, "Italian"], [/caribbean|jamaican/i, "Caribbean"],
  [/chicken|wings/i, "Chicken"], [/sandwich|deli/i, "Sandwiches"], [/seafood|fish/i, "Seafood"], [/asian|chinese/i, "Asian Fusion"],
];
export function mapApifyCategory(categoryName?: string): string {
  return CAT_MAP.find(([re]) => re.test(categoryName ?? ""))?.[1] ?? "Other";
}

/** Where to place a truck for a window: its matching stop, else its base location (gray). Mobile trucks only show where a stop says they are. */
export function placeTruck(t: Pick<Truck, "base_lat" | "base_lng" | "truck_type">, picked: { stop: Stop | null; status: Status }) {
  if (picked.stop && picked.status !== "none") return { lat: picked.stop.lat, lng: picked.stop.lng, status: picked.status, stop: picked.stop };
  if (t.truck_type === "mobile") return null;
  const lat = t.base_lat ?? picked.stop?.lat, lng = t.base_lng ?? picked.stop?.lng;
  return lat != null && lng != null ? { lat, lng, status: "none" as Status, stop: null } : null;
}

const RANK: Record<Status, number> = { open: 0, today: 1, none: 2 };
/** Sort live > scheduled > no data, then nearest first. */
export function byStatusThenDistance(a: { status: Status; dist: number }, b: { status: Status; dist: number }) {
  return RANK[a.status] - RANK[b.status] || a.dist - b.dist;
}

/** Use the user's location only when it is inside the Quad Cities area (≤ 40 mi). */
export function chooseCenter(user: { lat: number; lng: number } | null) {
  return user && milesBetween(user, QC_CENTER) <= 40 ? user : QC_CENTER;
}

/** Truck names compared loosely: lowercase, no punctuation, filler words dropped. */
export function normalizeTruckName(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w && !["the", "food", "truck", "trailer", "llc", "co", "inc"].includes(w)).join(" ");
}
/** Find an existing truck by normalized name (exact, or containment for names ≥ 5 chars). */
export function matchTruckByName<T extends { name: string }>(name: string, trucks: T[]): T | null {
  const n = normalizeTruckName(name);
  if (n.length < 3) return null;
  return trucks.find((t) => normalizeTruckName(t.name) === n)
    ?? (n.length >= 5 ? trucks.find((t) => { const m = normalizeTruckName(t.name); return m.length >= 5 && (m.includes(n) || n.includes(m)); }) : undefined)
    ?? null;
}
/** Today's date (YYYY-MM-DD) in Quad Cities (Central) time. */
export function chicagoDate(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(now);
}
/** Central local date + HH:MM → UTC Date (DST-aware). */
export function centralToUtc(date: string, time: string): Date {
  const guess = new Date(`${date}T${time.padStart(5, "0")}:00Z`);
  const format = new Intl.DateTimeFormat("en-US", { timeZone: "America/Chicago", hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" });
  let result = guess;
  for (let i = 0; i < 3; i++) {
    const parts = format.formatToParts(result);
    const g = (t: string) => Number(parts.find(x => x.type === t)?.value ?? 0);
    const wall = Date.UTC(g('year'), g('month') - 1, g('day'), g('hour'), g('minute'));
    const correction = guess.getTime() - wall;
    if (!correction) break;
    result = new Date(result.getTime() + correction);
  }
  return result;
}
/** Keep an AI-extracted stop only if confident (≥ 0.7) and dated today through the next 30 days. */
export function keepExtraction(e: { confidence: number; date: string }, today: string): boolean {
  if (!(e.confidence >= 0.7) || !/^\d{4}-\d{2}-\d{2}$/.test(e.date)) return false;
  const days = (Date.parse(e.date) - Date.parse(today)) / 86_400_000;
  return days >= 0 && days <= 30;
}

export type Business = Tables<"businesses">;
export const PAYMENT_METHODS = ["Cash", "Credit/debit card", "Apple Pay", "Google Pay", "Venmo", "Cash App", "Zelle", "PayPal"] as const;

/** Payment methods shown publicly: the truck's own list when "Same as business" is off, otherwise the business list. */
export function effectivePayments(
  truck: Pick<Truck, "payments_same_as_business" | "payment_methods" | "payment_other">,
  business: Pick<Business, "payment_methods" | "payment_other"> | null | undefined,
): string[] {
  const src = !truck.payments_same_as_business || !business ? truck : business;
  const other = src.payment_other.trim();
  return [...src.payment_methods, ...(other ? [other] : [])];
}

/** Social handles that identify a truck's posts: the owner's business handles, falling back to legacy per-truck values. */
export function ownerHandles(
  truck: Pick<Truck, "facebook" | "instagram" | "reddit">,
  business: Pick<Business, "facebook" | "instagram" | "reddit"> | null | undefined,
) {
  return {
    facebook: business?.facebook || truck.facebook || null,
    instagram: business?.instagram || truck.instagram || null,
    reddit: business?.reddit || truck.reddit || null,
  };
}

/** Public description without the private owner-contact / business lines stored by the signup form. */
export function publicDescription(d: string | null | undefined): string {
  return (d ?? "").split("\n").filter((l) => !/^(Owner contact|Business):/.test(l.trim())).join("\n").trim();
}

const venueKey = (s: string) => s.toLowerCase().replace(/\(.*?\)/g, "").replace(/[^a-z0-9]+/g, " ").replace(/\b(the|company|co|llc|inc)\b/g, "").replace(/\s+/g, " ").trim();

/**
 * Collapse repeated posts about the same outing: same truck, same venue name, overlapping times.
 * The most recently created row wins (newest post = latest info); `merged` counts the rows folded in.
 */
export function groupStops<T extends Pick<Stop, "truck_id" | "venue_name" | "starts_at" | "ends_at" | "created_at">>(stops: T[]): (T & { merged: number })[] {
  const out: (T & { merged: number })[] = [];
  for (const s of stops) {
    const k = venueKey(s.venue_name);
    const hit = out.find((g) => g.truck_id === s.truck_id && venueKey(g.venue_name) === k && k !== ""
      && new Date(g.starts_at) < new Date(s.ends_at) && new Date(s.starts_at) < new Date(g.ends_at));
    if (!hit) { out.push({ ...s, merged: 1 }); continue; }
    const n = hit.merged + 1;
    if (s.created_at > hit.created_at) Object.assign(hit, s);
    hit.merged = n;
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}
