import { describe, expect, it } from 'vitest';
import { approvalIssue, completeAddress, discoveredTruckId, profileCategory } from './ingestion-review';
describe('source-backed truck review', () => {
  it('preserves the Google profile category instead of Other', () => {
    expect(profileCategory(['Food truck'])).toBe('Food truck');
    expect(profileCategory(['African restaurant'])).toBe('African restaurant');
  });
  it('uses Facebook food evidence and refuses an invented category', () => {
    expect(profileCategory([], 'Serving brisket from our BBQ trailer')).toBe('BBQ');
    expect(profileCategory(['Other'], 'See you on Friday')).toBeNull();
  });
  it('requires an address and real coordinates', () => {
    expect(completeAddress(null, 41.5, -90.5)).toBe(false);
    expect(completeAddress('911 11th St, DeWitt IA', null, null)).toBe(false);
    expect(completeAddress('911 11th St, DeWitt IA', 41.8258374, -90.5442848)).toBe(true);
  });
  it('blocks approval with Other even with a location', () => {
    expect(approvalIssue({ category: 'Other', base_address: '911 11th St', base_lat: 41.8, base_lng: -90.5 })).toBe('Google or Facebook category required');
    expect(approvalIssue({ category: 'BBQ', base_address: '911 11th St', base_lat: 41.8, base_lng: -90.5 })).toBeNull();
  });
  it('gives repeated detections the same truck identity', () => {
    expect(discoveredTruckId("Mexie's Food Truck")).toBe(discoveredTruckId('MEXIES food-truck'));
  });
});