import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';

const idSchema = z.object({ id: z.uuid() });
export const saveVenueCalendar = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ name: z.string().trim().min(2).max(150), address: z.string().trim().min(10).max(300), url: z.url().max(2000), timezone: z.string().min(3).max(100) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!allowed) throw Error('Forbidden');
    new Intl.DateTimeFormat('en-US', { timeZone: data.timezone });
    const { validateProviderLink } = await import('./safe-link-fetch.server');
    const url = validateProviderLink(data.url, 'calendar').toString();
    const { geocode } = await import('./geocode');
    const geo = await geocode(data.address);
    if (!geo || !geo.city || !Number.isFinite(geo.lat) || !Number.isFinite(geo.lng)) throw Error('Venue address could not be geocoded. Use a complete street address.');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { data: source, error } = await supabaseAdmin.from('venue_calendar_sources').insert({ ...data, url, city: geo.city, lat: geo.lat, lng: geo.lng }).select('id').single();
    if (error) throw Error(error.message);
    return source;
  });
export const syncVenueCalendarNow = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => idSchema.parse(input)).handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!allowed) throw Error('Forbidden');
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { syncVenueCalendar } = await import('./venue-calendar.server');
    return syncVenueCalendar(supabaseAdmin, data.id);
  });
export const decideCalendarTitle = createServerFn({ method: 'POST' }).middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ id: z.uuid(), key: z.string().min(1).max(500), truckId: z.string().min(1).max(150).nullable() }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: allowed } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!allowed) throw Error('Forbidden');
    if (data.truckId) {
      const { data: truck } = await context.supabase.from('trucks').select('id').eq('id', data.truckId).eq('status', 'active').eq('is_food_truck', true).is('deleted_at', null).maybeSingle();
      if (!truck) throw Error('Link only to an approved food truck');
    }
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { error } = await supabaseAdmin.from('venue_calendar_titles').update({ decision: data.truckId ? 'link' : 'ignore', truck_id: data.truckId }).eq('source_id', data.id).eq('title_key', data.key);
    if (error) throw Error(error.message);
    const { syncVenueCalendar } = await import('./venue-calendar.server');
    return syncVenueCalendar(supabaseAdmin, data.id);
  });