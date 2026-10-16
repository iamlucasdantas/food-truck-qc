import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";

type Details = { client?: { name?: string; uri?: string } | null; redirect_uri?: string; scope?: string; user?: { email?: string } | null; redirect_url?: string; redirect_to?: string };
type Res = { data: Details | null; error: { message: string } | null };
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<Res>;
  approveAuthorization: (id: string) => Promise<Res>;
  denyAuthorization: (id: string) => Promise<Res>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

const SCOPES: Record<string, string> = { openid: "Confirm who you are", email: "Share your email address", profile: "Share your basic profile" };

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  staticData: { sitemap: false },
  head: () => ({ meta: [{ title: "Connect an app | FoodTruckQC" }, { name: "robots", content: "noindex" }] }),
  validateSearch: (s: Record<string, unknown>) => ({ authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "" }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("This connection link is missing its authorization code.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw redirect({ to: "/auth", search: { redirect: location.pathname + location.searchStr } });
  },
  loader: async ({ location }) => {
    const id = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(id);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate });
    const { data: u } = await supabase.auth.getUser();
    return { details: data, email: u.user?.email ?? "" };
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <Shell><h1 className="text-xl font-bold">This connection request can't be opened</h1>
      <p className="text-sm text-muted-foreground">{error instanceof Error ? error.message : String(error)}. It may have expired — start the connection again from your assistant.</p></Shell>
  ),
});

function Shell({ children }: { children: React.ReactNode }) {
  return <main className="grid min-h-dvh place-items-center bg-secondary p-4"><div className="w-full max-w-md space-y-4 rounded-2xl bg-card p-6 shadow-pop"><div className="flex justify-center"><Logo size="lg" /></div>{children}</div></main>;
}

function Consent() {
  const { details, email } = Route.useLoaderData();
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const client = details?.client?.name ?? "An app";
  const scopes = (details?.scope ?? "").split(/\s+/).filter(Boolean);
  let host = "";
  try { host = details?.redirect_uri ? new URL(details.redirect_uri).host : ""; } catch { /* ignore */ }

  async function decide(approve: boolean) {
    setBusy(true); setError(null);
    const { data, error } = approve ? await oauth().approveAuthorization(authorization_id) : await oauth().denyAuthorization(authorization_id);
    const target = data?.redirect_url ?? data?.redirect_to;
    if (error || !target) { setBusy(false); setError(error?.message ?? "Something went wrong. Please try again."); return; }
    window.location.href = target;
  }

  return (
    <Shell>
      <h1 className="text-xl font-bold">Connect {client} to FoodTruckQC</h1>
      <p className="text-sm">{client} will be able to search trucks, see upcoming stops and manage your favorites as <b>{email}</b>.</p>
      {host && <p className="text-xs text-muted-foreground">Returns to {host}</p>}
      {scopes.length > 0 && <ul className="list-disc space-y-1 pl-5 text-sm">{scopes.map((s) => <li key={s}>{SCOPES[s] ?? `Additional permission requested: ${s}`}</li>)}</ul>}
      <p className="text-xs text-muted-foreground">This does not bypass FoodTruckQC's permissions.</p>
      {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
      <div className="flex gap-2">
        <button disabled={busy} onClick={() => void decide(true)} className="h-12 flex-1 rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">Approve</button>
        <button disabled={busy} onClick={() => void decide(false)} className="h-12 flex-1 rounded-full border border-border text-sm font-semibold disabled:opacity-60">Cancel connection</button>
      </div>
    </Shell>
  );
}
