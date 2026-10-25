import { beforeEach, expect, it, vi } from 'vitest';
import { geocode } from './geocode';

const { lookup } = vi.hoisted(() => ({ lookup: vi.fn() }));
vi.mock('./geocode.functions', () => ({ lookupAddress: lookup }));
beforeEach(() => lookup.mockReset());

it('returns null for an unrecognized address instead of rejecting form saves', async () => {
  lookup.mockResolvedValue({ result: null, error: 'Address lookup failed. ZERO_RESULTS' });
  await expect(geocode('Unrecognized address, Davenport')).resolves.toBeNull();
});

it('returns null for RPC failures so busy forms reach their existing error handling', async () => {
  lookup.mockRejectedValue(new Error('Network unavailable'));
  await expect(geocode('2500 53rd St, Moline, IL')).resolves.toBeNull();
});

it.each(['', ' ', 'ab', 'a'.repeat(501)])('returns null for invalid address length without calling the server', async (address) => {
  await expect(geocode(address)).resolves.toBeNull();
  expect(lookup).not.toHaveBeenCalled();
});

it('retains coordinates returned by a successful lookup', async () => {
  const point = { lat: 41.4865353, lng: -90.465312, label: '2500 53rd St', city: 'Moline' };
  lookup.mockResolvedValue({ result: point, error: null });
  expect(await geocode(' 2500 53rd St ')).toEqual(point);
  expect(lookup).toHaveBeenCalledWith({ data: { address: '2500 53rd St' } });
});

it('continues processing subsequent CSV-style rows after a failed lookup', async () => {
  const point = { lat: 41.5, lng: -90.6, label: 'Davenport', city: 'Davenport' };
  lookup.mockResolvedValueOnce({ result: null, error: 'ZERO_RESULTS' }).mockResolvedValueOnce({ result: point, error: null });
  const rows = [];
  for (const address of ['Unknown street', '2200 W River Dr, Davenport']) rows.push(await geocode(address));
  expect(rows).toEqual([null, point]);
  expect(lookup).toHaveBeenCalledTimes(2);
});