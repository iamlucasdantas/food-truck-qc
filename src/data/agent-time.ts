import { chicagoDate, centralToUtc } from './trucks';
import { occursOn, type Series } from './schedule';
import type { ApiStop } from './api-search';
export const addDays = (date: string, days: number) => new Date(new Date(`${date}T12:00:00Z`).getTime() + days * 864e5).toISOString().slice(0,10);
export function timeWindow(when: string | undefined, days: number, upcoming: boolean, now: Date) {
  const today = chicagoDate(now); let start = today; let end = addDays(today, upcoming ? days : 1);
  if (when === 'tomorrow') { start = addDays(today,1); end = addDays(start,1); }
  else if (when === 'this_week') { const wd = new Date(`${today}T12:00:00Z`).getUTCDay(); end = addDays(today, wd === 0 ? 1 : 8 - wd); }
  else if (when && /^\d{4}-\d{2}-\d{2}$/.test(when)) { start = when; end = addDays(start,1); }
  else if (when === 'today' || when === 'now') end = addDays(today,1);
  return { from: centralToUtc(start,'00:00'), to:centralToUtc(end,'00:00'), when:when ?? (upcoming ? `${days}_days` : 'today') };
}
/** API recurrence uses Chicago wall time regardless of the server's timezone. */
export function expandCentralSeries(series: Series[], from: Date, to: Date): ApiStop[] {
  const out: ApiStop[] = []; const start = addDays(chicagoDate(from),-1); const last = chicagoDate(to);
  for (const s of series) for (let key = start; key <= last; key = addDays(key,1)) {
    const [y=2026,m=1,d=1] = key.split('-').map(Number);
    if (!occursOn(s,new Date(y,m-1,d))) continue;
    const st = centralToUtc(key,s.start_time.slice(0,5)); let en = centralToUtc(key,s.end_time.slice(0,5));
    if (en <= st) en = centralToUtc(addDays(key,1),s.end_time.slice(0,5));
    if (en <= from || st >= to) continue;
    out.push({truck_id:s.truck_id, venue_name:s.venue_name, address:s.address, city:s.city, lat:s.lat, lng:s.lng, starts_at:st.toISOString(), ends_at:en.toISOString(), source:'owner', created_at:s.created_at});
  }
  return out;
}
