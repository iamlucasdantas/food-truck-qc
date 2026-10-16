import { useRef, useState } from "react";
import { orderPhotos, useTruckPhotos } from "@/lib/photos";

/** Public cover photo + swipeable gallery (scroll-snap; swipe on touch, arrows/dots elsewhere). */
export function TruckGallery({ truckId, name }: { truckId: string; name: string }) {
  const { data = [] } = useTruckPhotos(truckId);
  const photos = orderPhotos(data);
  const ref = useRef<HTMLDivElement>(null);
  const [idx, setIdx] = useState(0);
  if (!photos.length) return null;
  const go = (i: number) => { const el = ref.current; if (el) el.scrollTo({ left: i * el.clientWidth, behavior: "smooth" }); };
  return (
    <section aria-label={`Photos of ${name}`} aria-roledescription="carousel" className="panel overflow-hidden">
      <div ref={ref} onScroll={(e) => setIdx(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}
        className="flex snap-x snap-mandatory overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {photos.map((p, i) => (
          <img key={p.id} src={p.url} alt={i === 0 ? `${name} — cover photo` : `${name} — photo ${i + 1} of ${photos.length}`}
            loading={i === 0 ? "eager" : "lazy"} className="aspect-[4/3] w-full shrink-0 snap-center object-cover sm:aspect-[16/9]" />
        ))}
      </div>
      {photos.length > 1 && (
        <div className="flex items-center justify-center gap-1 p-2">
          {photos.map((p, i) => (
            <button key={p.id} onClick={() => go(i)} aria-label={`Show photo ${i + 1}`} aria-current={i === idx}
              className="grid h-8 w-8 place-items-center"><span className={`block h-2.5 w-2.5 rounded-full ${i === idx ? "bg-foreground" : "bg-input"}`} /></button>
          ))}
        </div>
      )}
    </section>
  );
}
