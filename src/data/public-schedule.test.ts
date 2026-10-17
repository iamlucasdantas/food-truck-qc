import { it, expect } from 'vitest';
import { UPCOMING_LIMIT, upcomingStops, chicagoDay } from './public-schedule';
it('defaults to the next five stops', () => {
  const stops = Array.from({length: 8}, (_, i) => ({ starts_at: `2026-10-${18+i}T16:00:00Z`, ends_at: `2026-10-${18+i}T20:00:00Z`, cancelled: false }));
  expect(upcomingStops(stops, Date.parse('2026-10-17T18:14:00Z')).slice(0, UPCOMING_LIMIT)).toHaveLength(5);
});
it('excludes ended and cancelled stops but keeps an ongoing stop', () => {
  const s = { starts_at:'2026-10-17T16:00:00Z', ends_at:'2026-10-17T20:00:00Z', cancelled:false };
  expect(upcomingStops([s, {...s, cancelled:true}, {...s,ends_at:'2026-10-17T18:00:00Z'}],Date.parse('2026-10-17T18:14:00Z'))).toEqual([s]);
});
it('groups calendar days in Chicago rather than UTC', () => expect(chicagoDay('2026-10-18T01:00:00Z')).toBe('2026-10-17'));