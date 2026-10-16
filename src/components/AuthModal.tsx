import { useState, type FormEvent } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

export function AuthModal({ open, reason, onOpenChange }: { open: boolean; reason?: string; onOpenChange: (o: boolean) => void }) {
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
    setBusy(false);
    if (error) return void toast.error(error.message);
    if (mode === "up" && !data.session) setSent(true);
  }

  async function google() {
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) toast.error(r.error.message ?? "Google sign-in failed");
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) setSent(false); }}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle className="text-2xl font-extrabold">{mode === "in" ? "Sign in" : "Create account"}</DialogTitle>
          <DialogDescription>{reason ?? "Save your favorite food trucks."}</DialogDescription>
        </DialogHeader>
        {sent ? (
          <p className="rounded-xl bg-secondary p-4 text-sm">Check <b>{email}</b> for a confirmation link, then come back and sign in.</p>
        ) : (
          <div className="space-y-3">
            <button onClick={google} className="chip w-full justify-center py-2">Continue with Google</button>
            <div className="text-center text-xs text-muted-foreground">or</div>
            <form onSubmit={submit} className="space-y-2">
              <input className="field" type="email" required placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <input className="field" type="password" required minLength={6} placeholder="Password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <button disabled={busy} className="chip w-full justify-center bg-primary py-2 text-primary-foreground">
                {busy ? "…" : mode === "in" ? "Sign in" : "Sign up"}
              </button>
            </form>
            <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="w-full text-center text-sm underline">
              {mode === "in" ? "New here? Create an account" : "Have an account? Sign in"}
            </button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
