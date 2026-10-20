import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import { Check, X, BadgeCheck, Clock, ShieldAlert, LogIn, Truck as TruckIcon, Home, MapPin, PanelRightOpen } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { parseCsv, slugify } from "@/data/trucks";
import { geocode } from "@/lib/geocode";
import { useServerFn } from "@tanstack/react-start";
import { seedCity, SEED_CITIES } from "@/lib/apify.functions";
import { startFacebookUpdate, continueFacebookUpdate } from "@/lib/facebook.functions";
import { notifyCrmTruckDecision } from "@/lib/crm.functions";
import { AdminTrucks } from "@/components/AdminTrucks";
import { AdminSuggestions, FacebookSession, PastePost } from "@/components/AdminFacebookTools";
import { AdminShell } from "@/components/admin/AdminShell";
import { AdminOverview } from "@/components/admin/AdminOverview";
import { AgentApiLog } from "@/components/admin/AgentApiLog";
import { CalendarSources } from "@/components/admin/CalendarSources";
import { GoogleHours } from '@/components/admin/GoogleHours';
import { EmptyState, IconAction, Initials, ListSkeleton, SectionHeader, StatusPill, btn, statusTone } from "@/components/admin/ui";
import { sectionFromSearch } from "@/data/admin";
import { LogoMark } from "@/components/Logo";
import { approvalIssue } from "@/data/ingestion-review";

export const Route = createFileRoute("/admin")({
  staticData: { sitemap: false },
  validateSearch: (s: Record<string, unknown>) => s as Record<string, string | number | undefined>,
  head: () => ({
    meta: [
      { title: "Admin | FoodTruckQC" },
      { name: "description", content: "Review claims, approve trucks, import and merge listings." },
      { property: "og:title", content: "Admin | FoodTruckQC" },
      { property: "og:description", content: "FoodTruckQC administration." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Admin,
});

const err = (e: { message: string } | null) => (e ? (toast.error(e.message), true) : false);

function Admin() {
  const { user, ready, isAdmin, openAuth } = useAuth();
  const search = Route.useSearch();
  const section = sectionFromSearch(search["tab"]);
  if (!ready) return <div className="grid min-h-dvh place-items-center bg-muted/50"><LogoMark className="h-10 w-auto animate-pulse" /></div>;
  if (!user || !isAdmin) {
    return (
      <div className="grid min-h-dvh place-items-center bg-muted/50 p-4">
        <div className="w-full max-w-sm">
          {!user
            ? <EmptyState icon={LogIn} title="Sign in to Admin" hint="This area is for FoodTruckQC admins." action={<button className={btn.primary} onClick={() => openAuth()}>Sign in</button>} />
            : <EmptyState icon={ShieldAlert} title="Admins only" hint="Your account does not have admin access." action={<a href="/" className={btn.secondary}>Back to map</a>} />}
        </div>
      </div>
    );
  }
  return (
    <AdminShell section={section}>
      {section === "overview" && <AdminOverview />}
      {section === "claims" && <Claims />}
      {section === "pending" && <PendingTrucks />}
      {section === "trucks" && <AdminTrucks search={search} />}
      {section === "csv" && <><SectionHeader title="CSV import" description="Bulk-add trucks from a spreadsheet." /><CsvImport /></>}
      {section === "apify" && <><SectionHeader title="Google Maps seed" description="Find food trucks across Quad Cities towns." /><ApifySeed /></>}
      {section === "facebook" && <><SectionHeader title="Facebook" description="Scan groups and pages for upcoming stops." /><FacebookTab /></>}
      {section === "logs" && <><SectionHeader title="Import logs" description="Every CSV, Google Maps and Facebook run." /><Logs /></>}
      {section === "api" && <AgentApiLog />}
      {section === "calendars" && <CalendarSources />}
    </AdminShell>
  );
}

function useInvalidate() {
  const qc = useQueryClient();
  return () => void qc.invalidateQueries();
}

function Claims() {
  const inv = useInvalidate();
  const [show, setShow] = useState<"pending" | "all">("pending");
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "claims"],
    queryFn: async () => (await supabase.from("claims").select("*, trucks(name, status)").order("created_at", { ascending: false }).limit(100)).data ?? [],
  });
  const review = async (id: string, approve: boolean) => {
    const reason = approve ? null : window.prompt("Reason for rejecting (optional)") ?? null;
    if (!approve && reason === null) return;
    const { error } = await supabase.rpc("review_claim", { _claim_id: id, _approve: approve, _reason: reason ?? "" });
    if (!err(error)) { toast.success(approve ? "Approved — owner role granted" : "Rejected"); inv(); }
  };
  const list = show === "pending" ? data.filter((c) => c.status === "pending") : data;
  return (
    <>
      <SectionHeader title="Claims" description="Owners asking to manage an existing listing."
        actions={<Segmented value={show} onChange={setShow} options={[["pending", "Open"], ["all", "All"]]} />} />
      {isLoading ? <ListSkeleton /> : !list.length ? (
        <EmptyState icon={BadgeCheck} title={show === "pending" ? "No open claims" : "No claims yet"} hint="When an owner taps “Is this your truck?”, their request shows up here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-pop">
          {list.map((c) => (
            <li key={c.id} className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3 p-4">
              <Initials name={c.trucks?.name ?? "?"} />
              <div className="min-w-0 space-y-1">
                <div className="flex flex-wrap items-center gap-2"><p className="truncate font-medium">{c.trucks?.name ?? c.truck_id}</p><StatusPill tone={statusTone(c.status)}>{c.status}</StatusPill></div>
                <p className="truncate text-sm text-muted-foreground">{c.user_email} · {new Date(c.created_at).toLocaleString()}</p>
                {c.message && <p className="text-sm">“{c.message}”</p>}
                {c.reject_reason && <p className="text-sm text-destructive">Reason: {c.reject_reason}</p>}
              </div>
              {c.status === "pending" && (
                <div className="flex gap-1">
                  <IconAction label="Approve claim" icon={Check} tone="primary" onClick={() => void review(c.id, true)} />
                  <IconAction label="Reject claim" icon={X} tone="danger" onClick={() => void review(c.id, false)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

function Segmented<T extends string>({ value, onChange, options }: { value: T; onChange: (v: T) => void; options: [T, string][] }) {
  return (
    <div className="flex rounded-lg border border-border bg-card p-0.5 shadow-pop" role="group">
      {options.map(([v, l]) => (
        <button key={v} aria-pressed={value === v} onClick={() => onChange(v)} className={`h-8 rounded-md px-3 text-sm font-medium transition-colors ${value === v ? "bg-muted text-foreground" : "text-muted-foreground hover:text-foreground"}`}>{l}</button>
      ))}
    </div>
  );
}

function PendingTrucks() {
  const inv = useInvalidate();
  const navigate = Route.useNavigate();
  const { data = [], isLoading } = useQuery({
    queryKey: ["admin", "pending"],
    queryFn: async () => (await supabase.from("trucks").select("*").eq("status", "pending").is("deleted_at", null).order("created_at")).data ?? [],
  });
  const [rejecting, setRejecting] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const decide = async (id: string, decision: "approved" | "rejected", why = "") => {
    const status = decision === "approved" ? "active" : "archived";
    if (err((await supabase.from("trucks").update({ status }).eq("id", id)).error)) return;
    toast.success(decision === "approved" ? "Approved" : "Rejected");
    setRejecting(null); setReason(""); inv();
    // Fire-and-forget: the CRM email must never block the decision.
    void notifyCrmTruckDecision({ data: { truckId: id, decision, reason: why } })
      .then((r) => { if (r && "skipped" in r && r.skipped) toast("CRM webhook not configured — no email sent."); })
      .catch(() => toast("CRM webhook failed — the decision was saved anyway."));
  };
  return (
    <>
      <SectionHeader title="Pending trucks" description="New listings from the website form, owner dashboard and scrapers." />
      {isLoading ? <ListSkeleton /> : !data.length ? (
        <EmptyState icon={Clock} title="No trucks waiting for approval" hint="New sign-ups and detected trucks will appear here." />
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-card shadow-pop">
          {data.map((t) => (
            <li key={t.id} className="space-y-3 p-4">
              <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
                {t.logo_url ? <img src={t.logo_url} alt="" className="h-8 w-8 rounded-lg border border-border object-cover" /> : <Initials name={t.name} emoji={t.emoji} />}
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate font-medium">{t.name}</p>
                    <StatusPill tone="neutral">{t.truck_type === "fixed" ? <><Home className="h-3 w-3" />Fixed</> : <><TruckIcon className="h-3 w-3" />Mobile</>}</StatusPill>
                  </div>
                  <p className="flex min-w-0 items-center gap-1 truncate text-sm text-muted-foreground">{/^other$/i.test(t.category) ? "Category needs review" : t.category} · <MapPin className="h-3 w-3 shrink-0" />{t.base_address ?? "Address needs review"}</p>
                  {approvalIssue(t) && <p className="mt-1 text-xs font-medium text-destructive">Can't approve yet: {approvalIssue(t)} — open details to fix it.</p>}
                </div>
                <div className="flex gap-1">
                  <IconAction label="Open details" icon={PanelRightOpen} onClick={() => void navigate({ search: { tab: "trucks", truck: t.id } })} />
                  <IconAction label="Approve" icon={Check} tone="primary" disabled={!!approvalIssue(t)} onClick={() => void decide(t.id, "approved")} />
                  <IconAction label="Reject" icon={X} tone="danger" onClick={() => { setRejecting(rejecting === t.id ? null : t.id); setReason(""); }} />
                </div>
              </div>
              {rejecting === t.id && (
                <form className="flex flex-wrap gap-2 pl-11" onSubmit={(e) => { e.preventDefault(); void decide(t.id, "rejected", reason.trim()); }}>
                  <input autoFocus className="h-9 min-w-0 flex-1 rounded-lg border border-input bg-background px-3 text-sm outline-none focus:ring-2 focus:ring-ring" placeholder="Reason (sent to the owner)" value={reason} onChange={(e) => setReason(e.target.value)} />
                  <button className={btn.primary}>Confirm rejection</button>
                </form>
              )}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function CsvImport() {
  const inv = useInvalidate();
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const run = async (file: File) => {
    const rows = parseCsv(await file.text()).filter((r) => r["name"]);
    if (!rows.length) { toast.error("No rows with a name column found."); return; }
    setBusy(true); setLog([]);
    const add = (s: string) => setLog((l) => [...l, s]);
    const { data: runRow } = await supabase.from("ingestion_runs").insert({ source: "csv", notes: file.name }).select().single();
    let created = 0;
    try {
      for (const [i, r] of rows.entries()) {
        const addr = r["address"] ?? "";
        const geo = addr ? await geocode(addr) : null;
        const id = `${slugify(r["name"]!)}-${Math.random().toString(36).slice(2, 6)}`;
        const { error } = await supabase.from("trucks").insert({
          id, name: r["name"]!, category: r["category"] || "Other",
          phone: r["phone"] || null, website: r["website"] || null, instagram: r["instagram"] || null, facebook: r["facebook"] || null,
          base_address: geo?.label ?? (addr || null), base_lat: geo?.lat ?? null, base_lng: geo?.lng ?? null,
          status: "active", source: "manual",
        });
        if (error) add(`✗ ${r["name"]}: ${error.message}`);
        else { created++; add(`✓ ${r["name"]}${addr && !geo ? " (address not found)" : ""}`); }
        if (addr && i < rows.length - 1) await sleep(1100); // Nominatim: max 1 request/second
      }
      if (runRow) await supabase.from("ingestion_runs").update({ status: "success", finished_at: new Date().toISOString(), items_found: rows.length, items_created: created }).eq("id", runRow.id);
      toast.success(`Imported ${created} of ${rows.length}`);
    } catch (e) {
      if (runRow) await supabase.from("ingestion_runs").update({ status: "error", finished_at: new Date().toISOString(), items_found: rows.length, items_created: created, error: String(e) }).eq("id", runRow.id);
      toast.error(String(e));
    }
    setBusy(false); inv();
  };

  return (
    <div className="panel space-y-3 p-5">
      <p className="text-sm">Columns: <code>name,category,phone,website,instagram,facebook,address</code>. Addresses are looked up one per second, so large files take a while.</p>
      <input type="file" accept=".csv,text/csv" disabled={busy} onChange={(e) => { const f = e.target.files?.[0]; if (f) void run(f); e.target.value = ""; }} />
      {busy && <p className="text-sm">Importing… keep this tab open.</p>}
      {log.length > 0 && <pre className="max-h-64 overflow-auto rounded bg-muted p-2 text-xs">{log.join("\n")}</pre>}
    </div>
  );
}

function Logs() {
  const { data = [] } = useQuery({
    queryKey: ["admin", "runs"],
    queryFn: async () => (await supabase.from("ingestion_runs").select("*").order("started_at", { ascending: false }).limit(100)).data ?? [],
  });
  if (!data.length) return <p className="panel p-5 text-muted-foreground">No imports yet.</p>;
  return (
    <div className="panel overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-sm">
        <thead><tr className="border-b">{["Started", "Source", "Status", "Found", "Created", "Notes / error"].map((h) => <th key={h} className="p-2">{h}</th>)}</tr></thead>
        <tbody>
          {data.map((r) => (
            <tr key={r.id} className="border-b last:border-0">
              <td className="p-2 whitespace-nowrap">{new Date(r.started_at).toLocaleString()}</td>
              <td className="p-2">{r.source}</td><td className="p-2">{r.status}</td>
              <td className="p-2">{r.items_found}</td><td className="p-2">{r.items_created}</td>
              <td className="p-2 text-muted-foreground">{r.error ?? r.notes}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApifySeed() {
  const inv = useInvalidate();
  const seed = useServerFn(seedCity);
  const [busy, setBusy] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const { data: count = 0 } = useQuery({
    queryKey: ["admin", "active-count"],
    queryFn: async () => (await supabase.from("trucks").select("id", { count: "exact", head: true }).eq("status", "active")).count ?? 0,
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["admin", "runs", "apify"],
    queryFn: async () => (await supabase.from("ingestion_runs").select("*").eq("source", "apify_maps").order("started_at", { ascending: false }).limit(10)).data ?? [],
  });

  const latest = runs[0];
  const missing = latest && latest.status === "running" ? SEED_CITIES.filter((c) => !(latest.cities_done ?? []).includes(c)) : [];

  const run = async (resume: boolean) => {
    setBusy(true); setLog([]);
    let runId = resume ? latest?.id : undefined;
    if (!runId) {
      const { data: r } = await supabase.from("ingestion_runs").insert({ source: "apify_maps", notes: "Google Maps seed", cities_total: SEED_CITIES }).select().single();
      runId = r?.id;
    }
    const todo = resume ? missing : SEED_CITIES;
    let created = 0;
    for (const city of todo) {
      setLog((l) => [...l, `⏳ ${city}…`]);
      try {
        const out = await seed({ data: { city, runId } });
        created += out.created;
        setLog((l) => [...l.slice(0, -1), `✓ ${city}: ${out.found} found, ${out.created} new, ${out.updated} updated`]);
      } catch (e) {
        setLog((l) => [...l.slice(0, -1), `✗ ${city}: ${e instanceof Error ? e.message : String(e)}`]);
      }
      inv();
    }
    setBusy(false); inv();
    toast.success(`Seed done: ${created} new trucks`);
  };

  return (
    <div className="space-y-3">
      <div className="panel space-y-3 p-5">
        <p className="text-2xl font-extrabold">{count} <span className="text-base font-normal text-muted-foreground">/ 50 active trucks</span></p>
        <div className="h-2 overflow-hidden rounded bg-muted"><div className="h-full bg-primary" style={{ width: `${Math.min(100, (count / 50) * 100)}%` }} /></div>
        <p className="text-sm text-muted-foreground">Food truck discovery · {SEED_CITIES.length} towns within 75 miles of Davenport. Uses Apify credits. Owner business details are preserved; closed Google profiles are archived, not deleted.</p>
        {latest && <p className="text-sm font-semibold">Cities done {(latest.cities_done ?? []).length}/{latest.cities_total?.length || SEED_CITIES.length}{missing.length > 0 && ` · missing: ${missing.join(", ")}`}</p>}
        <div className="flex flex-wrap gap-2">
          {missing.length > 0 && <button disabled={busy} onClick={() => void run(true)} className="chip bg-primary text-primary-foreground">{busy ? "Running…" : `Continue (${missing.length} left)`}</button>}
          <button disabled={busy} onClick={() => void run(false)} className="chip">{busy ? "Running…" : "Run Google Maps seed"}</button>
        </div>
        {log.length > 0 && <pre className="rounded bg-muted p-2 text-xs">{log.join("\n")}</pre>}
      </div>
      <h3 className="font-bold">Last runs</h3>
      <GoogleHours />
      {runs.length === 0 ? <p className="text-sm text-muted-foreground">No seeds yet.</p> : (
        <ul className="space-y-1 text-sm">
          {runs.map((r) => (
            <li key={r.id} className="panel p-3">
              <b>{new Date(r.started_at).toLocaleString()}</b> · {r.status} · {r.items_found} found · {r.items_created} new
              {r.error && <pre className="mt-1 whitespace-pre-wrap text-xs text-destructive">{r.error}</pre>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function FacebookTab() {
  const inv = useInvalidate();
  const start = useServerFn(startFacebookUpdate);
  const cont = useServerFn(continueFacebookUpdate);
  const [busy, setBusy] = useState(false);
  const [url, setUrl] = useState("");
  const [kind, setKind] = useState<"group" | "page" | "reddit" | "instagram">("group");
  const { data: sources = [] } = useQuery({
    queryKey: ["admin", "social"],
    queryFn: async () => (await supabase.from("social_sources").select("*").order("created_at", { ascending: false })).data ?? [],
  });
  const { data: runs = [] } = useQuery({
    queryKey: ["admin", "runs", "fb"],
    queryFn: async () => (await supabase.from("ingestion_runs").select("*").eq("source", "apify_facebook").order("started_at", { ascending: false }).limit(10)).data ?? [],
    refetchInterval: busy ? 5000 : false,
  });
  const latest = runs[0];
  const running = latest?.status === "running";

  const add = async () => {
    if (!/facebook\.com\//i.test(url)) return toast.error("Paste a facebook.com URL");
    const { error } = await supabase.from("social_sources").insert({ kind, url: url.trim(), name: url.trim().split("/").filter(Boolean).pop() ?? "" });
    if (error) return toast.error(error.message);
    setUrl(""); inv(); return undefined;
  };
  const loop = async (runId: string) => {
    for (let i = 0; i < 60; i++) {
      const out = await cont({ data: { runId } });
      inv();
      if (out.done) return toast.success("Facebook update finished");
      await new Promise((r) => setTimeout(r, out.remaining > 0 ? 1000 : 10000));
    }
    return undefined;
  };
  const run = async (resume: boolean) => {
    setBusy(true);
    try {
      const runId = resume && latest ? latest.id : (await start()).runId;
      inv(); await loop(runId);
    } catch (e) { toast.error(e instanceof Error ? e.message : String(e)); }
    setBusy(false); inv();
  };

  return (
    <div className="space-y-3">
      <div className="panel space-y-3 p-5">
        <div className="flex flex-wrap gap-2">
          <select className="field w-auto" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}><option value="group">Facebook group</option><option value="page">Facebook page</option><option value="reddit">Reddit</option><option value="instagram">Instagram</option></select>
          <input className="field flex-1" placeholder="https://www.facebook.com/groups/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          <button onClick={() => void add()} className="chip bg-primary text-primary-foreground">Add</button>
        </div>
        <p className="text-sm text-muted-foreground">Only public groups work. Every truck with a Facebook link is checked automatically too. Automatic scans: 10am, noon, 2pm, 4pm, 6pm and 8pm Central daily; uses Apify and AI credits.</p>
        {latest && <p className="text-sm font-semibold">Sources done {latest.cities_done.length}/{latest.cities_total.length} · {latest.status} · {latest.items_created} stops added</p>}
        <div className="flex flex-wrap gap-2">
          {running && <button disabled={busy} onClick={() => void run(true)} className="chip bg-primary text-primary-foreground">{busy ? "Running…" : "Continue"}</button>}
          <button disabled={busy || running} onClick={() => void run(false)} className="chip">{busy ? "Running…" : "Run Facebook update"}</button>
        </div>
      </div>
      <AdminSuggestions />
      <PastePost />
      <FacebookSession />
      <h3 className="font-bold">Sources ({sources.length})</h3>
      <ul className="space-y-1 text-sm">
        {sources.map((s) => (
          <li key={s.id} className="panel flex items-center gap-2 p-2">
            <span className="chip">{s.kind}{s.truck_id ? " · truck" : ""}</span>
            <a href={s.url} target="_blank" rel="noreferrer" className="flex-1 truncate underline">{s.name || s.url}</a>
            <span className="text-right text-xs text-muted-foreground">
              {s.last_run_at ? `${new Date(s.last_run_at).toLocaleDateString()} · ${s.last_status === "blocked" ? "blocked" : `${s.last_posts} posts, ${s.last_stops} stops`}` : "never run"}
              {s.last_reason && <span className={`block ${s.last_status === "blocked" ? "font-semibold text-destructive" : ""}`}>{s.last_reason}</span>}
            </span>
            <button className="chip" onClick={async () => { await supabase.from("social_sources").delete().eq("id", s.id); inv(); }}>Remove</button>
          </li>
        ))}
      </ul>
      <h3 className="font-bold">Last runs</h3>
      <ul className="space-y-1 text-sm">
        {runs.map((r) => (
          <li key={r.id} className="panel p-3"><b>{new Date(r.started_at).toLocaleString()}</b> · {r.notes} · {r.status} · {r.items_found} posts · {r.items_created} stops
            {r.error && <pre className="mt-1 whitespace-pre-wrap text-xs text-destructive">{r.error}</pre>}</li>
        ))}
      </ul>
    </div>
  );
}
