import { Logo } from "@/components/Logo";
import { OwnerSchedule } from "@/components/OwnerSchedule";
import { OwnerPhotos } from "@/components/OwnerPhotos";
import { OwnerMenu } from "@/components/OwnerMenu";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { liveEnd, fmtCentral, LIVE_DEFAULT_MINUTES, type LiveChoice, fmtTime, QC_CENTER, effectivePayments, type Business, type Truck } from "@/data/trucks";
import { PaymentPicker } from "@/components/PaymentPicker";
import { ClaimSuggestions } from "@/components/ClaimSuggestions";
import { checklist, readProgress, showSetupCard } from "@/data/onboarding";
import { useStops, dayBounds, useStopsRealtime } from "@/lib/queries";
import { geocode, fileToLogo } from "@/lib/geocode";

const TruckMap = lazy(() => import("@/components/TruckMap"));

export const Route = createFileRoute("/owner")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Owner dashboard | FoodTruckQC" },
      { name: "description", content: "Check in live, post your schedule and edit your truck profile." },
      { property: "og:title", content: "Owner dashboard | FoodTruckQC" },
      { property: "og:description", content: "Tools for Quad Cities food truck owners." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: OwnerLayout,
});

function OwnerLayout() {
  const { pathname } = useLocation();
  return pathname === "/owner" || pathname === "/owner/" ? <Owner /> : <Outlet />;
}

const ok = (error: { message: string } | null, msg: string) => (error ? (toast.error(error.message), false) : (toast.success(msg), true));
const isoLocal = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString();

function Owner() {
  const { user, ready, openAuth } = useAuth();
  const { data } = useQuery({
    queryKey: ["me", "owner-trucks", user?.id],
    enabled: !!user,
    queryFn: async () => (await supabase.from("trucks").select("*").or(`claimed_by.eq.${user!.id},created_by.eq.${user!.id}`).is("deleted_at", null).order("name")).data ?? [],
  });
  const mine = (data ?? []).filter((t) => t.claimed_by === user?.id);
  const pending = (data ?? []).filter((t) => t.claimed_by !== user?.id && t.status === "pending");
  const [sel, setSel] = useState<string | null>(null);
  const truck = mine.find((t) => t.id === sel) ?? mine[0];
  useStopsRealtime();

  return (
    <div className="min-h-dvh bg-sidebar text-sidebar-foreground"><header className="border-b border-sidebar-border bg-sidebar"><div className="mx-auto flex w-full max-w-[1100px] items-center justify-between gap-3 p-4"><Logo /><Link to="/" className="chip">← Map</Link></div></header>
    <main className="mx-auto w-full max-w-[1100px] min-w-0 space-y-4 p-4 pb-16">
      <div className="flex items-center justify-end">
        <Link to="/owner/new" className="chip">+ Add another truck</Link>
      </div>
      <h1 className="text-3xl font-extrabold">Owner dashboard</h1>
      {ready && !user && (
        <div className="panel space-y-3 p-5">
          <p>Sign in to manage your truck.</p>
          <button onClick={() => openAuth("Sign in to manage your truck.")} className="chip bg-primary text-primary-foreground">Sign in</button>
        </div>
      )}
      {user && <ClaimSuggestions userId={user.id} />}
      {user && <SetupCard userId={user.id} />}
      {pending.map((t) => <p key={t.id} className="panel p-3 text-sm"><b>{t.name}</b> is waiting for review. You can already add its menu, photos and schedule in <Link to="/owner/onboarding" className="font-semibold underline">setup</Link>.</p>)}
      {user && data && mine.length === 0 && pending.length === 0 && (
        <div className="panel space-y-3 p-5 text-sm">
          <p>No trucks linked to your account yet. Set up your business and truck in a few short steps, or find your truck on the map and tap <b>"Claim it"</b>.</p>
          <Link to="/owner/onboarding" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-primary-foreground">Start setup</Link>
        </div>
      )}
      {mine.length > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          {mine.map((t) => (
            <button key={t.id} onClick={() => setSel(t.id)} className={`chip ${truck?.id === t.id ? "chip-active" : ""}`}>
              {t.truck_type === "fixed" ? "🏠" : "🚚"} {t.name}
            </button>
          ))}
          <Link to="/owner/new" className="chip">+ Add another truck</Link>
        </div>
      )}
      {truck && <TruckTools key={truck.id} truck={truck} siblings={mine.filter((t) => t.id !== truck.id).map((t) => t.name)} />}
      {user && mine.length > 0 && <BusinessForm ownerId={user.id} />}
    </main></div>
  );
}

/** "Finish setting up" checklist until every onboarding step is done or the owner dismisses it. */
function SetupCard({ userId }: { userId: string }) {
  const qc = useQueryClient();
  const { data: raw } = useQuery({
    queryKey: ["me", "onboarding", userId],
    queryFn: async () => {
      const [{ data: prof }, { data: biz }, { data: trucks }] = await Promise.all([
        supabase.from("profiles").select("onboarding").eq("id", userId).maybeSingle(),
        supabase.from("businesses").select("name").eq("owner_id", userId).maybeSingle(),
        supabase.from("trucks").select("id").or(`claimed_by.eq.${userId},created_by.eq.${userId}`).limit(1),
      ]);
      // Owners who set up before the wizard existed already have these done.
      let p = readProgress(prof?.onboarding);
      if (biz?.name) p = { ...p, done: Array.from(new Set([...p.done, "business" as const])) };
      if (trucks?.length) p = { ...p, done: Array.from(new Set([...p.done, "truck" as const])) };
      return p;
    },
  });
  if (raw === undefined) return null;
  const p = raw;
  if (!showSetupCard(p)) return null;
  const items = checklist(p);
  const next = items.find((i) => !i.done);
  async function dismiss() {
    await supabase.from("profiles").update({ onboarding: { ...p, dismissed: true } }).eq("id", userId);
    void qc.invalidateQueries({ queryKey: ["me", "onboarding", userId] });
  }
  return (
    <section className="panel space-y-3 p-5">
      <div className="flex items-start justify-between gap-3">
        <div><h2 className="text-xl font-bold">Finish setting up</h2><p className="text-sm text-muted-foreground">{items.filter((i) => i.done).length} of {items.length} done</p></div>
        <button onClick={() => void dismiss()} className="chip">Dismiss</button>
      </div>
      <ul className="space-y-1 text-sm">
        {items.map((i) => (
          <li key={i.key}><Link to="/owner/onboarding" search={{ step: i.index + 1 }} className="flex min-h-11 items-center gap-2 rounded-xl px-2 hover:bg-muted">
            <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-bold ${i.done ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{i.done ? "✓" : ""}</span>
            <span className={i.done ? "text-muted-foreground line-through" : "font-semibold"}>{i.title}</span>
            <span className="sr-only">{i.done ? "done" : "not done yet"}</span>
          </Link></li>
        ))}
      </ul>
      {next && <Link to="/owner/onboarding" search={{ step: next.index + 1 }} className="chip">Continue setup →</Link>}
    </section>
  );
}

function TruckTools({ truck, siblings }: { truck: Truck; siblings: string[] }) {
  return (
    <>
      <LiveCard truck={truck} />
      <SuggestedStops truck={truck} />
      <OwnerSchedule truck={truck} />
      <ProfileForm truck={truck} siblings={siblings} />
      <OwnerPhotos truckId={truck.id} />
      <OwnerMenu truck={truck} />
    </>
  );
}

type Suggestion = Tables<"suggested_stops">;

/** Inbox of stops detected in other people's posts. Nothing is public until approved. */
function SuggestedStops({ truck }: { truck: Truck }) {
  const qc = useQueryClient();
  const { data: items = [] } = useQuery({
    queryKey: ["suggested-stops", truck.id],
    queryFn: async () => (await supabase.from("suggested_stops").select("*").eq("truck_id", truck.id).eq("status", "pending").order("starts_at")).data ?? [],
  });
  const [edit, setEdit] = useState<Suggestion | null>(null);
  const [f, setF] = useState({ venue_name: "", address: "", city: "", date: "", start: "", end: "" });
  const SRC: Record<string, string> = { paste: "Community post", page: "Facebook page", group: "Facebook group", reddit: "Reddit", instagram: "Instagram" };

  function openEdit(s: Suggestion) {
    const d = new Date(s.starts_at);
    setF({
      venue_name: s.venue_name, address: s.address ?? "", city: s.city,
      date: isoLocal(d).slice(0, 10), start: fmtTime(s.starts_at), end: fmtTime(s.ends_at),
    });
    setEdit(s);
  }

  async function approve(s: Suggestion, fields?: typeof f) {
    let row = { venue_name: s.venue_name, address: s.address, city: s.city, lat: s.lat ?? QC_CENTER.lat, lng: s.lng ?? QC_CENTER.lng, starts_at: s.starts_at, ends_at: s.ends_at };
    if (fields) {
      const g = await geocode([fields.address || fields.venue_name, fields.city || "Quad Cities"].filter(Boolean).join(", "));
      const [sh, sm] = fields.start.replace(/(am|pm)/, "").split(":").map(Number);
      const [eh, em] = fields.end.replace(/(am|pm)/, "").split(":").map(Number);
      const pm = (v: string) => v.includes("pm") ? 12 : 0;
      const mk = (h: number, m: number, off: number) => { const d = new Date(`${fields.date}T00:00:00`); d.setHours((h % 12) + off, m, 0, 0); return d; };
      row = {
        venue_name: fields.venue_name, address: fields.address || null, city: fields.city,
        lat: g?.lat ?? s.lat ?? QC_CENTER.lat, lng: g?.lng ?? s.lng ?? QC_CENTER.lng,
        starts_at: mk(sh ?? 11, sm ?? 0, pm(fields.start)).toISOString(), ends_at: mk(eh ?? 14, em ?? 0, pm(fields.end)).toISOString(),
      };
    }
    const { error } = await supabase.from("stops").insert({
      truck_id: truck.id, ...row, venue_name: row.venue_name || "Suggested stop",
      source: "apify_post", confidence: 0.9, source_url: s.source_url,
    });
    if (error) return void toast.error(error.message);
    await supabase.from("suggested_stops").update({ status: "approved", reviewed_at: new Date().toISOString() }).eq("id", s.id);
    toast.success("Stop added to your public schedule");
    setEdit(null);
    void qc.invalidateQueries({ queryKey: ["suggested-stops", truck.id] });
    void qc.invalidateQueries({ queryKey: ["stops"] });
  }

  async function reject(s: Suggestion) {
    const { error } = await supabase.from("suggested_stops").update({ status: "rejected", reviewed_at: new Date().toISOString() }).eq("id", s.id);
    if (ok(error, "Suggestion rejected")) void qc.invalidateQueries({ queryKey: ["suggested-stops", truck.id] });
  }

  if (!items.length) return null;
  return (
    <section className="panel space-y-3 p-5">
      <h2 className="text-xl font-bold">Suggested stops</h2>
      <p className="text-xs text-muted-foreground">Found in community posts. Nothing is public until you approve it.</p>
      <ul className="space-y-3">
        {items.map((s) => (
          <li key={s.id} className="space-y-2 rounded-xl border-2 border-border p-3 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <span className="chip">{SRC[s.source] ?? s.source}</span>
              {s.needs_address_check && <span className="chip border-destructive text-destructive">Check address</span>}
              <b>{new Date(s.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</b>
              <span>{fmtTime(s.starts_at)}–{fmtTime(s.ends_at)}</span>
              <span className="text-muted-foreground">{s.venue_name}{s.city ? `, ${s.city}` : ""}</span>
            </div>
            <p className="line-clamp-3 text-xs text-muted-foreground">“{s.excerpt}”</p>
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => void approve(s)} className="chip bg-primary text-primary-foreground">Approve</button>
              <button onClick={() => openEdit(s)} className="chip">Edit</button>
              <button onClick={() => void reject(s)} className="chip">Reject</button>
              {s.source_url && <a href={s.source_url} target="_blank" rel="noreferrer" className="chip">View post</a>}
            </div>
          </li>
        ))}
      </ul>
      {edit && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-foreground/40 p-4" onClick={() => setEdit(null)}>
          <form className="panel w-full max-w-md space-y-2 p-5" onClick={(e) => e.stopPropagation()} onSubmit={(e) => { e.preventDefault(); void approve(edit, f); }}>
            <h3 className="text-lg font-bold">Edit suggested stop</h3>
            <input className="field" placeholder="Venue" value={f.venue_name} onChange={(e) => setF({ ...f, venue_name: e.target.value })} />
            <input className="field" placeholder="Address" value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
            <input className="field" placeholder="City" value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} />
            <input className="field" type="date" value={f.date} onChange={(e) => setF({ ...f, date: e.target.value })} />
            <div className="grid grid-cols-2 gap-2">
              <input className="field" placeholder="Start (e.g. 11am)" value={f.start} onChange={(e) => setF({ ...f, start: e.target.value })} />
              <input className="field" placeholder="End (e.g. 2pm)" value={f.end} onChange={(e) => setF({ ...f, end: e.target.value })} />
            </div>
            <div className="flex gap-2">
              <button className="chip bg-primary text-primary-foreground">Save and approve</button>
              <button type="button" onClick={() => setEdit(null)} className="chip">Cancel</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}

function LiveCard({ truck }: { truck: Truck }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [from, to] = useMemo(() => (now ? dayBounds(now) : [null, null]), [now]);
  const { data: today = [] } = useStops(from, to, [truck.id]);
  const live = today.find((s) => s.is_live && new Date(s.ends_at) > new Date());
  const [mins, setMins] = useState<number | "custom">(LIVE_DEFAULT_MINUTES);
  const [customMode, setCustomMode] = useState<"length" | "until">("length");
  const [cH, setCH] = useState("2"); const [cM, setCM] = useState("0"); const [until, setUntil] = useState("");
  const choice: LiveChoice = mins !== "custom" ? { kind: "minutes", minutes: mins }
    : customMode === "length" ? { kind: "minutes", minutes: (Number(cH) || 0) * 60 + (Number(cM) || 0) } : { kind: "until", time: until };
  const [fallback, setFallback] = useState(false);
  const [pos, setPos] = useState(QC_CENTER);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);

  async function checkIn(p: { lat: number; lng: number }, label = "Live location", city = "") {
    const start = new Date();
    const end = liveEnd(choice, start);
    if (!end.ok) return void toast.error(end.error);
    setBusy(true);
    await supabase.from("stops").update({ cancelled: true }).eq("truck_id", truck.id).eq("is_live", true).eq("cancelled", false);
    const { error } = await supabase.from("stops").insert({
      truck_id: truck.id, venue_name: label, address: addr || null, city, lat: p.lat, lng: p.lng,
      starts_at: start.toISOString(), ends_at: end.end.toISOString(),
      source: "owner", confidence: 1, is_live: true,
    });
    setBusy(false);
    if (ok(error, "You're live on the map!")) setFallback(false);
  }

  function imHere() {
    const check = liveEnd(choice, new Date());
    if (!check.ok) return void toast.error(check.error);
    if (!navigator.geolocation) return setFallback(true);
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => void checkIn({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setBusy(false); setFallback(true); toast("Couldn't get your location — enter an address or drag the pin."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  }

  async function extend(stop: { id: string; starts_at: string; ends_at: string }, m: number) {
    const next = new Date(Date.parse(stop.ends_at) + m * 60_000);
    const max = Date.parse(stop.starts_at) + 12 * 3_600_000;
    if (next.getTime() > max) return void toast.error("A check-in can last 12 hours at most.");
    const { error } = await supabase.from("stops").update({ ends_at: next.toISOString() }).eq("id", stop.id);
    ok(error, `Extended until ${fmtCentral(next)}`);
  }

  async function findAddr() {
    const g = await geocode(addr);
    if (!g) { toast.error("Address not found"); return; }
    setPos(g);
  }

  async function closedToday() {
    if (!from || !to) return;
    const { error } = await supabase.from("stops").update({ cancelled: true }).eq("truck_id", truck.id)
      .gte("starts_at", from.toISOString()).lt("starts_at", to.toISOString());
    ok(error, "Marked closed for today");
  }

  return (
    <section className="panel space-y-3 p-5">
      {live ? (
        <div className="rounded-xl bg-pin-open/30 p-3 text-sm">
          <p><b>You're live</b> at {live.venue_name} until {fmtCentral(live.ends_at)}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[30, 60].map((m) => (
              <button key={m} onClick={() => void extend(live, m)} className="chip">+{m === 60 ? "1h" : "30 min"}</button>
            ))}
            <button onClick={() => void supabase.from("stops").update({ ends_at: new Date().toISOString(), is_live: true }).eq("id", live.id).then(({ error }) => error ? supabase.from("stops").update({ cancelled: true }).eq("id", live.id).then(({ error: e2 }) => ok(e2, "Checked out")) : ok(null, "Checked out"))} className="chip">End now</button>
          </div>
        </div>
      ) : null}
      <button disabled={busy} onClick={imHere} className="w-full rounded-2xl border-2 border-border bg-primary py-6 text-2xl font-extrabold text-primary-foreground shadow-pop">
        {busy ? "Locating…" : "📍 I'm here"}
      </button>
      <fieldset className="space-y-2 text-sm">
        <legend className="font-semibold">How long will you be here?</legend>
        <div className="flex flex-wrap gap-2">
          {[60, 120, 180, 240].map((m) => (
            <button key={m} type="button" onClick={() => setMins(m)} aria-pressed={mins === m} className={`chip min-h-10 ${mins === m ? "chip-active" : ""}`}>{m / 60}h</button>
          ))}
          <button type="button" onClick={() => setMins("custom")} aria-pressed={mins === "custom"} className={`chip min-h-10 ${mins === "custom" ? "chip-active" : ""}`}>Custom</button>
        </div>
        {mins === "custom" && (
          <div className="space-y-2 rounded-xl border-2 border-border p-3">
            <div className="flex gap-2">
              <button type="button" onClick={() => setCustomMode("length")} aria-pressed={customMode === "length"} className={`chip ${customMode === "length" ? "chip-active" : ""}`}>For…</button>
              <button type="button" onClick={() => setCustomMode("until")} aria-pressed={customMode === "until"} className={`chip ${customMode === "until" ? "chip-active" : ""}`}>Until…</button>
            </div>
            {customMode === "length" ? (
              <div className="flex items-center gap-2">
                <label className="flex items-center gap-1"><input className="field w-20 text-base" type="number" min={0} max={12} inputMode="numeric" value={cH} onChange={(e) => setCH(e.target.value)} aria-label="Hours" /> h</label>
                <label className="flex items-center gap-1"><input className="field w-20 text-base" type="number" min={0} max={59} step={5} inputMode="numeric" value={cM} onChange={(e) => setCM(e.target.value)} aria-label="Minutes" /> min</label>
              </div>
            ) : (
              <label className="flex items-center gap-2">End time <input className="field w-36 text-base" type="time" value={until} onChange={(e) => setUntil(e.target.value)} aria-label="End time (Central)" /></label>
            )}
            <p className="text-xs text-muted-foreground">Between 15 minutes and 12 hours. Times are Central (Quad Cities).</p>
          </div>
        )}
        {(() => { const r = liveEnd(choice, new Date()); return <p className="text-muted-foreground">{r.ok ? `Shows "Here until ${fmtCentral(r.end)}" and ends on its own.` : r.error}</p>; })()}
      </fieldset>
      {fallback && (
        <div className="space-y-2">
          <div className="flex gap-2">
            <input className="field" placeholder="Address, e.g. 1200 River Dr, Moline" value={addr} onChange={(e) => setAddr(e.target.value)} />
            <button onClick={findAddr} className="chip shrink-0">Find</button>
          </div>
          <div className="h-56 overflow-hidden rounded-xl border-2 border-border">
            <ClientOnly fallback={null}>
              <Suspense fallback={null}>
                <TruckMap pins={[]} center={pos} radiusMi={0} zoom={15} showRadius={false} onSelect={() => {}} onCenterChange={setPos} />
              </Suspense>
            </ClientOnly>
          </div>
          <button disabled={busy} onClick={() => void checkIn(pos, addr || "Live location")} className="chip w-full justify-center bg-primary py-2 text-primary-foreground">Check in at pin</button>
        </div>
      )}
      <button onClick={closedToday} className="chip">🚫 Closed today</button>
    </section>
  );
}

function useBusiness(ownerId: string | null | undefined) {
  return useQuery({
    queryKey: ["business", ownerId],
    enabled: !!ownerId,
    queryFn: async () => (await supabase.from("businesses").select("*").eq("owner_id", ownerId!).maybeSingle()).data as Business | null,
  });
}


function BusinessForm({ ownerId }: { ownerId: string }) {
  const qc = useQueryClient();
  const { data: biz, isLoading } = useBusiness(ownerId);
  const [f, setF] = useState<null | { name: string; description: string; website: string; instagram: string; facebook: string; reddit: string; logo_url: string | null; payment_methods: string[]; payment_other: string }>(null);
  useEffect(() => {
    if (isLoading || f) return;
    setF({ name: biz?.name ?? "", description: biz?.description ?? "", website: biz?.website ?? "", instagram: biz?.instagram ?? "", facebook: biz?.facebook ?? "", reddit: biz?.reddit ?? "", logo_url: biz?.logo_url ?? null, payment_methods: biz?.payment_methods ?? [], payment_other: biz?.payment_other ?? "" });
  }, [biz, isLoading, f]);
  if (!f) return null;
  const txt = (k: "name" | "website" | "instagram" | "facebook" | "reddit", label: string, ph = "") => (
    <label className="block space-y-1 text-sm font-semibold">{label}
      <input className="field w-full text-base font-normal" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const row = { ...f!, owner_id: ownerId, website: f!.website.trim() || null, instagram: f!.instagram.trim() || null, facebook: f!.facebook.trim() || null, reddit: f!.reddit.trim() || null, updated_at: new Date().toISOString() };
    const { error } = await supabase.from("businesses").upsert(row, { onConflict: "owner_id" });
    if (ok(error, "Business profile saved")) { void qc.invalidateQueries({ queryKey: ["business"] }); void qc.invalidateQueries({ queryKey: ["truck"] }); }
  }
  return (
    <form onSubmit={save} className="panel space-y-3 p-5">
      <div>
        <h2 className="text-xl font-bold">Business profile</h2>
        <p className="text-sm text-muted-foreground">Shared by all your trucks.</p>
      </div>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border-2 border-border bg-secondary text-3xl">
          {f.logo_url ? <img src={f.logo_url} alt="Business logo" className="h-full w-full object-cover" /> : "🏪"}
        </div>
        <label className="chip cursor-pointer">Upload logo
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, logo_url: await fileToLogo(file) }); }} />
        </label>
      </div>
      {txt("name", "Business name")}
      <label className="block space-y-1 text-sm font-semibold">About your business
        <textarea className="field w-full text-base font-normal" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="grid gap-3 sm:grid-cols-2">{txt("website", "Website", "https://…")}{txt("instagram", "Instagram", "@handle")}{txt("facebook", "Facebook", "facebook.com/yourpage")}{txt("reddit", "Reddit username", "u/name")}</div>
      <p className="text-sm text-muted-foreground">These handles tell FoodTruckQC which posts are yours — stops from your own posts go straight onto the right truck's public calendar.</p>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Accepted payment methods</legend>
        <PaymentPicker idPrefix="biz" value={f.payment_methods} other={f.payment_other} onChange={(v, o) => setF({ ...f, payment_methods: v, payment_other: o })} />
      </fieldset>
      <button className="chip">Save business profile</button>
    </form>
  );
}

function ProfileForm({ truck, siblings }: { truck: Truck; siblings: string[] }) {
  const qc = useQueryClient();
  const { data: biz } = useBusiness(truck.claimed_by);
  const [f, setF] = useState({
    name: truck.name, category: truck.category, emoji: truck.emoji, phone: truck.phone ?? "",
    logo_url: truck.logo_url, truck_type: truck.truck_type, base_address: truck.base_address ?? "",
    payments_same_as_business: truck.payments_same_as_business, payment_methods: truck.payment_methods, payment_other: truck.payment_other,
  });
  const txt = (k: "name" | "category" | "emoji" | "phone" | "base_address", label: string) => (
    <label className="block space-y-1 text-sm font-semibold">{label}
      <input className="field w-full text-base font-normal" value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
    </label>
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("The truck name is required.");
    if (siblings.some((n) => n.trim().toLowerCase() === f.name.trim().toLowerCase())) return void toast.error("You already have a truck with that name — pick a unique one.");
    if (f.truck_type === "fixed" && !f.base_address.trim()) return void toast.error("A fixed location needs its address.");
    const addrChanged = f.base_address.trim() !== (truck.base_address ?? "");
    const g = addrChanged && f.base_address.trim() ? await geocode(f.base_address.trim()) : null;
    const pays = effectivePayments(f, biz);
    const { error } = await supabase.from("trucks").update({
      ...f, base_address: f.base_address.trim() || null,
      ...(addrChanged ? { base_lat: g?.lat ?? null, base_lng: g?.lng ?? null } : {}),
      accepts_card: pays.some((p) => p !== "Cash"),
    }).eq("id", truck.id);
    if (ok(error, "Truck saved")) { void qc.invalidateQueries({ queryKey: ["me"] }); void qc.invalidateQueries({ queryKey: ["trucks"] }); void qc.invalidateQueries({ queryKey: ["truck", truck.id] }); }
  }
  return (
    <form onSubmit={save} className="panel space-y-3 p-5">
      <h2 className="text-xl font-bold">Truck profile</h2>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border-2 border-border bg-secondary text-3xl">
          {f.logo_url ? <img src={f.logo_url} alt="Truck photo" className="h-full w-full object-cover" /> : f.emoji}
        </div>
        <label className="chip cursor-pointer">Upload truck photo
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, logo_url: await fileToLogo(file) }); }} />
        </label>
      </div>
      {txt("name", "Truck name")}
      <div className="grid grid-cols-[1fr_5rem] gap-2">{txt("category", "Cuisine")}{txt("emoji", "Emoji")}</div>
      <label className="block space-y-1 text-sm font-semibold">Fixed or mobile?
        <select className="field w-full text-base font-normal" value={f.truck_type} onChange={(e) => setF({ ...f, truck_type: e.target.value as "fixed" | "mobile" })}>
          <option value="mobile">🚚 Mobile — shows at scheduled stops or “I'm here”</option>
          <option value="fixed">🏠 Fixed location — always on the map during your hours</option>
        </select>
      </label>
      {f.truck_type === "fixed" && txt("base_address", "Address of your fixed location")}
      {txt("phone", "Truck phone (optional)")}
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Payment methods</legend>
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={f.payments_same_as_business} onChange={(e) => setF({ ...f, payments_same_as_business: e.target.checked, payment_methods: e.target.checked ? f.payment_methods : (f.payment_methods.length ? f.payment_methods : biz?.payment_methods ?? []) })} />
          Same as business
        </label>
        {f.payments_same_as_business
          ? <p className="text-sm text-muted-foreground">{effectivePayments(f, biz).join(", ") || "None set yet — add them in your business profile."}</p>
          : <PaymentPicker idPrefix={`truck-${truck.id}`} value={f.payment_methods} other={f.payment_other} onChange={(v, o) => setF({ ...f, payment_methods: v, payment_other: o })} />}
      </fieldset>
      <button className="chip bg-primary text-primary-foreground">Save truck</button>
    </form>
  );
}
