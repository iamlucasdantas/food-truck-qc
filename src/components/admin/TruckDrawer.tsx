import { useQuery } from "@tanstack/react-query";
import { LocationConfirmation } from '@/components/LocationConfirmation';
import { OwnerMenu } from "@/components/OwnerMenu";
import { OwnerPhotos } from "@/components/OwnerPhotos";
import { OwnerSchedule } from "@/components/OwnerSchedule";
import { ScreenshotStops } from "./ScreenshotStops";
import type { Truck } from "@/data/trucks";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Pencil, GitMerge, Archive, CheckCircle2, Trash2, RotateCcw, UtensilsCrossed, ImageOff, CalendarX, History, Sparkles, Loader2, XCircle, Link2, Plus } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { startEnrich } from "@/lib/enrich.functions";
import { listTruckSources, addTruckSource, removeTruckSource } from "@/lib/truck-sources.functions";
import { generateMenuSummary } from "@/lib/menu.functions";
import { TRUCK_SOURCE_KINDS, truckTypeLabel, type TruckSourceKind } from "@/data/truck-sources";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { signTruckPhotos } from "@/lib/photos.functions";
import { adminStatus, cityOf, restoreDaysLeft } from "@/data/filters";
import type { MenuSection } from "@/data/menu";
import { EmptyState, IconAction, Initials, StatusPill, statusTone } from "./ui";

export type DrawerActions = {
  edit: (id: string) => void; merge: (id: string) => void; toggleArchive: (id: string, status: string) => void;
  del: (id: string) => void; restore: (id: string) => void;
};

export function TruckDrawer({ truckId, onClose, actions, tab, onEnrichStarted }: { truckId: string | null; onClose: () => void; actions: DrawerActions; tab?: string | undefined; onEnrichStarted?: ((runId: string, name: string) => void) | undefined }) {
  return (
    <Sheet open={!!truckId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {truckId && <Body key={`${truckId}:${tab ?? ""}`} id={truckId} actions={actions} tab={tab} onEnrichStarted={onEnrichStarted} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ id, actions, tab, onEnrichStarted }: { id: string; actions: DrawerActions; tab?: string | undefined; onEnrichStarted?: ((runId: string, name: string) => void) | undefined }) {
  const [enrichOpen, setEnrichOpen] = useState(false);
  const { data: t, isLoading } = useQuery({
    queryKey: ["admin", "truck", id],
    queryFn: async () => (await supabase.from("trucks").select("*").eq("id", id).maybeSingle()).data,
  });
  if (isLoading) return <div className="space-y-3 p-6"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-40" /></div>;
  if (!t) return <div className="p-6"><SheetTitle>Truck not found</SheetTitle><SheetDescription>It may have been purged or merged.</SheetDescription></div>;
  const st = adminStatus(t);
  const label = { approved: "Approved", pending: "Pending", rejected: "Archived", deleted: "Deleted" }[st];
  return (
    <>
      <SheetHeader className="space-y-3 border-b border-border p-6 pr-12 text-left">
        <div className="flex min-w-0 items-center gap-3">
          {t.logo_url ? <img src={t.logo_url} alt="" className="h-11 w-11 shrink-0 rounded-lg border border-border object-cover" /> : <Initials name={t.name} emoji={t.emoji} className="h-11 w-11 text-base" />}
          <div className="min-w-0">
            <SheetTitle className="truncate text-lg">{t.name}</SheetTitle>
            <SheetDescription className="truncate">{[t.business_name, t.category, cityOf(t.base_address)].filter(Boolean).join(" · ")}</SheetDescription>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-1">
          <StatusPill tone={statusTone(st)}>{label}</StatusPill>
          <StatusPill tone={t.claimed_by ? "accent" : "neutral"}>{t.claimed_by ? "Claimed" : "Unclaimed"}</StatusPill>
          <span className="flex-1" />
          {t.deleted_at ? (
            <IconAction label={`Restore (${restoreDaysLeft(t.deleted_at)} days left)`} icon={RotateCcw} onClick={() => actions.restore(t.id)} tone="primary" />
          ) : (
            <>
              <IconAction label="Edit" icon={Pencil} onClick={() => actions.edit(t.id)} />
              <IconAction label="Enrich from all sources" icon={Sparkles} tone="primary" onClick={() => setEnrichOpen(true)} />
              <IconAction label="Merge into another truck" icon={GitMerge} onClick={() => actions.merge(t.id)} />
              <IconAction label={t.status === "archived" ? "Approve" : "Archive"} icon={t.status === "archived" ? CheckCircle2 : Archive} onClick={() => actions.toggleArchive(t.id, t.status)} />
              <IconAction label="Delete" icon={Trash2} tone="danger" onClick={() => actions.del(t.id)} />
            </>
          )}
          <Link to="/truck/$id" params={{ id: t.id }} target="_blank" className="grid h-8 w-8 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Open public page"><ExternalLink className="h-4 w-4" /></Link>
        </div>
      </SheetHeader>
      <EnrichDialog open={enrichOpen} onOpenChange={setEnrichOpen} truckId={t.id} name={t.name} onStarted={onEnrichStarted} />
      <Tabs defaultValue={["overview", "menu", "photos", "stops", "sources", "activity"].includes(tab ?? "") ? tab! : "overview"} className="flex min-h-0 flex-1 flex-col">
         <TabsList className="mx-6 mt-4 grid grid-cols-6">
          {["overview", "menu", "photos", "stops", "sources", "activity"].map((k) => <TabsTrigger key={k} value={k} className="capitalize">{k}</TabsTrigger>)}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="overview" className="mt-0">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              {([
                ["Type", truckTypeLabel(t.truck_type)], ["Address", t.base_address], ["Phone", t.phone], ["Website", t.website],
                ["Instagram", t.instagram], ["Facebook", t.facebook], ["Source", t.source], ["Payments", t.payment_methods.join(", ")],
                ["Created", new Date(t.created_at).toLocaleString()], ["Updated", new Date(t.updated_at).toLocaleString()], ["ID", t.id],
              ] as const).map(([k, v]) => (
                <div key={k} className="contents"><dt className="text-muted-foreground">{k}</dt><dd className="min-w-0 break-words">{v || "—"}</dd></div>
              ))}
            </dl>
            {!t.deleted_at && <button onClick={() => actions.edit(t.id)} className="chip mt-4"><Pencil className="h-4 w-4" />Edit all details</button>}
            {t.description && <p className="mt-6 whitespace-pre-line text-sm text-muted-foreground">{t.description}</p>}
            {!t.deleted_at && <LocationConfirmation truck={t} admin />}
          </TabsContent>
          <TabsContent value="menu" className="mt-0 space-y-4">
            <MenuSummary truckId={t.id} name={t.name} summary={t.menu_summary} readOnly={!!t.deleted_at} />
            {t.deleted_at ? <MenuTab sections={(t.menu_sections as MenuSection[] | null) ?? []} /> : <OwnerMenu truck={t as Truck} />}
          </TabsContent>
          <TabsContent value="photos" className="mt-0">{t.deleted_at ? <PhotosTab id={t.id} /> : <OwnerPhotos truckId={t.id} />}</TabsContent>
          <TabsContent value="stops" className="mt-0 space-y-4">
            {!t.deleted_at && <><ScreenshotStops truckId={t.id} /><OwnerSchedule truck={t as Truck} /></>}
            <h3 className="text-sm font-semibold">Stop history</h3>
            <StopsTab id={t.id} />
          </TabsContent>
          <TabsContent value="sources" className="mt-0"><SourcesTab id={t.id} /></TabsContent>
          <TabsContent value="activity" className="mt-0"><ActivityTab id={t.id} created={t.created_at} source={t.source} /></TabsContent>
        </div>
      </Tabs>
    </>
  );
}

function MenuSummary({ truckId, name, summary, readOnly }: { truckId: string; name: string; summary: string | null; readOnly: boolean }) {
  const gen = useServerFn(generateMenuSummary);
  const qc = useQueryClient();
  const [text, setText] = useState(summary ?? "");
  const [busy, setBusy] = useState(false);
  const dirty = text.trim() !== (summary ?? "");
  async function generate() {
    setBusy(true);
    try { const r = await gen({ data: { truckId } }); setText(r.summary); void qc.invalidateQueries({ queryKey: ["admin", "truck", truckId] }); toast.success("Summary written"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't write the summary"); }
    finally { setBusy(false); }
  }
  async function save() {
    const { error } = await supabase.from("trucks").update({ menu_summary: text.trim() || null, updated_at: new Date().toISOString() }).eq("id", truckId);
    if (error) return void toast.error(error.message);
    toast.success("Summary saved"); void qc.invalidateQueries({ queryKey: ["admin", "truck", truckId] });
  }
  return (
    <section className="space-y-2 rounded-lg border border-border p-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">What {name} offers</h3>
        {!readOnly && (
          <button type="button" onClick={() => void generate()} disabled={busy} className="chip h-8 text-xs">
            {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />}{summary ? "Rewrite with AI" : "Write with AI"}
          </button>
        )}
      </div>
      <p className="text-xs text-muted-foreground">One paragraph shown above the menu. Written from the truck's profile and website — check it before saving.</p>
      {readOnly ? <p className="text-sm text-muted-foreground">{summary || "—"}</p> : (
        <>
          <textarea className="field min-h-20 w-full text-sm" maxLength={600} placeholder="One paragraph about what this business offers…" value={text} onChange={(e) => setText(e.target.value)} />
          {dirty && <button type="button" onClick={() => void save()} className="chip h-8 text-xs">Save summary</button>}
        </>
      )}
    </section>
  );
}

function SourcesTab({ id }: { id: string }) {
  const list = useServerFn(listTruckSources);
  const add = useServerFn(addTruckSource);
  const remove = useServerFn(removeTruckSource);
  const qc = useQueryClient();
  const [kind, setKind] = useState<TruckSourceKind>("page");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "truck-sources", id], queryFn: () => list({ data: { truckId: id } }) });
  const inv = () => void qc.invalidateQueries({ queryKey: ["admin", "truck-sources", id] });
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try { await add({ data: { truckId: id, kind, url } }); setUrl(""); toast.success("Source added — the two-hour scans will check it"); inv(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't add the source"); }
    finally { setBusy(false); }
  }
  async function del(sourceId: string) {
    try { await remove({ data: { truckId: id, sourceId } }); toast.success("Source removed"); inv(); }
    catch (err) { toast.error(err instanceof Error ? err.message : "Couldn't remove the source"); }
  }
  const meta = TRUCK_SOURCE_KINDS.find((k) => k.kind === kind)!;
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">These are this truck's primary sources. Enrich and the two-hour scans check them first; the shared community groups are only a fallback. Another truck's sources are never used for this truck.</p>
      <form onSubmit={submit} className="space-y-2 rounded-lg border border-border p-3">
        <div className="grid gap-2 sm:grid-cols-[10rem_minmax(0,1fr)]">
          <select value={kind} onChange={(e) => setKind(e.target.value as TruckSourceKind)} className="h-9 rounded-lg border border-input bg-background px-2 text-sm" aria-label="Source type">
            {TRUCK_SOURCE_KINDS.map((k) => <option key={k.kind} value={k.kind}>{k.label}</option>)}
          </select>
          <input className="h-9 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder={meta.placeholder} value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Source link" />
        </div>
        <button disabled={busy || !url.trim()} className="inline-flex h-9 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-60">
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}Add source
        </button>
      </form>
      {isLoading ? <Skeleton className="h-24" /> : !data?.length ? (
        <EmptyState icon={Link2} title="No sources yet" hint="Add the truck's Facebook, Instagram, website, calendar link or Google Maps profile." />
      ) : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.map((s) => (
            <li key={s.id} className="flex items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block font-medium">{TRUCK_SOURCE_KINDS.find((k) => k.kind === s.kind)?.label ?? s.kind}</span>
                <a href={s.url} target="_blank" rel="noreferrer" className="block truncate text-xs text-muted-foreground underline-offset-2 hover:underline">{s.url}</a>
                {s.last_status && <span className="block text-xs text-muted-foreground">Last check: {s.last_status}{s.last_run_at ? ` · ${new Date(s.last_run_at).toLocaleString()}` : ""}</span>}
              </span>
              <IconAction label="Remove source" icon={Trash2} tone="danger" onClick={() => void del(s.id)} />
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function MenuTab({ sections }: { sections: MenuSection[] }) {
  if (!sections.length) return <EmptyState icon={UtensilsCrossed} title="No published menu" hint="The owner can upload a menu photo and publish it from their dashboard." />;
  return (
    <div className="space-y-5">
      {sections.map((s, i) => (
        <section key={i}>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{s.name || "Menu"}</h3>
          <ul className="divide-y divide-border rounded-lg border border-border">
            {s.items.map((it, j) => (
              <li key={j} className="flex items-start justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="font-medium">{it.name}</span>{it.description && <span className="block text-xs text-muted-foreground">{it.description}</span>}</span>
                {it.price != null && <span className="shrink-0 tabular-nums">${it.price.toFixed(2)}</span>}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}

function PhotosTab({ id }: { id: string }) {
  const sign = useServerFn(signTruckPhotos);
  const { data, isLoading } = useQuery({ queryKey: ["admin", "truck-photos", id], queryFn: () => sign({ data: { truckId: id } }) });
  if (isLoading) return <div className="grid grid-cols-3 gap-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="aspect-square rounded-lg" />)}</div>;
  if (!data?.length) return <EmptyState icon={ImageOff} title="No photos yet" hint="Owners add photos from their dashboard." />;
  return (
    <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
      {data.map((p) => (
        <li key={p.id} className="relative overflow-hidden rounded-lg border border-border">
          <img src={p.url} alt="" loading="lazy" className="aspect-square w-full object-cover" />
          {p.is_cover && <span className="absolute left-1.5 top-1.5"><StatusPill tone="accent">Cover</StatusPill></span>}
        </li>
      ))}
    </ul>
  );
}

function StopsTab({ id }: { id: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "truck-stops", id],
    queryFn: async () => {
      const [s, r] = await Promise.all([
        supabase.from("stops").select("id,venue_name,address,starts_at,ends_at,cancelled,is_live,source").eq("truck_id", id).order("starts_at", { ascending: false }).limit(40),
        supabase.from("stop_series").select("id", { count: "exact", head: true }).eq("truck_id", id),
      ]);
      return { stops: s.data ?? [], series: r.count ?? 0 };
    },
  });
  if (isLoading || !data) return <div className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)}</div>;
  const now = Date.now();
  return (
    <div className="space-y-3">
      {data.series > 0 && <p className="text-sm text-muted-foreground">{data.series} repeating schedule rule{data.series === 1 ? "" : "s"} (shown on the public page).</p>}
      {!data.stops.length ? <EmptyState icon={CalendarX} title="No dated stops" hint="Stops appear here once the owner, a calendar or an approved post adds them." /> : (
        <ul className="divide-y divide-border rounded-lg border border-border">
          {data.stops.map((s) => {
            const live = !s.cancelled && new Date(s.starts_at).getTime() <= now && new Date(s.ends_at).getTime() > now;
            const past = new Date(s.ends_at).getTime() <= now;
            return (
              <li key={s.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-3 py-2 text-sm">
                <span className="min-w-0"><span className="block truncate font-medium">{s.venue_name || s.address || "Stop"}</span>
                  <span className="block text-xs text-muted-foreground">{new Date(s.starts_at).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} – {new Date(s.ends_at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })} · {s.source}</span></span>
                <StatusPill tone={s.cancelled ? "danger" : live ? "success" : past ? "neutral" : "warning"}>{s.cancelled ? "Cancelled" : live ? "Live" : past ? "Past" : "Upcoming"}</StatusPill>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function ActivityTab({ id, created, source }: { id: string; created: string; source: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ["admin", "truck-activity", id],
    queryFn: async () => {
      const [d, c] = await Promise.all([
        supabase.from("truck_deletions").select("id,created_at,action,actor_email").eq("truck_id", id).order("created_at", { ascending: false }),
        supabase.from("claims").select("id,created_at,status,user_email,reviewed_at").eq("truck_id", id).order("created_at", { ascending: false }),
      ]);
      return [
        ...(d.data ?? []).map((x) => ({ id: x.id, at: x.created_at, text: `${x.action[0]!.toUpperCase()}${x.action.slice(1)}${x.actor_email ? ` by ${x.actor_email}` : " automatically"}` })),
        ...(c.data ?? []).map((x) => ({ id: x.id, at: x.created_at, text: `Claim by ${x.user_email ?? "unknown"} · ${x.status}` })),
        { id: "created", at: created, text: `Added (${source})` },
      ].sort((a, b) => b.at.localeCompare(a.at));
    },
  });
  if (isLoading || !data) return <Skeleton className="h-24" />;
  if (!data.length) return <EmptyState icon={History} title="No activity" />;
  return (
    <ol className="space-y-3 border-l border-border pl-4">
      {data.map((a) => (
        <li key={a.id} className="relative text-sm">
          <span className="absolute -left-[21px] top-1.5 h-2 w-2 rounded-full bg-primary" aria-hidden />
          <p>{a.text}</p><p className="text-xs text-muted-foreground">{new Date(a.at).toLocaleString()}</p>
        </li>
      ))}
    </ol>
  );
}

function EnrichDialog({ open, onOpenChange, truckId, name, onStarted }: { open: boolean; onOpenChange: (o: boolean) => void; truckId: string; name: string; onStarted?: ((runId: string, name: string) => void) | undefined }) {
  const start = useServerFn(startEnrich);
  const [links, setLinks] = useState<string[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  function addLink() {
    const v = url.trim();
    if (!v || links.includes(v) || links.length >= 5) return;
    setLinks((ls) => [...ls, v]); setUrl("");
  }
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true);
    try {
      const { runId } = await start({ data: { truckId, customUrls: links.length ? links : undefined } });
      onOpenChange(false); setLinks([]); setUrl("");
      onStarted?.(runId, name);
      toast.success(`Enriching ${name} — watch the progress bar at the bottom`);
    } catch (err) { toast.error(err instanceof Error ? err.message : "Enrich failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setLinks([]); setUrl(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enrich {name}</DialogTitle>
          <DialogDescription>Searches this truck's own sources first — Facebook, Instagram, website, calendar links, Google Maps — then the shared community groups. Add extra links below, or just start. Stops without an address show up in Pending trucks.</DialogDescription>
        </DialogHeader>
        <form onSubmit={go} className="space-y-3">
          <div className="space-y-2">
            <label className="block text-sm font-medium">Extra links (optional, up to 5)</label>
            <div className="flex gap-2">
              <input className="field flex-1" placeholder="https://… Facebook/Instagram post or page, website" value={url} onChange={(e) => setUrl(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLink(); } }} />
              <button type="button" onClick={addLink} disabled={!url.trim() || links.length >= 5} className="chip h-10 shrink-0 text-sm disabled:opacity-60"><Plus className="h-4 w-4" />Add</button>
            </div>
            {links.length > 0 && (
              <ul className="space-y-1">
                {links.map((l) => (
                  <li key={l} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1.5 text-xs">
                    <Link2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="min-w-0 flex-1 truncate">{l}</span>
                    <button type="button" aria-label={`Remove ${l}`} onClick={() => setLinks((ls) => ls.filter((x) => x !== l))} className="text-muted-foreground hover:text-destructive"><XCircle className="h-4 w-4" /></button>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <button disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? "Starting…" : "Enrich now"}
          </button>
        </form>
      </DialogContent>
    </Dialog>
  );
}
