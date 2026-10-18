import { describe, expect, it } from 'vitest';
import { DAVENPORT_CENTER, DEFAULT_RADIUS_MILES, inServiceRegion, mapRadius, REGION_RADIUS_MILES } from './coverage';
describe('100-mile maximum coverage, 10-mile default', () => {
  it('caps regional coverage at exactly 100 miles from Davenport', () => {
    expect(REGION_RADIUS_MILES).toBe(100);
    expect(DAVENPORT_CENTER).toEqual({lat:41.5236,lng:-90.5776});
    expect(inServiceRegion(41.5236,-92.1)).toBe(true);
    expect(inServiceRegion(41.5236,-93)).toBe(false);
  });
  it('defaults to exactly 10 miles without a valid radius', () => {
    expect(DEFAULT_RADIUS_MILES).toBe(10);
    for (const value of [undefined, null, '', NaN, 'bad', 0, -1]) expect(mapRadius(value)).toBe(10);
  });
  it('allows expansion to 100 miles and clamps larger values', () => {
    expect(mapRadius('25')).toBe(25);
    expect(mapRadius('100')).toBe(100);
    expect(mapRadius('101')).toBe(100);
  });
});
