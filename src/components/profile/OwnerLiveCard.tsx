import { lazy, Suspense, useEffect, useMemo, useState } from "react";
import { ClientOnly } from "@tanstack/react-router";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { liveEnd, fmtCentral, LIVE_DEFAULT_MINUTES, QC_CENTER, type LiveChoice, type Truck } from "@/data/trucks";
import { useStops, dayBounds } from "@/lib/queries";
import { Button } from "@/components/ui/button";
import { MapPin, Square } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { geocode } from "@/lib/geocode";
const TruckMap = lazy(() => import("@/components/TruckMap"));
const ok = (error: { message: string } | null, msg: string) => error ? (toast.error(error.message), false) : (toast.success(msg), true);
export function OwnerLiveCard({ truck }: { truck: Truck }) {
  const qc = useQueryClient();
  const [now, setNow] = useState<Date | null>(null);
  useEffect(() => { setNow(new Date()); const timer=setInterval(()=>setNow(new Date()),1000);return ()=>clearInterval(timer); }, []);
  const [from, to] = useMemo(() => (now ? dayBounds(now) : [null, null]), [now]);
  const { data: today = [] } = useStops(from, to, [truck.id]);
  const live = today.find((s) => s.is_live && new Date(s.ends_at) > new Date() && new Date(s.starts_at) <= new Date());
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
    void qc.invalidateQueries({queryKey:["stops"]});
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
    void qc.invalidateQueries({queryKey:["stops"]});
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
    <div className="space-y-3">
      {live ? (
        <div className="rounded-xl bg-pin-open/30 p-3 text-sm">
          <p className="mb-2 text-2xl font-semibold">{now ? `${Math.max(0,Math.ceil((Date.parse(live.ends_at)-now.getTime())/60000))} min remaining` : "Live"}</p><p><b>You're live</b> at {live.venue_name} until {fmtCentral(live.ends_at)}.</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {[30, 60].map((m) => (
              <Button variant="outline" key={m} onClick={() => void extend(live, m)} className="chip">+{m === 60 ? "1h" : "30 min"}</Button>
            ))}
            <Button variant="outline" onClick={() => void supabase.from("stops").update({ ends_at: new Date().toISOString(), is_live: true }).eq("id", live.id).then(({ error }) => error ? supabase.from("stops").update({ cancelled: true }).eq("id", live.id).then(({ error: e2 }) => ok(e2, "Checked out")) : ok(null, "Checked out")).then(()=>qc.invalidateQueries({queryKey:["stops"]}))} className="chip"><Square/>End now</Button>
          </div>
        </div>
      ) : null}
      <Button disabled={busy} onClick={imHere} className="w-full rounded-2xl border-2 border-border bg-primary py-6 text-2xl font-extrabold text-primary-foreground shadow-pop">
        {busy ? "Locating…" : <><MapPin/>I'm here</>}
      </Button>
      <fieldset className="space-y-2 text-sm">
        <legend className="font-semibold">How long will you be here?</legend>
        <div className="flex flex-wrap gap-2">
          {[60, 120, 180, 240].map((m) => (
            <Button variant="outline" key={m} type="button" onClick={() => setMins(m)} aria-pressed={mins === m} className={`chip min-h-10 ${mins === m ? "chip-active" : ""}`}>{m / 60}h</Button>
          ))}
          <Button variant="outline" type="button" onClick={() => setMins("custom")} aria-pressed={mins === "custom"} className={`chip min-h-10 ${mins === "custom" ? "chip-active" : ""}`}>Custom</Button>
        </div>
        {mins === "custom" && (
          <div className="space-y-2 rounded-xl border-2 border-border p-3">
            <div className="flex gap-2">
              <Button variant="outline" type="button" onClick={() => setCustomMode("length")} aria-pressed={customMode === "length"} className={`chip ${customMode === "length" ? "chip-active" : ""}`}>For…</Button>
              <Button variant="outline" type="button" onClick={() => setCustomMode("until")} aria-pressed={customMode === "until"} className={`chip ${customMode === "until" ? "chip-active" : ""}`}>Until…</Button>
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
            <Button variant="outline" onClick={findAddr} className="chip shrink-0">Find</Button>
          </div>
          <div className="h-56 overflow-hidden rounded-xl border-2 border-border">
            <ClientOnly fallback={null}>
              <Suspense fallback={null}>
                <TruckMap pins={[]} center={pos} radiusMi={0} zoom={15} showRadius={false} onSelect={() => {}} onCenterChange={setPos} />
              </Suspense>
            </ClientOnly>
          </div>
          <Button disabled={busy} onClick={() => void checkIn(pos, addr || "Live location")} className="chip w-full justify-center bg-primary py-2 text-primary-foreground">Check in at pin</Button>
        </div>
      )}
      <Button variant="outline" onClick={closedToday} className="chip"><Square/>Closed today</Button>
    </div>
  );
}
