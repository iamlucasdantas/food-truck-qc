import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PhotoDrop } from "@/components/PhotoDrop";
import { blobToDataUrl, checkPhoto, prepareImage } from "@/lib/images";
import { readStopsScreenshot } from "@/lib/stop-reader.functions";
import { enrichScreenshotLocation } from "@/lib/screenshot-location.functions";
import { PlaceSearch } from "@/components/PlaceSearch";
import { Button } from "@/components/ui/button";
import { applyStopLocation, editableStopLocation, type EnrichedStopDraft } from "@/data/screenshot-location";
import { centralToUtc } from "@/data/trucks";
import type { StopDraft } from "@/data/stop-drafts";

/** Upload a schedule screenshot → AI draft of venues/dates/times → review → save as stops. */
export function ScreenshotStops({ truckId }: { truckId: string }) {
  const qc = useQueryClient();
  const read = useServerFn(readStopsScreenshot);
  const enrich = useServerFn(enrichScreenshotLocation);
  const [busy, setBusy] = useState("");
  const [rows, setRows] = useState<EnrichedStopDraft[]>([]);

  const locate = async (row: EnrichedStopDraft): Promise<EnrichedStopDraft> => {
    try {
      const request = { truckId, venue: row.venue, city: row.city, address: row.address };
      let result = await enrich({ data: request });
      const runId = "runId" in result ? result.runId : undefined;
      if (runId) {
        for (let attempt = 0; attempt < 24; attempt++) {
          await new Promise(resolve => setTimeout(resolve, 5000));
          result = await enrich({ data: { ...request, runId, finishApify: attempt === 23 } });
          if (!("pending" in result && result.pending)) break;
        }
      }
      return result.location ? applyStopLocation(row, result.location) : { ...row, address: result.address || row.address, city: result.city || row.city, locationIssue: result.issue || "Address lookup is incomplete. Choose a place below." };
    } catch (e) { return { ...row, locationIssue: e instanceof Error ? e.message : String(e) }; }
  };

  const onFiles = async (files: File[]) => {
    const f = files[0]; if (!f) return;
    const bad = checkPhoto(f); if (bad) return void toast.error(bad);
    setBusy("Reading screenshot…");
    try {
      const image = await blobToDataUrl(await prepareImage(f, 1800, 0.85, "image/jpeg"));
      const r = await read({ data: { truckId, image } });
      if (r.error) toast.error(r.error);
      else if (!r.stops.length) toast(`No upcoming public stops found${r.skipped ? ` (${r.skipped} private/past skipped)` : ""}.`);
      else {
        setRows(r.stops);
        if (r.skipped) toast(`${r.skipped} private or past entries skipped.`);
        const cache = new Map<string, EnrichedStopDraft>();
        for (let i = 0; i < r.stops.length; i++) {
          const row = r.stops[i]; if (!row) continue;
          setBusy(`Finding addresses… ${i + 1}/${r.stops.length}`);
          const key = JSON.stringify([row.venue.toLowerCase(), row.city.toLowerCase(), row.address.toLowerCase()]);
          const prior = cache.get(key);
          const found = prior ? { ...row, address: prior.address, city: prior.city, location: prior.location, locationIssue: prior.locationIssue } : i < 12 ? await locate(row) : { ...row, locationIssue: "Lookup batch limit reached. Choose a place below." };
          cache.set(key, found);
          setRows(rs => rs.map((v, j) => j === i ? found : v));
        }
      }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy("");
  };

  const set = (i: number, k: keyof StopDraft, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? editableStopLocation(r, k, v) : r)));

  const save = async () => {
    setBusy("Saving stops…");
    let ok = 0; const failed: string[] = [];
    for (const r of rows) {
      const resolved = r.location && !r.locationIssue ? r : r.locationIssue ? r : await locate(r);
      const g = resolved.location;
      if (!g || resolved.locationIssue) { failed.push(r.venue); continue; }
      const { error } = await supabase.from("stops").insert({
        truck_id: truckId, venue_name: r.venue, address: g.address, city: resolved.city || g.city, lat: g.lat, lng: g.lng,
        starts_at: centralToUtc(r.date, r.start).toISOString(), ends_at: centralToUtc(r.date, r.end).toISOString(), source: "owner",
      });
      if (error) failed.push(`${r.venue}: ${error.message}`); else ok++;
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
      <fieldset disabled={!!busy} className="min-w-0">
      {rows.length > 0 && (
        <>
          <ul className="space-y-2">
            {rows.map((r, i) => (
              <li key={i} className="grid grid-cols-2 gap-2 rounded-md border border-border p-2 text-sm sm:grid-cols-6">
                <input className="field col-span-2" aria-label="Venue" value={r.venue} onChange={(e) => set(i, "venue", e.target.value)} />
                <input className="field col-span-2" aria-label="Address" placeholder="Street address" value={r.address} onChange={(e) => set(i, "address", e.target.value)} />
                <input className="field col-span-2" aria-label="City" placeholder="City, State" value={r.city} onChange={(e) => set(i, "city", e.target.value)} />
                 <div className="col-span-2 sm:col-span-6">
                   {r.locationIssue && <p role="status" className="mb-2 break-words text-xs text-destructive">{r.locationIssue}</p>}
                   {r.location && !r.locationIssue && <p className="mb-2 text-xs text-muted-foreground">Address found · {r.location.source}</p>}
                   <PlaceSearch onPick={p => setRows(rs => rs.map((v, j) => j === i ? { ...applyStopLocation(v, { ...p, source: "Selected Google Maps place" }), locationIssue: undefined } : v))} />
                 </div>
                <input className="field col-span-2" type="date" aria-label="Date" value={r.date} onChange={(e) => set(i, "date", e.target.value)} />
                <input className="field" type="time" aria-label="Start" value={r.start} onChange={(e) => set(i, "start", e.target.value)} />
                <input className="field" type="time" aria-label="End" value={r.end} onChange={(e) => set(i, "end", e.target.value)} />
                 <Button variant="outline" className="col-span-2" onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" />Remove</Button>
              </li>
            ))}
          </ul>
           <Button disabled={!!busy} onClick={() => void save()}>Save {rows.length} stop{rows.length === 1 ? "" : "s"} (Central time)</Button>
        </>
      )}
      </fieldset>
    </div>
  );
}
