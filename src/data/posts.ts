// Pure helpers that turn a social post into stops: time ranges, several venues per post, the post's date, venue matching.

const pad = (n: number) => String(n).padStart(2, "0");
const RANGE = /\b(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\s*(?:-|–|—|to|til|till|until)\s*(\d{1,2})(?::(\d{2}))?\s*(am|pm|a|p)?\b/gi;

/** "11-2" → 11:00–14:00, "4-8pm" → 16:00–20:00, "11am-2pm", "11:30-1:30", "5 to 8 pm". Times are 24h HH:MM (Central). */
export function parseTimeRange(s: string): { start: string; end: string } | null {
  RANGE.lastIndex = 0;
  const m = RANGE.exec(s);
  return m ? rangeFrom(m) : null;
}

function rangeFrom(m: RegExpExecArray): { start: string; end: string } | null {
  let sh = Number(m[1]), eh = Number(m[4]);
  const sm = Number(m[2] ?? 0), em = Number(m[5] ?? 0);
  const sMer = m[3]?.[0]?.toLowerCase(), eMer = m[6]?.[0]?.toLowerCase();
  if (sh > 23 || eh > 23 || sm > 59 || em > 59) return null;
  const to24 = (h: number, mer: string) => (mer === "p" ? (h % 12) + 12 : h % 12);
  if (eMer) eh = to24(eh, eMer);
  if (sMer) sh = to24(sh, sMer);
  else if (eMer && sh <= 12) {
    // "4-8pm" → 4pm; "11-2pm" → 11am (start would otherwise be after the end).
    const asSame = to24(sh, eMer);
    sh = asSame < eh ? asSame : sh % 12;
  } else if (!eMer && sh <= 12) {
    // No am/pm at all: food trucks serve 7am–11pm, so 1–6 means afternoon.
    if (sh >= 1 && sh <= 6) sh += 12;
  }
  if (!eMer && eh <= 12 && eh * 60 + em <= sh * 60 + sm) eh += 12;
  if (eh * 60 + em <= sh * 60 + sm || eh > 24) return null;
  return { start: `${pad(sh)}:${pad(sm)}`, end: `${pad(eh % 24 === 0 && eh === 24 ? 23 : eh)}:${pad(eh === 24 ? 59 : em)}` };
}

export type VenueHint = { venue: string; start: string; end: string };
const LEAD = /^(?:[\s,;:.!&+@|/-]|and\b|then\b|at\b|today\b|tonight\b|tomorrow\b|(?:mon|tues|wednes|thurs|fri|satur|sun)day\b|we'?re\b|we are\b|find us\b|catch us\b)+/i;
const TRAIL = /(?:[\s,;:.!&+@|/-]|from\b|at\b|@)+$/i;

/** One entry per "<venue> <time range>" pair: "Jumpin Joey's 11-2 & Adventurous Brewing LLC 4-8pm" → two venues. */
export function splitVenues(text: string): VenueHint[] {
  const out: VenueHint[] = [];
  const firstLine = text.split(/\n{2,}/)[0] ?? text;
  RANGE.lastIndex = 0;
  let prev = 0, m: RegExpExecArray | null;
  while ((m = RANGE.exec(firstLine))) {
    const r = rangeFrom(m);
    const raw = firstLine.slice(prev, m.index);
    prev = m.index + m[0].length;
    if (!r) continue;
    // Venue = the last clause before the time (after a sentence break or newline).
    const clause = raw.split(/[.!?\n]\s+|\n/).pop() ?? "";
    const venue = clause.replace(LEAD, "").replace(TRAIL, "").trim();
    if (venue.length >= 3 && venue.length <= 80) out.push({ venue, ...r });
  }
  return out;
}

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** The date a post is about (YYYY-MM-DD): "tomorrow", "today/tonight", a weekday name (next one on/after the post date), else the post date. */
export function resolvePostDate(text: string, postDate: string): string {
  const t = text.toLowerCase();
  if (/\btomorrow\b/.test(t)) return addDays(postDate, 1);
  if (/\b(today|tonight|this (morning|afternoon|evening))\b/.test(t)) return postDate;
  const dow = new Date(`${postDate}T12:00:00Z`).getUTCDay();
  for (let i = 0; i < 7; i++) {
    const name = WEEKDAYS[i]!;
    if (new RegExp(`\\b(${name}|${name.slice(0, 3)})\\b`).test(t)) return addDays(postDate, (i - dow + 7) % 7);
  }
  return postDate;
}

/** Venue names compared loosely: no apostrophes/punctuation, company suffixes dropped. */
export function normVenue(name: string): string {
  return name.toLowerCase().replace(/['’]/g, "").replace(/&/g, " and ").replace(/[^a-z0-9 ]/g, " ")
    .split(/\s+/).filter((w) => w && !["the", "llc", "inc", "co", "company", "ltd"].includes(w)).join(" ");
}

/** Find a saved venue by name: exact normalized match, or one name containing the other (≥ 6 chars). */
export function matchVenue<T extends { name: string }>(name: string, venues: T[]): T | null {
  const n = normVenue(name);
  if (n.length < 3) return null;
  return venues.find((v) => normVenue(v.name) === n)
    ?? (n.length >= 6 ? venues.find((v) => { const m = normVenue(v.name); return m.length >= 6 && (m.includes(n) || n.includes(m)); }) : undefined)
    ?? null;
}

export const QC_BOUNDS = { south: 41.38, north: 41.72, west: -90.80, east: -90.20 };
export const inQuadCities = (lat: number, lng: number) =>
  lat >= QC_BOUNDS.south && lat <= QC_BOUNDS.north && lng >= QC_BOUNDS.west && lng <= QC_BOUNDS.east;

/** A looked-up place is trusted only when it is in the Quad Cities and its name matches the venue; otherwise "Check address". */
export function needsAddressCheck(query: string, found: { name: string; lat: number; lng: number }): boolean {
  if (!inQuadCities(found.lat, found.lng)) return true;
  const a = normVenue(query), b = normVenue(found.name);
  return !(a && b && (a === b || (Math.min(a.length, b.length) >= 6 && (a.includes(b) || b.includes(a)))));
}

export type ExtractedStop = { truck_name: string; is_food_truck: boolean; date: string; start: string; end: string; venue: string; address: string; city: string; confidence: number };

/** Add stops the AI missed for venues found by splitVenues, so a post with two venues always gives two stops. */
export function mergeHints(ai: ExtractedStop[], hints: VenueHint[], date: string, truckName: string): ExtractedStop[] {
  const out = [...ai];
  for (const h of hints) {
    const n = normVenue(h.venue);
    if (out.some((e) => { const m = normVenue(e.venue); return m && (m === n || m.includes(n) || n.includes(m)); })) continue;
    out.push({ truck_name: ai[0]?.truck_name || truckName, is_food_truck: true, date: ai[0]?.date || date, start: h.start, end: h.end, venue: h.venue, address: "", city: "", confidence: 0.75 });
  }
  return out;
}

/** Placeholder names the AI returns when a post doesn't say who the truck is. Never create or match a truck by these. */
export function isUnknownTruckName(name: string | null | undefined): boolean {
  const n = (name ?? "").toLowerCase().replace(/[^a-z0-9 ]+/g, " ").replace(/\s+/g, " ").trim();
  if (n.length < 3) return true;
  return /^(unknown|unnamed|n a|na|none|null|undefined|tbd|not specified|not mentioned|no name|food truck|a food truck|the food truck|truck|unknown (food )?truck|unnamed (food )?truck)$/.test(n);
}

/** Name for a pending review truck when the post didn't name it: the post author, else a clear review label. */
export function reviewTruckName(author: string | null | undefined): string {
  const a = (author ?? "").trim();
  return a && !isUnknownTruckName(a) ? a : "Unnamed truck (needs review)";
}
