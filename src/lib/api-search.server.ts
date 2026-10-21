import { z } from 'zod';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import { knownLocation, type ResolvedLocation } from '@/data/agent-location';
import { agentSearch } from '@/data/agent-search';
import { timeWindow, expandCentralSeries } from '@/data/agent-time';
import { chicagoDate } from '@/data/trucks';
import { expandGoogleHours } from '@/data/google-hours';
import { chicago } from './chat-agent.server';
const bool = z.enum(['true','false','1','0','yes','no']).transform(v => ['true','1','yes'].includes(v));
export const AgentInputShape = {
  query:z.string().max(100).optional(), location:z.string().max(200).optional(), city:z.string().max(80).optional(),
  cuisine:z.string().max(60).optional(), dish:z.string().max(80).optional(), menu_item:z.string().max(80).optional(),
  near:z.string().max(200).optional(), address:z.string().max(200).optional(),
  truck_id:z.string().max(120).regex(/^[a-z0-9_-]+$/i).optional(),
  when:z.string().refine(v => ['now','today','tomorrow','this_week'].includes(v) || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v)) && new Date(v).toISOString().slice(0,10) === v), 'Invalid when').optional(),
};
export const SearchQuery = z.object({...AgentInputShape, open_now:bool.optional(),lat:z.coerce.number().min(-90).max(90).optional(),lng:z.coerce.number().min(-180).max(180).optional(),radius_miles:z.coerce.number().min(1).max(100).optional(),days:z.coerce.number().int().min(1).max(14).optional(),limit:z.coerce.number().int().min(1).max(50).optional()}).refine(p => (p.lat == null) === (p.lng == null), 'Provide lat and lng together');
export type SearchInput = z.infer<typeof SearchQuery>;
export async function geocodeAddress(address:string):Promise<{lat:number;lng:number;label:string}|null> {
  const u = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=us&viewbox=-91.0,41.8,-90.0,41.3&q=${encodeURIComponent(address)}`;
  try { const res = await fetch(u,{signal:AbortSignal.timeout(6000),headers:{Accept:'application/json','User-Agent':'FoodTruckQC/1.0 (app.foodtruckqc.com)'}}); if (!res.ok) return null;
    const [hit] = await res.json() as {lat:string;lon:string;display_name:string}[]; return hit && Number.isFinite(Number(hit.lat)) && Number.isFinite(Number(hit.lon)) ? {lat:Number(hit.lat),lng:Number(hit.lon),label:hit.display_name} : null;
  } catch { return null; }
}
export async function runSearch(input:SearchInput, defaults:{days:number;limit:number;upcoming?:boolean}, client?:SupabaseClient<Database>) {
  const raw = (input.location?.trim() || input.city?.trim() || input.near?.trim() || input.address?.trim() || '');
  let resolved:ResolvedLocation|null = input.lat != null && input.lng != null && !raw ? {input:`${input.lat}, ${input.lng}`,type:'address',name:'Coordinates',lat:input.lat,lng:input.lng,radius_miles:input.radius_miles ?? 5} : knownLocation(raw,input.radius_miles);
  if (!resolved) { const point = await geocodeAddress(raw); if (point) resolved = {input:raw,type:'address',name:point.label,lat:point.lat,lng:point.lng,radius_miles:input.radius_miles ?? 5}; }
  if (!resolved) return {error:'location not found' as const,hint:'try a city like Davenport or a nearby street'};
  const sb = client ?? createClient<Database>(process.env['SUPABASE_URL'] ?? '',process.env['SUPABASE_PUBLISHABLE_KEY'] ?? '',{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:async(url,init) => {const headers = new Headers(init?.headers); if (headers.get('Authorization')?.includes('sb_publishable_')) headers.delete('Authorization'); return fetch(url,{...init,headers});}}});
  const now = new Date(); const window = timeWindow(input.when,input.days ?? defaults.days,!!defaults.upcoming,now);
  const from = new Date(Math.min(window.from.getTime(),now.getTime())); const future = new Date(now.getTime()+7*864e5); const to = new Date(Math.max(window.to.getTime(),future.getTime()));
  let tq = sb.from('trucks').select('id,name,business_name,category,description,truck_type,website,menu_search,menu_sections,menu,base_address,base_lat,base_lng,is_food_truck,google_regular_hours,google_place_id,google_hours_updated_at').eq('status','active').eq('is_food_truck',true).is('deleted_at',null).limit(1000);
  let sq = sb.from('stops').select('truck_id,venue_name,address,city,lat,lng,starts_at,ends_at,source,source_url,series_id,calendar_source_id,created_at').eq('cancelled',false).gt('ends_at',from.toISOString()).lt('starts_at',to.toISOString()).order('starts_at').limit(5000);
  let rq = sb.from('stop_series').select('*').lte('start_date',chicagoDate(to)).or(`end_date.is.null,end_date.gte.${chicagoDate(from)}`).limit(2000);
  if (input.truck_id) { tq=tq.eq('id',input.truck_id); sq=sq.eq('truck_id',input.truck_id); rq=rq.eq('truck_id',input.truck_id); }
  const [tr,sr,rr] = await Promise.all([tq,sq,rq]); if (tr.error || sr.error || rr.error) return {error:'lookup failed' as const};
  const stops = [...(sr.data ?? []),...expandCentralSeries(rr.data ?? [],from,to),...expandGoogleHours(tr.data ?? [],from,to)];
  const p = {query:input.query,cuisine:input.cuisine,dish:input.dish ?? input.menu_item,open_now:input.open_now,when:input.when,limit:input.limit ?? defaults.limit};
  const hits = agentSearch(tr.data ?? [],stops,p,resolved,window.from,window.to,now);
  const next = hits.length ? null : agentSearch(tr.data ?? [],stops,{...p,open_now:false,when:undefined,limit:50},resolved,now,future,now).filter(h => h.stops.some(s => new Date(s.starts_at) > now)).sort((a,b) => (a.stops.find(s => new Date(s.starts_at)>now)?.starts_at ?? '9').localeCompare(b.stops.find(s => new Date(s.starts_at)>now)?.starts_at ?? '9'))[0];
  return {hits,limit:p.limit,origin:{lat:resolved.lat,lng:resolved.lng,label:resolved.name},radius:resolved.radius_miles,resolved,filters:{query:input.query ?? null,cuisine:input.cuisine ?? null,dish:input.dish ?? input.menu_item ?? null,open_now:input.open_now === true || input.when === 'now',when:window.when},next,now};
}
type SearchSuccess = Exclude<Awaited<ReturnType<typeof runSearch>>, {error:string}>;
export function agentResponse(r:SearchSuccess, upcoming=false) {
  const result = (h:SearchSuccess['hits'][number], s = h.stops[0]) => ({truck_id:h.truck.id,name:h.truck.name,cuisine:h.truck.category || null,open_now:s?.open_now ?? false,is_base_location:!s,distance_miles:h.distance_miles,stop:s ? {venue:s.venue_name,address:s.address,city:s.city,starts_at:chicago(s.starts_at),ends_at:chicago(s.ends_at)} : null,base_address:!s ? h.truck.base_address : null,matched_on:h.matched_on,matched_items:h.matched_items,menu_highlights:h.menu_highlights,app_url:`https://app.foodtruckqc.com/truck/${h.truck.id}`});
  const results = upcoming ? r.hits.flatMap(h => h.stops.length ? h.stops.map(s => result(h,s)) : [result(h)]) : r.hits.map(h => result(h));
  const nameScores = new Map(r.hits.map(h => [h.truck.id, h.name_score]));
  if (upcoming) results.sort((a,b) => (nameScores.get(b.truck_id) ?? 0)-(nameScores.get(a.truck_id) ?? 0) || Number(b.open_now)-Number(a.open_now) || Date.parse(a.stop?.starts_at ?? '9999-01-01')-Date.parse(b.stop?.starts_at ?? '9999-01-01') || (a.distance_miles ?? Infinity)-(b.distance_miles ?? Infinity));
  const display = results.slice(0,r.limit);
  const next = r.next ? result(r.next,r.next.stops.find(s => new Date(s.starts_at)>r.now)) : null;
  const where = r.resolved.type === 'city' ? `in ${r.resolved.name}` : `within ${r.radius} mi of ${r.resolved.name}`;
  const food = r.filters.dish || r.filters.cuisine || '';
  let message = display.length ? `${display.length} ${food ? food + ' ' : ''}trucks${r.filters.open_now ? ' open now' : ''} ${where}` : `No ${food ? food + ' ' : ''}trucks ${r.filters.open_now ? 'open right now' : 'with matching locations for ' + r.filters.when} ${where}.`;
  if (!display.length && next?.stop) message += ` Next one: ${next.name} ${next.stop.starts_at} in ${next.stop.city ?? next.stop.venue}.`;
  return {resolved_location:r.resolved,filters:r.filters,count:display.length,results:display,message,next_available:next,origin:r.origin.label,radius_miles:r.radius,trucks:display.map(x => ({...x,city:x.stop?.city ?? null,current_or_next_stop:x.stop})),stops:display.map(x => ({truck_id:x.truck_id,truck_name:x.name,cuisine:x.cuisine,distance_miles:x.distance_miles,is_base_location:x.is_base_location,open_now:x.is_base_location ? null : x.open_now,venue:x.stop?.venue ?? null,address:x.stop?.address ?? x.base_address,city:x.stop?.city ?? null,starts_at:x.stop?.starts_at ?? null,ends_at:x.stop?.ends_at ?? null}))};
}
