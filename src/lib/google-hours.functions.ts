import { createServerFn } from '@tanstack/react-start';
import { z } from 'zod';
import { requireSupabaseAuth } from '@/integrations/supabase/auth-middleware';
import { googleHours, mobileEvidence } from '@/data/google-hours';
import type { Json } from '@/integrations/supabase/types';
import { canAutoConfirmGoogleAddress, googleStatusPatch } from '@/data/google-profile';

/** Explicit admin refresh only. Public searches read saved hours without calling Google. */
export const refreshGoogleHours = createServerFn({ method: 'POST' })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ truckIds: z.array(z.string().min(1).max(150)).min(1).max(10) }).parse(input))
  .handler(async ({ data, context }) => {
    const { data: admin } = await context.supabase.rpc('has_role', { _user_id: context.userId, _role: 'admin' });
    if (!admin) throw Error('Forbidden');
    const lovable = process.env['LOVABLE_API_KEY'], maps = process.env['GOOGLE_MAPS_API_KEY'];
    if (!lovable || !maps) throw Error('Google Maps connection is not configured');
    const { data: trucks, error } = await context.supabase.from('trucks').select('id,name,description,is_food_truck,truck_type,google_place_id,base_address').in('id', [...new Set(data.truckIds)]).is('deleted_at', null);
    if (error) throw Error(error.message);
    const results: { id: string; name: string; hours: string[]; included: boolean; addressConfirmed?: boolean; businessStatus?: string; error?: string }[] = [];
    for (const t of trucks ?? []) {
      if (!t.google_place_id) { results.push({ id: t.id, name: t.name, hours: [], included: t.is_food_truck, error: 'No Google Place ID saved' }); continue; }
      const response = await fetch(`https://connector-gateway.lovable.dev/google_maps/places/v1/places/${encodeURIComponent(t.google_place_id)}`, {
        signal: AbortSignal.timeout(8000), headers: { Authorization: `Bearer ${lovable}`, 'X-Connection-Api-Key': maps, 'X-Goog-FieldMask': 'id,displayName,types,primaryType,regularOpeningHours,businessStatus,formattedAddress,location' },
      });
      if (!response.ok) {
        const body = await response.text();
        console.error(`Google hours refresh failed [${response.status}]: ${body}`);
        if (response.status === 403) {
          let reason = '';
          try { reason = (JSON.parse(body).error?.details ?? []).find((d: { reason?: string }) => d.reason)?.reason ?? ''; } catch { /* preserve provider error */ }
          if (reason === 'API_KEY_HTTP_REFERRER_BLOCKED') throw Error('Google Maps server key is referrer-restricted. Set its application restrictions to None or IP addresses in Google Cloud Console.');
          if (reason === 'API_KEY_SERVICE_BLOCKED') throw Error('Google Maps server key does not allow Places API (New). Add it to the allowed APIs in Google Cloud Console.');
        }
        throw Error(`Google Places refresh failed [${response.status}]: ${body}`);
      }
      const p = await response.json() as { id?: string; types?: string[]; primaryType?: string; regularOpeningHours?: unknown; businessStatus?: string; formattedAddress?: string; location?: {latitude:number;longitude:number}; displayName?: { text?: string } };
      if (p.id !== t.google_place_id) throw Error('Google returned a different profile; no changes saved');
      const types = [...new Set([...(p.types ?? []), ...(p.primaryType ? [p.primaryType] : [])])];
      const included = t.is_food_truck || mobileEvidence(t.name, t.description, types);
      const hours = googleHours(p.regularOpeningHours);
      const snapshot = p.regularOpeningHours && typeof p.regularOpeningHours === 'object' ? p.regularOpeningHours as Json : null;
      const addressConfirmed = canAutoConfirmGoogleAddress({...t,is_food_truck:included}, {id:p.id,address:p.formattedAddress,lat:p.location?.latitude,lng:p.location?.longitude});
      const { error: saveError } = await context.supabase.from('trucks').update({ google_types: types, google_regular_hours: hours ? snapshot : null, google_hours_updated_at: new Date().toISOString(), is_food_truck: included, ...googleStatusPatch(p.businessStatus), ...(addressConfirmed ? {base_address:p.formattedAddress,base_lat:p.location?.latitude,base_lng:p.location?.longitude} : {}) }).eq('id', t.id);
      if (saveError) throw Error(saveError.message);
      if (addressConfirmed) {
        const {error: confirmError} = await context.supabase.rpc('confirm_truck_location',{_truck_id:t.id,_google_verified:false});
        if (confirmError) throw Error(confirmError.message);
      }
      const descriptions = p.regularOpeningHours && typeof p.regularOpeningHours === 'object' && 'weekdayDescriptions' in p.regularOpeningHours && Array.isArray(p.regularOpeningHours.weekdayDescriptions) ? p.regularOpeningHours.weekdayDescriptions.filter((s): s is string => typeof s === 'string') : [];
      results.push({ id: t.id, name: t.name, included, hours: descriptions, addressConfirmed, businessStatus:p.businessStatus });
    }
    return results;
  });