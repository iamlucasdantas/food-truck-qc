import { useEffect, useRef } from "react";
import { useNavigate, useRouter } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useFavorites } from "@/hooks/use-favorites";
import { useProfile } from "@/hooks/use-profile";
import { useTrucks } from "@/lib/queries";
import { syncCrmContact, notifyCrmLiveAlert } from "@/lib/crm.functions";
import type { Stop } from "@/data/trucks";

/** In-app toast when a favorited truck checks in live; also returns users to their page after Google sign-in. */
export function LiveAlerts() {
  const { user } = useAuth();
  const { ids } = useFavorites();
  const { data: profile } = useProfile();
  const { data: trucks = [] } = useTrucks();
  const navigate = useNavigate();
  const router = useRouter();
  const ctx = useRef({ ids, trucks, on: true });
  ctx.current = { ids, trucks, on: profile?.notify_favorites ?? true };
  const seen = useRef(new Set<string>());
  const crmSyncTried = useRef(false);

  // Add every new user to the owner's HighLevel CRM (once per account).
  useEffect(() => {
    if (!user || crmSyncTried.current) return;
    const synced = (profile as { crm_synced_at?: string | null } | null)?.crm_synced_at;
    if (profile && synced) { crmSyncTried.current = true; return; }
    crmSyncTried.current = true;
    void syncCrmContact();
  }, [user, profile]);

  useEffect(() => {
    if (!user) return;
    const ch = supabase.channel(`fav-live-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "stops" }, (p) => {
        const s = p.new as Partial<Stop>;
        if (!s?.id || !s.is_live || s.cancelled || !s.truck_id || seen.current.has(s.id)) return;
        if (!ctx.current.on || !ctx.current.ids.includes(s.truck_id)) return;
        if (s.ends_at && new Date(s.ends_at) < new Date()) return;
        seen.current.add(s.id);
        const t = ctx.current.trucks.find((x) => x.id === s.truck_id);
        const name = t?.name ?? "A favorite truck";
        toast(`${name} is now open${s.venue_name ? ` at ${s.venue_name}` : ""}`, {
          duration: 10000,
          action: { label: "View", onClick: () => void navigate({ to: "/truck/$id", params: { id: s.truck_id! } }) },
        });
        // Ask HighLevel to send the "favorite truck is live" email.
        void notifyCrmLiveAlert({ data: { truckName: name, truckId: s.truck_id, venue: s.venue_name ?? null, endsAt: s.ends_at ?? null } });
      })
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [user, navigate]);

  // Return to the page the user was on before Google sign-in.
  useEffect(() => {
    if (!user) return;
    let to: string | null = null;
    try { to = sessionStorage.getItem("ftqc:returnTo"); sessionStorage.removeItem("ftqc:returnTo"); } catch { /* ignore */ }
    if (to && to.startsWith("/") && !to.startsWith("//") && to !== router.state.location.href) void router.history.push(to);
  }, [user, router]);

  return null;
}
