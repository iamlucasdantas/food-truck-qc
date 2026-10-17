import { editDistance } from './agent-location';
export const foodWords = (s: string) => s.toLowerCase().replace(/quesabirria/g,'birria taco').replace(/bar-b-q/g,'bbq').replace(/[^a-z0-9\s]/g,' ').split(/\s+/).filter(Boolean).map(w => w.length > 3 && w.endsWith('s') ? w.slice(0,-1) : w);
export const fuzzyFood = (needle: string, hay: string) => {
  const words = foodWords(hay); return foodWords(needle).every(w => words.some(h => h === w || (w.length > 4 && h.length > 4 && editDistance(w,h) <= 1)));
};
const GROUPS = ['tacos taco taqueria mexican','bbq barbecue bar-b-q smoked churrasco','pizza','burgers burger','hot dogs','chicken wings','asian chinese thai hibachi japanese sushi','dessert desserts sweets ice cream donuts','coffee espresso drinks','breakfast','seafood','vegan vegetarian','soul food','latin salvadoran pupusas','mediterranean greek gyros'];
const nameWords = (s: string) => foodWords(s.toLowerCase().replace(/['’]s\b/g, '').replace(/['’]/g, ''));
/** Name-only Levenshtein matching; every query token must have a close name token. */
export function truckNameScore(query: string, name: string): number {
  const needle = nameWords(query), hay = nameWords(name);
  if (!needle.length || !hay.length) return 0;
  if (needle.join(' ') === hay.join(' ')) return 1;
  const scores = needle.map(w => Math.max(...hay.map(h => {
    if (w === h) return 1;
    const distance = editDistance(w, h);
    const max = Math.max(w.length, h.length);
    return Math.min(w.length, h.length) >= 4 && distance <= (max >= 7 ? 2 : 1) && distance / max <= 0.25 ? 1 - distance / max : 0;
  })));
  if (scores.some(s => s === 0)) return 0;
  return scores.reduce((sum, s) => sum + s, 0) / scores.length * Math.min(1, needle.length / hay.length);
}
export function cuisineMatch(needle: string, category: string) {
  const groups = GROUPS.filter(g => fuzzyFood(needle,g));
  return fuzzyFood(needle, category) || groups.some(g => foodWords(category).some(w => foodWords(g).includes(w)));
}
export function publishedItems(sections: unknown, legacy: unknown): { name:string; description:string; label:string }[] {
  const rows: { name:string; description:string; label:string }[] = [];
  const add = (v: unknown) => { if (!v || typeof v !== 'object') return; const x = v as Record<string,unknown>; const name = typeof x['name'] === 'string' ? x['name'] : typeof x['item'] === 'string' ? x['item'] : ''; if (!name.trim()) return; const price = typeof x['price'] === 'number' && x['price'] > 0 ? ` $${Number.isInteger(x['price']) ? x['price'] : x['price'].toFixed(2)}` : ''; rows.push({name, description:typeof x['description'] === 'string' ? x['description'] : '', label:name + price}); };
  if (Array.isArray(sections)) for (const s of sections) if (s && Array.isArray(s.items)) s.items.forEach(add);
  if (!rows.length && Array.isArray(legacy)) legacy.forEach(add);
  return rows;
}
export function matchFood(t: {name:string; category:string; description?:string | null; menu_sections?:unknown; menu?:unknown; menu_search?:string | null}, p: {query?:string | undefined; cuisine?:string | undefined; dish?:string | undefined}) {
  const items = publishedItems(t.menu_sections,t.menu);
  const menu = items.map(i => `${i.name} ${i.description}`).join(' ');
  const matched = new Set<'name'|'cuisine'|'menu'|'description'>(); const selected = new Set<string>();
  const name_score = p.query?.trim() ? truckNameScore(p.query, t.name) : 0;
  if (p.cuisine?.trim()) { if (!cuisineMatch(p.cuisine,t.category)) return null; matched.add('cuisine'); }
  if (p.dish?.trim()) { const hits = items.filter(i => fuzzyFood(p.dish ?? '',`${i.name} ${i.description}`)); if (hits.length) { matched.add('menu'); hits.forEach(i => selected.add(i.label)); } else if (!items.length && fuzzyFood(p.dish,t.description ?? '')) matched.add('description'); else return null; }
  if (p.query?.trim()) {
    const fields = [['name',t.name],['cuisine',t.category],['description',t.description ?? ''],['menu',menu]] as const;
    const hits = fields.filter(([k,v]) => k === 'name' ? name_score > 0 || fuzzyFood(p.query ?? '',v) : fuzzyFood(p.query ?? '',v));
    if (!hits.length && !fuzzyFood(p.query,fields.map(([,v]) => v).join(' '))) return null;
    hits.forEach(([k]) => matched.add(k));
    if (!hits.length) foodWords(p.query).forEach(w => fields.filter(([,v]) => fuzzyFood(w,v)).forEach(([k]) => matched.add(k)));
    items.filter(i => fuzzyFood(p.query ?? '',`${i.name} ${i.description}`)).forEach(i => selected.add(i.label));
  }
  return { matched_on:[...matched], matched_items:[...selected], menu_highlights:items.slice(0,5).map(i => i.label), exact_name:name_score === 1, name_score };
}
