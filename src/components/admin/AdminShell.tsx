import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { Command as Cmdk } from "cmdk";
import {
  LayoutDashboard, Clock, BadgeCheck, Truck, Facebook, MapPinned, FileSpreadsheet, ScrollText, Search, LogOut, Map as MapIcon, ChevronRight, Zap, CornerDownLeft, PhoneCall, CalendarDays,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { LogoMark } from "@/components/Logo";
import {
  Sidebar, SidebarContent, SidebarFooter, SidebarGroup, SidebarGroupContent, SidebarGroupLabel, SidebarHeader, SidebarMenu, SidebarMenuBadge,
  SidebarMenuButton, SidebarMenuItem, SidebarProvider, SidebarRail, SidebarTrigger, useSidebar,
} from "@/components/ui/sidebar";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { ADMIN_SECTIONS, badgeText, buildCommands, filterCommands, isPaletteShortcut, sectionLabel, sidebarCounts, type AdminSection, type Command } from "@/data/admin";
import { Initials } from "./ui";

const ICONS: Record<AdminSection, typeof Truck> = {
  overview: LayoutDashboard, pending: Clock, claims: BadgeCheck, trucks: Truck, facebook: Facebook, apify: MapPinned, csv: FileSpreadsheet, logs: ScrollText, api: PhoneCall, calendars: CalendarDays,
};

/** Lightweight lists shared by the sidebar badges and the command palette. */
export function useAdminIndex() {
  return useQuery({
    queryKey: ["admin", "index"],
    queryFn: async () => {
      const [t, c] = await Promise.all([
        supabase.from("trucks").select("id,name,business_name,status,deleted_at").order("name").limit(5000),
        supabase.from("claims").select("id,truck_id,status,user_email,trucks(name)").order("created_at", { ascending: false }).limit(500),
      ]);
      const claims = (c.data ?? []).map((x) => ({ ...x, truck_name: (x.trucks as { name: string } | null)?.name ?? null }));
      return { trucks: t.data ?? [], claims };
    },
    staleTime: 30_000,
  });
}

type Go = (target: Command["target"]) => void;

export function AdminShell({ section, children }: { section: AdminSection; children: ReactNode }) {
  const navigate = useNavigate({ from: "/admin" });
  const [palette, setPalette] = useState(false);
  const { data } = useAdminIndex();
  const counts = sidebarCounts(data?.trucks ?? [], data?.claims ?? []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (isPaletteShortcut(e)) { e.preventDefault(); setPalette((o) => !o); } };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const go: Go = (t) => void navigate({ search: { tab: t.tab === "overview" ? undefined : t.tab, ...(t.truck ? { truck: t.truck } : {}), ...(t.extra ?? {}) } });

  return (
    <SidebarProvider>
      <div className="flex min-h-dvh w-full bg-muted/50 text-foreground">
        <AdminSidebar section={section} counts={counts} go={go} />
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-30 grid h-14 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-2 border-b border-border bg-background/90 px-3 backdrop-blur sm:gap-4 sm:px-6">
            <SidebarTrigger className="h-9 w-9" aria-label="Toggle sidebar" />
            <nav aria-label="Breadcrumb" className="flex min-w-0 items-center gap-1 text-sm">
              <button onClick={() => go({ tab: "overview" })} className="hidden shrink-0 text-muted-foreground hover:text-foreground sm:inline">Admin</button>
              <ChevronRight className="hidden h-3.5 w-3.5 shrink-0 text-muted-foreground sm:inline" aria-hidden />
              <span className="truncate font-medium" aria-current="page">{sectionLabel(section)}</span>
            </nav>
            <button
              onClick={() => setPalette(true)}
              className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-sm text-muted-foreground shadow-pop transition-colors hover:bg-muted sm:w-72"
              aria-label="Search and commands (Ctrl+K)"
            >
              <Search className="h-4 w-4 shrink-0" />
              <span className="hidden flex-1 text-left sm:inline">Search trucks, claims, actions…</span>
              <kbd className="hidden rounded border border-border bg-muted px-1.5 font-mono text-[11px] sm:inline">⌘K</kbd>
            </button>
          </header>
          <main className="mx-auto w-full min-w-0 max-w-[1240px] space-y-6 p-4 pb-24 sm:p-6 lg:p-8">{children}</main>
        </div>
      </div>
      <CommandPalette open={palette} onOpenChange={setPalette} go={go} trucks={data?.trucks ?? []} claims={data?.claims ?? []} />
    </SidebarProvider>
  );
}

function AdminSidebar({ section, counts, go }: { section: AdminSection; counts: { pending: number; claims: number }; go: Go }) {
  const { user, signOut } = useAuth();
  const { setOpenMobile, state } = useSidebar();
  const pick = (s: AdminSection) => { go({ tab: s }); setOpenMobile(false); };
  const badge: Partial<Record<AdminSection, number>> = { pending: counts.pending, claims: counts.claims };
  const email = user?.email ?? "";
  return (
    <Sidebar collapsible="icon" aria-label="Admin navigation">
      <SidebarHeader className="h-14 justify-center border-b border-sidebar-border">
        <button onClick={() => pick("overview")} className="flex min-w-0 items-center gap-2 px-1" aria-label="Admin overview">
          <LogoMark className="h-7 w-auto shrink-0" />
          {state === "expanded" && <span className="truncate text-sm font-semibold">FoodTruckQC <span className="font-normal text-muted-foreground">Admin</span></span>}
        </button>
      </SidebarHeader>
      <SidebarContent>
        {(["Workspace", "Data sources"] as const).map((g) => (
          <SidebarGroup key={g}>
            <SidebarGroupLabel>{g}</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {ADMIN_SECTIONS.filter((s) => s.group === g).map((s) => {
                  const Icon = ICONS[s.key];
                  const b = badgeText(badge[s.key] ?? 0);
                  return (
                    <SidebarMenuItem key={s.key}>
                      <SidebarMenuButton isActive={section === s.key} onClick={() => pick(s.key)} tooltip={b ? `${s.label} (${b})` : s.label} aria-current={section === s.key ? "page" : undefined}>
                        <Icon className="h-4 w-4" />
                        <span>{s.label}</span>
                      </SidebarMenuButton>
                      {b && <SidebarMenuBadge data-testid={`badge-${s.key}`} className="rounded-full bg-primary/15 text-foreground" aria-label={`${b} waiting`}>{b}</SidebarMenuBadge>}
                    </SidebarMenuItem>
                  );
                })}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        ))}
      </SidebarContent>
      <SidebarFooter className="border-t border-sidebar-border">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton asChild tooltip="Back to map"><Link to="/"><MapIcon className="h-4 w-4" /><span>Back to map</span></Link></SidebarMenuButton>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <div className="flex min-w-0 items-center gap-2 px-1 py-1">
              <Initials name={email || "Admin"} className="h-7 w-7 rounded-full" />
              {state === "expanded" && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={email}>{email}</span>}
            </div>
          </SidebarMenuItem>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={() => void signOut()} tooltip="Sign out"><LogOut className="h-4 w-4" /><span>Sign out</span></SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  );
}

type Idx = ReturnType<typeof useAdminIndex>["data"];
function CommandPalette({ open, onOpenChange, go, trucks, claims }: { open: boolean; onOpenChange: (o: boolean) => void; go: Go; trucks: NonNullable<Idx>["trucks"]; claims: NonNullable<Idx>["claims"] }) {
  const [q, setQ] = useState("");
  const all = useMemo(() => buildCommands(trucks, claims), [trucks, claims]);
  const items = filterCommands(all, q);
  const groups = (["Go to", "Actions", "Claims", "Trucks"] as const).map((g) => [g, items.filter((i) => i.group === g)] as const).filter(([, xs]) => xs.length);
  useEffect(() => { if (!open) setQ(""); }, [open]);
  const icon = (c: Command) => {
    if (c.group === "Go to" && c.target.tab) { const I = ICONS[c.target.tab]; return <I className="h-4 w-4 text-muted-foreground" />; }
    if (c.group === "Actions") return <Zap className="h-4 w-4 text-muted-foreground" />;
    if (c.group === "Claims") return <BadgeCheck className="h-4 w-4 text-muted-foreground" />;
    return <Truck className="h-4 w-4 text-muted-foreground" />;
  };
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="top-[15%] max-w-xl translate-y-0 overflow-hidden p-0 [&>button]:hidden">
        <DialogTitle className="sr-only">Search and commands</DialogTitle>
        <Cmdk shouldFilter={false} label="Search and commands" className="flex flex-col">
          <div className="flex items-center gap-2 border-b border-border px-4">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <Cmdk.Input value={q} onValueChange={setQ} autoFocus placeholder="Search trucks, claims or type an action…" className="h-12 flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground" />
            <kbd className="rounded border border-border bg-muted px-1.5 font-mono text-[11px] text-muted-foreground">Esc</kbd>
          </div>
          <Cmdk.List className="max-h-[min(60vh,420px)] overflow-y-auto p-2">
            <Cmdk.Empty className="py-10 text-center text-sm text-muted-foreground">No matches for “{q}”.</Cmdk.Empty>
            {groups.map(([g, xs]) => (
              <Cmdk.Group key={g} heading={g} className="[&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground">
                {xs.map((c) => (
                  <Cmdk.Item key={c.id} value={c.id} onSelect={() => { onOpenChange(false); go(c.target); }}
                    className="flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm data-[selected=true]:bg-accent">
                    {icon(c)}
                    <span className="min-w-0 flex-1 truncate">{c.label}</span>
                    {c.hint && <span className="max-w-[40%] truncate text-xs text-muted-foreground">{c.hint}</span>}
                    <CornerDownLeft className="h-3.5 w-3.5 text-muted-foreground opacity-0 [[data-selected=true]_&]:opacity-100" aria-hidden />
                  </Cmdk.Item>
                ))}
              </Cmdk.Group>
            ))}
          </Cmdk.List>
        </Cmdk>
      </DialogContent>
    </Dialog>
  );
}
