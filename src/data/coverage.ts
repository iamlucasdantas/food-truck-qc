import { milesBetween } from './trucks';

export const DAVENPORT_CENTER = { lat: 41.5236, lng: -90.5776 };
export const REGION_RADIUS_MILES = 75;
export const inServiceRegion = (lat: number, lng: number) => Number.isFinite(lat) && Number.isFinite(lng) && milesBetween(DAVENPORT_CENTER, { lat, lng }) <= REGION_RADIUS_MILES;
export const mapRadius = (value: unknown) => {
  const n = Number(value);
  return Number.isFinite(n) && n >= 1 && n <= REGION_RADIUS_MILES ? Math.round(n) : REGION_RADIUS_MILES;
};
// Multiple bounded city searches cover the region; coordinates enforce the actual circular boundary.
export const DISCOVERY_CITIES = ['Davenport, IA', 'Bettendorf, IA', 'Rock Island, IL', 'Moline, IL', 'East Moline, IL', 'Muscatine, IA', 'Clinton, IA', 'Iowa City, IA', 'Coralville, IA', 'Burlington, IA', 'Galesburg, IL', 'Kewanee, IL', 'Sterling, IL', 'Rock Falls, IL', 'Maquoketa, IA', 'Dubuque, IA', 'Galena, IL', 'Geneseo, IL', 'DeWitt, IA', 'Tipton, IA', 'Washington, IA', 'Mount Pleasant, IA', 'Anamosa, IA', 'Monmouth, IL'];