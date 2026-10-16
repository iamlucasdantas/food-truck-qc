import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { slugify } from "@/data/trucks";
import { geocode } from "@/lib/geocode";

export const Route = createFileRoute("/owner/new")({
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
  const [f, setF] = useState({ name: "", category: "", emoji: "🚚", phone: "", website: "", instagram: "", facebook: "", address: "", description: "" });
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return openAuth("Sign in to add your truck.");
    setBusy(true);
    const g = f.address ? await geocode(f.address) : null;
    const id = `${slugify(f.name)}-${Math.random().toString(36).slice(2, 6)}`;
    const { address, ...rest } = f;
    const { error } = await supabase.from("trucks").insert({
      ...rest, id, status: "pending", created_by: user.id,
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
    <main className="mx-auto max-w-xl space-y-4 p-4">
      <Link to="/owner" className="chip">← Owner dashboard</Link>
      <h1 className="text-3xl font-extrabold">Add your truck</h1>
      {done ? (
        <p className="panel p-5">Thanks! <b>{f.name}</b> is pending review. Once approved, it shows on the map and you can manage it from your dashboard.</p>
      ) : (
        <form onSubmit={submit} className="panel space-y-2 p-5">
          {field("name", "Truck name", true)}
          <div className="grid grid-cols-[1fr_5rem] gap-2">{field("category", "Category (e.g. Tacos)", true)}{field("emoji", "Emoji")}</div>
          <div className="grid grid-cols-2 gap-2">{field("phone", "Phone")}{field("website", "Website")}{field("instagram", "Instagram")}{field("facebook", "Facebook")}</div>
          {field("address", "Usual location / home base address")}
          <textarea className="field" rows={3} placeholder="Short description" value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
          <button disabled={busy} className="chip bg-primary text-primary-foreground">{busy ? "Submitting…" : "Submit for review"}</button>
        </form>
      )}
    </main>
  );
}
