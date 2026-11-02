import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { TutorialPlayer } from "@/components/tutorials/WatchHow";
import { TUTORIALS } from "@/data/tutorials";

export const Route = createFileRoute("/help")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Help & tutorials for food truck owners | FoodTruckQC" },
      { name: "description", content: "Seven short videos that show food truck owners exactly where to tap: create an account, put your truck on the map, add your menu, photos, schedule and go live." },
      { property: "og:title", content: "Help & tutorials for food truck owners | FoodTruckQC" },
      { property: "og:description", content: "Short videos and printable steps for getting your food truck on the FoodTruckQC map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

function HelpPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16">
        <div className="flex items-center justify-between gap-3"><Logo /><Link to="/" className="chip">← Map</Link></div>
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold leading-tight">Help & tutorials</h1>
          <p className="text-muted-foreground">Seven short videos for food truck owners. Each one shows exactly where to tap, step by step, and comes with a printable sheet. Start with number 1 if you're new, or jump to what you need.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to="/owner/onboarding" className="chip chip-active">Set up my truck</Link>
            <Link to="/owner" className="chip">Owner dashboard</Link>
          </div>
        </header>

        <ol className="space-y-4">
          {TUTORIALS.map((t) => (
            <li key={t.key} id={t.key} className="panel grid gap-4 p-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-5">
              <TutorialPlayer t={t} className="sm:max-w-none" />
              <div className="space-y-3">
                <div className="space-y-1">
                  <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Part {t.n} of {TUTORIALS.length} · {t.length}</p>
                  <h2 className="text-xl font-bold leading-snug">{t.title}</h2>
                  <p className="text-sm text-muted-foreground">{t.blurb}</p>
                </div>
                <a href={t.pdf} target="_blank" rel="noopener noreferrer" className="chip"><Printer className="h-4 w-4" aria-hidden />Print the steps (PDF)</a>
              </div>
            </li>
          ))}
        </ol>

        <section className="panel space-y-2 p-4 text-sm sm:p-5">
          <h2 className="text-lg font-bold">Still stuck?</h2>
          <p>A real person will help you get on the map. <a href="https://foodtruckqc.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Contact FoodTruckQC</a>, or open <Link to="/profile" search={{ section: "help", view: undefined }} className="underline">Profile &amp; settings → Help</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
