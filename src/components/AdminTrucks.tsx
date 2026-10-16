import { useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { LayoutGrid, Rows3, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { CUISINES, adminStatus, cityOf, filtersToSearch, matchesFilters, parseFilters, restoreDaysLeft, type AdminStatus, type Filters } from "@/data/filters";

const PAGE = 50;
const STATUS_LABEL: Record<AdminStatus, string> = { approved: "Approved", pending: "Pending", rejected: "Rejected", deleted: "Deleted" };
const SOURCE_LABEL: Record<string, string> = { apify_maps: "Google Maps", embed_form: "Website form", manual: "Manual", owner: "Owner", scraper: "Scraper" };

type Row = {
  id: string; name: string; business_name: string; category: string; emoji: string; base_address: string | null;
  truck_type: string; status: string; claimed_by: string | null; source: string; updated_at: string; deleted_at: string | null;
  menu_search: string; merged_into: string | null; phone: string | null; website: string | null; instagram: string | null; facebook: string | null;
};

export function AdminTrucks({ search }: { search: Record<string, unknown> }) {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/admin" });
  const f = parseFilters(search);
  const view = search["view"] === "cards" ? "cards" : "table";
  const page = Math.max(1, Number(search["page"]) || 1);
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [merge, setMerge] = useState<string | null>(null);

  const set = (next: Partial<Filters>, extra: Record<string, unknown> = {}) =>
    void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...filtersToSearch({ ...f, ...next }), page: undefined, ...extra }), replace: true });
  const setRaw = (extra: Record<string, unknown>) => void navigate({ search: (prev: Record<string, unknown>) => ({ ...prev, ...extra }), replace: true });

  const { data = [] } = useQuery({
    queryKey: ["admin", "trucks"],
    queryFn: async () => ((await supabase.from("trucks")
      .select("id,name,business_name,category,emoji,base_address,truck_type,status,claimed_by,source,updated_at,deleted_at,menu_search,merged_into,phone,website,instagram,facebook")
      .order("name").limit(5000)).data ?? []) as Row[],
  });
  const rows = useMemo(() => data.map((t) => ({ ...t, city: cityOf(t.base_address), adminStatus: adminStatus(t) })), [data]);
  const cities = useMemo(() => Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort(), [rows]);
  const list = rows.filter((r) => matchesFilters(r, f));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PAGE, cur * PAGE);
  const active = rows.filter((t) => t.status !== "archived");

  const inv = () => void qc.invalidateQueries();
  async function doDelete(ts: Row[]) {
    const { data: n, error } = await supabase.rpc("admin_delete_trucks", { _ids: ts.map((t) => t.id) });
    setConfirm(null);
    if (error) return void toast.error(error.message);
    toast.success(`${n} deleted — restore within 30 days from the Deleted filter.`);
    setPicked([]); inv();
  }
  async function restore(id: string) {
    const { error } = await supabase.rpc("admin_restore_truck", { _id: id });
    if (error) return void toast.error(error.message);
    toast.success("Restored"); inv();
  }
  async function save(id: string, fd: FormData) {
    const g = (k: string) => String(fd.get(k) ?? "").trim() || null;
    const tt = g("truck_type");
    const { error } = await supabase.from("trucks").update({ name: g("name") ?? "Untitled", category: g("category") ?? "Other", phone: g("phone"), website: g("website"), instagram: g("instagram"), facebook: g("facebook"), ...(tt === "fixed" || tt === "mobile" ? { truck_type: tt } : {}) }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Saved"); setEdit(null); inv();
  }
  async function setStatus(id: string, status: "archived" | "active") {
    const { error } = await supabase.from("trucks").update({ status }).eq("id", id);
    if (error) toast.error(error.message); else inv();
  }
  async function doMerge(dup: string, keep: string) {
    if (!keep || !window.confirm("Move favorites and stops into the master truck and archive this one?")) return;
    const { error } = await supabase.rpc("merge_trucks", { _keep: keep, _dup: dup });
    if (error) toast.error(error.message); else { toast.success("Merged"); setMerge(null); inv(); }
  }

  const chips: { k: string; label: string; clear: () => void }[] = [];
  if (f.q) chips.push({ k: "q", label: `“${f.q}”`, clear: () => set({ q: "" }) });
  if (f.dish) chips.push({ k: "dish", label: `Dish: ${f.dish}`, clear: () => set({ dish: "" }) });
  if (f.city) chips.push({ k: "city", label: f.city, clear: () => set({ city: "" }) });
  if (f.type) chips.push({ k: "type", label: f.type === "fixed" ? "Fixed" : "Mobile", clear: () => set({ type: "" }) });
  for (const c of f.cuisines) chips.push({ k: c, label: CUISINES.find((x) => x.key === c)!.label, clear: () => set({ cuisines: f.cuisines.filter((x) => x !== c) }) });
  for (const s of f.status) chips.push({ k: s, label: STATUS_LABEL[s], clear: () => set({ status: f.status.filter((x) => x !== s) }) });
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const allPicked = shown.length > 0 && shown.every((t) => picked.includes(t.id));

  const actions = (t: (typeof shown)[number]) => (
    <div className="flex flex-wrap gap-1">
      {t.deleted_at ? (
        <button className="chip" onClick={() => void restore(t.id)}>Restore ({restoreDaysLeft(t.deleted_at)}d left)</button>
      ) : (
        <>
          <button className="chip" onClick={() => setEdit(edit === t.id ? null : t.id)}>Edit</button>
          <button className="chip" onClick={() => setMerge(merge === t.id ? null : t.id)}>Merge…</button>
          <button className="chip" onClick={() => void setStatus(t.id, t.status === "archived" ? "active" : "archived")}>{t.status === "archived" ? "Approve" : "Archive"}</button>
          <button className="chip text-destructive" onClick={() => setConfirm([t])}>Delete</button>
        </>
      )}
    </div>
  );
  const extra = (t: Row) => (
    <>
      {edit === t.id && (
        <form className="grid gap-2 p-2 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(t.id, new FormData(e.currentTarget)); }}>
          {(["name", "category", "phone", "website", "instagram", "facebook"] as const).map((k) => (
            <input key={k} name={k} className="field" placeholder={k} aria-label={k} defaultValue={t[k] ?? ""} />
          ))}
          <select name="truck_type" className="field" defaultValue={t.truck_type} aria-label="Truck type">
            <option value="mobile">🚚 Mobile</option><option value="fixed">🏠 Fixed location</option>
          </select>
          <button className="chip bg-primary text-primary-foreground sm:col-span-2">Save</button>
        </form>
      )}
      {merge === t.id && (
        <div className="flex flex-wrap items-center gap-2 p-2 text-sm">Duplicate of:
          <select className="field" defaultValue="" onChange={(e) => void doMerge(t.id, e.target.value)} aria-label="Master truck">
            <option value="" disabled>Pick the master truck</option>
            {active.filter((o) => o.id !== t.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
    </>
  );

  return (
    <div className="space-y-3">
      <div className="panel space-y-3 p-4">
        <input className="field w-full" placeholder="Search truck, business, cuisine or dish…" aria-label="Search trucks" value={f.q} onChange={(e) => set({ q: e.target.value })} />
        <div className="grid gap-2 sm:grid-cols-4">
          <input className="field" placeholder="Dish (e.g. tacos)" aria-label="Dish" value={f.dish} onChange={(e) => set({ dish: e.target.value })} />
          <select className="field" aria-label="City" value={f.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="field" aria-label="Fixed or mobile" value={f.type} onChange={(e) => set({ type: e.target.value as Filters["type"] })}>
            <option value="">Fixed and mobile</option><option value="fixed">Fixed</option><option value="mobile">Mobile</option>
          </select>
          <div className="flex gap-1" role="group" aria-label="View">
            <button onClick={() => setRaw({ view: undefined })} aria-pressed={view === "table"} className={`chip flex-1 justify-center ${view === "table" ? "chip-active" : ""}`}><Rows3 className="h-4 w-4" />Table</button>
            <button onClick={() => setRaw({ view: "cards" })} aria-pressed={view === "cards"} className={`chip flex-1 justify-center ${view === "cards" ? "chip-active" : ""}`}><LayoutGrid className="h-4 w-4" />Cards</button>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(["approved", "pending", "rejected", "deleted"] as AdminStatus[]).map((s) => (
            <button key={s} onClick={() => set({ status: toggle(f.status, s) })} aria-pressed={f.status.includes(s)} className={`chip ${f.status.includes(s) ? "chip-active" : ""}`}>{STATUS_LABEL[s]}</button>
          ))}
          <span className="my-2 w-px bg-border" />
          {CUISINES.map((c) => (
            <button key={c.key} onClick={() => set({ cuisines: toggle(f.cuisines, c.key) })} aria-pressed={f.cuisines.includes(c.key)} className={`chip ${f.cuisines.includes(c.key) ? "chip-active" : ""}`}>{c.label}</button>
          ))}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5">
            {chips.map((c) => <button key={c.k} onClick={c.clear} className="inline-flex h-8 items-center gap-1 rounded-full bg-accent px-3 text-xs font-medium" aria-label={`Remove ${c.label}`}>{c.label}<X className="h-3 w-3" /></button>)}
            <button onClick={() => set({ q: "", dish: "", city: "", type: "", cuisines: [], status: [] })} className="h-8 px-2 text-xs font-semibold underline">Clear all</button>
          </div>
        )}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold">{list.length} trucks{pages > 1 && ` · page ${cur} of ${pages}`}</p>
        {picked.length > 0 && (
          <div className="flex items-center gap-2">
            <span className="text-sm">{picked.length} selected</span>
            <button className="chip text-destructive" onClick={() => setConfirm(rows.filter((r) => picked.includes(r.id) && !r.deleted_at))}>Delete selected</button>
            <button className="chip" onClick={() => setPicked([])}>Clear</button>
          </div>
        )}
      </div>

      {view === "table" ? (
        <div className="panel overflow-x-auto">
          <table className="w-full min-w-[980px] text-left text-sm">
            <thead><tr className="border-b">
              <th className="p-2"><input type="checkbox" aria-label="Select all on this page" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !shown.some((t) => t.id === id)) : Array.from(new Set([...picked, ...shown.map((t) => t.id)])))} /></th>
              {["Truck", "Business", "Cuisine", "City", "Type", "Status", "Owner", "Source", "Updated", ""].map((h) => <th key={h} className="p-2 font-semibold">{h}</th>)}
            </tr></thead>
            <tbody>
              {shown.map((t) => (
                <FragmentRow key={t.id} extra={edit === t.id || merge === t.id ? extra(t) : null}>
                  <td className="p-2"><input type="checkbox" aria-label={`Select ${t.name}`} checked={picked.includes(t.id)} onChange={() => setPicked(toggle(picked, t.id))} /></td>
                  <td className="p-2 font-semibold">{t.name}</td>
                  <td className="p-2">{t.business_name || "—"}</td>
                  <td className="p-2">{t.category}</td>
                  <td className="p-2">{t.city || "—"}</td>
                  <td className="p-2">{t.truck_type === "fixed" ? "Fixed" : "Mobile"}</td>
                  <td className="p-2">{STATUS_LABEL[t.adminStatus]}</td>
                  <td className="p-2">{t.claimed_by ? "Claimed" : "Unclaimed"}</td>
                  <td className="p-2">{SOURCE_LABEL[t.source] ?? t.source}</td>
                  <td className="whitespace-nowrap p-2">{new Date(t.updated_at).toLocaleDateString()}</td>
                  <td className="p-2">{actions(t)}</td>
                </FragmentRow>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-2 sm:grid-cols-2">
          {shown.map((t) => (
            <li key={t.id} className="panel space-y-2 p-3">
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1" aria-label={`Select ${t.name}`} checked={picked.includes(t.id)} onChange={() => setPicked(toggle(picked, t.id))} />
                <div className="min-w-0 flex-1">
                  <p className="truncate font-bold">{t.name}</p>
                  <p className="truncate text-sm text-muted-foreground">{[t.business_name, t.category, t.city].filter(Boolean).join(" · ")}</p>
                  <p className="text-xs text-muted-foreground">{t.truck_type === "fixed" ? "Fixed" : "Mobile"} · {STATUS_LABEL[t.adminStatus]} · {t.claimed_by ? "Claimed" : "Unclaimed"} · {SOURCE_LABEL[t.source] ?? t.source} · {new Date(t.updated_at).toLocaleDateString()}</p>
                </div>
              </div>
              {actions(t)}{extra(t)}
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className="chip" disabled={cur <= 1} onClick={() => setRaw({ page: cur - 1 > 1 ? cur - 1 : undefined })}>← Previous</button>
          <span className="text-sm">{cur} / {pages}</span>
          <button className="chip" disabled={cur >= pages} onClick={() => setRaw({ page: cur + 1 })}>Next →</button>
        </div>
      )}

      <DeletionLog />

      <AlertDialog open={!!confirm} onOpenChange={(o) => !o && setConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {confirm?.length === 1 ? confirm[0]!.name : `${confirm?.length ?? 0} trucks`}?</AlertDialogTitle>
            <AlertDialogDescription>
              {confirm && confirm.length > 1 && <span className="mb-2 block font-semibold text-foreground">{confirm.map((t) => t.name).join(", ")}</span>}
              It disappears from the map, search and its owner's dashboard right away. You can restore it for 30 days; after that the truck, its stops, photos and menu are removed for good.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={() => confirm && void doDelete(confirm)}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FragmentRow({ children, extra }: { children: React.ReactNode; extra: React.ReactNode }) {
  return (
    <>
      <tr className="border-b align-top last:border-0">{children}</tr>
      {extra && <tr><td colSpan={11}>{extra}</td></tr>}
    </>
  );
}

function DeletionLog() {
  const { data = [] } = useQuery({
    queryKey: ["admin", "deletions"],
    queryFn: async () => (await supabase.from("truck_deletions").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  if (!data.length) return null;
  return (
    <details className="panel p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Delete and restore log</summary>
      <ul className="mt-2 space-y-1">
        {data.map((d) => <li key={d.id}>{new Date(d.created_at).toLocaleString()} · <b>{d.truck_name}</b> {d.action} {d.actor_email ? `by ${d.actor_email}` : "automatically"}</li>)}
      </ul>
    </details>
  );
}
