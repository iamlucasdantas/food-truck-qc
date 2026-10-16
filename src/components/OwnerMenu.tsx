import { useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { PhotoDrop } from "@/components/PhotoDrop";
import { blobToDataUrl, checkPhoto, prepareImage } from "@/lib/images";
import { readMenuPhotos } from "@/lib/menu.functions";
import { MENU_TAGS, menuSearchText, parsePrice, type MenuSection, type MenuTag } from "@/data/menu";
import type { Truck } from "@/data/trucks";

type Row = { name: string; description: string; price: string; tags: MenuTag[]; lowConfidence: boolean };
type Sec = { name: string; items: Row[] };
const toRows = (s: MenuSection[]): Sec[] => s.map((x) => ({ name: x.name, items: x.items.map((i) => ({ ...i, price: i.price == null ? "" : i.price.toFixed(2) })) }));

export function OwnerMenu({ truck }: { truck: Truck }) {
  const qc = useQueryClient();
  const read = useServerFn(readMenuPhotos);
  const [busy, setBusy] = useState("");
  const [problem, setProblem] = useState("");
  const [draft, setDraft] = useState<Sec[] | null>(null);
  const current = (truck.menu_sections as MenuSection[] | null) ?? null;

  async function onFiles(files: File[]) {
    setProblem("");
    const ok = files.slice(0, 6).filter((f) => { const bad = checkPhoto(f); if (bad) toast.error(bad); return !bad; });
    if (files.length > 6) toast.error("Up to 6 menu photos at a time — using the first 6.");
    if (!ok.length) return;
    try {
      setBusy("Preparing photos…");
      const images = await Promise.all(ok.map(async (f) => blobToDataUrl(await prepareImage(f, 2000, 0.85, "image/jpeg"))));
      setBusy("Reading your menu… this can take up to a minute.");
      const r = await read({ data: { truckId: truck.id, images } });
      if (r.error) setProblem(r.error);
      else if (!r.readable) setProblem(`${r.problem} Try a sharper, well-lit photo taken straight on.`);
      else setDraft(toRows(r.sections));
    } catch (e) { setProblem(e instanceof Error ? e.message : "Couldn't read the menu. Please try again."); }
    setBusy("");
  }

  const upd = (si: number, ii: number, patch: Partial<Row>) => setDraft((d) => d!.map((s, a) => a !== si ? s : { ...s, items: s.items.map((it, b) => b !== ii ? it : { ...it, ...patch, lowConfidence: false }) }));

  async function publish() {
    const sections: MenuSection[] = draft!.map((s) => ({
      name: s.name.trim() || "Menu",
      items: s.items.filter((i) => i.name.trim()).map((i) => ({ name: i.name.trim(), description: i.description.trim(), price: parsePrice(i.price), tags: i.tags, lowConfidence: false })),
    })).filter((s) => s.items.length);
    if (!sections.length) return void toast.error("Add at least one item before publishing.");
    setBusy("Publishing…");
    const { error } = await supabase.from("trucks").update({
      menu_sections: sections, menu_updated_at: new Date().toISOString(), menu_search: menuSearchText(sections),
      menu: sections.flatMap((s) => s.items.filter((i) => i.price != null).map((i) => ({ item: i.name, price: i.price }))),
    }).eq("id", truck.id);
    setBusy("");
    if (error) return void toast.error(error.message);
    toast.success("Menu published");
    setDraft(null);
    void qc.invalidateQueries({ queryKey: ["me"] }); void qc.invalidateQueries({ queryKey: ["truck", truck.id] }); void qc.invalidateQueries({ queryKey: ["trucks"] });
  }

  return (
    <section className="panel space-y-3 p-5">
      <div>
        <h2 className="text-xl font-bold">Menu photos</h2>
        <p className="text-sm text-muted-foreground">
          Upload photos of your menu board, paper menu or delivery-app screenshots. AI reads them, then you review before anything goes public.
          {truck.menu_updated_at && ` Current menu published ${new Date(truck.menu_updated_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}.`}
        </p>
      </div>
      {!draft && <PhotoDrop label={busy || (current ? "Upload a new menu" : "Upload menu photos")} hint="Up to 6 photos. A new menu replaces the current one only after you publish it." onFiles={onFiles} disabled={!!busy} />}
      {problem && <p role="alert" className="rounded-xl border border-destructive bg-card p-3 text-sm">{problem}</p>}

      {draft && (
        <div className="space-y-4">
          <p className="rounded-xl bg-secondary p-3 text-sm">Check every item. Fix names and prices, delete anything wrong, then tap <b>Publish this menu</b>. Items marked <b>Check</b> were hard to read.</p>
          {draft.map((s, si) => (
            <div key={si} className="space-y-2 rounded-2xl border border-border p-3">
              <div className="flex gap-2">
                <input aria-label="Section name" className="field w-full text-base font-bold" value={s.name} onChange={(e) => setDraft(draft.map((x, a) => a === si ? { ...x, name: e.target.value } : x))} />
                <button type="button" aria-label="Delete section" onClick={() => setDraft(draft.filter((_, a) => a !== si))} className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-destructive"><Trash2 className="h-4 w-4" /></button>
              </div>
              <ul className="space-y-2">
                {s.items.map((it, ii) => (
                  <li key={ii} className={`space-y-2 rounded-xl border-2 p-2 ${it.lowConfidence ? "border-primary" : "border-transparent bg-secondary"}`}>
                    <div className="grid grid-cols-[minmax(0,1fr)_6.5rem_auto] gap-2">
                      <input aria-label="Item name" className="field w-full text-base" value={it.name} onChange={(e) => upd(si, ii, { name: e.target.value })} />
                      <input aria-label="Price" inputMode="decimal" placeholder="$" className="field w-full text-base" value={it.price} onChange={(e) => upd(si, ii, { price: e.target.value })} />
                      <button type="button" aria-label="Delete item" onClick={() => setDraft(draft.map((x, a) => a === si ? { ...x, items: x.items.filter((_, b) => b !== ii) } : x))} className="grid h-11 w-11 place-items-center rounded-full text-destructive"><Trash2 className="h-4 w-4" /></button>
                    </div>
                    <input aria-label="Description" placeholder="Description (optional)" className="field w-full text-base" value={it.description} onChange={(e) => upd(si, ii, { description: e.target.value })} />
                    <div className="flex flex-wrap items-center gap-2">
                      {it.lowConfidence && <span className="rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">Check</span>}
                      {MENU_TAGS.map((t) => {
                        const on = it.tags.includes(t);
                        return <button key={t} type="button" aria-pressed={on} onClick={() => upd(si, ii, { tags: on ? it.tags.filter((x) => x !== t) : [...it.tags, t] })} className={`h-8 rounded-full border px-3 text-xs font-medium ${on ? "border-primary bg-accent" : "border-input bg-card"}`}>{t}</button>;
                      })}
                    </div>
                  </li>
                ))}
              </ul>
              <button type="button" onClick={() => setDraft(draft.map((x, a) => a === si ? { ...x, items: [...x.items, { name: "", description: "", price: "", tags: [], lowConfidence: false }] } : x))} className="chip"><Plus className="h-4 w-4" />Add item</button>
            </div>
          ))}
          <button type="button" onClick={() => setDraft([...draft, { name: "New section", items: [{ name: "", description: "", price: "", tags: [], lowConfidence: false }] }])} className="chip"><Plus className="h-4 w-4" />Add section</button>
          <div className="flex flex-col gap-2 sm:flex-row">
            <button type="button" onClick={() => setDraft(null)} className="chip min-h-11 justify-center">Discard</button>
            <button type="button" disabled={!!busy} onClick={publish} className="min-h-11 flex-1 rounded-full bg-primary px-5 font-bold text-primary-foreground">{busy || "Publish this menu"}</button>
          </div>
        </div>
      )}
    </section>
  );
}
