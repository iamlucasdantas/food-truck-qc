import { groupStops, milesBetween } from './trucks';
import { knownLocation, normalizeLocation, type ResolvedLocation } from './agent-location';
import { matchFood } from './agent-food';
import type { ApiStop, ApiTruck } from './api-search';
import { googleHours, isGoogleHoursStop } from './google-hours';
export type AgentTruck = ApiTruck & { description?:string | null; menu_sections?:unknown; menu?:unknown; is_food_truck?:boolean; google_regular_hours?:unknown };
export type AgentParams = { query?:string | undefined; cuisine?:string | undefined; dish?:string | undefined; open_now?:boolean | undefined; when?:string | undefined; limit:number };
export function agentSearch<T extends AgentTruck>(trucks:T[], allStops:ApiStop[], p:AgentParams, location:ResolvedLocation, from:Date, to:Date, now:Date) {
  const stops = groupStops(allStops.filter(s => (s.source !== 'apify_maps' || isGoogleHoursStop(s)) && new Date(s.ends_at) > from && new Date(s.starts_at) < to));
  const out = [];
  for (const t of trucks) {
    if (t.is_food_truck !== true) continue;
    const match = matchFood(t,p); if (!match) continue;
    const inPlace = (s: {lat:number|null; lng:number|null; city?:string|null|undefined}) => {
      const dist = s.lat != null && s.lng != null ? milesBetween(location,{lat:s.lat,lng:s.lng}) : null;
      const city = location.type === 'city' && s.city && (knownLocation(s.city)?.name === location.name || normalizeLocation(s.city) === normalizeLocation(location.name));
      return {yes:dist != null && dist <= location.radius_miles || !!city, dist};
    };
    let mine = stops.filter(s => s.truck_id === t.id && inPlace(s).yes).map(s => ({...s,open_now:new Date(s.starts_at) <= now && new Date(s.ends_at) > now}));
    const open = mine.some(s => s.open_now);
    if ((p.open_now || p.when === 'now') && !open) continue;
    if (p.open_now || p.when === 'now') mine = mine.filter(s => s.open_now);
    mine.sort((a,b) => Number(b.open_now)-Number(a.open_now) || Date.parse(a.starts_at)-Date.parse(b.starts_at));
    const base = inPlace({lat:t.base_lat,lng:t.base_lng,city:t.base_address?.split(',').slice(-2,-1)[0]});
    const hasBase = t.truck_type === 'fixed' || allStops.some(s => s.truck_id === t.id && s.source === 'apify_maps');
    if (!mine.length && !(hasBase && base.yes && !googleHours(t.google_regular_hours)?.periods.length && !p.open_now && p.when !== 'now')) continue;
    const distances = mine.map(s => inPlace(s).dist).filter((d): d is number => d != null);
    const distance = distances.length ? Math.min(...distances) : base.dist;
    out.push({truck:t,stops:mine,open_now:open,distance_miles:distance == null ? null : Math.round(distance*10)/10,is_base_location:!mine.length,...match});
  }
  return out.sort((a,b) => Number(b.exact_name)-Number(a.exact_name) || b.name_score-a.name_score || Number(b.open_now)-Number(a.open_now) || Date.parse(a.stops[0]?.starts_at ?? '9999-01-01')-Date.parse(b.stops[0]?.starts_at ?? '9999-01-01') || (a.distance_miles ?? Infinity)-(b.distance_miles ?? Infinity) || a.truck.name.localeCompare(b.truck.name)).slice(0,p.limit);
}
