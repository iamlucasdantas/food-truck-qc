export const UPCOMING_LIMIT = 5;
export function chicagoDay(iso: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}
export function upcomingStops<T extends { starts_at: string; ends_at: string; cancelled: boolean }>(stops: T[], now: number): T[] {
  return stops.filter(s => !s.cancelled && Date.parse(s.ends_at) > now).sort((a,b) => Date.parse(a.starts_at) - Date.parse(b.starts_at));
}
export function calendarDate(iso: string): Date {
  const [year = 2026, month = 1, day = 1] = chicagoDay(iso).split('-').map(Number);
  return new Date(year, month - 1, day);
}