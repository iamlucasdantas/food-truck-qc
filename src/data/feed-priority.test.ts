import { describe, expect, it } from 'vitest';
import { resolveFeedConflicts, type FeedStop } from './feed-priority';

const row = (id: string, extra: Partial<FeedStop> = {}) => ({
  id, truck_id: 'schaabs-street-eats', source: 'calendar', source_url: 'https://calendar.google.com/feed',
  starts_at: '2026-10-21T16:00:00Z', ends_at: '2026-10-21T19:00:00Z', created_at: '2026-10-21T13:00:00Z', ...extra,
});
const fb = row('facebook', { source: 'own_post', source_url: 'https://www.facebook.com/schaabs/posts/123' });
describe('Facebook feed priority', () => {
  it.each(['calendar', 'apify_maps', 'own_post', 'estimated'])('Facebook overrides newer conflicting %s feed data', source => {
    const other = row('other', { source, source_url: source === 'own_post' ? 'https://instagram.com/p/123' : null, created_at: '2026-10-21T14:00:00Z' });
    expect(resolveFeedConflicts([other, fb]).map(s => s.id)).toEqual(['facebook']);
  });
  it('overrides a changed venue and partial time overlap, not only exact duplicates', () => {
    expect(resolveFeedConflicts([row('old', { starts_at: '2026-10-21T17:00:00Z', ends_at: '2026-10-21T20:00:00Z' }), fb]).map(s => s.id)).toEqual(['facebook']);
  });
  it('preserves adjacent stops and other trucks', () => {
    expect(resolveFeedConflicts([fb, row('evening', { starts_at: fb.ends_at, ends_at: '2026-10-21T22:00:00Z' }), row('other-truck', { truck_id: 'other' })]).map(s => s.id)).toEqual(['facebook', 'other-truck', 'evening']);
  });
  it('cancelled Facebook posts do not suppress public feeds', () => {
    expect(resolveFeedConflicts([{ ...fb, cancelled: true }, row('calendar')]).map(s => s.id)).toEqual(['calendar']);
  });
  it('newest Facebook information wins independent of input order', () => {
    const newer = { ...fb, id: 'newer', created_at: '2026-10-21T14:00:00Z' };
    expect(resolveFeedConflicts([fb, newer]).map(s => s.id)).toEqual(['newer']);
    expect(resolveFeedConflicts([newer, fb]).map(s => s.id)).toEqual(['newer']);
  });
  it('calendar-derived owner edits and recurring occurrences are feeds', () => {
    expect(resolveFeedConflicts([fb, row('edited-calendar', { source: 'owner' }), row('recurring', { source: 'owner', source_url: null, series_id: 'series' })]).map(s => s.id)).toEqual(['facebook']);
  });
  it('does not override a direct manual confirmation', () => {
    expect(resolveFeedConflicts([fb, row('manual', { source: 'owner', source_url: null })])).toHaveLength(2);
  });
});