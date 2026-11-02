import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Play, Printer } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { embedUrl, thumbUrl, tutorial, type Tutorial, type TutorialKey } from "@/data/tutorials";

/** Vertical YouTube player (9:16). Thumbnail first; the iframe only loads on tap. */
export function TutorialPlayer({ t, autoplay = false, className = "" }: { t: Tutorial; autoplay?: boolean; className?: string }) {
  const [playing, setPlaying] = useState(autoplay);
  return (
    <div className={`relative mx-auto aspect-[9/16] w-full max-w-[320px] overflow-hidden rounded-2xl bg-black ${className}`}>
      {playing ? (
        <iframe
          src={embedUrl(t.youtubeId, true)}
          title={`Tutorial ${t.n}: ${t.title}`}
          className="absolute inset-0 h-full w-full"
          allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
          allowFullScreen
        />
      ) : (
        <button type="button" onClick={() => setPlaying(true)} className="group absolute inset-0 h-full w-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Play tutorial ${t.n}: ${t.title}`}>
          <img src={thumbUrl(t.youtubeId)} alt="" className="h-full w-full object-cover opacity-80 transition-opacity group-hover:opacity-100" loading="lazy" />
          <span className="absolute inset-0 grid place-items-center">
            <span className="grid h-16 w-16 place-items-center rounded-full bg-primary text-primary-foreground shadow-pop"><Play className="ml-1 h-7 w-7" aria-hidden /></span>
          </span>
          <span className="absolute bottom-3 left-3 rounded-full bg-black/70 px-2 py-0.5 text-xs font-semibold text-white">{t.length}</span>
        </button>
      )}
    </div>
  );
}

/**
 * "▶ Watch how" chip that opens the matching tutorial in a modal.
 * Drop it next to any section title; owners who are new to phones get a 1–3 minute
 * video showing exactly where to tap, plus a printable PDF.
 */
export function WatchHow({ k, label = "Watch how", className = "" }: { k: TutorialKey; label?: string; className?: string }) {
  const t = tutorial(k);
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`chip min-h-9 px-3 text-xs ${className}`} aria-label={`${label}: ${t.title} (${t.length} video)`}>
        <Play className="h-3.5 w-3.5 fill-current" aria-hidden />{label} <span className="text-muted-foreground">· {t.length}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="z-[1300] max-h-[95dvh] w-[calc(100%-1rem)] max-w-sm overflow-y-auto rounded-2xl p-4 sm:p-5">
          <DialogTitle className="pr-6 text-base font-bold">{t.n}. {t.title}</DialogTitle>
          <DialogDescription className="text-sm">{t.blurb}</DialogDescription>
          {open && <TutorialPlayer t={t} autoplay />}
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <a href={t.pdf} target="_blank" rel="noopener noreferrer" className="chip"><Printer className="h-4 w-4" aria-hidden />Print the steps (PDF)</a>
            <Link to="/help" onClick={() => setOpen(false)} className="font-semibold text-primary underline">All tutorials →</Link>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
