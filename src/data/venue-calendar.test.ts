import { describe, it, expect } from 'vitest';
import { expandVenueCalendar, planCalendarSync, cleanCalendarTitle, CALENDAR_DAYS, CALENDAR_CRON } from './venue-calendar';
const calendar = (events: string) => `BEGIN:VCALENDAR\r\nVERSION:2.0\r\n${events}\r\nEND:VCALENDAR`;
const event = (lines: string) => `BEGIN:VEVENT\r\n${lines}\r\nEND:VEVENT`;
const truck = { id: 's', name: "Schaab's Street Eats", is_food_truck: true, status: 'active' };
const row = (title: string) => ({ uid: title, occurrence: '2026-10-20', title, start: '2026-10-20T16:00:00Z', end: '2026-10-20T19:00:00Z' });
describe('venue calendar rules', () => {
  it('uses a 30-day horizon and six-hour schedule', () => { expect(CALENDAR_DAYS).toBe(30); expect(CALENDAR_CRON).toBe('0 */6 * * *'); });
  it.each(["8pm Schaab's (11-2)", "2pm Schaab's (5-8)", "Schaab's (11-?)", "Schaab's 8pm"] )('cleans %s', title => { expect(cleanCalendarTitle(title)).toBe("Schaab's"); });
  it('expands RRULE EXDATE UNTIL with TZID and DST', () => {
    const rows = expandVenueCalendar(calendar(event('UID:a\r\nSUMMARY:Schaab\r\nDTSTART;TZID=America/Chicago:20261026T110000\r\nDTEND;TZID=America/Chicago:20261026T140000\r\nRRULE:FREQ=WEEKLY;UNTIL=20261109T235959Z\r\nEXDATE;TZID=America/Chicago:20261102T110000')), 'America/Chicago', new Date('2026-10-19T00:00:00Z'));
    expect(rows.map(x => x.start)).toEqual(['2026-10-26T16:00:00.000Z', '2026-11-09T17:00:00.000Z']);
    expect(rows.map(x => x.end)).toEqual(['2026-10-26T19:00:00.000Z', '2026-11-09T20:00:00.000Z']);
  });
  it('preserves UTC timestamps', () => {
    const rows = expandVenueCalendar(calendar(event('UID:a\r\nSUMMARY:vendor\r\nDTSTART:20261020T160000Z\r\nDTEND:20261020T190000Z')), 'America/Chicago', new Date('2026-10-19T00:00:00Z'));
    expect(rows[0]?.start).toBe('2026-10-20T16:00:00.000Z');
  });
  it('uses overrides with stable occurrence identity', () => {
    const rows = expandVenueCalendar(calendar(event('UID:a\r\nSUMMARY:old\r\nDTSTART:20261020T160000Z\r\nDTEND:20261020T190000Z\r\nRRULE:FREQ=WEEKLY;COUNT=2') + '\r\n' + event('UID:a\r\nSUMMARY:Schaab\r\nRECURRENCE-ID:20261027T160000Z\r\nDTSTART:20261027T170000Z\r\nDTEND:20261027T200000Z')), 'America/Chicago', new Date('2026-10-19T00:00:00Z'));
    expect(rows[1]).toMatchObject({ occurrence: '2026-10-27', title: 'Schaab', start: '2026-10-27T17:00:00.000Z' });
  });
  it('ignores cancelled events and reviews untimed vendors', () => {
    const rows = expandVenueCalendar(calendar(event('UID:a\r\nSUMMARY:vendor\r\nDTSTART;VALUE=DATE:20261020\r\nDTEND;VALUE=DATE:20261021') + '\r\n' + event('UID:b\r\nSUMMARY:vendor\r\nDTSTART:20261020T160000Z\r\nDTEND:20261020T190000Z\r\nSTATUS:CANCELLED')), 'America/Chicago', new Date('2026-10-19T00:00:00Z'));
    expect(rows).toHaveLength(1); expect(rows[0]?.start).toBe('');
    expect(planCalendarSync(rows, [truck], []).stops).toHaveLength(0);
  });
  it('matches abbreviated and fuzzy existing vendor names', () => {
    const plan = planCalendarSync([row("Schaab's (11-2)"), row("Hayshaker's")], [truck, { ...truck, id: 'h', name: "Hayshaker's Grill" }], []);
    expect(plan.stops.map(x => x.truck_id)).toEqual(['s', 'h']);
  });
  it.each(['trivia','bingo','market','workshop','showcase','brunch'])('ignores %s', title => { expect(planCalendarSync([row(title)], [truck], []).ignored).toBe(1); });
  it('queues unknown vendors without creating trucks', () => {
    const plan = planCalendarSync([row('Mozbites')], [truck], []);
    expect(plan.stops).toHaveLength(0); expect(plan.titles[0]?.title).toBe('Mozbites');
  });
  it('remembers links and ignores across title time changes', () => {
    expect(planCalendarSync([row('8pm Mozbites (5-8)')], [truck], [{ title_key: 'mozbites', decision: 'link', truck_id: 's' }]).stops[0]?.truck_id).toBe('s');
    expect(planCalendarSync([row('2pm Mozbites')], [truck], [{ title_key: 'mozbites', decision: 'ignore', truck_id: null }]).ignored).toBe(1);
  });
  it('never imports excluded or pending trucks', () => {
    expect(planCalendarSync([row("Schaab's")], [{ ...truck, is_food_truck: false }], []).stops).toHaveLength(0);
    expect(planCalendarSync([row("Schaab's")], [{ ...truck, status: 'pending' }], []).stops).toHaveLength(0);
  });
});