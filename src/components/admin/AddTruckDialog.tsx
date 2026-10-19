import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Loader2, Search, AlertTriangle } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { lookupTruck, createTruckFromDraft, type TruckDraft } from "@/lib/add-truck.functions";
import type { DupMatch } from "@/data/duplicates";
import { btn } from "./ui";

const FIELDS: [keyof TruckDraft, string][] = [
  ["name", "Name"], ["category", "Category (from Google/Facebook)"], ["base_address", "Address"], ["phone", "Phone"],
  ["website", "Website"], ["facebook", "Facebook"], ["instagram", "Instagram"],
];

export function AddTruckDialog({ open, onOpenChange, categories, onOpenTruck }: { open: boolean; onOpenChange: (o: boolean) => void; categories: string[]; onOpenTruck: (id: string) => void }) {
  const qc = useQueryClient();
  const lookup = useServerFn(lookupTruck), create = useServerFn(createTruckFromDraft);
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [draft, setDraft] = useState<TruckDraft | null>(null);
  const [dups, setDups] = useState<DupMatch[]>([]);
  const reset = () => { setQuery(""); setDraft(null); setDups([]); };

  async function find() {
    setBusy(true);
    try { const r = await lookup({ data: { query } }); setDraft(r.draft); setDups(r.duplicates); }
    catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }
  async function save(allowDuplicate = false) {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await create({ data: { draft, allowDuplicate } });
      if (r.duplicates) { setDups(r.duplicates); toast.warning("Possible duplicate — review before saving."); return; }
      toast.success(r.status === "active" ? "Truck added to the map" : "Truck saved to Pending (needs address/category)", { description: "Its social pages are now scan sources." });
      void qc.invalidateQueries(); onOpenChange(false); reset(); if (r.id) onOpenTruck(r.id);
    } catch (e) { toast.error((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Add a truck</DialogTitle>
          <DialogDescription>Paste a Facebook or Instagram link, or type the truck name. We'll look it up with Apify and check for duplicates.</DialogDescription>
        </DialogHeader>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); void find(); }}>
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="facebook.com/yourtruck or Truck name" aria-label="Link or name"
            className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
          <button className={btn.primary} disabled={busy || query.trim().length < 2}>{busy && !draft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}Find</button>
        </form>
        {busy && !draft && <p className="text-sm text-muted-foreground">Looking it up — this can take up to a minute…</p>}

        {dups.length > 0 && (
          <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm" role="alert">
            <p className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-destructive" />Possible duplicate{dups.length > 1 ? "s" : ""}</p>
            <ul className="mt-2 space-y-1">
              {dups.slice(0, 5).map((d) => (
                <li key={d.id} className="flex items-center justify-between gap-2">
                  <span className="min-w-0 truncate"><span className="font-medium">{d.name}</span> <span className="text-muted-foreground">· {d.reasons.join(", ")}{d.status ? ` · ${d.status}` : ""}</span></span>
                  <button type="button" className="shrink-0 text-primary hover:underline" onClick={() => { onOpenChange(false); reset(); onOpenTruck(d.id); }}>Open</button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {draft && (
          <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); void save(false); }}>
            {draft.found_with && <p className="text-xs text-muted-foreground">Found with {draft.found_with}</p>}
            {draft.notes.map((n) => <p key={n} className="text-xs text-muted-foreground">• {n}</p>)}
            <div className="grid gap-3 sm:grid-cols-2">
              {FIELDS.map(([k, label]) => (
                <label key={k} className={k === "base_address" || k === "name" ? "space-y-1 text-sm sm:col-span-2" : "space-y-1 text-sm"}>
                  <span className="text-muted-foreground">{label}</span>
                  <input value={String(draft[k] ?? "")} list={k === "category" ? "add-truck-categories" : undefined}
                    onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" />
                </label>
              ))}
              <datalist id="add-truck-categories">{categories.map((c) => <option key={c} value={c} />)}</datalist>
              <label className="space-y-1 text-sm sm:col-span-2"><span className="text-muted-foreground">Description</span>
                <textarea value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} rows={3}
                  className="w-full rounded-lg border border-input bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring" />
              </label>
            </div>
            <div className="flex flex-wrap justify-end gap-2">
              {dups.length > 0 && <button type="button" className={btn.secondary} disabled={busy} onClick={() => void save(true)}>Not a duplicate — add anyway</button>}
              <button className={btn.primary} disabled={busy || !draft.name.trim()}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add truck</button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
