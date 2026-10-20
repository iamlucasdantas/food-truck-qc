import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { MapPin, Search } from "lucide-react";
import { toast } from "sonner";
import { addressAutocomplete, type AddressSuggestion } from "@/lib/onboarding.functions";
import { placeLocation } from "@/lib/enrich.functions";

export type PickedPlace = { name: string; address: string; lat: number; lng: number; city: string };

/** Google Maps search for a place name or address; picking one returns name, address and pin. */
export function PlaceSearch({ onPick }: { onPick: (p: PickedPlace) => void }) {
  const auto = useServerFn(addressAutocomplete);
  const details = useServerFn(placeLocation);
  const [q, setQ] = useState("");
  const [list, setList] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const seq = useRef(0);

  useEffect(() => {
    if (q.trim().length < 3) { setList([]); return; }
    const n = ++seq.current;
    const h = setTimeout(() => {
      auto({ data: { input: q.trim() } }).then((r) => { if (n === seq.current) { setList(r.suggestions); setActive(0); setOpen(true); } }).catch(() => {});
    }, 300);
    return () => clearTimeout(h);
  }, [q, auto]);

  async function pick(s: AddressSuggestion) {
    setOpen(false); setQ(s.label);
    try { onPick(await details({ data: { placeId: s.placeId } })); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Couldn't load that place"); }
  }

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
      <input
        className="field pl-9" role="combobox" aria-expanded={open && list.length > 0} aria-autocomplete="list"
        placeholder="Search Google Maps — place name or address" value={q}
        onChange={(e) => setQ(e.target.value)} onFocus={() => list.length && setOpen(true)} onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={(e) => {
          if (!open || !list.length) return;
          if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(a + 1, list.length - 1)); }
          else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(a - 1, 0)); }
          else if (e.key === "Enter") { e.preventDefault(); void pick(list[active]!); }
          else if (e.key === "Escape") setOpen(false);
        }}
      />
      {open && list.length > 0 && (
        <ul role="listbox" className="absolute z-50 mt-1 w-full overflow-hidden rounded-lg border border-border bg-popover text-popover-foreground shadow-pop">
          {list.map((s, i) => (
            <li key={s.placeId} role="option" aria-selected={i === active}>
              <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => void pick(s)}
                className={`flex w-full items-start gap-2 px-3 py-2 text-left text-sm ${i === active ? "bg-muted" : "hover:bg-muted"}`}>
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />{s.label}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
