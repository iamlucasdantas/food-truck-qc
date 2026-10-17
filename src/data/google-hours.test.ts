import { describe, expect, it } from 'vitest';
import { expandGoogleHours, mobileEvidence } from './google-hours';
import { agentSearch } from './agent-search';
import { knownLocation } from './agent-location';
import { pickStop } from './trucks';
const t = { id: 'bonbon', name: "Bonbon's Tacos", is_food_truck: true, category: 'Mexican', menu_search: '', truck_type: 'fixed', base_address: '1218 N Brady St, Davenport, IA 52803', base_lat: 41.53, base_lng: -90.57, google_regular_hours: { periods: [{ open: { day: 6, hour: 11 }, close: { day: 6, hour: 20 } }] } };
const from = new Date('2026-10-17T05:00:00Z'), to = new Date('2026-10-18T05:00:00Z');
describe('stationary Google food truck rules', () => {
  it.each(['Food truck', 'Food stand', 'Mobile caterer'])('keeps a fixed %s profile', category => expect(mobileEvidence('Bonbon Tacos', '', [category])).toBe(true));
  it.each(['truck', 'trailer', 'cart'])('keeps fixed %s descriptions', word => expect(mobileEvidence('Bonbon Tacos', `Stationary food ${word}`)).toBe(true));
  it('does not classify a restaurant category as mobile evidence', () => expect(mobileEvidence('Restaurant', '', ['restaurant'])).toBe(false));
  it('expands Saturday Chicago hours with concrete start/end', () => expect(expandGoogleHours([t], from, to)).toMatchObject([{ starts_at: '2026-10-17T16:00:00.000Z', ends_at: '2026-10-18T01:00:00.000Z' }]));
  it('applies open_now in API search and map using the same hours', () => {
    const stops = expandGoogleHours([t], from, to), now = new Date('2026-10-17T17:56:00Z'), loc = knownLocation('QC');
    if (!loc) throw Error('QC missing');
    expect(agentSearch([t], stops, { open_now: true, limit: 5 }, loc, from, to, now)).toMatchObject([{ truck: { id: 'bonbon' }, open_now: true, is_base_location: false }]);
    expect(pickStop(stops, now, 'now', now).status).toBe('open');
    expect(agentSearch([t], stops, { open_now: true, limit: 5 }, loc, from, to, new Date('2026-10-18T01:00:00Z'))).toEqual([]);
  });
  it('has no occurrences on closed days or without hours', () => {
    expect(expandGoogleHours([t], to, new Date('2026-10-19T05:00:00Z'))).toEqual([]);
    expect(expandGoogleHours([{ ...t, google_regular_hours: null }], from, to)).toEqual([]);
  });
  it('includes tomorrow and weekly occurrences', () => expect(expandGoogleHours([t], new Date('2026-10-16T05:00:00Z'), new Date('2026-10-19T05:00:00Z'))).toHaveLength(1));
  it('handles overnight weekly periods', () => expect(expandGoogleHours([{ ...t, google_regular_hours: { periods: [{ open: { day: 5, hour: 22 }, close: { day: 6, hour: 2 } }] } }], from, to)).toMatchObject([{ starts_at: '2026-10-17T03:00:00.000Z', ends_at: '2026-10-17T07:00:00.000Z' }]));
  it('handles 24h across Chicago DST ending (25h day)', () => {
    const stops = expandGoogleHours([{ ...t, google_regular_hours: { periods: [{ open: { day: 0, hour: 0 } }] } }], new Date('2026-11-01T05:00:00Z'), new Date('2026-11-02T06:00:00Z'));
    expect(stops).toHaveLength(1); expect(stops[0]?.ends_at).toBe('2026-11-02T06:00:00.000Z');
  });
  it('never schedules excluded restaurant records', () => expect(expandGoogleHours([{ ...t, is_food_truck: false }], from, to)).toEqual([]));
});