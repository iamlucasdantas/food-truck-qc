/** Pure rules for schedule-screenshot drafts and the Admin stop log. Unit-tested in stop-drafts.test.ts. */

export type StopDraft = { venue: string; address: string; city: string; date: string; start: string; end: string };

const hm = (v: unknown) => (typeof v === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(v.trim()) ? v.trim() : "");

/** Keep only usable future public stops; private events and past dates are skipped. Missing times default to 11:00, end = start + 3h. */
export function parseStopDrafts(raw: unknown, today: string): { stops: StopDraft[]; skipped: number } {
  const list = Array.isArray(raw) ? raw : [];
  const stops: StopDraft[] = [];
  let skipped = 0;
  for (const r of list) {
    const o = (r ?? {}) as Record<string, unknown>;
    const date = typeof o["date"] === "string" && /^\d{4}-\d{2}-\d{2}$/.test(o["date"]) ? o["date"] : "";
    const venue = String(o["venue"] ?? "").trim().slice(0, 160);
    if (o["private"] === true || /private/i.test(venue) || !date || date < today || !venue) { skipped++; continue; }
    const start = hm(o["start"]) || "11:00";
    let end = hm(o["end"]);
    if (!end || end <= start) { const [h, m] = start.split(":").map(Number); end = `${String(Math.min(23, h! + 3)).padStart(2, "0")}:${String(m).padStart(2, "0")}`; }
    stops.push({ venue, address: String(o["address"] ?? "").trim().slice(0, 240), city: String(o["city"] ?? "").trim().slice(0, 80), date, start, end });
  }
  return { stops, skipped };
}

export type LogStatus = "past" | "live" | "upcoming" | "cancelled";
export function stopStatus(s: { starts_at: string; ends_at: string; cancelled: boolean }, now = Date.now()): LogStatus {
  if (s.cancelled) return "cancelled";
  const a = new Date(s.starts_at).getTime(), b = new Date(s.ends_at).getTime();
  return b <= now ? "past" : a <= now ? "live" : "upcoming";
}

/** Date-range filter on Chicago calendar days, inclusive: a stop counts when it overlaps [from 00:00, to 24:00). */
export function inDateRange(s: { starts_at: string; ends_at: string }, from: string, to: string): boolean {
  const day = (iso: string) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago" }).format(new Date(iso));
  const a = day(s.starts_at), b = day(s.ends_at);
  return (!from || b >= from) && (!to || a <= to);
}

export function toCsv(rows: (string | number | null)[][]): string {
  return rows.map((r) => r.map((v) => { const s = v == null ? "" : String(v); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; }).join(",")).join("\n");
}
