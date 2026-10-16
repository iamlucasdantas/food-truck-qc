import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { facebookSessionStatus, processPastedPost } from "@/lib/facebook.functions";
import { fmtCentral } from "@/data/trucks";

type Result = Awaited<ReturnType<typeof processPastedPost>>;
const STATUS: Record<string, string> = {
  preview: "Ready to save", published: "Published (own post)", suggested: "Waiting for approval", history: "In the past — not saved",
  duplicate: "Already saved", "no-address": "Address not found", "no-truck": "No matching truck", "owner-has-stop": "Owner already has a stop then",
  "low-confidence": "Unclear — skipped",
};

function toDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, 1600 / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/jpeg", 0.88));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

/** Fallback when Facebook blocks the scraper: paste a post or a screenshot, preview the stops, then save. */
export function PastePost() {
  const qc = useQueryClient();
  const run = useServerFn(processPastedPost);
  const [text, setText] = useState("");
  const [image, setImage] = useState("");
  const [author, setAuthor] = useState("");
  const [postDate, setPostDate] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState<Result | null>(null);

  async function go(save: boolean) {
    setBusy(true);
    try {
      const r = await run({ data: { text, image, author, postDate, url, save } });
      setRes(r);
      if (r.error) toast.error(r.error);
      else if (r.read && !save) { if (!text) setText(r.read.text); if (!author) setAuthor(r.read.author); if (!postDate) setPostDate(r.read.postDate); setImage(""); }
      if (save && !r.error) { toast.success("Saved"); void qc.invalidateQueries(); }
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false);
  }

  return (
    <section className="panel space-y-3 p-5">
      <h3 className="text-lg font-bold">Paste a post or screenshot</h3>
      <p className="text-sm text-muted-foreground">Use this when a group is private or Facebook blocks the update. Same reading, address lookup and truck matching as the automatic update.</p>
      <textarea className="field w-full text-base" rows={4} placeholder="Paste the post text…" value={text} onChange={(e) => setText(e.target.value)} aria-label="Post text" />
      <div className="grid gap-2 sm:grid-cols-3">
        <input className="field text-base" placeholder="Posted by (page or person)" value={author} onChange={(e) => setAuthor(e.target.value)} aria-label="Posted by" />
        <label className="flex items-center gap-2 text-sm">Post date <input className="field text-base" type="date" value={postDate} onChange={(e) => setPostDate(e.target.value)} /></label>
        <input className="field text-base" placeholder="Post link (optional)" value={url} onChange={(e) => setUrl(e.target.value)} aria-label="Post link" />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <label className="chip cursor-pointer">{image ? "Screenshot added ✓" : "Upload screenshot"}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setImage(await toDataUrl(f)); e.target.value = ""; }} />
        </label>
        {image && <button className="chip" onClick={() => setImage("")}>Remove screenshot</button>}
        <button disabled={busy || (!text.trim() && !image)} onClick={() => void go(false)} className="chip">{busy ? "Reading…" : "Read post"}</button>
        {res?.stops.some((s) => s.status === "preview") && <button disabled={busy} onClick={() => void go(true)} className="inline-flex min-h-11 items-center rounded-full bg-primary px-5 font-bold text-primary-foreground">Save stops</button>}
      </div>
      {res?.stops && res.stops.length > 0 && (
        <ul className="space-y-2 text-sm">
          {res.stops.map((s, i) => (
            <li key={i} className="rounded-xl border-2 border-border p-3">
              <div className="flex flex-wrap items-center gap-2">
                <b>{s.truckName || "Unknown truck"}</b>{s.newTruck && <span className="chip">New truck (pending)</span>}
                {s.own && <span className="chip">Their own post</span>}
                {s.checkAddress && <span className="chip border-destructive text-destructive">Check address</span>}
                <span className="ml-auto text-xs font-semibold">{STATUS[s.status] ?? s.status}</span>
              </div>
              <p>{s.date} · {s.start}–{s.end} · {s.venue}</p>
              <p className="text-muted-foreground">{s.address ?? "No address"}</p>
            </li>
          ))}
        </ul>
      )}
      {res && !res.error && res.stops.length === 0 && <p className="text-sm">No stops found in this post.</p>}
    </section>
  );
}

/** Suggested stops on unclaimed trucks (nobody else can approve them) and any stop whose address needs checking. */
export function AdminSuggestions() {
  const qc = useQueryClient();
  const { data = [] } = useQuery({
    queryKey: ["admin", "suggested"],
    queryFn: async () => (await supabase.from("suggested_stops").select("*, trucks(name, claimed_by)").eq("status", "pending").order("starts_at").limit(100)).data ?? [],
  });
  const items = data.filter((s) => !s.trucks?.claimed_by || s.needs_address_check);
  if (!items.length) return null;
  async function decide(s: (typeof items)[number], approve: boolean) {
    if (approve) {
      const { error } = await supabase.from("stops").insert({
        truck_id: s.truck_id, venue_name: s.venue_name || "Suggested stop", address: s.address, city: s.city, lat: s.lat ?? 41.52, lng: s.lng ?? -90.55,
        starts_at: s.starts_at, ends_at: s.ends_at, source: "apify_post", confidence: 0.9, source_url: s.source_url,
      });
      if (error) return void toast.error(error.message);
    }
    await supabase.from("suggested_stops").update({ status: approve ? "approved" : "rejected", reviewed_at: new Date().toISOString() }).eq("id", s.id);
    toast.success(approve ? "Published" : "Rejected");
    void qc.invalidateQueries();
  }
  return (
    <section className="panel space-y-2 p-5">
      <h3 className="text-lg font-bold">Stops to review ({items.length})</h3>
      <p className="text-sm text-muted-foreground">Unclaimed trucks and addresses marked "Check address". Nothing here is public until approved.</p>
      <ul className="space-y-2 text-sm">
        {items.map((s) => (
          <li key={s.id} className="rounded-xl border-2 border-border p-3">
            <div className="flex flex-wrap items-center gap-2">
              <b>{s.trucks?.name ?? s.truck_id}</b>
              {s.needs_address_check && <span className="chip border-destructive text-destructive">Check address</span>}
              <span>{new Date(s.starts_at).toLocaleDateString("en-US", { timeZone: "America/Chicago", weekday: "short", month: "short", day: "numeric" })} {fmtCentral(s.starts_at)}–{fmtCentral(s.ends_at)}</span>
            </div>
            <p>{s.venue_name} · {s.address ?? s.city}</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button className="chip" onClick={() => void decide(s, true)}>Approve</button>
              <button className="chip" onClick={() => void decide(s, false)}>Reject</button>
              {s.lat != null && <a className="chip" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lng}`}>See on map</a>}
              {s.source_url && !s.source_url.startsWith("paste:") && <a className="chip" target="_blank" rel="noreferrer" href={s.source_url}>View post</a>}
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

/** Explains the optional logged-in scraping setting. The admin enters the secret themselves; nothing is pasted in chat. */
export function FacebookSession() {
  const status = useServerFn(facebookSessionStatus);
  const { data } = useQuery({ queryKey: ["admin", "fb-session"], queryFn: () => status() });
  return (
    <details className="panel p-5 text-sm">
      <summary className="cursor-pointer font-bold">Optional: scrape with a logged-in Facebook session {data?.configured ? "· on" : "· off"}</summary>
      <div className="mt-3 space-y-2">
        <p><b>Warning:</b> using a personal Facebook login for scraping can break Facebook's rules and get the account restricted. Use a dedicated account made only for this, never your personal one.</p>
        <ol className="list-decimal space-y-1 pl-5">
          <li>Log in to the dedicated account in a desktop browser and join the group.</li>
          <li>Export its cookies as JSON with a cookie-export browser extension (an array of objects with name, value, domain).</li>
          <li>In Lovable, open Project Settings → Secrets and add a secret named <code>FACEBOOK_COOKIES_JSON</code> with that JSON as the value.</li>
        </ol>
        <p>When it's set, the next update sends it to the Apify actors <code>apify~facebook-groups-scraper</code> and <code>apify~facebook-posts-scraper</code> as the <code>cookies</code> input field. Delete the secret to turn it off. Cookies expire, so you may need to refresh them every few weeks.</p>
      </div>
    </details>
  );
}
