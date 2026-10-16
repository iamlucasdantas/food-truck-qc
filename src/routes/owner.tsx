import { Logo } from "@/components/Logo";
import { OwnerSchedule } from "@/components/OwnerSchedule";
import { createFileRoute, Link, Outlet, useLocation } from "@tanstack/react-router";
import { ClientOnly } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { Tables } from "@/integrations/supabase/types";
import { useAuth } from "@/hooks/use-auth";
import { closingTime, fmtTime, QC_CENTER, type Truck } from "@/data/trucks";
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
        <Link to="/owner/new" className="chip">+ Add another truck</Link>
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
    </main></div>
  );
}

function TruckTools({ truck, siblings }: { truck: Truck; siblings: string[] }) {
  return (
    <>
      <LiveCard truck={truck} />
      <SuggestedStops truck={truck} />
      <OwnerSchedule truck={truck} />
      <ProfileForm truck={truck} siblings={siblings} />
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
  const SRC: Record<string, string> = { page: "Facebook page", group: "Facebook group", reddit: "Reddit", instagram: "Instagram" };

  function openEdit(s: Suggestion) {
    const d = new Date(s.starts_at);
    setF({
      venue_name: s.venue_name, address: s.address ?? "", city: s.city,
      date: isoLocal(d).slice(0, 10), start: fmtTime(s.starts_at), end: fmtTime(s.ends_at),
    });
    setEdit(s);
  }

  async function approve(s: Suggestion, fields?: typeof f) {
    let row = { venue_name: s.venue_name, address: s.address, city: s.city, lat: s.lat, lng: s.lng, starts_at: s.starts_at, ends_at: s.ends_at };
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

function ProfileForm({ truck, siblings }: { truck: Truck; siblings: string[] }) {
  const qc = useQueryClient();
  const [f, setF] = useState({
    name: truck.name, category: truck.category, emoji: truck.emoji, description: truck.description,
    phone: truck.phone ?? "", website: truck.website ?? "", instagram: truck.instagram ?? "", facebook: truck.facebook ?? "", reddit: truck.reddit ?? "",
    accepts_card: truck.accepts_card, logo_url: truck.logo_url, truck_type: truck.truck_type,
  });
  const txt = (k: "name" | "category" | "emoji" | "description" | "phone" | "website" | "instagram" | "facebook" | "reddit", ph: string) => (
    <input className="field" placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f.name.trim()) return void toast.error("The truck name is required.");
    if (siblings.some((n) => n.trim().toLowerCase() === f.name.trim().toLowerCase())) return void toast.error("You already have a truck with that name — pick a unique one.");
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
      <label className="block space-y-1 text-sm font-semibold">Fixed or mobile?
        <select className="field" value={f.truck_type} onChange={(e) => setF({ ...f, truck_type: e.target.value as "fixed" | "mobile" })}>
          <option value="mobile">🚚 Mobile — shows at scheduled stops or “I'm here”</option>
          <option value="fixed">🏠 Fixed location — always on the map during your hours</option>
        </select>
      </label>
      <textarea className="field" rows={3} placeholder="Description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      <div className="grid grid-cols-2 gap-2">{txt("phone", "Phone")}{txt("website", "Website")}{txt("instagram", "Instagram")}{txt("facebook", "Facebook")}{txt("reddit", "Reddit username")}</div>
      <p className="text-xs text-muted-foreground">Your social handles tell FoodTruckQC which posts are yours — stops from your own posts go straight onto your public calendar.</p>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.accepts_card} onChange={(e) => setF({ ...f, accepts_card: e.target.checked })} /> Accepts cards</label>
      <button className="chip bg-primary text-primary-foreground">Save profile</button>
    </form>
  );
}
