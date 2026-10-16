import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { checkBusinessEmail, submitTruckSignup, truckSignupSchema } from "@/lib/embed.functions";
import { signupStepsFor } from "@/data/business";
import { LogoMark } from "@/components/Logo";
import { StepHeader } from "@/components/StepHeader";

export const Route = createFileRoute("/embed/register-truck")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "List your food truck | FoodTruckQC" },
      { name: "description", content: "Add your Quad Cities food truck to the FoodTruckQC map." },
      { property: "og:title", content: "List your food truck | FoodTruckQC" },
      { property: "og:description", content: "Get your truck on the Quad Cities food truck map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: EmbedForm,
});

const CATS = ["Tacos", "BBQ", "Burgers", "Asian", "Pizza", "Dessert", "Coffee", "Other"];
const empty = { contactName: "", email: "", phone: "", businessName: "", truckName: "", category: "", truckType: "", city: "", instagram: "", facebook: "", website: "", description: "", company: "" };

function EmbedForm() {
  const submit = useServerFn(submitTruckSignup);
  const check = useServerFn(checkBusinessEmail);
  const [known, setKnown] = useState(false);
  const checkedEmail = useRef("");
  async function checkEmail(email: string) {
    const e = email.trim().toLowerCase();
    if (e === checkedEmail.current || !/^\S+@\S+\.\S+$/.test(e)) return known;
    checkedEmail.current = e;
    try { const r = await check({ data: { email: e } }); setKnown(r.known); return r.known; } catch { return known; }
  }
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState("");
  const [step, setStep] = useState<0 | 1>(0);

  // Report the content wrapper's height (never viewport-dependent) to the host page.
  // Posting only on >2px change + rAF debounce prevents an iframe resize feedback loop.
  const wrapRef = useRef<HTMLDivElement>(null);
  const lastHeight = useRef(0);
  useEffect(() => {
    const el = wrapRef.current;
    if (!el || window.parent === window) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      const h = Math.round(el.getBoundingClientRect().height);
      if (Math.abs(h - lastHeight.current) <= 2) return;
      lastHeight.current = h;
      window.parent.postMessage({ type: "ftqc-embed-height", height: h }, "*");
    };
    const schedule = () => { if (!raf) raf = requestAnimationFrame(measure); };
    schedule();
    const ro = new ResizeObserver(schedule);
    ro.observe(el);
    window.addEventListener("load", schedule);
    window.addEventListener("resize", schedule);
    return () => {
      ro.disconnect();
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("load", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [done, step, known]);

  /** Errors for the given step only (whole schema is validated, then filtered to that step's fields). */
  function stepErrors(s: 0 | 1, k = known) {
    const r = truckSignupSchema.safeParse(f);
    if (r.success) return {};
    const keys = signupStepsFor(k)[s] as readonly string[];
    return Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message]).filter(([k]) => keys.includes(k ?? "")));
  }

  async function next(e: React.FormEvent) {
    e.preventDefault();
    const k = await checkEmail(f.email);
    const e1 = stepErrors(0, k);
    setErr(e1);
    if (Object.keys(e1).length) return;
    // First truck: its name starts as the business name (editable).
    if (!k && !f.truckName.trim() && f.businessName.trim()) setF((p) => ({ ...p, truckName: p.businessName.trim() }));
    setStep(1);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const e2 = stepErrors(1);
    if (Object.keys(e2).length) return setErr(e2);
    const e1 = stepErrors(0);
    if (Object.keys(e1).length) { setErr(e1); return setStep(0); }
    setErr({}); setFail(""); setBusy(true);
    try {
      const res = await submit({ data: f });
      if (res.ok) setDone(true);
      else if ("field" in res && res.field) setErr({ [res.field]: res.error ?? "" });
      else setFail(res.error ?? "Could not save.");
    } catch { setFail("Could not save. Please try again."); }
    setBusy(false);
  }

  const input = (k: keyof typeof f, label: string, type = "text", ph = "") => (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      <input className="field w-full text-base" type={type} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} onBlur={k === "email" ? (e) => void checkEmail(e.target.value) : undefined} />
      {err[k] && <span className="text-sm text-destructive">{err[k]}</span>}
    </label>
  );

  return (
    <main ref={wrapRef} className="flow-root overflow-x-hidden bg-background p-3 text-foreground sm:p-4">
      <div className="mx-auto w-full max-w-[620px] space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-8"><LogoMark /></div>
          <div>
            <h1 className="text-xl font-extrabold">List your food truck</h1>
            <p className="text-sm text-muted-foreground">Free on the Quad Cities food truck map.</p>
          </div>
        </div>
        {done ? (
          <div className="panel space-y-3 p-5" role="status">
            <p className="text-lg font-bold">Thanks! Your truck is in review.</p>
            <p className="text-muted-foreground">Look for an email with next steps once it's approved.</p>
            <div className="space-y-2 rounded-xl bg-accent p-4">
              <p className="font-bold">Next step: add your menu and photos</p>
              <p className="text-sm">Create your free account with the same email (<b className="break-all">{f.email}</b>). Your truck links to it once you confirm that email.</p>
              <a href={`/auth?mode=up&redirect=${encodeURIComponent("/owner/onboarding?step=3")}`} target="_blank" rel="noopener" className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-primary-foreground">Create your free account</a>
            </div>
          </div>
        ) : (
          <form onSubmit={step === 0 ? next : onSubmit} className="panel space-y-3 p-4 sm:p-5" noValidate>
            <StepHeader step={step} titles={[known ? "About you" : "About you and your business", "Your truck"]} />
            {step === 0 ? (
              <>
                {input("contactName", "Your name")}
                <div className="grid gap-3 sm:grid-cols-2">{input("email", "Email", "email")}{input("phone", "Phone / WhatsApp (optional)", "tel")}</div>
                {known ? (
                  <p className="rounded-xl bg-accent p-3 text-sm text-foreground" role="status">Welcome back! This email already has a business on FoodTruckQC. Your new truck will be linked to it and use its website, social links and payment methods.</p>
                ) : (<>
                {input("businessName", "Business name (optional)")}
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">About your business (optional)</span>
                  <textarea className="field w-full text-base" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
                </label>
                <div className="grid gap-3 sm:grid-cols-3">{input("website", "Website (optional)")}{input("instagram", "Instagram (optional)")}{input("facebook", "Facebook (optional)")}</div>
                </>)}
              </>
            ) : (
              <>
                {input("truckName", "Truck name")}
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold">Is it fixed or mobile?</legend>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([["fixed", "🏠 Fixed location", "Restaurant, brewery, market stall"], ["mobile", "🚚 Mobile", "Moves around the Quad Cities"]] as const).map(([v, label, hint]) => (
                      <label key={v} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border-2 p-3 text-base ${f.truckType === v ? "border-primary bg-accent" : "border-input bg-card"}`}>
                        <input type="radio" name="truckType" className="mt-1" checked={f.truckType === v} onChange={() => setF({ ...f, truckType: v })} />
                        <span><b>{label}</b><br /><span className="text-sm text-muted-foreground">{hint}</span></span>
                      </label>
                    ))}
                  </div>
                  {err["truckType"] && <span className="text-sm text-destructive">{err["truckType"]}</span>}
                </fieldset>
                <label className="block space-y-1">
                  <span className="text-sm font-semibold">Cuisine</span>
                  <select className="field w-full text-base" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                    <option value="">Pick one…</option>
                    {CATS.map((c) => <option key={c}>{c}</option>)}
                  </select>
                  {err["category"] && <span className="text-sm text-destructive">{err["category"]}</span>}
                </label>
                {f.truckType === "fixed" ? input("city", "Address of your fixed location", "text", "123 Main St, Davenport, IA") : input("city", "City or usual spot (optional)", "text", "Davenport, IA")}
              </>
            )}
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            {fail && <p className="text-sm text-destructive">{fail}</p>}
            <div className="flex gap-2 pt-1">
              {step === 1 && <button type="button" onClick={() => { setErr({}); setStep(0); }} className="min-h-11 rounded-full border border-input bg-card px-5 font-semibold">Back</button>}
              <button disabled={busy} className="min-h-11 flex-1 rounded-full bg-primary px-5 font-bold text-primary-foreground">{step === 0 ? "Continue" : busy ? "Sending…" : "Submit my truck"}</button>
            </div>
          </form>
        )}
      </div>
    </main>
  );
}

