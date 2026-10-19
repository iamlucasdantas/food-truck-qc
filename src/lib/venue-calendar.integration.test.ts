import { describe, it, expect } from 'vitest';
import { supabaseAdmin as db } from '@/integrations/supabase/client.server';

describe.skipIf(!process.env['SUPABASE_SERVICE_ROLE_KEY'])('calendar reconciliation in Lovable Cloud', () => {
  it('updates stable identities, deletes missing calendar events, preserves other sources and remembers decisions', async () => {
    const { data: source, error } = await db.from('venue_calendar_sources').insert({ name: 'Calendar isolation test', address: '2500 53rd St, Moline IL 61265', city: 'Moline', lat: 41.4873036, lng: -90.4641063, url: `https://calendar.google.com/test/${crypto.randomUUID()}` }).select('id').single();
    if (error || !source) throw Error(error?.message ?? 'No test source');
    let otherId: string | undefined;
    const row = { uid: 'test-event', occurrence: '2026-10-25', truck_id: 'schaabs-street-eats', start: '2026-10-25T16:00:00Z', end: '2026-10-25T19:00:00Z' };
    const commit = async (rows: typeof row[], token = crypto.randomUUID()) => {
      const lock = await db.from('venue_calendar_sources').update({ sync_token: token }).eq('id', source.id);
      if (lock.error) throw Error(lock.error.message);
      const r = await db.rpc('reconcile_venue_calendar', { _source_id: source.id, _token: token, _stops: rows, _titles: [], _ignored: 0 });
      if (r.error) throw Error(r.error.message);
    };
    try {
      const other = await db.from('stops').insert({ truck_id: row.truck_id, venue_name: 'Isolation test', city: 'Moline', lat: 41.48, lng: -90.46, starts_at: '2026-12-25T16:00:00Z', ends_at: '2026-12-25T19:00:00Z', source: 'estimated' }).select('id').single();
      if (other.error || !other.data) throw Error(other.error?.message ?? 'No test stop');
      otherId = other.data.id;
      await commit([row]);
      const first = await db.from('stops').select('id').eq('calendar_source_id', source.id).single();
      expect(first.data?.id).toBeTruthy();
      await commit([{ ...row, end: '2026-10-25T20:00:00Z' }]);
      const changed = await db.from('stops').select('id,ends_at').eq('calendar_source_id', source.id).single();
      expect(changed.data?.id).toBe(first.data?.id);
      expect(new Date(changed.data?.ends_at ?? '').toISOString()).toBe('2026-10-25T20:00:00.000Z');
      await db.from('venue_calendar_titles').insert({ source_id: source.id, title_key: 'alias', title: 'Alias', decision: 'link', truck_id: row.truck_id });
      await commit([]);
      expect((await db.from('stops').select('id').eq('calendar_source_id', source.id)).data).toEqual([]);
      expect((await db.from('stops').select('id').eq('id', otherId)).data?.[0]?.id).toBe(otherId);
      expect((await db.from('venue_calendar_titles').select('decision,truck_id').eq('source_id', source.id).single()).data).toEqual({ decision: 'link', truck_id: row.truck_id });
      const denied = await db.rpc('reconcile_venue_calendar', { _source_id: source.id, _token: crypto.randomUUID(), _stops: [row], _titles: [], _ignored: 0 });
      expect(denied.error?.message).toContain('lease expired');
    } finally {
      await db.from('stops').delete().eq('calendar_source_id', source.id);
      if (otherId) await db.from('stops').delete().eq('id', otherId);
      await db.from('venue_calendar_sources').delete().eq('id', source.id);
    }
  });
});