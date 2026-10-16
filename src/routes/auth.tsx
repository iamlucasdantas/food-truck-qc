import { Logo } from "@/components/Logo";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { z } from "zod";
import { AuthForm } from "@/components/AuthForm";
import { useAuth } from "@/hooks/use-auth";

const safe = (p?: string) => (p && p.startsWith("/") && !p.startsWith("//") ? p : "/");

export const Route = createFileRoute("/auth")({
  staticData: { sitemap: false },
  validateSearch: z.object({ redirect: z.string().optional(), mode: z.enum(["in", "up"]).optional() }),
  head: () => ({
    meta: [
      { title: "Sign in | FoodTruckQC" },
      { name: "description", content: "Sign in or create a FoodTruckQC account to save your favorite Quad Cities food trucks." },
      { property: "og:title", content: "Sign in | FoodTruckQC" },
      { property: "og:description", content: "Save favorite food trucks and get alerts when they open." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

function AuthPage() {
  const { redirect, mode } = Route.useSearch();
  const { user } = useAuth();
  const navigate = useNavigate();
  useEffect(() => { if (user) void navigate({ to: safe(redirect), replace: true }); }, [user, redirect, navigate]);

  return (
    <main className="grid min-h-dvh place-items-center bg-secondary p-4">
      <div className="w-full max-w-sm space-y-5 rounded-2xl bg-card p-6 shadow-pop">
        <div className="flex justify-center"><Logo size="lg" /></div>
        <AuthForm initialMode={mode ?? "in"} />
      </div>
    </main>
  );
}
