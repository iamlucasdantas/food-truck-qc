import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database, Json } from '@/integrations/supabase/types';
import { expandVenueCalendar, planCalendarSync } from '@/data/venue-calendar';
import { readPublicLink, CALENDAR_FETCH_LIMITS } from './safe-link-fetch.server';

export async function syncVenueCalendar(db: SupabaseClient<Database>, id: string) {
  const token = crypto.randomUUID();
  const { data: source, error } = await db.from('venue_calendar_sources').update({ sync_token: token, sync_started_at: new Date().toISOString() }).eq('id', id)
    .or(`sync_token.is.null,sync_started_at.lt.${new Date(Date.now() - 10 * 60e3).toISOString()}`).select().maybeSingle();
  if (error) throw Error(error.message);
  if (!source) return { skipped: true };
  try {
    const response = await readPublicLink(source.url, CALENDAR_FETCH_LIMITS, { Accept: 'text/calendar' });
    if (!response.ok) throw Error(`Calendar returned ${response.status}`);
    const [trucks, links] = await Promise.all([
      db.from('trucks').select('id,name,status,is_food_truck,deleted_at').eq('is_food_truck', true).eq('status', 'active').is('deleted_at', null),
      db.from('venue_calendar_titles').select('title_key,decision,truck_id').eq('source_id', id),
    ]);
    if (trucks.error || links.error) throw Error(trucks.error?.message ?? links.error?.message);
    const plan = planCalendarSync(expandVenueCalendar(response.text, source.timezone), trucks.data ?? [], links.data ?? []);
    const { error: commitError } = await db.rpc('reconcile_venue_calendar', { _source_id: id, _token: token, _stops: plan.stops as unknown as Json, _titles: plan.titles as unknown as Json, _ignored: plan.ignored });
    if (commitError) throw Error(commitError.message);
    return { imported: plan.stops.length, ignored: plan.ignored, in_review: plan.titles.length };
  } catch (e) {
    await db.from('venue_calendar_sources').update({ last_error: e instanceof Error ? e.message : String(e), sync_token: null, sync_started_at: null }).eq('id', id).eq('sync_token', token);
    throw e;
  }
}