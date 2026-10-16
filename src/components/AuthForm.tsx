import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable";

type Mode = "in" | "up" | "forgot";

function friendly(msg: string) {
  if (/invalid login/i.test(msg)) return "Email or password is incorrect.";
  if (/not confirmed/i.test(msg)) return "Please confirm your email first — check your inbox for the link.";
  if (/already registered|already exists/i.test(msg)) return "An account with this email already exists. Try signing in.";
  if (/password/i.test(msg) && /(short|least|weak)/i.test(msg)) return "Password must be at least 6 characters.";
  return msg;
}

export function AuthForm({ initialMode = "in" }: { initialMode?: "in" | "up" }) {
  const [mode, setMode] = useState<Mode>(initialMode);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null);
    if (mode === "forgot") {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      setBusy(false);
      if (error) return setError(friendly(error.message));
      return setNotice(`If an account exists for ${email}, we sent a link to reset your password.`);
    }
    const { data, error } = mode === "in"
      ? await supabase.auth.signInWithPassword({ email, password })
      : await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.href, data: { display_name: name.trim() } } });
    setBusy(false);
    if (error) return setError(friendly(error.message));
    if (mode === "up" && !data.session) setNotice(`Check ${email} for a confirmation link, then come back and sign in.`);
  }

  async function google() {
    setError(null);
    try { sessionStorage.setItem("ftqc:returnTo", window.location.pathname + window.location.search); } catch { /* ignore */ }
    const r = await lovable.auth.signInWithOAuth("google", { redirect_uri: window.location.origin });
    if (r.error) setError("Google sign-in failed. Please try again.");
  }

  if (notice) return (
    <div className="space-y-3">
      <p className="rounded-xl bg-muted p-4 text-sm">{notice}</p>
      <button onClick={() => { setNotice(null); setMode("in"); }} className="w-full text-center text-sm font-semibold text-primary">Back to sign in</button>
    </div>
  );

  const tab = (m: "in" | "up", label: string) => (
    <button type="button" onClick={() => { setMode(m); setError(null); }} role="tab" aria-selected={mode === m}
      className={`h-10 rounded-full text-sm font-semibold transition-all duration-150 ${mode === m ? "bg-card shadow-pop-sm" : "text-muted-foreground"}`}>{label}</button>
  );

  return (
    <div className="space-y-4">
      {mode !== "forgot" ? (
        <div role="tablist" className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">{tab("in", "Sign in")}{tab("up", "Create account")}</div>
      ) : (
        <div><p className="font-semibold">Reset your password</p><p className="text-sm text-muted-foreground">Get an email link to choose a new one.</p></div>
      )}
      {mode !== "forgot" && (
        <>
          <button onClick={google} type="button" className="flex h-12 w-full items-center justify-center gap-2 rounded-full border border-border bg-card text-sm font-semibold shadow-pop transition-colors duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z"/><path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3 0 5.8 1.1 7.9 3l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z"/></svg>
            Continue with Google
          </button>
          <div className="flex items-center gap-3 text-xs text-muted-foreground"><span className="h-px flex-1 bg-border" />or<span className="h-px flex-1 bg-border" /></div>
        </>
      )}
      <form onSubmit={submit} className="space-y-3" noValidate={false}>
        {mode === "up" && <label className="block space-y-1 text-sm font-medium">Name<input className="field" required value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" /></label>}
        <label className="block space-y-1 text-sm font-medium">Email<input className="field" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></label>
        {mode !== "forgot" && (
          <label className="block space-y-1 text-sm font-medium">
            <span className="flex justify-between">Password
              {mode === "in" && <button type="button" onClick={() => { setMode("forgot"); setError(null); }} className="text-xs font-semibold text-primary">Forgot password?</button>}
            </span>
            <span className="relative block">
              <input className="field pr-12" type={show ? "text" : "password"} required minLength={6} value={password} onChange={(e) => setPassword(e.target.value)} autoComplete={mode === "in" ? "current-password" : "new-password"} />
              <button type="button" onClick={() => setShow(!show)} aria-label={show ? "Hide password" : "Show password"} className="absolute right-0 top-0 grid h-11 w-11 place-items-center text-muted-foreground">
                {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </span>
          </label>
        )}
        {error && <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">{error}</p>}
        <button disabled={busy} className="h-12 w-full rounded-full bg-primary text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          {busy ? "Please wait…" : mode === "in" ? "Sign in" : mode === "up" ? "Create account" : "Send reset link"}
        </button>
      </form>
      {mode === "forgot" && <button onClick={() => setMode("in")} className="w-full text-center text-sm font-semibold text-primary">Back to sign in</button>}
    </div>
  );
}
