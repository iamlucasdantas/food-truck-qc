export function profileCategory(categories: string[], facebookText = ''): string | null {
  const meaningful = categories.map(s => s.trim().replace(/_/g, ' ')).filter(s => s && !/^(other|unknown|uncategorized|point of interest|establishment|food)$/i.test(s));
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
export function approvalIssue(t: { category: string; base_address: string | null; base_lat?: number | null; base_lng?: number | null }): string | null {
  if (!completeAddress(t.base_address, t.base_lat, t.base_lng)) return 'Address and coordinates required';
  if (!t.category.trim() || /^(other|unknown|uncategorized)$/i.test(t.category.trim())) return 'Google or Facebook category required';
  return null;
}
export function discoveredTruckId(name: string): string {
  return `social-${name.toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '')}`;
}