import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { slugify } from "@/data/trucks";
import { geocode } from "@/lib/geocode";

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
  const [f, setF] = useState({ name: "", category: "", emoji: "🚚", phone: "", website: "", instagram: "", facebook: "", address: "", description: "", truckType: "" as "" | "fixed" | "mobile" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return openAuth("Sign in to add your truck.");
    if (!f.truckType) return void toast.error("Pick fixed location or mobile.");
    if (f.truckType === "fixed" && !f.address.trim()) return void toast.error("A fixed location needs its address.");
    setBusy(true);
    const { data: mine } = await supabase.from("trucks").select("name").or(`claimed_by.eq.${user.id},created_by.eq.${user.id}`);
    if ((mine ?? []).some((t) => t.name.trim().toLowerCase() === f.name.trim().toLowerCase())) {
      setBusy(false);
      return void toast.error("You already have a truck with that name — pick a unique one.");
    }
    const g = f.address ? await geocode(f.address) : null;
    const id = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { address, truckType, ...rest } = f;
    const { error } = await supabase.from("trucks").insert({
      ...rest, id, status: "pending", created_by: user.id, truck_type: truckType,
      base_address: address || null, base_lat: g?.lat ?? null, base_lng: g?.lng ?? null,
    });
    if (!error) await supabase.from("claims").insert({ truck_id: id, user_id: user.id, user_email: user.email ?? null, message: "New truck submitted by owner" });
    setBusy(false);
    if (error) return void toast.error(error.message);
    setDone(true);
  }

  const field = (k: keyof typeof f, ph: string, req = false) => (
    <input className="field" required={req} placeholder={ph} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
  );

  return (
    <main className="mx-auto w-full max-w-[1100px] min-w-0 space-y-4 p-4">
      <Link to="/owner" className="chip">← Owner dashboard</Link>
      <h1 className="text-3xl font-extrabold">Add your truck</h1>
      {done ? (
        <p className="panel p-5">Thanks! <b>{f.name}</b> is pending review. Once approved, it shows on the map and you can manage it from your dashboard.</p>
      ) : (
        <form onSubmit={submit} className="panel space-y-2 p-5">
          {field("name", "Truck name", true)}
          <div className="grid grid-cols-[1fr_5rem] gap-2">{field("category", "Category (e.g. Tacos)", true)}{field("emoji", "Emoji")}</div>
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
          </fieldset>
          <div className="grid grid-cols-2 gap-2">{field("phone", "Phone")}{field("website", "Website")}{field("instagram", "Instagram")}{field("facebook", "Facebook")}</div>
          {field("address", f.truckType === "fixed" ? "Address of your fixed location" : "Usual location / home base address", f.truckType === "fixed")}
          <textarea className="field" rows={3} placeholder="Short description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button disabled={busy} className="chip bg-primary text-primary-foreground">{busy ? "Submitting…" : "Submit for review"}</button>
        </form>
      )}
    </main>
  );
}
