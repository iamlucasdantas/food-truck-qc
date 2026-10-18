import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useServerFn } from '@tanstack/react-start';
import { RefreshCw, Clock } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { refreshGoogleHours } from '@/lib/google-hours.functions';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { googleHours, weeklyHoursLabels } from '@/data/google-hours';

export function GoogleHours() {
  const qc = useQueryClient(), refresh = useServerFn(refreshGoogleHours);
  const [selected, setSelected] = useState<string[]>([]), [busy, setBusy] = useState(false);
  const { data: trucks = [] } = useQuery({ queryKey: ['admin', 'google-hours'], queryFn: async () => {
    const { data, error } = await supabase.from('trucks').select('id,name,is_food_truck,truck_type,google_types,google_regular_hours,google_hours_updated_at,google_business_status,base_location_confirmed_at,base_address').eq('is_food_truck',true).eq('truck_type','fixed').not('google_place_id', 'is', null).is('deleted_at', null).order('name');
    if (error) throw error; return data;
  } });
  const run = async () => {
    setBusy(true);
    try { await refresh({ data: { truckIds: selected } }); setSelected([]); await Promise.all(['trucks', 'stops', 'admin'].map(k => qc.invalidateQueries({ queryKey: [k] }))); toast.success('Google addresses, status and hours refreshed'); }
    catch (e) { toast.error(e instanceof Error ? e.message : 'Refresh failed'); }
    finally { setBusy(false); }
  };
  return <section className="space-y-3 border-t pt-5">
    <div className="flex flex-wrap items-center justify-between gap-3"><h3 className="flex items-center gap-2 font-semibold"><Clock className="h-4 w-4" />Stationary trucks · Google hours</h3><Button variant="outline" disabled={busy || !selected.length} onClick={() => void run()}><RefreshCw className={busy ? 'h-4 w-4 animate-spin' : 'h-4 w-4'} />Refresh selected ({selected.length}/10)</Button></div>
    <p className="text-sm text-muted-foreground">Select stationary truck/trailer/cart locations only. Google Places usage charges may apply. America/Chicago weekly hours.</p>
    <div className="max-h-96 overflow-auto divide-y">
      {trucks.map(t => <label key={t.id} className="flex gap-3 py-3 text-sm"><Checkbox aria-label={`Select ${t.name}`} checked={selected.includes(t.id)} disabled={busy || (selected.length >= 10 && !selected.includes(t.id))} onCheckedChange={v => setSelected(s => v ? [...s, t.id] : s.filter(id => id !== t.id))} /><span className="min-w-0 flex-1"><span className="font-semibold">{t.name}</span><span className="ml-2 text-xs text-muted-foreground">{t.google_business_status ?? 'Status not checked'}</span><span className="block text-muted-foreground">{t.base_address} · {t.base_location_confirmed_at ? 'Address confirmed' : 'Address awaiting confirmation'}</span><span className="block text-xs">{t.google_types.join(', ') || 'Google category not imported'}</span><span className="block text-xs text-muted-foreground">{googleHours(t.google_regular_hours)?.periods.length ? weeklyHoursLabels(t.google_regular_hours).join(' · ') : t.google_hours_updated_at ? 'No Google hours · usual spot' : 'Hours not imported yet'}</span></span></label>)}
    </div>
  </section>;
}