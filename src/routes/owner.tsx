import { Logo } from "@/components/Logo";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { closingTime, fmtRange, fmtTime, QC_CENTER, type Stop, type Truck } from "@/data/trucks";
import { useStops, dayBounds, useStopsRealtime } from "@/lib/queries";
import { geocode, fileToLogo } from "@/lib/geocode";

const TruckMap = lazy(() => import("@/components/TruckMap"));

export const Route = createFileRoute("/owner")({
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
    queryFn: async () => (await supabase.from("trucks").select("*").or(`claimed_by.eq.${user!.id},created_by.eq.${user!.id}`).order("name")).data ?? [],
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
        <Link to="/owner/new" className="chip">+ Add a truck</Link>
      </div>
      <h1 className="text-3xl font-extrabold">Owner dashboard</h1>
      {ready && !user && (
        <div className="panel space-y-3 p-5">
          <p>Sign in to manage your truck.</p>
          <button onClick={() => openAuth("Sign in to manage your truck.")} className="chip bg-primary text-primary-foreground">Sign in</button>
        </div>
      )}
      {pending.map((t) => <p key={t.id} className="panel p-3 text-sm"><b>{t.name}</b> is waiting for review and unlocks once approved.</p>)}
      {user && data && mine.length === 0 && (
        <p className="panel p-5 text-sm">No trucks linked to your account yet. Find your truck on the map and tap <b>"Claim it"</b>, or add a new one.</p>
      )}
      {mine.length > 1 && (
        <select className="field" value={truck?.id} onChange={(e) => setSel(e.target.value)}>
          {mine.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
      )}
      {truck && <TruckTools key={truck.id} truck={truck} />}
    </main>
  );
}

function TruckTools({ truck }: { truck: Truck }) {
  return (
    <>
      <LiveCard truck={truck} />
      <ScheduleForm truck={truck} />
      <WeekList truck={truck} />
      <ProfileForm truck={truck} />
    </>
  );
}

function LiveCard({ truck }: { truck: Truck }) {
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => setNow(new Date()), []);
  const [from, to] = useMemo(() => (now ? dayBounds(now) : [null, null]), [now]);
  const { data: today = [] } = useStops(from, to, [truck.id]);
  const live = today.find((s) => s.is_live && new Date(s.ends_at) > new Date());
  const [choice, setChoice] = useState<"+2h" | "+4h" | "9pm">("+4h");
  const [fallback, setFallback] = useState(false);
  const [pos, setPos] = useState(QC_CENTER);
  const [addr, setAddr] = useState("");
  const [busy, setBusy] = useState(false);

  async function checkIn(p: { lat: number; lng: number }, label = "Live location", city = "") {
    setBusy(true);
    const start = new Date();
    await supabase.from("stops").update({ cancelled: true }).eq("truck_id", truck.id).eq("is_live", true).eq("cancelled", false);
    const { error } = await supabase.from("stops").insert({
      truck_id: truck.id, venue_name: label, address: addr || null, city, lat: p.lat, lng: p.lng,
      starts_at: start.toISOString(), ends_at: closingTime(choice, start).toISOString(),
      source: "owner", confidence: 1, is_live: true,
    });
    setBusy(false);
    if (ok(error, "You're live on the map!")) setFallback(false);
  }

  function imHere() {
    if (!navigator.geolocation) return setFallback(true);
    setBusy(true);
    navigator.geolocation.getCurrentPosition(
      (p) => void checkIn({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => { setBusy(false); setFallback(true); toast("Couldn't get your location — enter an address or drag the pin."); },
      { enableHighAccuracy: true, timeout: 10000 },
    );
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
          <b>You're live</b> at {live.venue_name} until {fmtTime(live.ends_at)}.
          <button onClick={() => void supabase.from("stops").update({ cancelled: true }).eq("id", live.id).then(({ error }) => ok(error, "Checked out"))} className="chip ml-2">End now</button>
        </div>
      ) : null}
      <button disabled={busy} onClick={imHere} className="w-full rounded-2xl border-2 border-border bg-primary py-6 text-2xl font-extrabold text-primary-foreground shadow-pop">
        {busy ? "Locating…" : "📍 I'm here"}
      </button>
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Open until</span>
        {(["+2h", "+4h", "9pm"] as const).map((c) => (
          <button key={c} onClick={() => setChoice(c)} className={`chip ${choice === c ? "chip-active" : ""}`}>{c}</button>
        ))}
        <span className="text-xs text-muted-foreground">Auto-expires within 6h.</span>
      </div>
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

function ScheduleForm({ truck }: { truck: Truck }) {
  const [f, setF] = useState({ date: "", start: "11:00", end: "14:00", venue: "", address: "", weeks: 0 });
  const [busy, setBusy] = useState(false);
  useEffect(() => setF((x) => ({ ...x, date: isoLocal(new Date()).slice(0, 10) })), []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const g = await geocode(f.address);
    if (!g) { setBusy(false); return void toast.error("Address not found"); }
    const group = f.weeks > 0 ? crypto.randomUUID() : null;
    const rows = Array.from({ length: f.weeks + 1 }, (_, i) => {
      const s = new Date(`${f.date}T${f.start}`); s.setDate(s.getDate() + 7 * i);
      const en = new Date(`${f.date}T${f.end}`); en.setDate(en.getDate() + 7 * i);
      return {
        truck_id: truck.id, venue_name: f.venue || f.address, address: f.address, city: g.city, lat: g.lat, lng: g.lng,
        starts_at: s.toISOString(), ends_at: en.toISOString(), source: "owner" as const, confidence: 1, repeat_group: group,
      };
    });
    const { error } = await supabase.from("stops").insert(rows);
    setBusy(false);
    if (ok(error, `Added ${rows.length} stop${rows.length > 1 ? "s" : ""}`)) setF({ ...f, venue: "", address: "" });
  }

  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setF({ ...f, [k]: k === "weeks" ? Number(e.target.value) : e.target.value });

  return (
    <form onSubmit={submit} className="panel grid grid-cols-2 gap-2 p-5">
      <h2 className="col-span-2 text-xl font-bold">Schedule a stop</h2>
      <input className="field col-span-2" type="date" required value={f.date} onChange={set("date")} />
      <input className="field" type="time" required value={f.start} onChange={set("start")} />
      <input className="field" type="time" required value={f.end} onChange={set("end")} />
      <input className="field col-span-2" placeholder="Venue name (optional)" value={f.venue} onChange={set("venue")} />
      <input className="field col-span-2" placeholder="Address" required value={f.address} onChange={set("address")} />
      <select className="field" value={f.weeks} onChange={set("weeks")}>
        <option value={0}>Just once</option>
        {[3, 7, 11].map((w) => <option key={w} value={w}>Weekly for {w + 1} weeks</option>)}
      </select>
      <button disabled={busy} className="chip justify-center bg-primary text-primary-foreground">{busy ? "Saving…" : "Add stop"}</button>
    </form>
  );
}

function WeekList({ truck }: { truck: Truck }) {
  const [range, setRange] = useState<[Date, Date] | null>(null);
  useEffect(() => { const [a] = dayBounds(new Date()); const b = new Date(a); b.setDate(a.getDate() + 7); setRange([a, b]); }, []);
  const { data: stops = [] } = useStops(range?.[0] ?? null, range?.[1] ?? null, [truck.id]);
  const [edit, setEdit] = useState<string | null>(null);

  return (
    <section className="panel p-5">
      <h2 className="mb-2 text-xl font-bold">Next 7 days</h2>
      {stops.length === 0 && <p className="text-sm text-muted-foreground">Nothing scheduled.</p>}
      <ul className="divide-y-2 divide-muted">
        {stops.map((s) => edit === s.id ? <EditRow key={s.id} s={s} done={() => setEdit(null)} /> : (
          <li key={s.id} className="flex items-center gap-2 py-2 text-sm">
            <span className="w-24 font-semibold">{new Date(s.starts_at).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}</span>
            <span className="min-w-0 flex-1 truncate">{s.venue_name} · {fmtRange(s)}{s.source !== "owner" && <span className="text-muted-foreground"> · imported</span>}</span>
            <button onClick={() => setEdit(s.id)} className="chip">Edit</button>
            <button onClick={() => void supabase.from("stops").update({ cancelled: true }).eq("id", s.id).then(({ error }) => ok(error, "Stop cancelled"))} className="chip">Cancel</button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function EditRow({ s, done }: { s: Stop; done: () => void }) {
  const t = (iso: string) => isoLocal(new Date(iso)).slice(11, 16);
  const day = isoLocal(new Date(s.starts_at)).slice(0, 10);
  const [v, setV] = useState({ venue: s.venue_name, start: t(s.starts_at), end: t(s.ends_at) });
  async function save() {
    const { error } = await supabase.from("stops").update({
      venue_name: v.venue, source: "owner", confidence: 1,
      starts_at: new Date(`${day}T${v.start}`).toISOString(), ends_at: new Date(`${day}T${v.end}`).toISOString(),
    }).eq("id", s.id);
    if (ok(error, "Stop updated")) done();
  }
  return (
    <li className="grid grid-cols-2 gap-2 py-2">
      <input className="field col-span-2" value={v.venue} onChange={(e) => setV({ ...v, venue: e.target.value })} />
      <input className="field" type="time" value={v.start} onChange={(e) => setV({ ...v, start: e.target.value })} />
      <input className="field" type="time" value={v.end} onChange={(e) => setV({ ...v, end: e.target.value })} />
      <button onClick={save} className="chip justify-center bg-primary text-primary-foreground">Save</button>
      <button onClick={done} className="chip justify-center">Back</button>
    </li>
  );
}

function ProfileForm({ truck }: { truck: Truck }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: truck.name, category: truck.category, emoji: truck.emoji, description: truck.description,
    phone: truck.phone ?? "", website: truck.website ?? "", instagram: truck.instagram ?? "", facebook: truck.facebook ?? "",
    accepts_card: truck.accepts_card, logo_url: truck.logo_url,
  });
  const txt = (k: "name" | "category" | "emoji" | "description" | "phone" | "website" | "instagram" | "facebook", ph: string) => (
    <input className="field" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const { error } = await supabase.from("trucks").update(f).eq("id", truck.id);
    if (ok(error, "Profile saved")) { void qc.invalidateQueries({ queryKey: ["me"] }); void qc.invalidateQueries({ queryKey: ["trucks"] }); void qc.invalidateQueries({ queryKey: ["truck", truck.id] }); }
  }
  return (
    <form onSubmit={save} className="panel space-y-2 p-5">
      <h2 className="text-xl font-bold">Truck profile</h2>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border-2 border-border bg-secondary text-3xl">
          {f.logo_url ? <img src={f.logo_url} alt="" className="h-full w-full object-cover" /> : f.emoji}
        </div>
        <label className="chip cursor-pointer">Upload logo
          <input type="file" accept="image/*" className="hidden" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, logo_url: await fileToLogo(file) }); }} />
        </label>
      </div>
      {txt("name", "Truck name")}
      <div className="grid grid-cols-[1fr_5rem] gap-2">{txt("category", "Category")}{txt("emoji", "Emoji")}</div>
      <textarea className="field" rows={3} placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">{txt("phone", "Phone")}{txt("website", "Website")}{txt("instagram", "Instagram")}{txt("facebook", "Facebook")}</div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.accepts_card} onChange={(e) => setF({ ...f, accepts_card: e.target.checked })} /> Accepts cards</label>
      <button className="chip bg-primary text-primary-foreground">Save profile</button>
    </form>
  );
}
