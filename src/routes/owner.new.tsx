import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { slugify } from "@/data/trucks";
import { geocode } from "@/lib/geocode";
import { StepHeader } from "@/components/StepHeader";

export const Route = createFileRoute("/owner/new")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Add your food truck | FoodTruckQC" },
      { name: "description", content: "List a Quad Cities food truck that isn't on the map yet." },
      { property: "og:title", content: "Add your food truck | FoodTruckQC" },
      { property: "og:description", content: "Get your truck on the Quad Cities food truck map." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: NewTruck,
});

function NewTruck() {
  const { user, openAuth } = useAuth();
  const [f, setF] = useState({ contactName: "", email: "", businessName: "", name: "", category: "", emoji: "🚚", phone: "", website: "", instagram: "", facebook: "", address: "", description: "", truckType: "" as "" | "fixed" | "mobile" });
  const [err, setErr] = useState<Record<string, string>>({});
  const [step, setStep] = useState<0 | 1>(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => { if (user?.email && !f.email) setF((p) => ({ ...p, email: user.email ?? "" })); }, [user?.email]); // eslint-disable-line react-hooks/exhaustive-deps

  const step1Errors = () => {
    const e: Record<string, string> = {};
    if (!f.contactName.trim()) e["contactName"] = "Enter your name";
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) e["email"] = "Enter a valid email";
    return e;
  };
  const step2Errors = () => {
    const e: Record<string, string> = {};
    if (!f.name.trim()) e["name"] = "Enter the truck name";
    if (!f.truckType) e["truckType"] = "Pick fixed location or mobile";
    if (!f.category.trim()) e["category"] = "Enter a cuisine";
    if (f.truckType === "fixed" && !f.address.trim()) e["address"] = "A fixed location needs its address";
    return e;
  };

  function next(e: React.FormEvent) {
    e.preventDefault();
    const e1 = step1Errors();
    setErr(e1);
    if (!Object.keys(e1).length) setStep(1);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const e2 = step2Errors();
    if (Object.keys(e2).length) return setErr(e2);
    setErr({});
    if (!user) return openAuth("Sign in to add your truck.");
    setBusy(true);
    const { data: mine } = await supabase.from("trucks").select("name").or(`claimed_by.eq.${user.id},created_by.eq.${user.id}`);
    if ((mine ?? []).some((t) => t.name.trim().toLowerCase() === f.name.trim().toLowerCase())) {
      setBusy(false);
      return setErr({ name: "You already have a truck with that name — pick a unique one." });
    }
    const g = f.address ? await geocode(f.address) : null;
    const id = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { address, truckType, contactName, email, businessName, description, ...rest } = f;
    const contact = `Owner contact: ${[contactName.trim(), email.trim(), f.phone.trim()].filter(Boolean).join(" · ")}`;
    const { error } = await supabase.from("trucks").insert({
      ...rest, id, status: "pending", created_by: user.id, truck_type: truckType,
      description: [description.trim(), businessName.trim() && `Business: ${businessName.trim()}`, contact].filter(Boolean).join("\n\n"),
      base_address: address || null, base_lat: g?.lat ?? null, base_lng: g?.lng ?? null,
    });
    if (!error) await supabase.from("claims").insert({ truck_id: id, user_id: user.id, user_email: user.email ?? null, message: "New truck submitted by owner" });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setDone(true);
  }

  const field = (k: keyof typeof f, label: string, type = "text", ph = "") => (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      <input className="field w-full text-base" type={type} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {err[k] && <span className="text-sm text-destructive">{err[k]}</span>}
    </label>
  );

  return (
    <main className="mx-auto w-full max-w-[680px] min-w-0 space-y-4 p-4">
      <Link to="/owner" className="chip">← Owner dashboard</Link>
      <h1 className="text-3xl font-extrabold">Add your truck</h1>
      {done ? (
        <div className="panel space-y-3 p-5" role="status">
          <p className="text-lg font-bold">Thanks! {f.name} is in review.</p>
          <p className="text-muted-foreground">Once approved, it shows on the map and you can manage it from your dashboard.</p>
          <Link to="/owner" className="chip">Go to my dashboard</Link>
        </div>
      ) : (
        <form onSubmit={step === 0 ? next : submit} className="panel space-y-3 p-4 sm:p-5" noValidate>
          <StepHeader step={step} titles={["About you and your business", "Your truck"]} />
          {step === 0 ? (
            <>
              {field("contactName", "Your name")}
              <div className="grid gap-3 sm:grid-cols-2">{field("email", "Email", "email")}{field("phone", "Phone / WhatsApp (optional)", "tel")}</div>
              {field("businessName", "Business name (optional)")}
              <div className="grid gap-3 sm:grid-cols-3">{field("website", "Website (optional)")}{field("instagram", "Instagram (optional)")}{field("facebook", "Facebook (optional)")}</div>
            </>
          ) : (
            <>
              {field("name", "Truck name")}
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold">Is it fixed or mobile?</legend>
                <div className="grid gap-2 sm:grid-cols-2">
                  {([["fixed", "🏠 Fixed location", "Restaurant, brewery, market stall — always on the map during your hours."], ["mobile", "🚚 Mobile", "Moves around — shows on the map at scheduled stops or when you tap “I'm here”."]] as const).map(([v, label, hint]) => (
                    <label key={v} className={`flex min-h-11 cursor-pointer items-start gap-2 rounded-xl border-2 p-3 text-sm ${f.truckType === v ? "border-primary bg-accent" : "border-input bg-card"}`}>
                      <input type="radio" name="truckType" className="mt-1" checked={f.truckType === v} onChange={() => setF({ ...f, truckType: v })} />
                      <span><b>{label}</b><br /><span className="text-muted-foreground">{hint}</span></span>
                    </label>
                  ))}
                </div>
                {err["truckType"] && <span className="text-sm text-destructive">{err["truckType"]}</span>}
              </fieldset>
              <div className="grid grid-cols-[1fr_5rem] gap-2">{field("category", "Cuisine", "text", "e.g. Tacos")}{field("emoji", "Emoji")}</div>
              {field("address", f.truckType === "fixed" ? "Address of your fixed location" : "City or home base (optional)")}
              <label className="block space-y-1">
                <span className="text-sm font-semibold">Short description (optional)</span>
                <textarea className="field w-full text-base" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
              </label>
            </>
          )}
          <div className="flex gap-2 pt-1">
            {step === 1 && <button type="button" onClick={() => { setErr({}); setStep(0); }} className="min-h-11 rounded-full border border-input bg-card px-5 font-semibold">Back</button>}
            <button disabled={busy} className="min-h-11 flex-1 rounded-full bg-primary px-5 font-bold text-primary-foreground">{step === 0 ? "Continue" : busy ? "Submitting…" : "Submit for review"}</button>
          </div>
        </form>
      )}
    </main>
  );
}
