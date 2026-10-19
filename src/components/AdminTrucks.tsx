import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  LayoutGrid, Rows3, X, Search, MoreHorizontal, Pencil, GitMerge, Archive, CheckCircle2, Trash2, RotateCcw, PanelRightOpen, Bookmark, ChevronDown,
  Rows4, StretchHorizontal, Truck as TruckIcon, ChevronLeft, ChevronRight, History, Plus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { CUISINES, adminDefaultVisible, adminStatus, cityOf, filtersToSearch, parseFilters, restoreDaysLeft, type AdminStatus, type Filters } from "@/data/filters";
import { EmptyState, IconAction, Initials, SectionHeader, StatusPill, btn, statusTone } from "@/components/admin/ui";
import { TruckDrawer } from "@/components/admin/TruckDrawer";
import { cn } from "@/lib/utils";
import { LocationQueue } from '@/components/admin/LocationQueue';
import { geocode } from '@/lib/geocode';

const PAGE = 50;
const STATUS_LABEL: Record<AdminStatus, string> = { approved: "Approved", pending: "Pending", rejected: "Rejected", deleted: "Deleted" };
const SOURCE_LABEL: Record<string, string> = { apify_maps: "Google Maps", apify: "Google Maps", embed_form: "Website form", manual: "Manual", owner: "Owner", scraper: "Scraper" };
const PRESET_VIEWS: { name: string; search: S }[] = [
  { name: "Active trucks", search: {} },
  { name: "Waiting for approval", search: { status: "pending" } },
  { name: "Every status", search: { status: "approved,pending,rejected,deleted" } },
  { name: "Fixed locations", search: { type: "fixed" } },
  { name: "Recently deleted", search: { status: "deleted" } },
  { name: "Trucks without address", search: { missing: "address", status: "approved,pending" } },
  { name: "Category needs review", search: { missing: "category", status: "approved,pending" } },
];
const VIEWS_KEY = "ftqc-admin-truck-views";
const DENSITY_KEY = "ftqc-admin-density";

type Row = {
  id: string; name: string; business_name: string; category: string; emoji: string; base_address: string | null; logo_url: string | null;
  truck_type: string; is_food_truck: boolean; status: string; claimed_by: string | null; source: string; created_at: string; updated_at: string; deleted_at: string | null;
  menu_search: string; merged_into: string | null; phone: string | null; website: string | null; instagram: string | null; facebook: string | null;
};

type S = Record<string, string | number | undefined>;
/** "Without address" / "Category needs review" views. */
function missingOk(r: { base_address: string | null; category: string }, missing: unknown) {
  if (missing === "address") return !r.base_address?.trim();
  if (missing === "category") return !r.category?.trim() || /^(other|unknown|uncategorized)$/i.test(r.category.trim());
  return true;
}
export function AdminTrucks({ search }: { search: S }) {
  const qc = useQueryClient();
  const navigate = useNavigate({ from: "/admin" });
  const f = parseFilters(search);
  const view = search["view"] === "cards" ? "cards" : "table";
  const page = Math.max(1, Number(search["page"]) || 1);
  const drawerId = typeof search["truck"] === "string" ? search["truck"] : null;
  const [picked, setPicked] = useState<string[]>([]);
  const [confirm, setConfirm] = useState<Row[] | null>(null);
  const [edit, setEdit] = useState<string | null>(null);
  const [merge, setMerge] = useState<string | null>(null);
  const [compact, setCompact] = useState(false);
  const [saved, setSaved] = useState<{ name: string; search: S }[]>([]);
  useEffect(() => {
    try { setCompact(localStorage.getItem(DENSITY_KEY) === "compact"); setSaved(JSON.parse(localStorage.getItem(VIEWS_KEY) ?? "[]")); } catch { /* ignore */ }
  }, []);
  const toggleDensity = () => setCompact((c) => { localStorage.setItem(DENSITY_KEY, c ? "comfortable" : "compact"); return !c; });

  const set = (next: Partial<Filters>, extra: S = {}) =>
    void navigate({ search: (prev: S): S => ({ ...prev, ...filtersToSearch({ ...f, ...next }), page: undefined, ...extra }), replace: true });
  const setRaw = (extra: S) => void navigate({ search: (prev: S): S => ({ ...prev, ...extra }), replace: true });
  const applyView = (s: S) => void navigate({ search: { tab: "trucks", ...(view === "cards" ? { view: "cards" } : {}), ...s } });
  const saveView = () => {
    const name = window.prompt("Name this view")?.trim();
    if (!name) return;
    const next = [...saved.filter((v) => v.name !== name), { name, search: filtersToSearch(f) as S }];
    setSaved(next); localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); toast.success(`Saved view “${name}”`);
  };
  const removeView = (name: string) => { const next = saved.filter((v) => v.name !== name); setSaved(next); localStorage.setItem(VIEWS_KEY, JSON.stringify(next)); };

  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "trucks"],
    queryFn: async () => ((await supabase.from("trucks")
      .select("id,name,business_name,category,emoji,base_address,logo_url,truck_type,is_food_truck,status,claimed_by,source,created_at,updated_at,deleted_at,menu_search,merged_into,phone,website,instagram,facebook")
      .order("created_at", { ascending: false }).limit(5000)).data ?? []) as Row[],
  });
  const rows = useMemo(() => data.map((t) => ({ ...t, city: cityOf(t.base_address), adminStatus: adminStatus(t) })), [data]);
  const cities = useMemo(() => Array.from(new Set(rows.map((r) => r.city).filter(Boolean))).sort(), [rows]);
  const missing = search["missing"];
  const list = rows.filter((r) => adminDefaultVisible(r, f) && missingOk(r, missing));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  const cur = Math.min(page, pages);
  const shown = list.slice((cur - 1) * PAGE, cur * PAGE);
  const active = rows.filter((t) => t.status !== "archived");
  const byId = (id: string) => rows.find((r) => r.id === id);

  const inv = () => void qc.invalidateQueries();
  async function restoreMany(ids: string[]) {
    for (const id of ids) {
      const { error } = await supabase.rpc("admin_restore_truck", { _id: id });
      if (error) { toast.error(error.message); break; }
    }
    inv();
  }
  async function doDelete(ts: Row[]) {
    const ids = ts.map((t) => t.id);
    const { data: n, error } = await supabase.rpc("admin_delete_trucks", { _ids: ids });
    setConfirm(null);
    if (error) return void toast.error(error.message);
    toast.success(`${n} deleted`, { description: "Restore within 30 days from Recently deleted.", action: { label: "Undo", onClick: () => void restoreMany(ids).then(() => toast.success("Restored")) }, duration: 8000 });
    setPicked([]); if (drawerId && ids.includes(drawerId)) setRaw({ truck: undefined }); inv();
  }
  async function restore(id: string) {
    const { error } = await supabase.rpc("admin_restore_truck", { _id: id });
    if (error) return void toast.error(error.message);
    toast.success("Restored"); inv();
  }
  async function save(id: string, fd: FormData) {
    const g = (k: string) => String(fd.get(k) ?? "").trim() || null;
    const tt = g("truck_type");
    const category = g('category'), address = g('base_address');
    if (!category || /^(other|unknown|uncategorized)$/i.test(category)) return void toast.error('Use the category from the Google or Facebook profile.');
    let location = {};
    if (address && address !== byId(id)?.base_address) {
      const hit = await geocode(address);
      if (!hit) return void toast.error('Address not found. Check the street and city.');
      location = {base_address:address,base_lat:hit.lat,base_lng:hit.lng};
    }
    const { error } = await supabase.from("trucks").update({ ...location, is_food_truck: fd.get("is_food_truck") === "on", name: g("name") ?? "Untitled", category, phone: g("phone"), website: g("website"), instagram: g("instagram"), facebook: g("facebook"), ...(tt === "fixed" || tt === "mobile" ? { truck_type: tt } : {}) }).eq("id", id);
    if (error) return void toast.error(error.message);
    toast.success("Saved"); setEdit(null); inv();
  }
  async function setStatus(id: string, status: "archived" | "active", undoable = true) {
    const prev = byId(id)?.status;
    const { error } = await supabase.from("trucks").update({ status }).eq("id", id);
    if (error) return void toast.error(error.message);
    inv();
    if (undoable && (prev === "archived" || prev === "active" || prev === "pending")) {
      toast.success(status === "archived" ? "Archived" : "Approved", { action: { label: "Undo", onClick: () => void supabase.from("trucks").update({ status: prev }).eq("id", id).then(({ error: e }) => { if (e) toast.error(e.message); else { toast("Undone"); inv(); } }) } });
    }
  }
  const toggleArchive = (id: string, status: string) => void setStatus(id, status === "archived" ? "active" : "archived");
  async function doMerge(dup: string, keep: string) {
    if (!keep || !window.confirm("Move favorites and stops into the master truck and archive this one?")) return;
    const { error } = await supabase.rpc("merge_trucks", { _keep: keep, _dup: dup });
    if (error) toast.error(error.message); else { toast.success("Merged"); setMerge(null); inv(); }
  }

  const chips: { k: string; label: string; clear: () => void }[] = [];
  if (f.q) chips.push({ k: "q", label: `“${f.q}”`, clear: () => set({ q: "" }) });
  if (f.dish) chips.push({ k: "dish", label: `Dish: ${f.dish}`, clear: () => set({ dish: "" }) });
  if (f.city) chips.push({ k: "city", label: `City: ${f.city}`, clear: () => set({ city: "" }) });
  if (f.type) chips.push({ k: "type", label: f.type === "fixed" ? "Fixed" : "Mobile", clear: () => set({ type: "" }) });
  for (const c of f.cuisines) chips.push({ k: c, label: CUISINES.find((x) => x.key === c)!.label, clear: () => set({ cuisines: f.cuisines.filter((x) => x !== c) }) });
  for (const s of f.status) chips.push({ k: s, label: STATUS_LABEL[s], clear: () => set({ status: f.status.filter((x) => x !== s) }) });
  const toggle = <T,>(xs: T[], x: T) => (xs.includes(x) ? xs.filter((y) => y !== x) : [...xs, x]);
  const allPicked = shown.length > 0 && shown.every((t) => picked.includes(t.id));
  const open = (id: string) => setRaw({ truck: id });

  const rowMenu = (t: Row) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button aria-label={`More actions for ${t.name}`} onClick={(e) => e.stopPropagation()} className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <MoreHorizontal className="h-4 w-4" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel className="truncate">{t.name}</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => open(t.id)}><PanelRightOpen className="mr-2 h-4 w-4" />Open details</DropdownMenuItem>
        {t.deleted_at ? (
          <DropdownMenuItem onSelect={() => void restore(t.id)}><RotateCcw className="mr-2 h-4 w-4" />Restore ({restoreDaysLeft(t.deleted_at)}d left)</DropdownMenuItem>
        ) : (
          <>
            <DropdownMenuItem onSelect={() => setEdit(t.id)}><Pencil className="mr-2 h-4 w-4" />Edit</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => setMerge(t.id)}><GitMerge className="mr-2 h-4 w-4" />Merge…</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => toggleArchive(t.id, t.status)}>{t.status === "archived" ? <><CheckCircle2 className="mr-2 h-4 w-4" />Approve</> : <><Archive className="mr-2 h-4 w-4" />Archive</>}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem className="text-destructive focus:text-destructive" onSelect={() => setConfirm([t])}><Trash2 className="mr-2 h-4 w-4" />Delete</DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
  const hoverActions = (t: Row) => (
    <div className="flex items-center justify-end gap-0.5">
      <div className="flex items-center gap-0.5 opacity-100 transition-opacity md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
        {t.deleted_at ? <IconAction label="Restore" icon={RotateCcw} onClick={() => void restore(t.id)} /> : (
          <>
            <IconAction label="Edit" icon={Pencil} onClick={() => setEdit(t.id)} />
            <IconAction label={t.status === "archived" ? "Approve" : "Archive"} icon={t.status === "archived" ? CheckCircle2 : Archive} onClick={() => toggleArchive(t.id, t.status)} />
            <IconAction label="Delete" icon={Trash2} tone="danger" onClick={() => setConfirm([t])} />
          </>
        )}
      </div>
      {rowMenu(t)}
    </div>
  );
  const pill = (t: (typeof shown)[number]) => <StatusPill tone={statusTone(t.adminStatus)}>{STATUS_LABEL[t.adminStatus]}</StatusPill>;
  const avatar = (t: Row) => t.logo_url ? <img src={t.logo_url} alt="" className="h-8 w-8 shrink-0 rounded-lg border border-border object-cover" /> : <Initials name={t.name} emoji={t.emoji} />;
  const editing = edit ? byId(edit) : undefined;
  const merging = merge ? byId(merge) : undefined;
  const pad = compact ? "px-3 py-1.5" : "px-3 py-3";

  return (
    <div className="space-y-4">
      <LocationQueue />
      <SectionHeader title="Trucks" description="Search, edit, merge, archive and restore every listing."
        actions={
          <DropdownMenu>
            <DropdownMenuTrigger asChild><button className={btn.secondary}><Bookmark className="h-4 w-4" /><span className="hidden sm:inline">Views</span><ChevronDown className="h-3.5 w-3.5" /></button></DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-60">
              <DropdownMenuLabel>Built-in views</DropdownMenuLabel>
              {PRESET_VIEWS.map((v) => <DropdownMenuItem key={v.name} onSelect={() => applyView(v.search)}>{v.name}</DropdownMenuItem>)}
              {saved.length > 0 && <><DropdownMenuSeparator /><DropdownMenuLabel>Your views</DropdownMenuLabel></>}
              {saved.map((v) => (
                <DropdownMenuItem key={v.name} onSelect={() => applyView(v.search)} className="justify-between">
                  <span className="truncate">{v.name}</span>
                  <button aria-label={`Remove view ${v.name}`} onClick={(e) => { e.stopPropagation(); e.preventDefault(); removeView(v.name); }} className="rounded p-0.5 hover:bg-muted"><X className="h-3.5 w-3.5" /></button>
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={saveView}><Plus className="mr-2 h-4 w-4" />Save current filters…</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        } />

      <div className="space-y-3 rounded-xl border border-border bg-card p-3 shadow-pop">
        <div className="grid gap-2 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)_auto]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input className="h-9 w-full rounded-lg border border-input bg-background pl-9 pr-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Search truck, business, cuisine or dish…" aria-label="Search trucks" value={f.q} onChange={(e) => set({ q: e.target.value })} />
          </label>
          <input className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Dish (e.g. tacos)" aria-label="Dish" value={f.dish} onChange={(e) => set({ dish: e.target.value })} />
          <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring" aria-label="City" value={f.city} onChange={(e) => set({ city: e.target.value })}>
            <option value="">All cities</option>{cities.map((c) => <option key={c}>{c}</option>)}
          </select>
          <select className="h-9 rounded-lg border border-input bg-background px-2 text-sm outline-none focus:ring-2 focus:ring-ring" aria-label="Fixed or mobile" value={f.type} onChange={(e) => set({ type: e.target.value as Filters["type"] })}>
            <option value="">Fixed and mobile</option><option value="fixed">Fixed</option><option value="mobile">Mobile</option>
          </select>
          <div className="flex gap-1">
            <div className="flex rounded-lg border border-border p-0.5" role="group" aria-label="View">
              <IconToggle on={view === "table"} label="Table view" onClick={() => setRaw({ view: undefined })}><Rows3 className="h-4 w-4" /></IconToggle>
              <IconToggle on={view === "cards"} label="Card view" onClick={() => setRaw({ view: "cards" })}><LayoutGrid className="h-4 w-4" /></IconToggle>
            </div>
            <div className="flex rounded-lg border border-border p-0.5">
              <IconToggle on={compact} label={compact ? "Comfortable rows" : "Compact rows"} onClick={toggleDensity}>{compact ? <StretchHorizontal className="h-4 w-4" /> : <Rows4 className="h-4 w-4" />}</IconToggle>
            </div>
          </div>
        </div>
        <div className="no-scrollbar -mx-3 flex gap-1.5 overflow-x-auto px-3">
          {(["approved", "pending", "rejected", "deleted"] as AdminStatus[]).map((s) => (
            <FilterChip key={s} on={f.status.includes(s)} onClick={() => set({ status: toggle(f.status, s) })}><span className={cn("h-1.5 w-1.5 rounded-full", { approved: "bg-pin-open", pending: "bg-pin-today", rejected: "bg-muted-foreground", deleted: "bg-destructive" }[s])} />{STATUS_LABEL[s]}</FilterChip>
          ))}
          <span className="mx-1 w-px shrink-0 bg-border" />
          {CUISINES.map((c) => <FilterChip key={c.key} on={f.cuisines.includes(c.key)} onClick={() => set({ cuisines: toggle(f.cuisines, c.key) })}>{c.label}</FilterChip>)}
        </div>
        {chips.length > 0 && (
          <div className="flex flex-wrap items-center gap-1.5 border-t border-border pt-3">
            <span className="text-xs text-muted-foreground">Filtered by</span>
            {chips.map((c) => <button key={c.k} onClick={c.clear} className="inline-flex h-7 items-center gap-1 rounded-md bg-accent px-2 text-xs font-medium hover:bg-accent/70" aria-label={`Remove ${c.label}`}>{c.label}<X className="h-3 w-3" /></button>)}
            <button onClick={() => set({ q: "", dish: "", city: "", type: "", cuisines: [], status: [] })} className="h-7 px-2 text-xs font-medium text-muted-foreground hover:text-foreground">Clear all</button>
          </div>
        )}
      </div>

      <p className="text-sm text-muted-foreground"><span className="font-medium text-foreground">{list.length}</span> trucks{pages > 1 && ` · page ${cur} of ${pages}`}</p>

      {isLoading ? (
        <div className="space-y-1.5 rounded-xl border border-border bg-card p-3">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-10" />)}</div>
      ) : !shown.length ? (
        <EmptyState icon={TruckIcon} title="No trucks match these filters" hint="Try removing a filter or searching a different name." action={chips.length ? <button className={btn.secondary} onClick={() => set({ q: "", dish: "", city: "", type: "", cuisines: [], status: [] })}>Clear filters</button> : undefined} />
      ) : view === "table" ? (
        <div className="max-h-[70vh] overflow-auto rounded-xl border border-border bg-card shadow-pop">
          <table className="w-full min-w-[960px] text-left text-sm">
            <thead className="sticky top-0 z-10 bg-muted/95 text-xs font-medium text-muted-foreground backdrop-blur">
              <tr className="border-b border-border">
                <th className="w-10 px-3 py-2"><input type="checkbox" className="accent-primary" aria-label="Select all on this page" checked={allPicked} onChange={() => setPicked(allPicked ? picked.filter((id) => !shown.some((t) => t.id === id)) : Array.from(new Set([...picked, ...shown.map((t) => t.id)])))} /></th>
                {["Truck", "Cuisine", "City", "Type", "Status", "Owner", "Source", "Updated", ""].map((h, i) => <th key={i} className="px-3 py-2 font-medium">{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {shown.map((t) => (
                <tr key={t.id} tabIndex={0} onClick={() => open(t.id)} onKeyDown={(e) => { if (e.key === "Enter" && e.target === e.currentTarget) open(t.id); }}
                  className={cn("group cursor-pointer border-b border-border last:border-0 hover:bg-muted/50 focus-visible:bg-muted focus-visible:outline-none", picked.includes(t.id) && "bg-accent/50")}>
                  <td className={pad} onClick={(e) => e.stopPropagation()}><input type="checkbox" className="accent-primary" aria-label={`Select ${t.name}`} checked={picked.includes(t.id)} onChange={() => setPicked(toggle(picked, t.id))} /></td>
                  <td className={pad}>
                    <div className="flex min-w-0 items-center gap-2.5">
                      {!compact && avatar(t)}
                      <div className="min-w-0"><p className="truncate font-medium">{t.name}</p>{!compact && t.business_name && t.business_name !== t.name && <p className="truncate text-xs text-muted-foreground">by {t.business_name}</p>}</div>
                    </div>
                  </td>
                  <td className={pad}>{/^other$/i.test(t.category) ? "Category needs review" : t.category}</td>
                  <td className={pad}>{t.city || "—"}</td>
                  <td className={pad}>{t.truck_type === "fixed" ? "Fixed" : "Mobile"}</td>
                  <td className={pad}>{pill(t)}</td>
                  <td className={cn(pad, "text-muted-foreground")}>{t.claimed_by ? "Claimed" : "Unclaimed"}</td>
                  <td className={cn(pad, "text-muted-foreground")}>{SOURCE_LABEL[t.source] ?? t.source}</td>
                  <td className={cn(pad, "whitespace-nowrap text-muted-foreground")}>{new Date(t.updated_at).toLocaleDateString()}</td>
                  <td className={cn(pad, "w-40")}>{hoverActions(t)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((t) => (
            <li key={t.id} className={cn("group rounded-xl border border-border bg-card p-4 shadow-pop transition-shadow hover:shadow-pop-sm", picked.includes(t.id) && "ring-2 ring-primary/40")}>
              <div className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-start gap-3">
                <input type="checkbox" className="mt-2 accent-primary" aria-label={`Select ${t.name}`} checked={picked.includes(t.id)} onChange={() => setPicked(toggle(picked, t.id))} />
                {avatar(t)}
                <button onClick={() => open(t.id)} className="min-w-0 text-left">
                  <p className="truncate font-medium">{t.name}</p>
                  <p className="truncate text-xs text-muted-foreground">{[t.business_name, t.category, t.city].filter(Boolean).join(" · ")}</p>
                </button>
                {rowMenu(t)}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-1.5">
                {pill(t)}
                <StatusPill tone="neutral">{t.truck_type === "fixed" ? "Fixed" : "Mobile"}</StatusPill>
                <StatusPill tone={t.claimed_by ? "accent" : "neutral"}>{t.claimed_by ? "Claimed" : "Unclaimed"}</StatusPill>
                <span className="ml-auto text-xs text-muted-foreground">{SOURCE_LABEL[t.source] ?? t.source}</span>
              </div>
            </li>
          ))}
        </ul>
      )}

      {pages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <button className={btn.secondary} disabled={cur <= 1} onClick={() => setRaw({ page: cur - 1 > 1 ? cur - 1 : undefined })}><ChevronLeft className="h-4 w-4" />Previous</button>
          <span className="text-sm tabular-nums text-muted-foreground">{cur} / {pages}</span>
          <button className={btn.secondary} disabled={cur >= pages} onClick={() => setRaw({ page: cur + 1 })}>Next<ChevronRight className="h-4 w-4" /></button>
        </div>
      )}

      <DeletionLog />

      {picked.length > 0 && (
        <div role="toolbar" aria-label="Bulk actions" className="fixed inset-x-3 bottom-4 z-40 mx-auto flex max-w-md items-center gap-2 rounded-xl border border-border bg-popover p-2 pl-4 text-sm shadow-lg">
          <span className="flex-1 font-medium">{picked.length} selected</span>
          <button className={cn(btn.ghost, "text-destructive hover:bg-destructive/10")} onClick={() => setConfirm(rows.filter((r) => picked.includes(r.id) && !r.deleted_at))}><Trash2 className="h-4 w-4" />Delete</button>
          <IconAction label="Clear selection" icon={X} onClick={() => setPicked([])} />
        </div>
      )}

      <TruckDrawer truckId={drawerId} onClose={() => setRaw({ truck: undefined })}
        actions={{ edit: setEdit, merge: setMerge, toggleArchive, del: (id) => { const r = byId(id); if (r) setConfirm([r]); }, restore: (id) => void restore(id) }} />

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader><DialogTitle>Edit {editing?.name}</DialogTitle><DialogDescription>Changes appear on the public page right away.</DialogDescription></DialogHeader>
          {editing && (
            <form className="grid gap-3 sm:grid-cols-2" onSubmit={(e) => { e.preventDefault(); void save(editing.id, new FormData(e.currentTarget)); }}>
              {(["name", "category", "base_address", "phone", "website", "instagram", "facebook"] as const).map((k) => (
                <label key={k} className="space-y-1 text-sm"><span className="capitalize text-muted-foreground">{k}</span>
                  <input name={k} className="h-9 w-full rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" defaultValue={editing[k] ?? ""} />
                </label>
              ))}
              <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" name="is_food_truck" defaultChecked={editing.is_food_truck} />Food truck, trailer or cart</label>
              <label className="space-y-1 text-sm sm:col-span-2"><span className="text-muted-foreground">Type</span>
                <select name="truck_type" className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" defaultValue={editing.truck_type}>
                  <option value="mobile">Mobile</option><option value="fixed">Fixed location</option>
                </select>
              </label>
              <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" className={btn.secondary} onClick={() => setEdit(null)}>Cancel</button><button className={btn.primary}>Save changes</button></div>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={!!merging} onOpenChange={(o) => !o && setMerge(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>Merge {merging?.name}</DialogTitle><DialogDescription>Pick the master truck. Favorites and stops move there and this listing is archived.</DialogDescription></DialogHeader>
          {merging && (
            <select className="h-9 w-full rounded-lg border border-input bg-background px-2 text-sm" defaultValue="" onChange={(e) => void doMerge(merging.id, e.target.value)} aria-label="Master truck">
              <option value="" disabled>Pick the master truck</option>
              {active.filter((o) => o.id !== merging.id).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          )}
        </DialogContent>
      </Dialog>

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

function IconToggle({ on, label, onClick, children }: { on: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" aria-label={label} title={label} aria-pressed={on} onClick={onClick}
      className={cn("grid h-7 w-8 place-items-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", on && "bg-muted text-foreground")}>
      {children}
    </button>
  );
}

function FilterChip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={on}
      className={cn("inline-flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md border border-dashed border-border px-2.5 text-xs font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        on && "border-solid border-primary bg-accent text-foreground")}>
      {children}
    </button>
  );
}

function DeletionLog() {
  const { data = [] } = useQuery({
    queryKey: ["admin", "deletions"],
    queryFn: async () => (await supabase.from("truck_deletions").select("*").order("created_at", { ascending: false }).limit(20)).data ?? [],
  });
  if (!data.length) return null;
  return (
    <details className="group rounded-xl border border-border bg-card p-4 text-sm shadow-pop">
      <summary className="flex cursor-pointer items-center gap-2 font-medium"><History className="h-4 w-4 text-muted-foreground" />Delete and restore log<ChevronDown className="ml-auto h-4 w-4 transition-transform group-open:rotate-180" /></summary>
      <ul className="mt-3 space-y-1.5 text-muted-foreground">
        {data.map((d) => <li key={d.id}>{new Date(d.created_at).toLocaleString()} · <b className="font-medium text-foreground">{d.truck_name}</b> {d.action} {d.actor_email ? `by ${d.actor_email}` : "automatically"}</li>)}
      </ul>
    </details>
  );
}
