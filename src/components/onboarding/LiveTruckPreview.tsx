import { MapPin, Star } from "lucide-react";
import { truckByline } from "@/data/onboarding";

export interface PreviewData {
  truckName: string;
  businessName: string;
  cuisine: string;
  logoUrl: string | null;
  coverUrl: string | null;
  paymentMethods: string[];
  description: string;
}

/** Live mini preview of the public truck page, updating as the owner types. */
export function LiveTruckPreview({ d }: { d: PreviewData }) {
  const name = d.truckName.trim() || "Your truck name";
  const byline = truckByline(name, d.businessName);
  return (
    <div className="panel overflow-hidden" aria-label="Preview of your public truck page">
      <p className="border-b border-border bg-muted px-3 py-1.5 text-xs font-semibold text-muted-foreground">What customers will see</p>
      <div className="relative h-24 bg-secondary">
        {d.coverUrl ? <img src={d.coverUrl} alt="" className="h-full w-full object-cover" /> : (
          <div className="grid h-full place-items-center text-xs font-semibold text-muted-foreground">Your cover photo goes here</div>
        )}
      </div>
      <div className="space-y-2 p-3">
        <div className="flex items-center gap-2.5">
          <div className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-xl border border-border bg-secondary text-lg">
            {d.logoUrl ? <img src={d.logoUrl} alt="" className="h-full w-full object-cover" /> : "🚚"}
          </div>
          <div className="min-w-0">
            <p className="truncate font-extrabold leading-tight">{name}</p>
            <p className="truncate text-xs text-muted-foreground">
              {byline || "\u00A0"}{d.cuisine.trim() ? ` · ${d.cuisine.trim()}` : ""}
            </p>
          </div>
          <Star className="ml-auto h-4 w-4 shrink-0 text-muted-foreground" aria-hidden />
        </div>
        {d.description.trim() && <p className="line-clamp-2 text-xs text-muted-foreground">{d.description.trim()}</p>}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[11px] font-semibold text-muted-foreground"><MapPin className="h-3 w-3" aria-hidden />Quad Cities</span>
          {d.paymentMethods.slice(0, 4).map((m) => (
            <span key={m} className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold">{m}</span>
          ))}
        </div>
      </div>
    </div>
  );
}
