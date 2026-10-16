import { useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ArrowRight, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PhotoDrop } from "@/components/PhotoDrop";
import { checkPhoto, prepareImage } from "@/lib/images";
import { MAX_PHOTOS, PHOTO_BUCKET, orderPhotos, useTruckPhotos, type TruckPhoto } from "@/lib/photos";

export function OwnerPhotos({ truckId }: { truckId: string }) {
  const qc = useQueryClient();
  const { data: photos = [] } = useTruckPhotos(truckId);
  const [busy, setBusy] = useState("");
  const list = orderPhotos(photos);
  const refresh = () => qc.invalidateQueries({ queryKey: ["truck-photos", truckId] });

  async function upload(files: File[]) {
    const room = MAX_PHOTOS - photos.length;
    if (room <= 0) return void toast.error(`Up to ${MAX_PHOTOS} photos per truck.`);
    if (files.length > room) toast.error(`Only ${room} more photo${room === 1 ? "" : "s"} fit — adding the first ${room}.`);
    let pos = Math.max(-1, ...photos.map((p) => p.position)) + 1;
    let added = 0;
    for (const [i, f] of files.slice(0, room).entries()) {
      const bad = checkPhoto(f);
      if (bad) { toast.error(bad); continue; }
      setBusy(`Uploading ${i + 1} of ${Math.min(files.length, room)}…`);
      try {
        const blob = await prepareImage(f, 1600, 0.8);
        const path = `${truckId}/${crypto.randomUUID()}.${blob.type === "image/webp" ? "webp" : "jpg"}`;
        const up = await supabase.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type });
        if (up.error) throw up.error;
        const { error } = await supabase.from("truck_photos").insert({ truck_id: truckId, path, position: pos++, is_cover: photos.length === 0 && added === 0 });
        if (error) { await supabase.storage.from(PHOTO_BUCKET).remove([path]); throw error; }
        added++;
      } catch (e) { toast.error(`${f.name}: ${e instanceof Error ? e.message : "upload failed"}`); }
    }
    setBusy("");
    if (added) { toast.success(`${added} photo${added === 1 ? "" : "s"} added`); void refresh(); }
  }

  async function move(p: TruckPhoto, dir: -1 | 1) {
    const i = list.findIndex((x) => x.id === p.id), j = i + dir;
    const other = list[j];
    if (!other) return;
    // Swap order; renumber the whole list so positions stay unique.
    const next = [...list]; next[i] = other; next[j] = p;
    await Promise.all(next.map((x, k) => supabase.from("truck_photos").update({ position: k }).eq("id", x.id)));
    void refresh();
  }
  async function cover(p: TruckPhoto) {
    await supabase.from("truck_photos").update({ is_cover: false }).eq("truck_id", truckId).neq("id", p.id);
    const { error } = await supabase.from("truck_photos").update({ is_cover: true }).eq("id", p.id);
    if (error) toast.error(error.message); else void refresh();
  }
  async function remove(p: TruckPhoto) {
    if (!confirm("Delete this photo?")) return;
    const { error } = await supabase.from("truck_photos").delete().eq("id", p.id);
    if (error) return void toast.error(error.message);
    await supabase.storage.from(PHOTO_BUCKET).remove([p.path]);
    if (p.is_cover) { const nextCover = list.find((x) => x.id !== p.id); if (nextCover) await supabase.from("truck_photos").update({ is_cover: true }).eq("id", nextCover.id); }
    void refresh();
  }

  return (
    <section className="panel space-y-3 p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xl font-bold">Truck photos</h2>
        <span className="text-sm text-muted-foreground">{photos.length} / {MAX_PHOTOS}</span>
      </div>
      <PhotoDrop label={busy || "Add photos"} hint="Drag photos here, or tap to choose or take one. JPG, PNG, WebP or HEIC, up to 5 MB." onFiles={upload} disabled={!!busy || photos.length >= MAX_PHOTOS} />
      {list.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {list.map((p, i) => (
            <li key={p.id} className="overflow-hidden rounded-2xl border border-border bg-card">
              <div className="relative aspect-[4/3] bg-secondary">
                <img src={p.url} alt={`Truck photo ${i + 1}`} className="h-full w-full object-cover" loading="lazy" />
                {p.is_cover && <span className="absolute left-2 top-2 rounded-full bg-foreground px-2 py-0.5 text-xs font-semibold text-background">Cover</span>}
              </div>
              <div className="flex items-center justify-between gap-1 p-1">
                <button type="button" onClick={() => move(p, -1)} disabled={i === 0} aria-label="Move earlier" className="grid h-11 w-11 place-items-center rounded-full disabled:opacity-40"><ArrowLeft className="h-4 w-4" /></button>
                <button type="button" onClick={() => cover(p)} aria-label={p.is_cover ? "Cover photo" : "Make cover photo"} aria-pressed={p.is_cover} className="grid h-11 w-11 place-items-center rounded-full"><Star className={`h-4 w-4 ${p.is_cover ? "fill-primary text-primary" : ""}`} /></button>
                <button type="button" onClick={() => remove(p)} aria-label="Delete photo" className="grid h-11 w-11 place-items-center rounded-full text-destructive"><Trash2 className="h-4 w-4" /></button>
                <button type="button" onClick={() => move(p, 1)} disabled={i === list.length - 1} aria-label="Move later" className="grid h-11 w-11 place-items-center rounded-full disabled:opacity-40"><ArrowRight className="h-4 w-4" /></button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
