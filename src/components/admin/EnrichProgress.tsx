import { useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { useQueryClient } from "@tanstack/react-query";
import { CheckCircle, ChevronDown, ChevronUp, Loader2, X, XCircle } from "lucide-react";
import { getEnrichRun, runEnrich, type EnrichRunState } from "@/lib/enrich.functions";

export type ActiveEnrichRun = { id: string; name: string };

/** Floating progress bar for background Enrich runs. Click a card to see the step log. */
export function EnrichProgress({ runs, onRemove }: { runs: ActiveEnrichRun[]; onRemove: (id: string) => void }) {
  if (!runs.length) return null;
  return (
    <div className="fixed inset-x-3 bottom-4 z-[70] mx-auto max-w-md space-y-2">
      {runs.map((r) => <RunCard key={r.id} run={r} onRemove={onRemove} />)}
    </div>
  );
}

function RunCard({ run, onRemove }: { run: ActiveEnrichRun; onRemove: (id: string) => void }) {
  const get = useServerFn(getEnrichRun);
  const step = useServerFn(runEnrich);
  const startedRef = useRef(false);
  const qc = useQueryClient();
  const [state, setState] = useState<EnrichRunState | null>(null);
  const [open, setOpen] = useState(false);
  const doneRef = useRef(false);

  // The card drives the run: one task per request until the queue is empty (short requests can't be cut off mid-run).
  useEffect(() => {
    let stop = false;
    const drive = async () => {
      try { const s = await get({ data: { runId: run.id } }); if (!stop) setState(s); } catch { /* keep going */ }
      let failures = 0;
      while (!stop) {
        try {
          const r = await step({ data: { runId: run.id } });
          if (stop) return;
          failures = 0;
          setState((s) => ({ ...(s ?? { id: run.id, truck_id: "", created_at: "" }), status: r.done ? "done" : "running", steps: r.steps }));
          if (r.done) break;
        } catch {
          if (++failures >= 3) { if (!stop) setState((s) => s ? { ...s, status: "error" } : s); return; }
          await new Promise((res) => setTimeout(res, 3000));
        }
      }
      if (!stop && !doneRef.current) {
        doneRef.current = true;
        void qc.invalidateQueries({ queryKey: ["admin"] });
        void qc.invalidateQueries({ queryKey: ["stops"] });
      }
    };
    if (startedRef.current) return;
    startedRef.current = true;
    void drive();
    return () => { stop = true; startedRef.current = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [run.id]);

  const status = state?.status ?? "running";
  const steps = state?.steps ?? [];
  const running = status === "running";

  return (
    <div className="overflow-hidden rounded-xl border border-border bg-popover text-sm shadow-lg">
      <button type="button" onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 p-3 text-left" aria-expanded={open}>
        {running ? <Loader2 className="h-4 w-4 shrink-0 animate-spin text-primary" />
          : status === "done" ? <CheckCircle className="h-4 w-4 shrink-0 text-primary" />
          : <XCircle className="h-4 w-4 shrink-0 text-destructive" />}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{running ? `Enriching ${run.name}…` : `Enrich ${status === "done" ? "finished" : "failed"} — ${run.name}`}</span>
          <span className="block text-xs text-muted-foreground">{steps.length} step{steps.length === 1 ? "" : "s"} checked{running ? " — tap to watch the log" : " — tap for the log"}</span>
        </span>
        {open ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronUp className="h-4 w-4 text-muted-foreground" />}
        {!running && (
          <span role="button" tabIndex={0} aria-label="Dismiss" className="grid h-7 w-7 place-items-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"
            onClick={(e) => { e.stopPropagation(); onRemove(run.id); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onRemove(run.id); } }}>
            <X className="h-4 w-4" />
          </span>
        )}
      </button>
      {running && (
        <div className="h-1 w-full overflow-hidden bg-muted" aria-hidden>
          <div className="h-full w-1/3 animate-[enrich-slide_1.2s_ease-in-out_infinite] rounded-full bg-primary" />
        </div>
      )}
      {open && (
        <ul className="max-h-64 space-y-2 overflow-y-auto border-t border-border p-3">
          {steps.length === 0 && <li className="text-xs text-muted-foreground">Starting…</li>}
          {steps.map((s, i) => (
            <li key={i} className="flex gap-2">
              {s.ok ? <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-primary" /> : <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />}
              <span className="break-words"><b>{s.source}:</b> {s.detail}</span>
            </li>
          ))}
          {running && <li className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Working on the next source…</li>}
        </ul>
      )}
    </div>
  );
}
