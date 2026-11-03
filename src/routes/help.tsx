import { createFileRoute, Link } from "@tanstack/react-router";
import { Printer } from "lucide-react";
import { Logo } from "@/components/Logo";
import { SiteFooter } from "@/components/SiteFooter";
import { TutorialPlayer } from "@/components/tutorials/WatchHow";
import { tutorialsIn, type TutorialGroup } from "@/data/tutorials";

export const Route = createFileRoute("/help")({
  staticData: { sitemap: true },
  head: () => ({
    meta: [
      { title: "Help & tutorials for food truck owners | FoodTruckQC" },
      { name: "description", content: "Short videos that show food truck owners exactly where to tap: create an account, put your truck on the map, add your menu, photos, schedule, go live, and optionally run it all by talking to your AI." },
      { property: "og:title", content: "Help & tutorials for food truck owners | FoodTruckQC" },
      { property: "og:description", content: "Short videos and printable steps for getting your food truck on the FoodTruckQC map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: HelpPage,
});

function TutorialList({ group }: { group: TutorialGroup }) {
  return (
    <ol className="space-y-4">
      {tutorialsIn(group).map((t) => (
        <li key={t.key} id={t.key} className="panel grid gap-4 p-4 sm:grid-cols-[200px_minmax(0,1fr)] sm:p-5">
          <TutorialPlayer t={t} className="sm:max-w-none" />
          <div className="space-y-3">
            <div className="space-y-1">
              <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Part {t.n} of 10 · {t.length}</p>
              <h2 className="text-xl font-bold leading-snug">{t.title}</h2>
              <p className="text-sm text-muted-foreground">{t.blurb}</p>
            </div>
            <a href={t.pdf} target="_blank" rel="noopener noreferrer" className="chip"><Printer className="h-4 w-4" aria-hidden />Print the steps (PDF)</a>
          </div>
        </li>
      ))}
    </ol>
  );
}

function HelpPage() {
  return (
    <div className="min-h-dvh bg-background text-foreground">
      <main className="mx-auto w-full max-w-3xl space-y-6 p-4 pb-16">
        <div className="flex items-center justify-between gap-3"><Logo /><Link to="/" className="chip">← Map</Link></div>
        <header className="space-y-2">
          <h1 className="text-3xl font-extrabold leading-tight">Help & tutorials</h1>
          <p className="text-muted-foreground">Short videos for food truck owners. Each one shows exactly where to tap, step by step, and comes with a printable sheet. Start with number 1 if you're new, or jump to what you need.</p>
          <div className="flex flex-wrap gap-2 pt-1">
            <Link to="/owner/onboarding" className="chip chip-active">Set up my truck</Link>
            <Link to="/owner" className="chip">Owner dashboard</Link>
          </div>
        </header>

        <TutorialList group="basics" />

        <header className="space-y-1 pt-2">
          <h2 className="text-2xl font-extrabold leading-tight">Run your truck by talking to your AI</h2>
          <p className="text-muted-foreground">Optional. Connect Claude or ChatGPT once, then register your truck, add stops and go live by voice. Setup steps are in the “Connect your AI” box below.</p>
        </header>
        <TutorialList group="ai" />

        <section id="connect-ai" className="panel space-y-3 p-4 text-sm sm:p-5">
          <h2 className="text-lg font-bold">Connect your AI (optional)</h2>
          <p>Already talk to Claude or ChatGPT on your phone? Connect it to FoodTruckQC once and you can run your truck by voice: register it, add stops, update your phone or menu, and tap “I'm here” just by saying it.</p>
          <ol className="list-decimal space-y-1 pl-5">
            <li>In the app, open <Link to="/profile" search={{ section: "connections", view: undefined }} className="font-semibold text-primary underline">Profile &amp; settings → Connected accounts → API keys</Link> and tap <b>Create key</b>. Copy it — it starts with <code>ftqc_</code> and is shown once.</li>
            <li><b>Claude</b> (phone app): Settings → Connectors → Add custom connector. Name: <code>FoodTruckQC</code>. URL: <code>https://app.foodtruckqc.com/api/public/mcp-key</code>. Header: <code>Authorization: Bearer ftqc_…</code> (your key).</li>
            <li><b>ChatGPT</b>: Settings → Connectors (or Apps) → Add MCP server with the same URL and header.</li>
            <li>Then hold the mic and talk. Your AI only sees and changes <em>your</em> truck.</li>
          </ol>
          <div className="space-y-1 rounded-xl bg-muted p-3">
            <p className="font-semibold">Things you can say</p>
            <ul className="list-disc space-y-0.5 pl-5">
              <li>“Put my truck on the map: Taco One, tacos, based in Davenport, phone 563-555-0142.”</li>
              <li>“I'm at Bass Street Landing until 2.”</li>
              <li>“Add a stop Friday 11 to 2 at Marketplace at 2500, Moline — every week.”</li>
              <li>“Change my phone number to …” · “What's still missing on my truck?” · “I'm done for today.”</li>
            </ul>
          </div>
          <p className="text-muted-foreground">New trucks still go through the same quick review before they show on the map. You can delete the key any time in the same screen.</p>
        </section>

        <section className="panel space-y-2 p-4 text-sm sm:p-5">
          <h2 className="text-lg font-bold">Still stuck?</h2>
          <p>A real person will help you get on the map. <a href="https://foodtruckqc.com" target="_blank" rel="noopener noreferrer" className="font-semibold text-primary underline">Contact FoodTruckQC</a>, or open <Link to="/profile" search={{ section: "help", view: undefined }} className="underline">Profile &amp; settings → Help</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </div>
  );
}
