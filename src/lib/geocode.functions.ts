import { createServerFn } from '@tanstack/react-start';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { z } from 'zod';

export const lookupAddress = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ address: z.string().trim().min(3).max(500) }).parse(input))
  .handler(async ({ data }) => {
    const { geocodeAddress } = await import('./geocode.server');
    try { return { result: await geocodeAddress(data.address), error: null }; }
    catch (e) { return { result: null, error: e instanceof Error ? e.message : 'Address lookup failed' }; }
  });