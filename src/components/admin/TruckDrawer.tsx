import { useQuery } from "@tanstack/react-query";
import { LocationConfirmation } from '@/components/LocationConfirmation';
import { OwnerMenu } from "@/components/OwnerMenu";
import { OwnerPhotos } from "@/components/OwnerPhotos";
import { OwnerSchedule } from "@/components/OwnerSchedule";
import { ScreenshotStops } from "./ScreenshotStops";
import type { Truck } from "@/data/trucks";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ExternalLink, Pencil, GitMerge, Archive, CheckCircle2, Trash2, RotateCcw, UtensilsCrossed, ImageOff, CalendarX, History, Sparkles, Loader2, CheckCircle, XCircle } from "lucide-react";
import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { enrichTruck, type EnrichStep } from "@/lib/enrich.functions";
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

export function TruckDrawer({ truckId, onClose, actions, tab }: { truckId: string | null; onClose: () => void; actions: DrawerActions; tab?: string }) {
  return (
    <Sheet open={!!truckId} onOpenChange={(o) => !o && onClose()}>
      <SheetContent side="right" className="flex w-full flex-col gap-0 overflow-hidden p-0 sm:max-w-xl">
        {truckId && <Body key={`${truckId}:${tab ?? ""}`} id={truckId} actions={actions} tab={tab} />}
      </SheetContent>
    </Sheet>
  );
}

function Body({ id, actions, tab }: { id: string; actions: DrawerActions; tab?: string }) {
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
      <EnrichDialog open={enrichOpen} onOpenChange={setEnrichOpen} truckId={t.id} name={t.name} />
      <Tabs defaultValue={["overview", "menu", "photos", "stops", "activity"].includes(tab ?? "") ? tab : "overview"} className="flex min-h-0 flex-1 flex-col">
        <TabsList className="mx-6 mt-4 grid grid-cols-5">
          {["overview", "menu", "photos", "stops", "activity"].map((k) => <TabsTrigger key={k} value={k} className="capitalize">{k}</TabsTrigger>)}
        </TabsList>
        <div className="min-h-0 flex-1 overflow-y-auto p-6">
          <TabsContent value="overview" className="mt-0">
            <dl className="grid grid-cols-[8rem_minmax(0,1fr)] gap-x-4 gap-y-3 text-sm">
              {([
                ["Type", t.truck_type === "fixed" ? "Fixed location" : "Mobile"], ["Address", t.base_address], ["Phone", t.phone], ["Website", t.website],
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
          <TabsContent value="menu" className="mt-0 space-y-4">{t.deleted_at ? <MenuTab sections={(t.menu_sections as MenuSection[] | null) ?? []} /> : <OwnerMenu truck={t as Truck} />}</TabsContent>
          <TabsContent value="photos" className="mt-0">{t.deleted_at ? <PhotosTab id={t.id} /> : <OwnerPhotos truckId={t.id} />}</TabsContent>
          <TabsContent value="stops" className="mt-0 space-y-4">
            {!t.deleted_at && <><ScreenshotStops truckId={t.id} /><OwnerSchedule truck={t as Truck} /></>}
            <h3 className="text-sm font-semibold">Stop history</h3>
            <StopsTab id={t.id} />
          </TabsContent>
          <TabsContent value="activity" className="mt-0"><ActivityTab id={t.id} created={t.created_at} source={t.source} /></TabsContent>
        </div>
      </Tabs>
    </>
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

function EnrichDialog({ open, onOpenChange, truckId, name }: { open: boolean; onOpenChange: (o: boolean) => void; truckId: string; name: string }) {
  const run = useServerFn(enrichTruck);
  const qc = useQueryClient();
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState<EnrichStep[] | null>(null);
  async function go(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setSteps(null);
    try {
      const r = await run({ data: { truckId, customUrl: url.trim() || undefined } });
      setSteps(r.steps);
      void qc.invalidateQueries({ queryKey: ["admin"] }); void qc.invalidateQueries({ queryKey: ["stops"] });
    } catch (err) { toast.error(err instanceof Error ? err.message : "Enrich failed"); }
    finally { setBusy(false); }
  }
  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) { setSteps(null); setUrl(""); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Enrich {name}</DialogTitle>
          <DialogDescription>Searches Facebook, Instagram, the truck's website, venue calendars and an optional custom link for stops. Stops without an address show up in Pending trucks.</DialogDescription>
        </DialogHeader>
        <form onSubmit={go} className="space-y-3">
          <label className="block text-sm font-medium">Custom link (optional)
            <input className="field mt-1" placeholder="https://… event page, directory, website" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          <button disabled={busy} className="inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-60">
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}{busy ? "Searching sources… (up to a minute)" : "Enrich now"}
          </button>
        </form>
        {steps && (
          <ul className="space-y-2 text-sm">
            {steps.map((s, i) => (
              <li key={i} className="flex gap-2">
                {s.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
                <span><b>{s.source}:</b> {s.detail}</span>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
