import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AuthModal } from "@/components/AuthModal";

type Role = "admin" | "owner" | "consumer";
interface AuthCtx {
  user: User | null; roles: Role[]; ready: boolean; isAdmin: boolean;
  openAuth: (reason?: string) => void; signOut: () => Promise<void>;
}

const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [roles, setRoles] = useState<Role[]>([]);
  const [ready, setReady] = useState(false);
  const [modal, setModal] = useState<{ open: boolean; reason?: string | undefined }>({ open: false });

  const loadRoles = useCallback(async (u: User | null) => {
    if (!u) return setRoles([]);
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", u.id);
    setRoles((data ?? []).map((r) => r.role));
  }, []);

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user); await loadRoles(data.user); setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (event !== "SIGNED_IN" && event !== "SIGNED_OUT" && event !== "USER_UPDATED") return;
      const u = session?.user ?? null;
      setUser(u);
      void loadRoles(u);
      if (u) setModal({ open: false });
      if (event === "SIGNED_OUT") qc.removeQueries({ queryKey: ["me"] });
      else void qc.invalidateQueries({ queryKey: ["me"] });
    });
    return () => sub.subscription.unsubscribe();
  }, [loadRoles, qc]);

  const value: AuthCtx = {
    user, roles, ready, isAdmin: roles.includes("admin"),
    openAuth: (reason) => setModal({ open: true, reason }),
    signOut: async () => { await qc.cancelQueries(); await supabase.auth.signOut(); },
  };

  return (
    <Ctx.Provider value={value}>
      {children}
      <AuthModal open={modal.open} reason={modal.reason} onOpenChange={(open) => setModal({ open })} />
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAuth must be used inside AuthProvider");
  return v;
}
