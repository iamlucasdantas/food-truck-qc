/** Facebook/Google labels that say nothing about the food (e.g. Facebook's generic "Page"). */
export const GENERIC_CATEGORY = /^(other|unknown|uncategorized|point of interest|establishment|food|page|local business|business|company|brand|public figure|community|organization)$/i;
/** Geocoder-friendly forms of an address: as typed, then without country / ZIP, which often make the geocoder miss. */
export function addressVariants(address: string): string[] {
  const a = address.trim();
  if (!a) return [];
  const noCountry = a.replace(/,?\s*(united states( of america)?|usa|us)\b\.?/gi, '').replace(/\s*,\s*,/g, ',').trim().replace(/,$/, '');
  const noZip = noCountry.replace(/,?\s*\d{5}(-\d{4})?\s*$/, '').trim().replace(/,$/, '');
  return [...new Set([a, noCountry, noZip])].filter(Boolean);
}
export function profileCategory(categories: string[], facebookText = ''): string | null {
  const meaningful = categories.map(s => s.trim().replace(/_/g, ' ')).filter(s => s && !GENERIC_CATEGORY.test(s));
  if (meaningful.length) return meaningful[0] ?? null;
  const matches: [RegExp, string][] = [
    [/\b(bbq|barbecue|smoked meats|brisket)\b/i, 'BBQ'], [/\b(tacos?|mexican|birria)\b/i, 'Mexican'],
    [/\bburgers?\b/i, 'Burgers'], [/\bpizza\b/i, 'Pizza'], [/\b(ice cream|shaved ice|desserts?)\b/i, 'Desserts'],
    [/\b(coffee|espresso)\b/i, 'Coffee'], [/\b(seafood|fish)\b/i, 'Seafood'],
    [/\b(food truck|food trailer|food cart|mobile caterer|food stand)\b/i, 'Food truck'],
  ];
  return matches.find(([pattern]) => pattern.test(facebookText))?.[1] ?? null;
}
export function completeAddress(address: string | null | undefined, lat: number | null | undefined, lng: number | null | undefined): boolean {
  return !!address?.trim() && lat != null && lng != null && Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
/** Fixed-location trucks always need an address; mobile trucks can be approved without one (they only go live through dated stops with an address). */
export function approvalIssue(t: { category: string; base_address: string | null; base_lat?: number | null; base_lng?: number | null; truck_type?: string | null }): string | null {
  if (t.truck_type === 'fixed' && !completeAddress(t.base_address, t.base_lat, t.base_lng)) return 'Fixed location needs an address and coordinates';
  if (!t.category.trim() || GENERIC_CATEGORY.test(t.category.trim())) return 'Google or Facebook category required';
  return null;
}
export function discoveredTruckId(name: string): string {
  return `social-${name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}`;
}