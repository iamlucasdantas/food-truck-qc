import ICAL from 'ical.js';
import { truckNameScore } from './agent-food';

export const CALENDAR_DAYS = 30;
export const CALENDAR_CRON = '0 */6 * * *';
export type CalendarOccurrence = { uid: string; occurrence: string; title: string; start: string; end: string };
export type CalendarTruck = { id: string; name: string; is_food_truck: boolean; status: string; deleted_at?: string | null };
export type TitleDecision = { title_key: string; decision: string; truck_id: string | null };
export function cleanCalendarTitle(title: string) {
  return title.replace(/\(\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)?\s*[-–]\s*(?:\d{1,2}(?::\d{2})?\s*(?:am|pm)?|\?)\s*\)/gi, ' ')
    .replace(/^\s*\d{1,2}(?::\d{2})?\s*(?:am|pm)\b\s*/i, '')
    .replace(/\s+\d{1,2}(?::\d{2})?\s*(?:am|pm)\s*$/i, '').replace(/\s+/g, ' ').trim();
}
export const calendarTitleKey = (title: string) => cleanCalendarTitle(title).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/['’]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
export const nonFoodEvent = (title: string) => /\b(trivia|bingo|market|workshop|showcase|brunch)\b/i.test(title);

/** ICAL owns recurrence, exclusions and exception overrides; Intl handles TZID without VTIMEZONE. */
function timestamp(time: ICAL.Time, property: ICAL.Property | null, fallback: string) {
  if (time.zone.tzid !== 'floating' && time.zone.tzid !== 'local') return new Date(time.toUnixTime() * 1000);
  const zone = String(property?.getParameter('tzid') ?? fallback);
  const wall = Date.UTC(time.year, time.month - 1, time.day, time.hour, time.minute, time.second);
  let result = wall;
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
  for (let i = 0; i < 3; i++) {
    const parts = Object.fromEntries(formatter.formatToParts(new Date(result)).map(p => [p.type, p.value]));
    const observed = Date.UTC(Number(parts['year']), Number(parts['month']) - 1, Number(parts['day']), Number(parts['hour']), Number(parts['minute']), Number(parts['second']));
    const adjusted = result + wall - observed;
    if (adjusted === result) break;
    result = adjusted;
  }
  return new Date(result);
}
export function expandVenueCalendar(text: string, timezone: string, now = new Date()): CalendarOccurrence[] {
  const root = new ICAL.Component(ICAL.parse(text));
  if (root.name !== 'vcalendar') throw Error('The link did not return an ICS calendar');
  const horizon = new Date(now.getTime() + CALENDAR_DAYS * 864e5);
  const components = root.getAllSubcomponents('vevent');
  const masters = components.filter(c => !c.hasProperty('recurrence-id'));
  const masterIds = new Set(masters.map(c => String(c.getFirstPropertyValue('uid'))));
  const events = [...masters, ...components.filter(c => c.hasProperty('recurrence-id') && !masterIds.has(String(c.getFirstPropertyValue('uid'))))];
  const result: CalendarOccurrence[] = [];
  let steps = 0;
  for (const component of events) {
    const event = new ICAL.Event(component);
    if (!event.uid || !component.hasProperty('dtstart')) throw Error('Calendar event is missing UID or start time');
    if (String(component.getFirstPropertyValue('status')).toUpperCase() === 'CANCELLED') continue;
    const iterator = event.isRecurring() ? event.iterator() : null;
    for (;;) {
      if (++steps > 100000) throw Error('Calendar recurrence limit exceeded; previous stops preserved');
      const occurrence = iterator ? iterator.next() : event.startDate;
      if (!occurrence) break;
      const detail = iterator ? event.getOccurrenceDetails(occurrence) : { item: event, startDate: event.startDate, endDate: event.endDate };
      const original = timestamp(occurrence, component.getFirstProperty('dtstart'), timezone);
      if (original >= horizon && !event.isRecurrenceException()) break;
      const item = detail.item;
      if (String(item.component.getFirstPropertyValue('status')).toUpperCase() !== 'CANCELLED' && !detail.startDate.isDate) {
        const start = timestamp(detail.startDate, item.component.getFirstProperty('dtstart'), timezone);
        const end = timestamp(detail.endDate, item.component.getFirstProperty('dtend'), timezone);
        if (end <= start) throw Error(`Invalid event hours: ${item.summary}`);
        if (start < horizon && end > now) result.push({ uid: event.uid, occurrence: occurrence.toString().slice(0, 10), title: item.summary ?? '', start: start.toISOString(), end: end.toISOString() });
      } else if (detail.startDate.isDate && original >= now) {
        // Untimed events are available for review, never published as invented hours.
        result.push({ uid: event.uid, occurrence: occurrence.toString().slice(0, 10), title: item.summary ?? '', start: '', end: '' });
      }
      if (!iterator) break;
    }
  }
  return result;
}

export function planCalendarSync(events: CalendarOccurrence[], trucks: CalendarTruck[], decisions: TitleDecision[]) {
  const eligible = trucks.filter(t => t.is_food_truck && t.status === 'active' && !t.deleted_at);
  const stops: (CalendarOccurrence & { truck_id: string })[] = [];
  const review = new Map<string, { key: string; title: string; occurrences: CalendarOccurrence[] }>();
  let ignored = 0;
  for (const e of events) {
    const title = cleanCalendarTitle(e.title), key = calendarTitleKey(title);
    const decision = decisions.find(d => d.title_key === key);
    if (decision?.decision === 'ignore' || nonFoodEvent(title)) { ignored++; continue; }
    let truck = decision?.decision === 'link' ? eligible.find(t => t.id === decision.truck_id) : undefined;
    if (!decision || decision.decision === 'review') {
      const exact = eligible.filter(t => calendarTitleKey(t.name) === key);
      const ranked = eligible.map(t => ({ t, score: truckNameScore(title, t.name) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score);
      truck = exact.length === 1 ? exact[0] : ranked[0] && (!ranked[1] || ranked[0].score - ranked[1].score >= 0.1) ? ranked[0].t : undefined;
    }
    if (truck && e.start && e.end) stops.push({ ...e, truck_id: truck.id });
    else {
      const row = review.get(key) ?? { key, title, occurrences: [] };
      row.occurrences.push(e); review.set(key, row);
    }
  }
  return { stops, titles: [...review.values()], ignored };
}