import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { claimSuggestedTruck, suggestMyTrucks } from "@/lib/claims.functions";

const KEY = "ftqc-claim-dismissed";

/** "Is this your truck?" cards for unclaimed trucks that probably belong to the signed-in owner. */
export function ClaimSuggestions({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const suggest = useServerFn(suggestMyTrucks);
  const claim = useServerFn(claimSuggestedTruck);
  const [hidden, setHidden] = useState<string[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { try { setHidden(JSON.parse(localStorage.getItem(KEY) ?? "[]")); } catch { /* ignore */ } }, []);
  const { data } = useQuery({ queryKey: ["me", "claim-suggestions", userId], queryFn: () => suggest(), staleTime: 60_000 });
  const items = (data?.items ?? []).filter((i) => !hidden.includes(i.id));
  if (!items.length) return null;

  const dismiss = (id: string) => {
    const next = [...hidden, id];
    setHidden(next);
    localStorage.setItem(KEY, JSON.stringify(next));
  };
  async function onClaim(id: string) {
    setBusy(id);
    const r = await claim({ data: { truckId: id } }).catch(() => ({ ok: false as const, error: "Couldn't send the claim. Try again." }));
    setBusy(null);
    if (!r.ok) return void toast.error(r.error);
    toast.success(r.linked ? "Linked — you can set it up while it's in review." : "Claim sent — an admin reviews it, usually within a day or two.");
    void qc.invalidateQueries({ queryKey: ["me"] });
  }

  return (
    <section className="space-y-2" aria-label="Trucks that may be yours">
      {items.map((t) => (
        <div key={t.id} className="panel space-y-3 p-4">
          <p className="text-lg font-bold">Is this your truck?</p>
          <div className="flex items-center gap-3">
            <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl bg-muted text-3xl">
              {t.cover ? <img src={t.cover} alt="" className="h-full w-full object-cover" /> : <span aria-hidden>{t.emoji}</span>}
            </span>
            <div className="min-w-0">
              <p className="truncate font-bold">{t.name}</p>
              <p className="truncate text-sm text-muted-foreground">{[t.category, t.city].filter(Boolean).join(" · ") || "Quad Cities"}</p>
              <p className="text-xs text-muted-foreground">{t.reasons.join(" · ")}</p>
            </div>
          </div>
          {!data?.emailConfirmed && <p className="text-sm">Confirm your email first — the link is in your inbox.</p>}
          <div className="flex flex-wrap gap-2">
            <button disabled={busy === t.id || !data?.emailConfirmed} onClick={() => void onClaim(t.id)} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-primary-foreground disabled:opacity-60">
              {busy === t.id ? "Sending…" : "Claim this truck"}
            </button>
            <button onClick={() => dismiss(t.id)} className="chip min-h-11">No, create a new one</button>
          </div>
        </div>
      ))}
    </section>
  );
}
