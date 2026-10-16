import type { ReactNode } from "react";
import { Compass, type LucideIcon } from "lucide-react";
export function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return <section className="space-y-5 border-b border-border py-6 last:border-0"><div><h2 className="text-lg font-semibold">{title}</h2>{subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}</div>{children}</section>;
}
export function Empty({ title, detail, icon: Icon = Compass, children }: { title: string; detail?: string; icon?: LucideIcon; children?: ReactNode }) {
  return <div className="flex flex-col items-center gap-3 rounded-lg border border-dashed border-border px-5 py-8 text-center"><Icon className="size-7 text-muted-foreground" aria-hidden/><h3 className="font-medium">{title}</h3>{detail && <p className="max-w-sm text-sm text-muted-foreground">{detail}</p>}{children}</div>;
}
export function ScoreRing({ score, label }: { score: number; label: string }) {
  return <div className="relative size-16 shrink-0" role="img" aria-label={`${label}: ${score}%`}><svg viewBox="0 0 64 64" className="size-16 -rotate-90"><circle cx="32" cy="32" r="27" fill="none" stroke="var(--border)" strokeWidth="5"/><circle cx="32" cy="32" r="27" fill="none" stroke="var(--primary)" strokeWidth="5" strokeLinecap="round" strokeDasharray="169.65" strokeDashoffset={169.65 * (1-score/100)}/></svg><span className="absolute inset-0 grid place-items-center text-sm font-semibold">{score}%</span></div>;
}