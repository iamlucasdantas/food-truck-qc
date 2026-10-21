import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ingestPost, type IngestCtx } from './facebook.server';
const { venue, webhook } = vi.hoisted(() => ({ venue: vi.fn(), webhook: vi.fn() }));
vi.mock('./venues.server', () => ({ resolveVenue: venue }));
vi.mock('./owner-webhook.server', () => ({ postOwnerWebhook: webhook }));
describe('scraper listing creation', () => {
  let inserted: Record<string, unknown>[];
  let ctx: IngestCtx;
  const post = { url: 'https://www.facebook.com/mexies/posts/123', inputUrl: 'https://www.facebook.com/mexies', text: 'Our food truck is serving tacos at Market on October 21, 11am–2pm', time: '2026-10-18T18:00:00Z', author: 'Mexies Food Truck' };
  beforeEach(() => {
    inserted = [];
    process.env['LOVABLE_API_KEY'] = 'test-only';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ choices: [{ message: { content: JSON.stringify({ menu: [], stops: [{ truck_name: 'Mexies Food Truck', is_food_truck: true, date: '2026-10-21', start: '11:00', end: '14:00', venue: 'Market', address: '', city: 'DeWitt', confidence: 0.95 }] }) } }] }))));
    venue.mockResolvedValue({ name: 'Market', address: '911 11th St, DeWitt IA', city: 'DeWitt', lat: 41.8258374, lng: -90.5442848, check: false });
    webhook.mockReset();
    const db = { from: (table: string) => {
      const q: Record<string, any> = {};
      for (const method of ['select', 'eq', 'neq', 'lt', 'gt', 'limit', 'is']) q[method] = () => q;
      q['upsert'] = (row: Record<string, unknown>) => { inserted.push({table, ...row}); return q; };
      q['insert'] = (row: Record<string, unknown>) => { inserted.push({table, ...row}); return q; };
      q['then'] = (resolve: (v: unknown) => unknown) => Promise.resolve({data:table === 'trucks' ? [{id:'social-mexiesfoodtruck'}] : [],count:0,error:null}).then(resolve);
      return q;
    } };
    ctx = { db: db as unknown as IngestCtx['db'], trucks: [], bizByOwner: new Map(), today: '2026-10-18', runId: null };
  });
  it('stores the evidenced address and Facebook category on the shared truck', async () => {
    const result = await ingestPost(ctx, 'page', post, null);
    expect(inserted.find(r => r['table'] === 'trucks')).toMatchObject({id:'social-mexiesfoodtruck',base_address:'911 11th St, DeWitt IA',category:'Mexican',truck_type:'mobile',status:'pending'});
    expect(result[0]?.truckId).toBe('social-mexiesfoodtruck');
    expect(inserted.find(r => r['table'] === 'suggested_stops')?.['truck_id']).toBe('social-mexiesfoodtruck');
  });
  it('does not create a truck without an address', async () => {
    venue.mockResolvedValue(null);
    expect((await ingestPost(ctx, 'page', post, null))[0]?.status).toBe('no-address');
    expect(inserted).toEqual([]);
  });
  it('does not invent a category from a group host post', async () => {
    expect((await ingestPost(ctx, 'group', {...post,inputUrl:'https://www.facebook.com/groups/123'}, null))[0]?.status).toBe('no-category');
    expect(inserted).toEqual([]);
  });
  it('reuses the existing pending truck across posts', async () => {
    ctx.trucks.push({id:'existing-mexies',name:'Mexies Food Truck',claimed_by:null,phone:null,facebook:null,instagram:null,reddit:null});
    expect((await ingestPost(ctx, 'page', post, null))[0]?.truckId).toBe('existing-mexies');
    expect(inserted.some(r => r['table'] === 'trucks')).toBe(false);
  });
  it('publishes an own Facebook post when another feed already covers the same outing', async () => {
    const truck = { id: 'existing-mexies', name: 'Mexies Food Truck', claimed_by: null, phone: null, facebook: post.inputUrl, instagram: null, reddit: null };
    ctx.trucks.push(truck);
    const result = await ingestPost(ctx, 'page', post, truck);
    expect(result[0]?.status).toBe('published');
    expect(inserted.find(r => r['table'] === 'stops')).toMatchObject({ source: 'own_post', source_url: post.url, starts_at: '2026-10-21T16:00:00.000Z', ends_at: '2026-10-21T19:00:00.000Z' });
  });
});