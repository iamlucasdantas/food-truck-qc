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
  apify_event: "Imported from Facebook Events",
  apify_post: "Imported from a social post",
  apify_maps: "Imported from Google Maps",
  estimated: "Estimated (weekly pattern)",
};

const hours = (d: Date) => d.getHours() + d.getMinutes() / 60;
const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** Best stop for one truck on a date/time window, with status relative to now. */
/** Google Maps base-location stops are low-confidence: shown gray ("none"), only when no real stop matches. */
export function pickStop(stops: Stop[], date: Date, win: Window, now: Date): { stop: Stop | null; status: Status } {
  const real = pickReal(stops.filter((s) => s.source !== "apify_maps"), date, win, now);
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
