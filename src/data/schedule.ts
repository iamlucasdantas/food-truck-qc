import type { Tables } from "@/integrations/supabase/types";
import type { Stop } from "@/data/trucks";

export type Series = Tables<"stop_series">;
export type Freq = "weekly" | "biweekly" | "monthly";
export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const ICS_DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];

/** Local calendar date as YYYY-MM-DD. */
export const ymd = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
const parseYmd = (s: string) => { const [y, m, d] = s.split("-").map(Number); return new Date(y!, m! - 1, d!); };
const at = (day: Date, hhmm: string) => { const [h, m] = hhmm.split(":").map(Number); const x = new Date(day); x.setHours(h!, m!, 0, 0); return x; };

/** Does a recurring rule fall on this local day? (nth: 1–4, or -1 = last) */
export function occursOn(s: Pick<Series, "freq" | "weekdays" | "month_nth" | "start_date" | "end_date" | "skip_dates">, day: Date): boolean {
  const key = ymd(day);
  if (key < s.start_date || (s.end_date && key > s.end_date) || s.skip_dates.includes(key)) return false;
  const wd = day.getDay();
  if (!s.weekdays.includes(wd)) return false;
  if (s.freq === "weekly") return true;
  if (s.freq === "biweekly") {
    const start = parseYmd(s.start_date); start.setDate(start.getDate() - start.getDay());
    const weeks = Math.round((parseYmd(key).getTime() - start.getTime()) / (7 * 864e5) - 0.5 + 0.5);
    return Math.floor(weeks) % 2 === 0;
  }
  const nth = s.month_nth ?? 1;
  if (nth === -1) { const n = new Date(day); n.setDate(day.getDate() + 7); return n.getMonth() !== day.getMonth(); }
  return Math.ceil(day.getDate() / 7) === nth;
}

/** Expand rules into Stop-shaped occurrences overlapping [from, to). Nothing is stored. */
export function expandSeries(list: Series[], from: Date, to: Date): Stop[] {
  const out: Stop[] = [];
  const d0 = new Date(from); d0.setHours(0, 0, 0, 0); d0.setDate(d0.getDate() - 1);
  for (const s of list) {
    for (const day = new Date(d0); day < to; day.setDate(day.getDate() + 1)) {
      if (!occursOn(s, day)) continue;
      const st = at(day, s.start_time);
      const en = at(day, s.end_time); if (en <= st) en.setDate(en.getDate() + 1);
      if (en <= from || st >= to) continue;
      const key = ymd(day);
      out.push({
        id: `${s.id}:${key}`, truck_id: s.truck_id, venue_name: s.venue_name, address: s.address, city: s.city, lat: s.lat, lng: s.lng,
        starts_at: st.toISOString(), ends_at: en.toISOString(), source: "owner", confidence: 1, is_live: false, cancelled: false,
        repeat_group: null, created_at: s.created_at, source_url: null, note: s.note, series_id: s.id, occurrence_date: key,
      });
    }
  }
  return out;
}

export function describeRule(s: Pick<Series, "freq" | "weekdays" | "month_nth" | "end_date">) {
  const days = s.weekdays.map((d) => WEEKDAYS[d]).join(", ");
  const nth = s.month_nth === -1 ? "last" : ["", "first", "second", "third", "fourth"][s.month_nth ?? 1];
  const base = s.freq === "weekly" ? `Weekly on ${days}` : s.freq === "biweekly" ? `Every 2 weeks on ${days}` : `Monthly, ${nth} ${days}`;
  return s.end_date ? `${base} until ${s.end_date}` : base;
}

/* ---------- iCal ---------- */

export type IcsEvent = { uid: string; title: string; start: Date; end: Date; allDay: boolean; location: string; rrule: Record<string, string> | null };

function icsDate(v: string, params: string): { d: Date; allDay: boolean } {
  const m = v.match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/);
  if (!m) return { d: new Date(v), allDay: false };
  const [, y, mo, da, h, mi, se, z] = m;
  if (!h) return { d: new Date(+y!, +mo! - 1, +da!), allDay: true };
  if (z) return { d: new Date(Date.UTC(+y!, +mo! - 1, +da!, +h, +mi!, +se!)), allDay: false };
  // TZID or floating: Quad Cities is America/Chicago; interpret as Chicago wall time.
  void params;
  const guess = new Date(Date.UTC(+y!, +mo! - 1, +da!, +h, +mi!, +se!));
  const off = chicagoOffsetMin(guess);
  return { d: new Date(guess.getTime() - off * 60000), allDay: false };
}
function chicagoOffsetMin(d: Date) {
  const s = d.toLocaleString("en-US", { timeZone: "America/Chicago", hour12: false });
  const local = new Date(s + " UTC");
  return Math.round((local.getTime() - d.getTime()) / 60000);
}
const unescape = (s: string) => s.replace(/\\n/gi, " ").replace(/\\([,;\\])/g, "$1").trim();

export function parseIcs(text: string): IcsEvent[] {
  const lines = text.replace(/\r\n[ \t]/g, "").replace(/\n[ \t]/g, "").split(/\r?\n/);
  const out: IcsEvent[] = [];
  let cur: Record<string, { v: string; p: string }> | null = null;
  for (const line of lines) {
    if (line === "BEGIN:VEVENT") { cur = {}; continue; }
    if (line === "END:VEVENT") {
      if (cur?.["DTSTART"] && !cur["RECURRENCE-ID"]) {
        const s = icsDate(cur["DTSTART"].v, cur["DTSTART"].p);
        const e = cur["DTEND"] ? icsDate(cur["DTEND"].v, cur["DTEND"].p).d : new Date(s.d.getTime() + (s.allDay ? 864e5 : 36e5));
        const rr = cur["RRULE"]?.v;
        out.push({
          uid: cur["UID"]?.v ?? `${cur["DTSTART"].v}-${cur["SUMMARY"]?.v ?? ""}`, title: unescape(cur["SUMMARY"]?.v ?? "Untitled"),
          start: s.d, end: e, allDay: s.allDay, location: unescape(cur["LOCATION"]?.v ?? ""),
          rrule: rr ? Object.fromEntries(rr.split(";").map((kv) => kv.split("=") as [string, string])) : null,
        });
      }
      cur = null; continue;
    }
    if (!cur) continue;
    const i = line.indexOf(":"); if (i < 0) continue;
    const [name, ...params] = line.slice(0, i).split(";");
    cur[name!.toUpperCase()] = { v: line.slice(i + 1), p: params.join(";") };
  }
  return out;
}

/** Map an iCal RRULE onto the supported rules; null = import as a single stop. */
export function rruleToSeries(rr: Record<string, string>, start: Date): { freq: Freq; weekdays: number[]; month_nth: number | null; end_date: string | null } | null {
  const until = rr["UNTIL"] ? ymd(icsDate(rr["UNTIL"], "").d) : null;
  const interval = Number(rr["INTERVAL"] ?? 1);
  if (rr["FREQ"] === "WEEKLY" && (interval === 1 || interval === 2)) {
    const days = (rr["BYDAY"] ?? ICS_DAYS[start.getDay()]!).split(",").map((d) => ICS_DAYS.indexOf(d.slice(-2))).filter((d) => d >= 0);
    return { freq: interval === 2 ? "biweekly" : "weekly", weekdays: days, month_nth: null, end_date: until };
  }
  if (rr["FREQ"] === "MONTHLY" && interval === 1) {
    const m = (rr["BYDAY"] ?? "").match(/^(-?\d)([A-Z]{2})$/);
    const nth = m ? Number(m[1]) : Math.ceil(start.getDate() / 7);
    const wd = m ? ICS_DAYS.indexOf(m[2]!) : start.getDay();
    if (wd < 0 || nth < -1 || nth > 4 || nth === 0) return null;
    return { freq: "monthly", weekdays: [wd], month_nth: nth, end_date: until };
  }
  return null;
}

const icsStamp = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (s: string) => s.replace(/([,;\\])/g, "\\$1").replace(/\n/g, "\\n");

/** Build an .ics file: one-off stops as events, rules as RRULE events. */
export function buildIcs(name: string, stops: Stop[], series: Series[]): string {
  const L = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//FoodTruckQC//Schedule//EN", `X-WR-CALNAME:${esc(name)}`];
  const loc = (x: { venue_name: string; address: string | null; city: string }) => esc([x.venue_name, x.address, x.city].filter(Boolean).join(", "));
  for (const s of stops) {
    L.push("BEGIN:VEVENT", `UID:${s.id}@foodtruckqc.com`, `DTSTAMP:${icsStamp(new Date())}`, `DTSTART:${icsStamp(new Date(s.starts_at))}`,
      `DTEND:${icsStamp(new Date(s.ends_at))}`, `SUMMARY:${esc(name)}`, `LOCATION:${loc(s)}`, ...(s.note ? [`DESCRIPTION:${esc(s.note)}`] : []), "END:VEVENT");
  }
  for (const r of series) {
    const first = expandSeries([r], parseYmd(r.start_date), new Date(parseYmd(r.start_date).getTime() + 70 * 864e5))[0];
    if (!first) continue;
    const by = r.freq === "monthly" ? `${r.month_nth ?? 1}${ICS_DAYS[r.weekdays[0] ?? 5]}` : r.weekdays.map((d) => ICS_DAYS[d]).join(",");
    const rule = `RRULE:FREQ=${r.freq === "monthly" ? "MONTHLY" : "WEEKLY"}${r.freq === "biweekly" ? ";INTERVAL=2" : ""};BYDAY=${by}${r.end_date ? `;UNTIL=${r.end_date.replace(/-/g, "")}T235959Z` : ""}`;
    L.push("BEGIN:VEVENT", `UID:${r.id}@foodtruckqc.com`, `DTSTAMP:${icsStamp(new Date())}`, `DTSTART:${icsStamp(new Date(first.starts_at))}`,
      `DTEND:${icsStamp(new Date(first.ends_at))}`, rule, ...r.skip_dates.map((d) => `EXDATE:${icsStamp(new Date(`${d}T${r.start_time}:00`))}`),
      `SUMMARY:${esc(name)}`, `LOCATION:${loc(r)}`, ...(r.note ? [`DESCRIPTION:${esc(r.note)}`] : []), "END:VEVENT");
  }
  L.push("END:VCALENDAR");
  return L.join("\r\n");
}
