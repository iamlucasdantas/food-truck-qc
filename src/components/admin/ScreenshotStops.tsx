import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhotoDrop } from "@/components/PhotoDrop";
import { blobToDataUrl, checkPhoto, prepareImage } from "@/lib/images";
import { readStopsScreenshot } from "@/lib/stop-reader.functions";
import { geocode } from "@/lib/geocode";
import { centralToUtc } from "@/data/trucks";
import type { StopDraft } from "@/data/stop-drafts";

/** Upload a schedule screenshot → AI draft of venues/dates/times → review → save as stops. */
export function ScreenshotStops({ truckId }: { truckId: string }) {
  const qc = useQueryClient();
  const read = useServerFn(readStopsScreenshot);
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState<StopDraft[]>([]);

  const onFiles = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    const bad = checkPhoto(f); if (bad) return void toast.error(bad);
    setBusy("Reading screenshot…");
    try {
      const image = await blobToDataUrl(await prepareImage(f, 1800, 0.85, "image/jpeg"));
      const r = await read({ data: { truckId, image } });
      if (r.error) toast.error(r.error);
      else if (!r.stops.length) toast(`No upcoming public stops found${r.skipped ? ` (${r.skipped} private/past skipped)` : ""}.`);
      else { setRows(r.stops); if (r.skipped) toast(`${r.skipped} private or past entries skipped.`); }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const set = (i: number, k: keyof StopDraft, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  const save = async () => {
    setBusy("Saving stops…");
    let ok = 0; const failed: string[] = [];
    for (const r of rows) {
      const g = await geocode([r.address || r.venue, r.city].filter(Boolean).join(", "));
      if (!g) { failed.push(r.venue); continue; }
      const { error } = await supabase.from("stops").insert({
        truck_id: truckId, venue_name: r.venue, address: r.address || g.label, city: r.city || g.city, lat: g.lat, lng: g.lng,
        starts_at: centralToUtc(r.date, r.start).toISOString(), ends_at: centralToUtc(r.date, r.end).toISOString(), source: "owner",
      });
      if (error) failed.push(`${r.venue}: ${error.message}`); else ok++;
      await new Promise((res) => setTimeout(res, 1100)); // address lookup allows ~1 request/second
    }
    setBusy("");
    if (ok) toast.success(`${ok} stop${ok === 1 ? "" : "s"} added`);
    if (failed.length) toast.error(`Address not found or not saved: ${failed.join(", ")} — fix the address and save again.`);
    setRows((rs) => rs.filter((r) => failed.some((f) => f.startsWith(r.venue))));
    void qc.invalidateQueries({ queryKey: ["stops"] }); void qc.invalidateQueries({ queryKey: ["admin", "truck-stops", truckId] });
  };

  return (
    <div className="space-y-3 rounded-lg border border-border p-3">
      <p className="text-sm font-semibold">Add stops from a screenshot</p>
      <PhotoDrop label={busy || "Drop a schedule screenshot"} hint="Post, flyer or calendar — private events and past dates are skipped" onFiles={(f) => void onFiles(f)} disabled={!!busy} />
      {rows.length > 0 && (
        <>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 text-sm sm:grid-cols-6">
                <input className="field col-span-2" aria-label="Venue" value={r.venue} onChange={(e) => set(i, "venue", e.target.value)} />
                <input className="field col-span-2" aria-label="Address" placeholder="Street address" value={r.address} onChange={(e) => set(i, "address", e.target.value)} />
                <input className="field col-span-2" aria-label="City" placeholder="City, State" value={r.city} onChange={(e) => set(i, "city", e.target.value)} />
                <input className="field col-span-2" type="date" aria-label="Date" value={r.date} onChange={(e) => set(i, "date", e.target.value)} />
                <input className="field" type="time" aria-label="Start" value={r.start} onChange={(e) => set(i, "start", e.target.value)} />
                <input className="field" type="time" aria-label="End" value={r.end} onChange={(e) => set(i, "end", e.target.value)} />
                <button className="chip col-span-2 justify-center" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" />Remove</button>
              </li>
            ))}
          </ul>
          <button disabled={!!busy} onClick={() => void save()} className="chip bg-primary text-primary-foreground">Save {rows.length} stop{rows.length === 1 ? "" : "s"} (Central time)</button>
        </>
      )}
    </div>
  );
}
