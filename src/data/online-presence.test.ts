import { describe, expect, it } from 'vitest';
import { centralToUtc, isBaseLocationStop, pickStop, placeTruck, type Stop } from './trucks';
import { openNowApplied } from './filters';

const truck = { base_lat: 41.5325068, base_lng: -90.5744467, truck_type: 'fixed' };
const stop = (date: string, start: string, end: string, extra: Partial<Stop> = {}): Stop => ({
  id: 'real', truck_id: 'bonbon-s-tacos-yp_1i', venue_name: 'Saturday venue',
  address: '1218 N Brady St, Davenport', city: 'Davenport', lat: 41.54, lng: -90.58,
  starts_at: centralToUtc(date, start).toISOString(), ends_at: centralToUtc(date, end).toISOString(),
  source: 'own_post', confidence: 1, is_live: false, cancelled: false, repeat_group: null,
  source_url: null, note: null, series_id: null, occurrence_date: null,
  created_at: '2026-10-24T12:00:00Z', ...extra,
});
const base = stop('2026-10-25', '00:00', '23:59', {
  id: 'base', source: 'apify_maps', venue_name: 'Base location (Google Maps)',
});
// Same picker, placement and open-only rule used to produce both list rows and map pins.
const visible = (stops: Stop[], now: Date, showAll = false) => {
  const placed = placeTruck(truck, pickStop(stops, now, 'now', now));
  const openOnly = openNowApplied({ explicitOpen: false, showAll, inNowView: true, openCount: placed?.status === 'open' ? 1 : 0 });
  return placed && (!openOnly || placed.status === 'open') ? placed : null;
};

describe('real online presence on map and list', () => {
  it('Bonbon Sunday at 12:45 Chicago stays offline with only its all-day base and expired 2am stop', () => {
    const ended = stop('2026-10-25', '00:00', '02:00');
    const now = new Date('2026-10-25T17:45:00Z');
    expect(pickStop([base, ended], now, 'now', now).status).toBe('none');
    expect(visible([base, ended], now)).toBeNull();
  });
  it('a real current stop appears at its venue instead of the base coordinates', () => {
    const real = stop('2026-10-25', '11:00', '14:00', { venue_name: 'Marketplace at 2500' });
    expect(visible([base, real], new Date('2026-10-25T17:45:00Z'))).toMatchObject({
      status: 'open', lat: 41.54, lng: -90.58, stop: { venue_name: 'Marketplace at 2500' },
    });
  });
  it('disappears from default results at the exclusive end boundary', () => {
    const real = stop('2026-10-25', '11:00', '14:00');
    expect(visible([base, real], new Date('2026-10-25T18:59:59Z'))?.status).toBe('open');
    expect(visible([base, real], new Date('2026-10-25T19:00:00Z'))).toBeNull();
  });
  it('offline toggle explicitly allows a static base, never an open status', () => {
    expect(visible([base], new Date('2026-10-25T17:45:00Z'), true)).toMatchObject({
      status: 'none', stop: null, lat: truck.base_lat, lng: truck.base_lng,
    });
  });
  it('split Saturday 16:00–23:59 and Sunday 00:00–02:00 stops remain open until 2am', () => {
    const stops = [base, stop('2026-10-24', '16:00', '23:59'), stop('2026-10-25', '00:00', '02:00')];
    for (const instant of ['2026-10-25T04:58:00Z', '2026-10-25T05:00:00Z', '2026-10-25T06:59:59Z']) {
      expect(visible(stops, new Date(instant))?.status).toBe('open');
    }
    expect(visible(stops, new Date('2026-10-25T07:00:00Z'))).toBeNull();
  });
  it('unsplit overnight stops remain open across midnight', () => {
    const real = stop('2026-10-24', '16:00', '23:59', { ends_at: centralToUtc('2026-10-25', '02:00').toISOString() });
    expect(visible([base, real], new Date('2026-10-25T06:00:00Z'))?.status).toBe('open');
  });
  it('a base-named row never becomes real presence even with a hours note or different source', () => {
    expect(isBaseLocationStop({ ...base, note: 'Google opening hours' })).toBe(true);
    expect(isBaseLocationStop({ ...base, source: 'owner' })).toBe(true);
  });
  it('actual Google weekly-hour windows still count as timed non-base stops', () => {
    const real = stop('2026-10-25', '11:00', '14:00', { source: 'apify_maps', note: 'Google opening hours', venue_name: 'Fixed truck' });
    expect(visible([base, real], new Date('2026-10-25T17:45:00Z'))?.status).toBe('open');
  });
});