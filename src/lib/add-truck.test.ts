import { beforeEach, expect, it, vi } from 'vitest';

const { geocodeAddress } = vi.hoisted(() => ({ geocodeAddress: vi.fn() }));
vi.mock('./geocode.server', () => ({ geocodeAddress }));
vi.mock('@/integrations/supabase/auth-middleware', () => ({ requireSupabaseAuth: {} }));
vi.mock('@tanstack/react-start', () => ({
  createServerFn: () => {
    const builder = {
      middleware: () => builder,
      inputValidator: () => builder,
      handler: (handler: unknown) => handler,
    };
    return builder;
  },
}));
import { createTruckFromDraft, type TruckDraft } from './add-truck.functions';

beforeEach(() => geocodeAddress.mockReset());

it('saves an Admin truck draft with its original address and null coordinates when lookup fails', async () => {
  geocodeAddress.mockRejectedValue(new Error('Address lookup failed. ZERO_RESULTS'));
  const insert = vi.fn(async () => ({ error: null }));
  const supabase = {
    rpc: vi.fn(async () => ({ data: true })),
    from: () => ({
      select: () => ({ is: () => ({ limit: async () => ({ data: [] }) }) }),
      insert,
    }),
  };
  const draft: TruckDraft = { name: 'Regression Truck', category: 'Burgers', description: '', base_address: 'Unknown street, Davenport', phone: '', website: '', facebook: '', instagram: '', google_place_id: '', found_with: '', notes: [] };
  const handler = createTruckFromDraft as unknown as (args: { data: { draft: TruckDraft }; context: { supabase: typeof supabase; userId: string } }) => Promise<{ id?: string }>;
  const result = await handler({ data: { draft }, context: { supabase, userId: 'test-admin' } });
  expect(result.id).toMatch(/^regression-truck-/);
  expect(insert).toHaveBeenCalledWith(expect.objectContaining({ base_address: 'Unknown street, Davenport', base_lat: null, base_lng: null }));
});