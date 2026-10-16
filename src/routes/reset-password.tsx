import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/reset-password")({
  staticData: { sitemap: false },
  head: () => ({
    meta: [
      { title: "Choose a new password | FoodTruckQC" },
      { name: "description", content: "Set a new password for your FoodTruckQC account." },
      { property: "og:title", content: "Reset password | FoodTruckQC" },
      { property: "og:description", content: "Set a new password for your FoodTruckQC account." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: ResetPassword,
});

function ResetPassword() {
  const navigate = useNavigate();
  const [ok, setOk] = useState<boolean | null>(null);
  const [pw, setPw] = useState("");
  const [pw2, setPw2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const recovery = window.location.hash.includes("type=recovery");
    const { data } = supabase.auth.onAuthStateChange((e) => { if (e === "PASSWORD_RECOVERY") setOk(true); });
    void supabase.auth.getSession().then(({ data: s }) => setOk((v) => v ?? (recovery || !!s.session)));
    return () => data.subscription.unsubscribe();
  }, []);

  async function submit(e: FormEvent) {
    e.preventDefault(); setError(null);
    if (pw.length < 6) return setError("Password must be at least 6 characters.");
    if (pw !== pw2) return setError("Passwords don't match.");
    setBusy(true);
    const { error } = await supabase.auth.updateUser({ password: pw });
    setBusy(false);
    if (error) return setError(error.message);
    toast.success("Password updated");
    void navigate({ to: "/" });
  }

  return (
    <main className="grid min-h-dvh place-items-center bg-secondary p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl bg-card p-6 shadow-pop">
        <h1 className="text-xl font-bold">Choose a new password</h1>
        {ok === false ? (
          <p className="text-sm text-muted-foreground">This reset link is invalid or expired. <Link to="/auth" className="font-semibold text-primary">Request a new one</Link>.</p>
        ) : (
          <form onSubmit={submit} className="space-y-3">
            <input className="field" type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="New password" />
            <input className="field" type="password" placeholder="Repeat new password" value={pw2} onChange={(e) => setPw2(e.target.value)} autoComplete="new-password" aria-label="Repeat new password" />
            {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
            <button disabled={busy} className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground disabled:opacity-60">{busy ? "Saving…" : "Update password"}</button>
          </form>
        )}
      </div>
    </main>
  );
}
