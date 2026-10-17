import { describe, it, expect } from 'vitest';
import { locationVerified, canConfirmLocation } from './location-confirmation';
describe('location confirmation', () => {
  it('explicit Google verification confirms a location', () => expect(locationVerified({ google_location_verified: true })).toBe(true));
  it('no verification evidence stays unconfirmed', () => expect(locationVerified({ google_location_verified: false, base_location_confirmed_at: null })).toBe(false));
  it('owner confirmation verifies a location', () => expect(locationVerified({ base_location_confirmed_at: '2026-10-17T18:09:00Z' })).toBe(true));
  it('approved claimed owner can confirm', () => expect(canConfirmLocation({ claimed_by: 'owner', status: 'active' }, 'owner', false)).toBe(true));
  it('pending claim is insufficient', () => expect(canConfirmLocation({ claimed_by: 'owner', status: 'pending' }, 'owner', false)).toBe(false));
  it('another owner cannot confirm', () => expect(canConfirmLocation({ claimed_by: 'owner', status: 'active' }, 'other', false)).toBe(false));
  it('admin can confirm an unclaimed truck', () => expect(canConfirmLocation({ claimed_by: null, status: 'active' }, 'admin', true)).toBe(true));
});