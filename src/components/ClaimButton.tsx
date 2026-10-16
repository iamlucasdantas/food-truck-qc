import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";

export function ClaimButton({ truckId }: { truckId: string }) {
  const { user, openAuth } = useAuth();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [msg, setMsg] = useState("");
  const key = ["me", "claim", truckId, user?.id];
  const { data: claim } = useQuery({
    queryKey: key, enabled: !!user,
    queryFn: async () => (await supabase.from("claims").select("status").eq("truck_id", truckId).eq("user_id", user!.id).order("created_at", { ascending: false }).limit(1).maybeSingle()).data,
  });

  if (claim?.status === "pending") return <p className="panel p-4 text-sm">Your claim is pending review.</p>;

  async function submit() {
    const { error } = await supabase.from("claims").insert({ truck_id: truckId, user_id: user!.id, user_email: user!.email ?? null, message: msg });
    if (error) return void toast.error(error.message);
    toast.success("Claim sent — review usually takes a day or two.");
    setOpen(false);
    void qc.invalidateQueries({ queryKey: key });
  }

  if (!open) return (
    <button onClick={() => (user ? setOpen(true) : openAuth("Sign in to claim your truck."))} className="chip">
      Is this your truck? Claim it
    </button>
  );
  return (
    <div className="panel space-y-2 p-4">
      <p className="text-sm font-semibold">Tell us how to verify you own this truck</p>
      <textarea className="field" rows={3} placeholder="e.g. I'm the owner — reach me at the truck's phone or Instagram" value={msg} onChange={(e) => setMsg(e.target.value)} />
      <div className="flex gap-2">
        <button onClick={submit} className="chip bg-primary text-primary-foreground">Send claim</button>
        <button onClick={() => setOpen(false)} className="chip">Cancel</button>
      </div>
    </div>
  );
}
