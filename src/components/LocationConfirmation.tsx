import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, MapPin } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { locationVerified } from '@/data/location-confirmation';
import type { Truck } from '@/data/trucks';

export function LocationConfirmation({ truck, admin = false }: { truck: Truck; admin?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [google, setGoogle] = useState(false);
  const qc = useQueryClient();
  const valid = Boolean(truck.base_address?.trim() && truck.base_lat != null && truck.base_lng != null);
  async function confirm() {
    setBusy(true);
    const { error } = await supabase.rpc('confirm_truck_location', { _truck_id: truck.id, _google_verified: admin && google });
    setBusy(false);
    if (error) { toast.error(error.message); return; }
    toast.success('Location verified');
    for (const queryKey of [['trucks'], ['truck', truck.id], ['admin'], ['me']]) void qc.invalidateQueries({ queryKey });
  }
  if (!truck.base_address) return null;
  return <section className="space-y-3 border-t border-border py-4">
    <h3 className="flex items-center gap-2 font-semibold"><MapPin className="h-4 w-4" />Base location</h3>
    <p className="break-words text-sm">{truck.base_address}</p>
    <p className="text-sm text-muted-foreground">{locationVerified(truck) ? 'Location verified' : 'Location awaiting confirmation'}</p>
    {admin && !truck.google_location_verified && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={google} onChange={e => setGoogle(e.target.checked)} />Verified on Google</label>}
    {(!locationVerified(truck) || (admin && google)) && <Button type="button" variant="outline" disabled={busy || !valid} onClick={() => void confirm()}><CheckCircle2 className="h-4 w-4" />{busy ? 'Confirming…' : 'Confirm location'}</Button>}
    {!valid && <p className="text-sm text-muted-foreground">Save this address with map coordinates before confirming.</p>}
  </section>;
}