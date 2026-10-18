import { describe, expect, it } from 'vitest';
import { canAutoConfirmGoogleAddress, googleStatusPatch } from './google-profile';
describe('Google fixed-truck evidence', () => {
  const truck = {truck_type:'fixed',is_food_truck:true,google_place_id:'real-place'};
  const profile = {id:'real-place',address:'1218 N Brady St, Davenport, IA',lat:41.5324,lng:-90.5744};
  it('automatically confirms a matched fixed food-truck address', () => expect(canAutoConfirmGoogleAddress(truck,profile)).toBe(true));
  it('does not confirm unmatched or incomplete profiles', () => { expect(canAutoConfirmGoogleAddress(truck,{...profile,id:'different'})).toBe(false); expect(canAutoConfirmGoogleAddress(truck,{...profile,address:''})).toBe(false); expect(canAutoConfirmGoogleAddress({...truck,truck_type:'mobile'},profile)).toBe(false); });
  it('archives temporary closures without deletion', () => expect(googleStatusPatch('CLOSED_TEMPORARILY')).toEqual({google_business_status:'CLOSED_TEMPORARILY',status:'archived'}));
  it('archives permanent closures without deletion', () => expect(googleStatusPatch('CLOSED_PERMANENTLY')).toEqual({google_business_status:'CLOSED_PERMANENTLY',status:'archived'}));
  it('operational outside opening hours stays active; unknown evidence changes nothing', () => { expect(googleStatusPatch('OPERATIONAL')).toEqual({google_business_status:'OPERATIONAL'}); expect(googleStatusPatch(undefined)).toEqual({}); expect(googleStatusPatch(false)).toEqual({}); });
});