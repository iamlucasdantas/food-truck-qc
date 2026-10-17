import { centralToUtc, chicagoDate, type Stop } from './trucks';

export type GooglePoint = { day: number; hour?: number; minute?: number };
export type GoogleHours = { periods: { open: GooglePoint; close?: GooglePoint }[]; weekdayDescriptions?: string[] };
export type HoursTruck = { id: string; name: string; is_food_truck?: boolean; base_lat: number | null; base_lng: number | null; base_address: string | null; google_regular_hours?: unknown; google_place_id?: string | null; google_hours_updated_at?: string | null };
export function googleHours(value: unknown): GoogleHours | null {
  if (!value || typeof value !== 'object' || !('periods' in value) || !Array.isArray(value.periods)) return null;
  const point = (v: unknown): v is GooglePoint => !!v && typeof v === 'object' && 'day' in v && Number.isInteger(v.day) && Number(v.day) >= 0 && Number(v.day) <= 6 && (!('hour' in v) || (Number.isInteger(v.hour) && Number(v.hour) >= 0 && Number(v.hour) < 24)) && (!('minute' in v) || (Number.isInteger(v.minute) && Number(v.minute) >= 0 && Number(v.minute) < 60));
  const periods: GoogleHours['periods'] = [];
  for (const p of value.periods) {
    if (!p || typeof p !== 'object' || !point(p.open) || (p.close != null && !point(p.close))) continue;
    periods.push(p.close == null ? { open: p.open } : { open: p.open, close: p.close });
  }
  return { periods };
}
export function mobileEvidence(name: string, description = '', types: string[] = []): boolean {
  const categories = types.map(x => x.toLowerCase().replace(/_/g, ' ').trim());
  if (categories.some(x => ['food truck', 'food stand', 'mobile caterer'].includes(x))) return true;
  if (/dealer|repair|rental|towing/.test(categories.join(' '))) return false;
  return /\b(?:truck|trailer|cart)s?\b/i.test(`${name} ${description}`);
}
const add = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 864e5).toISOString().slice(0, 10);
const clock = (p: GooglePoint) => `${String(p.hour ?? 0).padStart(2, '0')}:${String(p.minute ?? 0).padStart(2, '0')}`;
export const isGoogleHoursStop = (s: { source: string; note?: string | null | undefined }) => s.source === 'apify_maps' && s.note === 'Google opening hours';
/** Expand stored weekly Google periods in Chicago, never the browser/server timezone. */
export function expandGoogleHours(trucks: HoursTruck[], from: Date, to: Date): Stop[] {
  const out: Stop[] = [];
  for (const t of trucks) {
    const h = googleHours(t.google_regular_hours);
    if (!t.is_food_truck || !h?.periods.length || t.base_lat == null || t.base_lng == null) continue;
    for (let date = add(chicagoDate(from), -7); date <= chicagoDate(to); date = add(date, 1)) {
      const wd = new Date(`${date}T12:00:00Z`).getUTCDay();
      h.periods.forEach((p, i) => {
        const allDay = !p.close && p.open.day === 0 && (p.open.hour ?? 0) === 0 && (p.open.minute ?? 0) === 0;
        if (!allDay && p.open.day !== wd) return;
        if (!p.close && !allDay) return;
        const st = centralToUtc(date, allDay ? '00:00' : clock(p.open));
        let en: Date;
        if (allDay) en = centralToUtc(add(date, 1), '00:00');
        else if (p.close) {
          let days = (p.close.day - p.open.day + 7) % 7;
          if (days === 0 && clock(p.close) <= clock(p.open)) days = 7;
          en = centralToUtc(add(date, days), clock(p.close));
        } else return;
        if (en <= from || st >= to) return;
        out.push({ id: `google-hours:${t.id}:${date}:${i}`, truck_id: t.id, venue_name: t.name, address: t.base_address, city: t.base_address?.split(',').slice(-2, -1)[0]?.trim() ?? '', lat: t.base_lat ?? 0, lng: t.base_lng ?? 0,
          starts_at: st.toISOString(), ends_at: en.toISOString(), source: 'apify_maps', confidence: 1, is_live: false, cancelled: false, repeat_group: null, series_id: null, occurrence_date: date, created_at: t.google_hours_updated_at ?? '1970-01-01T00:00:00Z', source_url: t.google_place_id ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(t.name)}&query_place_id=${encodeURIComponent(t.google_place_id)}` : null, note: 'Google opening hours' });
      });
    }
  }
  return out.sort((a, b) => a.starts_at.localeCompare(b.starts_at));
}