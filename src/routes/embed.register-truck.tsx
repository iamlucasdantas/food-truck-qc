import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { submitTruckSignup, truckSignupSchema } from "@/lib/embed.functions";
import { LogoMark } from "@/components/Logo";

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
const empty = { contactName: "", email: "", phone: "", truckName: "", category: "", city: "", instagram: "", facebook: "", website: "", description: "", company: "" };

function EmbedForm() {
  const submit = useServerFn(submitTruckSignup);
  const [f, setF] = useState(empty);
  const [err, setErr] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [fail, setFail] = useState("");

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    const r = truckSignupSchema.safeParse(f);
    if (!r.success) {
      setErr(Object.fromEntries(r.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErr({}); setFail(""); setBusy(true);
    try {
      const res = await submit({ data: f });
      if (res.ok) setDone(true); else setFail(res.error ?? "Could not save.");
    } catch { setFail("Could not save. Please try again."); }
    setBusy(false);
  }

  const input = (k: keyof typeof f, label: string, type = "text", ph = "") => (
    <label className="block space-y-1">
      <span className="text-sm font-semibold">{label}</span>
      <input className="field w-full" type={type} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
      {err[k] && <span className="text-sm text-destructive">{err[k]}</span>}
    </label>
  );

  return (
    <main className="min-h-dvh bg-background p-4 text-foreground">
      <div className="mx-auto w-full max-w-[620px] space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-10 w-8"><LogoMark /></div>
          <div>
            <h1 className="text-xl font-extrabold">List your food truck</h1>
            <p className="text-sm text-muted-foreground">Free on the Quad Cities food truck map.</p>
          </div>
        </div>
        {done ? (
          <div className="panel space-y-2 p-5">
            <p className="text-lg font-bold">Thanks! Your truck is in review.</p>
            <p className="text-muted-foreground">Look for an email with next steps once it's approved.</p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="panel space-y-3 p-5" noValidate>
            {input("contactName", "Your name")}
            <div className="grid gap-3 sm:grid-cols-2">{input("email", "Email", "email")}{input("phone", "Phone / WhatsApp", "tel")}</div>
            {input("truckName", "Truck name")}
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Category</span>
              <select className="field w-full" value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                <option value="">Pick one…</option>
                {CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
              {err["category"] && <span className="text-sm text-destructive">{err["category"]}</span>}
            </label>
            {input("city", "City or usual spot", "text", "Davenport, IA")}
            <div className="grid gap-3 sm:grid-cols-3">{input("instagram", "Instagram")}{input("facebook", "Facebook")}{input("website", "Website")}</div>
            <label className="block space-y-1">
              <span className="text-sm font-semibold">Short description</span>
              <textarea className="field w-full" rows={3} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
            </label>
            <input tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" value={f.company} onChange={(e) => setF({ ...f, company: e.target.value })} />
            {fail && <p className="text-sm text-destructive">{fail}</p>}
            <button disabled={busy} className="min-h-11 w-full rounded-full bg-primary px-5 font-bold text-primary-foreground">{busy ? "Sending…" : "Submit my truck"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
