import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useProfile, initials } from "@/hooks/use-profile";
import { Switch } from "@/components/ui/switch";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { deleteMyAccount } from "@/lib/account.functions";
import { SiteFooter } from "@/components/SiteFooter";

export const Route = createFileRoute("/_authenticated/account")({
  head: () => ({
    meta: [
      { title: "Your account | FoodTruckQC" },
      { name: "description", content: "Manage your FoodTruckQC profile, password and notifications." },
      { property: "og:title", content: "Your account | FoodTruckQC" },
      { property: "og:description", content: "Manage your FoodTruckQC profile and alerts." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: Account,
});

const card = "space-y-4 rounded-2xl bg-card p-5 shadow-pop";
const btn = "h-11 rounded-full bg-primary px-5 text-sm font-semibold text-primary-foreground transition-colors duration-150 hover:bg-primary/90 disabled:opacity-60";

function Account() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile();
  const qc = useQueryClient();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [cur, setCur] = useState("");
  const [pw, setPw] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  useEffect(() => { if (profile) setName(profile.display_name); }, [profile]);
  const key = ["me", "profile", user?.id];

  async function saveName(e: FormEvent) {
    e.preventDefault(); setBusy("name");
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() }).eq("id", user!.id);
    setBusy(null);
    if (error) return void toast.error("Couldn't save your name.");
    void qc.invalidateQueries({ queryKey: key }); toast.success("Name saved");
  }
  async function changePw(e: FormEvent) {
    e.preventDefault();
    if (pw.length < 6) return void toast.error("New password must be at least 6 characters.");
    setBusy("pw");
    const { error } = await supabase.auth.updateUser({ password: pw, current_password: cur } as Parameters<typeof supabase.auth.updateUser>[0]);
    setBusy(null);
    if (error) return void toast.error(error.message);
    setCur(""); setPw(""); toast.success("Password changed");
  }
  async function setNotify(v: boolean) {
    qc.setQueryData(key, profile ? { ...profile, notify_favorites: v } : profile);
    const { error } = await supabase.from("profiles").update({ notify_favorites: v }).eq("id", user!.id);
    if (error) { toast.error("Couldn't save setting."); void qc.invalidateQueries({ queryKey: key }); }
  }
  async function del() {
    setBusy("del");
    try { await deleteMyAccount(); await signOut(); qc.clear(); toast.success("Your account was deleted"); void navigate({ to: "/", replace: true }); }
    catch { toast.error("Couldn't delete your account. Please try again."); }
    finally { setBusy(null); }
  }

  return (
    <main className="min-h-dvh bg-secondary">
      <div className="mx-auto w-full max-w-[640px] space-y-4 p-4">
        <Link to="/" className="chip">← Map</Link>
        <div className="flex items-center gap-4">
          <span className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-full bg-primary text-xl font-bold text-primary-foreground">
            {profile?.avatar_url ? <img src={profile.avatar_url} alt="" className="h-full w-full object-cover" /> : initials(profile?.display_name, user?.email)}
          </span>
          <div className="min-w-0"><h1 className="truncate text-2xl font-bold">{profile?.display_name || "Your account"}</h1><p className="truncate text-sm text-muted-foreground">{user?.email}</p></div>
        </div>

        <form onSubmit={saveName} className={card}>
          <h2 className="font-semibold">Profile</h2>
          <label className="block space-y-1 text-sm font-medium">Display name<input className="field" value={name} onChange={(e) => setName(e.target.value)} /></label>
          <label className="block space-y-1 text-sm font-medium">Email<input className="field bg-muted text-muted-foreground" value={user?.email ?? ""} readOnly /></label>
          <button disabled={busy === "name"} className={btn}>Save</button>
        </form>

        <form onSubmit={changePw} className={card}>
          <h2 className="font-semibold">Change password</h2>
          <input className="field" type="password" placeholder="Current password" value={cur} onChange={(e) => setCur(e.target.value)} autoComplete="current-password" aria-label="Current password" />
          <input className="field" type="password" placeholder="New password" value={pw} onChange={(e) => setPw(e.target.value)} autoComplete="new-password" aria-label="New password" />
          <button disabled={busy === "pw"} className={btn}>Update password</button>
        </form>

        <div className={card}>
          <label className="flex min-h-11 cursor-pointer items-center justify-between gap-4">
            <span><span className="block font-semibold">Notify me when my favorite trucks go live</span><span className="block text-sm text-muted-foreground">We'll let you know when a saved truck checks in.</span></span>
            <Switch checked={profile?.notify_favorites ?? true} onCheckedChange={(v) => void setNotify(v)} />
          </label>
        </div>

        <div className={`${card} flex flex-wrap gap-3`}>
          <button onClick={() => void signOut().then(() => navigate({ to: "/", replace: true }))} className="h-11 rounded-full bg-muted px-5 text-sm font-semibold hover:bg-accent">Sign out</button>
          <AlertDialog>
            <AlertDialogTrigger className="h-11 rounded-full px-5 text-sm font-semibold text-destructive hover:bg-destructive/10">Delete my account</AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete your account?</AlertDialogTitle>
                <AlertDialogDescription>This permanently removes your profile and saved favorites. This can't be undone.</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction onClick={() => void del()} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">{busy === "del" ? "Deleting…" : "Delete account"}</AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </div>
      <SiteFooter />
    </main>
  );
}
