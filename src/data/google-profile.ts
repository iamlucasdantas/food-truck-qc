export type GoogleBusinessStatus = 'OPERATIONAL' | 'CLOSED_TEMPORARILY' | 'CLOSED_PERMANENTLY';
export function businessStatus(value: unknown): GoogleBusinessStatus | null {
  return value === 'OPERATIONAL' || value === 'CLOSED_TEMPORARILY' || value === 'CLOSED_PERMANENTLY' ? value : null;
}
export function googleStatusPatch(value: unknown): { google_business_status?: GoogleBusinessStatus; status?: 'archived' } {
  const status = businessStatus(value);
  if (!status) return {};
  return { google_business_status: status, ...(status !== 'OPERATIONAL' ? { status: 'archived' as const } : {}) };
}
// Never equate address confirmation with Google's private merchant verification state.
export function canAutoConfirmGoogleAddress(t: { truck_type: string; is_food_truck: boolean; google_place_id?: string | null }, p: { id?: string | undefined; address?: string | undefined; lat?: number | undefined; lng?: number | undefined }): boolean {
  return t.truck_type === 'fixed' && t.is_food_truck && !!t.google_place_id && p.id === t.google_place_id && !!p.address?.trim() && p.lat != null && p.lng != null && Number.isFinite(p.lat) && Number.isFinite(p.lng) && Math.abs(p.lat) <= 90 && Math.abs(p.lng) <= 180;
}