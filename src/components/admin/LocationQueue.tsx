import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { LocationConfirmation } from '@/components/LocationConfirmation';
export function LocationQueue() {
  const { data = [], isLoading, error } = useQuery({ queryKey: ['admin', 'locations'], queryFn: async () => {
    const { data, error } = await supabase.from('trucks').select('*').eq('is_food_truck', true).is('deleted_at', null).eq('google_location_verified', false).is('base_location_confirmed_at', null).not('base_address', 'is', null).order('name').limit(1000);
    if (error) throw error;
    return data;
  } });
  return <details className="border-y border-border py-3"><summary className="cursor-pointer font-semibold">Locations awaiting confirmation ({data.length})</summary>
    {isLoading && <p className="py-3 text-sm">Loading…</p>}{error && <p className="py-3 text-sm text-destructive">{error.message}</p>}
    <div className="max-h-96 overflow-y-auto">{data.map(t => <div key={t.id} className="py-3"><h3 className="font-semibold">{t.name}</h3><LocationConfirmation truck={t} admin /></div>)}</div>
  </details>;
}