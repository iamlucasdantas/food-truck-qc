import { DAVENPORT_CENTER, DEFAULT_RADIUS_MILES } from './coverage';
export const normalizeLocation = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').replace(/\b(city of|downtown|iowa|ia|illinois|il|usa|united states)\b/g, ' ').replace(/\s+/g, ' ').trim();
export function editDistance(a: string, b: string): number {
  let row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) { const next = [i]; for (let j = 1; j <= b.length; j++) next[j] = Math.min((next[j - 1] ?? 0) + 1, (row[j] ?? 0) + 1, (row[j - 1] ?? 0) + Number(a[i - 1] !== b[j - 1])); row = next; }
  return row[b.length] ?? 0;
}
const CITIES: [string, number, number, string[]][] = [
  ['Davenport',41.5236,-90.5776,['devonport','davenpor','dvpt']], ['Bettendorf',41.525,-90.5151,['betendorf','bettendorff','berendorf']],
  ['Moline',41.5067,-90.5151,['molene']], ['East Moline',41.5009,-90.4443,['e moline','emoline']], ['Rock Island',41.5095,-90.5787,['rockisland','ri']],
  ['Silvis',41.5123,-90.4151,[]], ['Milan',41.4531,-90.5721,[]], ['Coal Valley',41.4286,-90.4604,[]], ['Rapids City',41.5817,-90.3435,[]],
  ['Port Byron',41.6064,-90.3354,[]], ['Le Claire',41.5986,-90.3435,['leclaire']], ['Eldridge',41.6581,-90.5846,[]], ['Blue Grass',41.5089,-90.7657,[]],
  ['Buffalo',41.4564,-90.7235,[]], ['Muscatine',41.4245,-91.0432,[]], ['Clinton',41.8445,-90.1887,[]], ['Camanche',41.7881,-90.2562,[]],
  ['DeWitt',41.8234,-90.5382,['de witt']], ['Geneseo',41.4481,-90.1543,[]], ['Colona',41.4834,-90.3532,[]], ['Hampton',41.555,-90.4093,[]], ['Wilton',41.5889,-91.0168,[]],
];
export type ResolvedLocation = { input: string; type: 'region' | 'city' | 'address' | 'default'; name: string; lat: number; lng: number; radius_miles: number };
const REGIONS = new Set(['qc','the qc','quad cities','quad city','quadcities','qca','quad cities area','qc area','the quad','around here','anywhere']);
export function knownLocation(input = '', radius?: number): ResolvedLocation | null {
  const n = normalizeLocation(input);
  if (!n || REGIONS.has(n)) return { input, type: n ? 'region' : 'default', name: 'Quad Cities', ...DAVENPORT_CENTER, radius_miles: radius ?? DEFAULT_RADIUS_MILES };
  const exact = CITIES.find(([name,,,aliases]) => [normalizeLocation(name), ...aliases].includes(n));
  const fuzzy = exact ?? CITIES.map(c => ({ c, d: editDistance(n, normalizeLocation(c[0])) })).filter(x => x.d <= 2 && n.length >= 4).sort((a,b) => a.d - b.d)[0]?.c;
  return fuzzy ? { input, type:'city', name:fuzzy[0], lat:fuzzy[1], lng:fuzzy[2], radius_miles:radius ?? 5 } : null;
}
