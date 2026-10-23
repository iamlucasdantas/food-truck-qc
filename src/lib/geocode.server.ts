export type GeocodedAddress = { lat: number; lng: number; label: string; city: string };

const cache = new Map<string, { value: GeocodedAddress; expires: number }>();
const pending = new Map<string, Promise<GeocodedAddress>>();
let osmQueue: Promise<unknown> = Promise.resolve();
let lastOsmRequest = 0;

function validPoint(lat: number, lng: number) {
  return Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180;
}
function safeMessage(value: string) {
  let text = value;
  for (const name of ['GOOGLE_MAPS_API_KEY', 'LOVABLE_API_KEY', 'GOOGLE_API_KEY']) {
    const secret = process.env[name];
    if (secret) text = text.replaceAll(secret, '[redacted]');
  }
  return text.replace(/([?&]key=)[^&\s"<>]+/gi, '$1[redacted]');
}
async function readResponse(provider: string, url: string, headers: HeadersInit) {
  const response = await fetch(url, { headers, redirect: 'manual', signal: AbortSignal.timeout(8000) });
  const body = safeMessage(await response.text());
  // Keep the raw provider response on the server, never credentials/request headers.
  console.info(`[geocode] ${provider} HTTP ${response.status}: ${body}`);
  if (!response.ok) throw Error(`${provider} HTTP ${response.status}: ${body.slice(0, 500)}`);
  try { return { status: response.status, data: JSON.parse(body) }; }
  catch { throw Error(`${provider} HTTP ${response.status}: invalid JSON response`); }
}

async function google(address: string): Promise<GeocodedAddress> {
  const key = process.env['GOOGLE_MAPS_API_KEY'], auth = process.env['LOVABLE_API_KEY'];
  if (!key || !auth) throw Error('Google Geocoding: server connector credentials missing');
  const query = new URLSearchParams({ address, components: 'country:US', region: 'us' });
  const { status, data } = await readResponse('Google Geocoding', `https://connector-gateway.lovable.dev/google_maps/maps/api/geocode/json?${query}`, {
    Authorization: `Bearer ${auth}`, 'X-Connection-Api-Key': key,
  });
  if (data.status !== 'OK') throw Error(`Google Geocoding HTTP ${status}, ${data.status ?? 'UNKNOWN'}: ${data.error_message ?? 'No matching address'}`);
  const hit = data.results?.[0], pos = hit?.geometry?.location;
  if (!pos || !validPoint(pos.lat, pos.lng)) throw Error('Google Geocoding: invalid or missing coordinates');
  const city = hit.address_components?.find((c: { types: string[] }) => c.types.includes('locality'))?.long_name
    ?? hit.address_components?.find((c: { types: string[] }) => c.types.includes('postal_town'))?.long_name ?? '';
  return { lat: pos.lat, lng: pos.lng, label: hit.formatted_address ?? address, city };
}

async function nominatim(address: string): Promise<GeocodedAddress> {
  const work = osmQueue.catch(() => undefined).then(async () => {
    const wait = Math.max(0, lastOsmRequest + 1100 - Date.now());
    if (wait) await new Promise((resolve) => setTimeout(resolve, wait));
    lastOsmRequest = Date.now();
    const query = new URLSearchParams({ format: 'json', limit: '1', addressdetails: '1', countrycodes: 'us', q: address });
    const { status, data } = await readResponse('Nominatim', `https://nominatim.openstreetmap.org/search?${query}`, {
      Accept: 'application/json', 'User-Agent': 'FoodTruckQC/1.0 (https://app.foodtruckqc.com; foodtruckqc@gmail.com)',
    });
    const hit = Array.isArray(data) ? data[0] : undefined;
    if (!hit) throw Error(`Nominatim HTTP ${status}: ZERO_RESULTS`);
    const lat = Number(hit.lat), lng = Number(hit.lon);
    if (!validPoint(lat, lng)) throw Error(`Nominatim HTTP ${status}: invalid coordinates`);
    const a = hit.address ?? {};
    return { lat, lng, label: hit.display_name ?? address, city: a.city ?? a.town ?? a.village ?? '' };
  });
  osmQueue = work;
  return work;
}

/** Auth is enforced by each caller before entering this server-only helper. */
export async function geocodeAddress(input: string): Promise<GeocodedAddress> {
  const address = input.trim();
  if (address.length < 3 || address.length > 500) throw Error('Enter an address between 3 and 500 characters');
  const key = address.toLowerCase().replace(/\s+/g, ' ');
  const cached = cache.get(key);
  if (cached && cached.expires > Date.now()) return cached.value;
  const existing = pending.get(key);
  if (existing) return existing;
  const task = (async () => {
    const failures: string[] = [];
    for (const provider of [google, nominatim]) {
      try {
        const value = await provider(address);
        if (cache.size >= 500) { const oldest = cache.keys().next().value; if (oldest) cache.delete(oldest); }
        cache.set(key, { value, expires: Date.now() + 24 * 60 * 60 * 1000 });
        return value;
      } catch (e) {
        const message = safeMessage(e instanceof Error ? e.message : String(e));
        failures.push(message); console.error(`[geocode] ${provider.name}: ${message}`);
      }
    }
    throw Error(`Address lookup failed. ${failures.join(' | ')}`);
  })();
  pending.set(key, task);
  try { return await task; } finally { pending.delete(key); }
}