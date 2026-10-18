import { describe, expect, it } from 'vitest';
import { DAVENPORT_CENTER, inServiceRegion, mapRadius, REGION_RADIUS_MILES } from './coverage';
describe('75-mile Davenport coverage', () => {
  it('uses exactly 75 miles and Davenport center', () => { expect(REGION_RADIUS_MILES).toBe(75); expect(DAVENPORT_CENTER).toEqual({lat:41.5236,lng:-90.5776}); });
  it('includes extended towns and rejects outside the circle', () => { expect(inServiceRegion(41.6611,-91.5302)).toBe(true); expect(inServiceRegion(40.8075,-91.1129)).toBe(true); expect(inServiceRegion(42.5006,-90.6646)).toBe(true); expect(inServiceRegion(41.5236,-92.1)).toBe(false); });
  it('map default and upper bound are 75', () => { expect(mapRadius(undefined)).toBe(75); expect(mapRadius('75')).toBe(75); expect(mapRadius('25')).toBe(25); expect(mapRadius('76')).toBe(75); });
});