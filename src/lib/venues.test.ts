import { expect, it } from 'vitest';
import { resolveVenue } from './venues.server';

it('a confirmed owner address replaces an uncertain cached venue lookup', async () => {
  const writes: unknown[] = [];
  const confirmed = { venue_name: 'SSAB', address: '1770 Bill Sharp Blvd, Muscatine, IA 52761', city: 'Muscatine', lat: 41.4864287, lng: -90.8244188 };
  const db = { from: (table: string) => {
    const q: Record<string, any> = {};
    for (const method of ['select', 'eq', 'ilike', 'order', 'limit']) q[method] = () => q;
    q['upsert'] = (row: unknown) => { writes.push(row); return q; };
    q['then'] = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: table === 'stops' ? [confirmed] : [{ name: 'SSAB', confirmed: false, address: confirmed.address, city: 'Muscatine', lat: 41.4853965, lng: -90.8137131 }] }).then(resolve);
    return q;
  } };
  expect(await resolveVenue(db as unknown as Parameters<typeof resolveVenue>[0], 'SSAB')).toMatchObject({ address: confirmed.address, lat: 41.4864287, lng: -90.8244188, check: false });
  expect(writes[0]).toMatchObject({ norm_name: 'ssab', confirmed: true, source: 'owner_stop' });
});