import { createFileRoute } from '@tanstack/react-router';
import { authenticateCronRequest } from '@/integrations/supabase/cron-auth';
import { z } from 'zod';

export const Route = createFileRoute('/api/public/jobs/venue-calendars')({
  staticData: { sitemap: false },
  server: { handlers: { POST: async ({ request }) => {
    const failure = await authenticateCronRequest(request);
    if (failure) return failure;
    const body = z.object({ version: z.literal(1) }).strict().safeParse(await request.json().catch(() => null));
    if (!body.success) return new Response('Bad request', { status: 400 });
    const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
    const { syncVenueCalendar } = await import('@/lib/venue-calendar.server');
    const { data, error } = await supabaseAdmin.from('venue_calendar_sources').select('id').eq('active', true);
    if (error) throw Error(error.message);
    const results = [];
    for (const source of data ?? []) {
      try { results.push({ id: source.id, ...await syncVenueCalendar(supabaseAdmin, source.id) }); }
      catch (e) { results.push({ id: source.id, error: e instanceof Error ? e.message : String(e) }); }
    }
    return Response.json({ results });
  } } },
});