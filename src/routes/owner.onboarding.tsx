import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { Logo } from "@/components/Logo";
import { PaymentPicker } from "@/components/PaymentPicker";
import { OwnerMenu } from "@/components/OwnerMenu";
import { OwnerPhotos } from "@/components/OwnerPhotos";
import { OwnerSchedule } from "@/components/OwnerSchedule";
import { slugify, type Truck } from "@/data/trucks";
import { contactLine, sameName } from "@/data/business";
import { ONBOARDING_STEPS, FINISH_STEP, checklist, completeStep, defaultTruckName, readProgress, resumeStep, skipStep, type Progress, type StepKey } from "@/data/onboarding";
import { geocode, fileToLogo } from "@/lib/geocode";
import { linkMyEmbedTrucks, notifyOwnerTruckAdded } from "@/lib/embed.functions";

export const Route = createFileRoute("/owner/onboarding")({
  staticData: { sitemap: false },
  validateSearch: z.object({ step: z.coerce.number().int().min(1).max(FINISH_STEP + 1).optional() }),
  head: () => ({
    meta: [
      { title: "Set up your truck | FoodTruckQC" },
      { name: "description", content: "Set up your business, truck, menu, photos and schedule in a few short steps." },
      { property: "og:title", content: "Set up your truck | FoodTruckQC" },
      { property: "og:description", content: "Get your food truck on the Quad Cities map in a few short steps." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Onboarding,
});

function Onboarding() {
  const { user, ready, openAuth } = useAuth();
  return (
    <div className="min-h-dvh bg-sidebar text-sidebar-foreground">
      <header className="border-b border-sidebar-border bg-sidebar"><div className="mx-auto flex w-full max-w-[680px] items-center justify-between gap-3 p-4"><Logo /><Link to="/owner" className="chip">Owner dashboard</Link></div></header>
      <main className="mx-auto w-full max-w-[680px] min-w-0 space-y-4 p-4 pb-16">
        {ready && !user && (
          <div className="panel space-y-3 p-5">
            <h1 className="text-2xl font-extrabold">Set up your truck</h1>
            <p>Sign in or create a free account to continue.</p>
            <button onClick={() => openAuth("Sign in to set up your truck.")} className="min-h-11 rounded-full bg-primary px-5 font-bold text-primary-foreground">Sign in</button>
          </div>
        )}
        {user && <Wizard userId={user.id} email={user.email ?? ""} />}
      </main>
    </div>
  );
}

type Biz = { name: string; description: string; website: string; instagram: string; facebook: string; logo_url: string | null; payment_methods: string[]; payment_other: string };

function Wizard({ userId, email }: { userId: string; email: string }) {
  const qc = useQueryClient();
  const search = Route.useSearch();
  const link = useServerFn(linkMyEmbedTrucks);
  const notify = useServerFn(notifyOwnerTruckAdded);
  const [p, setP] = useState<Progress | null>(null);
  const [biz, setBiz] = useState<Biz | null>(null);
  const [trucks, setTrucks] = useState<{ id: string; name: string }[]>([]);
  const started = useRef(false);

  // Load saved progress, the business and the owner's trucks once; link any website-form truck with a verified email.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      const linked = await link().catch(() => ({ linked: [] as string[] }));
      const [{ data: prof }, { data: b }, { data: ts }] = await Promise.all([
        supabase.from("profiles").select("onboarding").eq("id", userId).maybeSingle(),
        supabase.from("businesses").select("*").eq("owner_id", userId).maybeSingle(),
        supabase.from("trucks").select("id, name, created_at").or(`claimed_by.eq.${userId},created_by.eq.${userId}`).order("created_at"),
      ]);
      let prog = readProgress(prof?.onboarding);
      if (b?.name) prog = completeStep(prog, "business");
      const truckId = prog.truckId && (ts ?? []).some((t) => t.id === prog.truckId) ? prog.truckId : (linked.linked[0] ?? ts?.[0]?.id ?? null);
      if (truckId) prog = { ...completeStep(prog, "truck"), truckId };
      const want = search.step ? search.step - 1 : prog.step;
      prog = { ...prog, step: resumeStep({ ...prog, step: want }) };
      setBiz({ name: b?.name ?? "", description: b?.description ?? "", website: b?.website ?? "", instagram: b?.instagram ?? "", facebook: b?.facebook ?? "", logo_url: b?.logo_url ?? null, payment_methods: b?.payment_methods ?? [], payment_other: b?.payment_other ?? "" });
      setTrucks(ts ?? []);
      setP(prog);
    })();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const { data: truck } = useQuery({
    queryKey: ["me", "onboarding-truck", p?.truckId],
    enabled: !!p?.truckId,
    queryFn: async () => (await supabase.from("trucks").select("*").eq("id", p!.truckId!).maybeSingle()).data as Truck | null,
  });

  async function save(next: Progress) {
    setP(next);
    window.scrollTo({ top: 0 });
    const { error } = await supabase.from("profiles").update({ onboarding: next as unknown as Record<string, never> }).eq("id", userId);
    if (error) toast.error("Couldn't save your progress — check your connection.");
  }

  if (!p || !biz) return <p className="panel p-5 text-sm" role="status">Loading your setup…</p>;
  const step = p.step;
  const go = (i: number) => void save({ ...p, step: i });
  const finish = (key: StepKey, extra: Partial<Progress> = {}) => void save({ ...completeStep(p, key), ...extra });
  const skip = (key: StepKey) => void save(skipStep(p, key));

  return (
    <>
      <Progressbar step={step} />
      {step === 0 && <BusinessStep initial={biz} onDone={async (b) => {
        const { error } = await supabase.from("businesses").upsert({ ...b, owner_id: userId, website: b.website.trim() || null, instagram: b.instagram.trim() || null, facebook: b.facebook.trim() || null, updated_at: new Date().toISOString() }, { onConflict: "owner_id" });
        if (error) return void toast.error(error.message);
        setBiz(b); void qc.invalidateQueries({ queryKey: ["business"] }); finish("business");
      }} />}
      {step === 1 && (p.truckId && truck
        ? <Submitted truck={truck} onBack={() => go(0)} onNext={() => finish("truck")} />
        : <TruckStep businessName={biz.name} existing={trucks} onBack={() => go(0)} onDone={async (f) => {
            const g = f.address ? await geocode(f.address) : null;
            const id = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
            const { error } = await supabase.from("trucks").insert({
              id, name: f.name.trim(), category: f.category.trim(), emoji: f.truckType === "fixed" ? "🏠" : "🚚", status: "pending", created_by: userId,
              truck_type: f.truckType, business_name: biz.name, description: `${biz.name ? `Business: ${biz.name}\n\n` : ""}${contactLine({ name: "", email, phone: "" }).replace("Owner contact: ", "Owner contact: " + (email.split("@")[0] ?? "") + " · ").replace(/ · $/, "")}`,
              base_address: f.address.trim() || null, base_lat: g?.lat ?? null, base_lng: g?.lng ?? null,
            });
            if (error) return void toast.error(error.message);
            await supabase.from("claims").insert({ truck_id: id, user_id: userId, user_email: email || null, message: "New truck submitted during onboarding" });
            void notify({ data: { truckId: id, isNewBusiness: trucks.length === 0 } }).catch((e) => console.error("[onboarding] notify failed", e));
            setTrucks([...trucks, { id, name: f.name.trim() }]);
            void qc.invalidateQueries({ queryKey: ["me"] });
            toast.success("Submitted for approval");
            finish("truck", { truckId: id });
          }} />)}
      {step >= 2 && step < FINISH_STEP && !truck && <p className="panel p-5 text-sm" role="status">Loading your truck…</p>}
      {step >= 2 && step < FINISH_STEP && truck && (() => {
        const s = ONBOARDING_STEPS[step]!;
        const intro: Record<string, string> = {
          menu: "Snap your menu board or paper menu. FoodTruckQC reads it for you — check it, then publish.",
          photos: "Add a few photos of your truck and food. Tap the star to pick the cover.",
          schedule: "Connect your calendar or add your first stop so people know where to find you.",
        };
        return (
          <section className="space-y-4">
            <div className="space-y-1"><h1 className="text-2xl font-extrabold">{s.title}</h1><p className="text-muted-foreground">{intro[s.key]}</p></div>
            {s.key === "menu" && <OwnerMenu truck={truck} />}
            {s.key === "photos" && <OwnerPhotos truckId={truck.id} />}
            {s.key === "schedule" && <OwnerSchedule truck={truck} />}
            <Nav onBack={() => go(step - 1)} onSkip={() => skip(s.key)} onNext={() => finish(s.key)} />
          </section>
        );
      })()}
      {step >= FINISH_STEP && <Finish p={p} truck={truck ?? null} onOpen={(i) => go(i)} />}
    </>
  );
}

function Progressbar({ step }: { step: number }) {
  const pct = Math.round((Math.min(step, FINISH_STEP) / FINISH_STEP) * 100);
  return (
    <div className="space-y-1.5">
      <p className="text-sm font-semibold text-muted-foreground">{step < FINISH_STEP ? `Step ${step + 1} of ${FINISH_STEP} · ${ONBOARDING_STEPS[step]!.title}` : "All steps visited"}</p>
      <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Setup progress">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

function Nav({ onBack, onSkip, onNext, nextLabel = "Continue", busy = false, submit = false }: { onBack?: () => void; onSkip?: () => void; onNext?: () => void; nextLabel?: string; busy?: boolean; submit?: boolean }) {
  return (
    <div className="flex flex-wrap items-center gap-2 pt-1">
      {onBack && <button type="button" onClick={onBack} className="min-h-11 rounded-full border border-input bg-card px-5 font-semibold">Back</button>}
      {onSkip && <button type="button" onClick={onSkip} className="min-h-11 rounded-full px-4 font-semibold text-foreground underline">Skip for now</button>}
      <button type={submit ? "submit" : "button"} onClick={submit ? undefined : onNext} disabled={busy} className="min-h-11 flex-1 rounded-full bg-primary px-5 font-bold text-primary-foreground">{busy ? "Saving…" : nextLabel}</button>
    </div>
  );
}

const field = "field w-full text-base font-normal";

function BusinessStep({ initial, onDone }: { initial: Biz; onDone: (b: Biz) => Promise<void> }) {
  const [f, setF] = useState(initial);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  const txt = (k: "website" | "instagram" | "facebook", label: string, ph: string) => (
    <label className="block space-y-1 text-sm font-semibold">{label}<input className={field} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></label>
  );
  return (
    <form className="panel space-y-4 p-4 sm:p-5" noValidate onSubmit={async (e) => {
      e.preventDefault();
      if (!f.name.trim()) return setErr("Enter your business name");
      setErr(""); setBusy(true); await onDone({ ...f, name: f.name.trim() }); setBusy(false);
    }}>
      <div className="space-y-1"><h1 className="text-2xl font-extrabold">Your business</h1><p className="text-muted-foreground">Asked once. Every truck you add shares it.</p></div>
      <label className="block space-y-1 text-sm font-semibold">Business name
        <input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} aria-invalid={!!err} />
        {err && <span className="block text-sm font-normal text-destructive">{err}</span>}
      </label>
      <label className="block space-y-1 text-sm font-semibold">Short description (optional)
        <textarea className={field} rows={3} maxLength={600} placeholder="What do you serve? What makes it special?" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </label>
      <div className="flex items-center gap-3">
        <div className="grid h-16 w-16 place-items-center overflow-hidden rounded-xl border-2 border-border bg-secondary text-3xl">{f.logo_url ? <img src={f.logo_url} alt="Business logo" className="h-full w-full object-cover" /> : "🏪"}</div>
        <label className="chip cursor-pointer">Upload logo (optional)
          <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const file = e.target.files?.[0]; if (file) setF({ ...f, logo_url: await fileToLogo(file) }); }} />
        </label>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">{txt("website", "Website (optional)", "https://…")}{txt("instagram", "Instagram (optional)", "@handle")}{txt("facebook", "Facebook (optional)", "facebook.com/page")}</div>
      <fieldset className="space-y-2"><legend className="text-sm font-semibold">Accepted payment methods</legend>
        <PaymentPicker idPrefix="onb" value={f.payment_methods} other={f.payment_other} onChange={(v, o) => setF({ ...f, payment_methods: v, payment_other: o })} />
      </fieldset>
      <Nav submit busy={busy} />
    </form>
  );
}

type TruckForm = { name: string; truckType: "" | "fixed" | "mobile"; category: string; address: string };

function TruckStep({ businessName, existing, onBack, onDone }: { businessName: string; existing: { name: string }[]; onBack: () => void; onDone: (f: TruckForm) => Promise<void> }) {
  const [f, setF] = useState<TruckForm>({ name: defaultTruckName(businessName, existing.map((t) => t.name)), truckType: "", category: "", address: "" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  return (
    <form className="panel space-y-4 p-4 sm:p-5" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const er: Record<string, string> = {};
      if (!f.name.trim()) er["name"] = "Enter the truck name";
      else if (existing.some((t) => sameName(t.name, f.name))) er["name"] = "You already have a truck with that name — pick a unique one.";
      if (!f.truckType) er["truckType"] = "Pick fixed location or mobile";
      if (!f.category.trim()) er["category"] = "Enter a cuisine";
      if (f.truckType === "fixed" && !f.address.trim()) er["address"] = "A fixed location needs its address";
      setErr(er);
      if (Object.keys(er).length) return;
      setBusy(true); await onDone(f); setBusy(false);
    }}>
      <div className="space-y-1"><h1 className="text-2xl font-extrabold">Your food truck</h1>{businessName && <p className="text-sm text-muted-foreground">Business: <b className="text-foreground">{businessName}</b></p>}</div>
      <label className="block space-y-1 text-sm font-semibold">Truck name
        <input className={field} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
        {err["name"] && <span className="block text-sm font-normal text-destructive">{err["name"]}</span>}
      </label>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">Is it fixed or mobile?</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {([["fixed", "🏠 Fixed location", "Restaurant, brewery, market stall."], ["mobile", "🚚 Mobile", "Moves around between stops."]] as const).map(([v, label, hint]) => (
            <label key={v} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border-2 p-3 text-sm ${f.truckType === v ? "border-primary bg-accent" : "border-input bg-card"}`}>
              <input type="radio" name="truckType" className="mt-1" checked={f.truckType === v} onChange={() => setF({ ...f, truckType: v })} />
              <span><b>{label}</b><br /><span className="text-muted-foreground">{hint}</span></span>
            </label>
          ))}
        </div>
        {err["truckType"] && <span className="text-sm text-destructive">{err["truckType"]}</span>}
      </fieldset>
      <label className="block space-y-1 text-sm font-semibold">Cuisine
        <input className={field} placeholder="e.g. Tacos" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} />
        {err["category"] && <span className="block text-sm font-normal text-destructive">{err["category"]}</span>}
      </label>
      <label className="block space-y-1 text-sm font-semibold">{f.truckType === "fixed" ? "Address of your fixed location" : "City or home base (optional)"}
        <input className={field} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} />
        {err["address"] && <span className="block text-sm font-normal text-destructive">{err["address"]}</span>}
      </label>
      <p className="text-sm text-muted-foreground">Continuing submits your truck for approval. You can keep setting it up meanwhile.</p>
      <Nav onBack={onBack} submit busy={busy} nextLabel="Submit and continue" />
    </form>
  );
}

function Submitted({ truck, onBack, onNext }: { truck: Truck; onBack: () => void; onNext: () => void }) {
  return (
    <section className="panel space-y-3 p-4 sm:p-5">
      <h1 className="text-2xl font-extrabold">Your food truck</h1>
      <p><b>{truck.name}</b> {truck.status === "pending" ? "is submitted and waiting for approval." : "is on FoodTruckQC."}</p>
      <p className="text-sm text-muted-foreground">Change its details anytime from the owner dashboard.</p>
      <Nav onBack={onBack} onNext={onNext} />
    </section>
  );
}

function Finish({ p, truck, onOpen }: { p: Progress; truck: Truck | null; onOpen: (i: number) => void }) {
  return (
    <section className="panel space-y-4 p-4 sm:p-5">
      <h1 className="text-2xl font-extrabold">You're all set</h1>
      <div className="space-y-1">
        <h2 className="font-bold">What happens next</h2>
        <p className="text-muted-foreground">{truck?.status === "active" ? "Your truck is live on the map." : "The FoodTruckQC team reviews your truck. You'll get an email once it's approved, and then it shows on the map."}</p>
      </div>
      <ul className="space-y-1 text-sm">
        {checklist(p).map((c) => (
          <li key={c.key} className="flex min-h-11 items-center gap-2">
            <span aria-hidden className={`grid h-6 w-6 place-items-center rounded-full border-2 text-xs font-bold ${c.done ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>{c.done ? "✓" : ""}</span>
            <span className="flex-1">{c.title} <span className="text-muted-foreground">— {c.done ? "done" : "still missing"}</span></span>
            {!c.done && <button onClick={() => onOpen(c.index)} className="chip">Add now</button>}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Link to="/owner" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-primary-foreground">Open owner dashboard</Link>
        {truck && <Link to="/truck/$id" params={{ id: truck.id }} className="inline-flex min-h-11 items-center rounded-full border border-input bg-card px-5 font-semibold">View public page</Link>}
      </div>
    </section>
  );
}
