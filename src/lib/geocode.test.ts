import { afterEach, beforeEach, expect, it, vi } from 'vitest';

beforeEach(() => {
  vi.resetModules();
  vi.stubEnv('GOOGLE_MAPS_API_KEY', '');
  vi.stubEnv('LOVABLE_API_KEY', '');
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.restoreAllMocks(); });

const cases = [
  ['2200 W River Dr, Davenport, IA 52802', 41.509553, -90.606374, 'Davenport'],
  ['1218 N Brady St, Davenport, IA 52803', 41.535016, -90.574056, 'Davenport'],
  ['2500 53rd St, Moline, IL 61265', 41.486598, -90.465592, 'Moline'],
] as const;
for (const [address, lat, lng, city] of cases) {
  it(`encodes only the address with US bias and an identified fallback: ${address}`, async () => {
    const fetcher = vi.fn(async (url: string, init: RequestInit) => {
      const query = new URL(url);
      expect(query.hostname).toBe('nominatim.openstreetmap.org');
      expect(query.searchParams.get('q')).toBe(address);
      expect(query.searchParams.get('countrycodes')).toBe('us');
      expect(new Headers(init.headers).get('User-Agent')).toContain('FoodTruckQC/1.0');
      expect(init.redirect).toBe('manual');
      return Response.json([{ lat: String(lat), lon: String(lng), address: { city }, display_name: address }]);
    });
    vi.stubGlobal('fetch', fetcher);
    const { geocodeAddress } = await import('./geocode.server');
    expect(await geocodeAddress(address)).toEqual({ lat, lng, city, label: address });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
}
it('preserves the actual provider status/body instead of a generic not-found error', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => new Response('Access denied. See https://operations.osmfoundation.org/policies/nominatim/', { status: 403 })));
  const { geocodeAddress } = await import('./geocode.server');
  await expect(geocodeAddress(cases[0][0])).rejects.toThrow('Nominatim HTTP 403: Access denied.');
});
it('distinguishes zero results from failed requests', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([])));
  const { geocodeAddress } = await import('./geocode.server');
  await expect(geocodeAddress(cases[0][0])).rejects.toThrow('Nominatim HTTP 200: ZERO_RESULTS');
});
it('rejects invalid coordinates rather than saving a false map pin', async () => {
  vi.stubGlobal('fetch', vi.fn(async () => Response.json([{ lat: 'invalid', lon: '999' }])));
  const { geocodeAddress } = await import('./geocode.server');
  await expect(geocodeAddress(cases[0][0])).rejects.toThrow('invalid coordinates');
});
it('deduplicates concurrent requests and reuses a successful lookup', async () => {
  const fetcher = vi.fn(async () => Response.json([{ lat: '41.5', lon: '-90.6', address: { city: 'Davenport' } }]));
  vi.stubGlobal('fetch', fetcher);
  const { geocodeAddress } = await import('./geocode.server');
  const results = await Promise.all([geocodeAddress(cases[0][0]), geocodeAddress(cases[0][0])]);
  expect(results[0]).toEqual(results[1]);
  await geocodeAddress(cases[0][0]);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('rejects empty input before contacting a provider', async () => {
  const fetcher = vi.fn(); vi.stubGlobal('fetch', fetcher);
  const { geocodeAddress } = await import('./geocode.server');
  await expect(geocodeAddress('')).rejects.toThrow('Enter an address');
  expect(fetcher).not.toHaveBeenCalled();
});