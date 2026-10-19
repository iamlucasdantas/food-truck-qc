import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { CalendarDays, RefreshCw, Plus, Link2, X } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { saveVenueCalendar, syncVenueCalendarNow, decideCalendarTitle } from '@/lib/venue-calendar.functions';
import { SectionHeader, EmptyState, ListSkeleton } from './ui';

export function CalendarSources() {
  const qc = useQueryClient();
  const save = useServerFn(saveVenueCalendar), sync = useServerFn(syncVenueCalendarNow), decide = useServerFn(decideCalendarTitle);
  const [adding, setAdding] = useState(false), [busy, setBusy] = useState<string | null>(null);
  const [form, setForm] = useState({ name: '', address: '', url: '', timezone: 'America/Chicago' });
  const [links, setLinks] = useState<Record<string, string>>({});
  const { data, isLoading, error } = useQuery({ queryKey: ['admin', 'venue-calendars'], queryFn: async () => {
    const [sources, titles, trucks] = await Promise.all([
      supabase.from('venue_calendar_sources').select('*').order('name'),
      supabase.from('venue_calendar_titles').select('*').order('title'),
      supabase.from('trucks').select('id,name').eq('status', 'active').eq('is_food_truck', true).is('deleted_at', null).order('name'),
    ]);
    if (sources.error || titles.error || trucks.error) throw Error(sources.error?.message ?? titles.error?.message ?? trucks.error?.message);
    return { sources: sources.data ?? [], titles: (titles.data ?? []).filter(t => Array.isArray(t.occurrences) && t.occurrences.length > 0), trucks: trucks.data ?? [] };
  } });
  const action = async (key: string, run: () => Promise<unknown>) => {
    setBusy(key);
    try { await run(); toast.success('Calendar updated'); await qc.invalidateQueries(); }
    catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    finally { setBusy(null); }
  };
  return <>
    <SectionHeader title="Calendar sources" actions={<Button variant="outline" onClick={() => setAdding(!adding)}><Plus />Add source</Button>} />
    {adding && <form className="grid gap-4 border-y border-border py-5 sm:grid-cols-2" onSubmit={e => {
      e.preventDefault(); void action('save', async () => { const source = await save({ data: form }); await sync({ data: { id: source.id } }); setAdding(false); });
    }}>
      {(['name', 'address', 'url', 'timezone'] as const).map(key => <label key={key} className="min-w-0 text-sm font-medium">{{ name: 'Venue name', address: 'Street address', url: 'ICS URL', timezone: 'Timezone' }[key]}
        <input required type={key === 'url' ? 'url' : 'text'} className="field mt-1 w-full" value={form[key]} onChange={e => setForm({ ...form, [key]: e.target.value })} />
      </label>)}
      <div className="flex gap-2"><Button disabled={!!busy} type="submit">Save and sync</Button><Button variant="ghost" type="button" onClick={() => setAdding(false)}>Cancel</Button></div>
    </form>}
    {isLoading ? <ListSkeleton /> : error ? <p className="text-destructive">{error.message}</p> : !data?.sources.length ? <EmptyState icon={CalendarDays} title="No calendar sources" /> : <div className="divide-y divide-border">
      {data.sources.map(s => <section key={s.id} className="flex flex-wrap items-start justify-between gap-4 py-5">
        <div className="min-w-0"><h2 className="font-semibold">{s.name}</h2><p className="text-sm text-muted-foreground">{s.address}</p>
          <p className="mt-2 text-sm">{s.imported} imported · {s.ignored} ignored · {s.in_review} titles in review</p>
          <p className="mt-1 text-xs text-muted-foreground">{s.timezone} · Every 6 hours · {s.last_sync_at ? `Last sync ${new Date(s.last_sync_at).toLocaleString()}` : 'Not synced yet'}</p>
          {s.last_error && <p className="mt-2 text-sm text-destructive">{s.last_error}</p>}
        </div>
        <Button variant="outline" disabled={!!busy} onClick={() => void action(s.id, () => sync({ data: { id: s.id } }))}><RefreshCw className={busy === s.id ? 'animate-spin motion-reduce:animate-none' : ''} />Sync now</Button>
      </section>)}
    </div>}
    <h2 className="text-lg font-semibold">Vendor title review</h2>
    {data && !data.titles.length && <EmptyState icon={CalendarDays} title="No titles waiting" />}
    <div className="divide-y divide-border">{data?.titles.map(t => {
      const key = `${t.source_id}:${t.title_key}`, selected = links[key] ?? '';
      return <section key={key} className="space-y-3 py-4">
        <div><h3 className="font-medium">{t.title}</h3><p className="text-xs text-muted-foreground">{data.sources.find(s => s.id === t.source_id)?.name} · {Array.isArray(t.occurrences) ? t.occurrences.length : 0} upcoming events</p></div>
        <div className="flex flex-wrap gap-2">
          <select aria-label={`Truck for ${t.title}`} className="field min-w-0 max-w-full sm:w-72" value={selected} onChange={e => setLinks({ ...links, [key]: e.target.value })}><option value="">Select an approved truck</option>{data.trucks.map(truck => <option key={truck.id} value={truck.id}>{truck.name}</option>)}</select>
          <Button disabled={!!busy || !selected} onClick={() => void action(key, () => decide({ data: { id: t.source_id, key: t.title_key, truckId: selected } }))}><Link2 />Link title</Button>
          <Button variant="outline" disabled={!!busy} onClick={() => void action(key, () => decide({ data: { id: t.source_id, key: t.title_key, truckId: null } }))}><X />Ignore</Button>
        </div>
      </section>;
    })}</div>
  </>;
}