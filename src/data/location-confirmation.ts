export type LocationEvidence = { google_location_verified?: boolean; base_location_confirmed_at?: string | null };
export function locationVerified(t: LocationEvidence): boolean {
  return t.google_location_verified === true || Boolean(t.base_location_confirmed_at);
}
export function canConfirmLocation(t: { claimed_by: string | null; status: string }, userId: string, admin: boolean): boolean {
  return admin || (t.claimed_by === userId && t.status === 'active');
}