import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { matchClaimCandidates, REASON_LABEL, type Candidate, type Me } from "@/data/claims";
import { cityOf } from "@/data/filters";

const COLS = "id, name, status, claimed_by, created_by, deleted_at, merged_into, website, facebook, instagram, reddit, description";

async function loadMatches(userId: string, supabase: SupabaseClient<Database>) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: u } = await supabaseAdmin.auth.admin.getUserById(userId);
  const [{ data: biz }, { data: mine }, { data: open }, { data: claims }] = await Promise.all([
    supabase.from("businesses").select("name, website, facebook, instagram, reddit").eq("owner_id", userId).maybeSingle(),
    supabase.from("trucks").select("name").or(`claimed_by.eq.${userId},created_by.eq.${userId}`),
    supabaseAdmin.from("trucks").select(COLS).is("claimed_by", null).is("deleted_at", null).is("merged_into", null).neq("status", "archived").limit(2000),
    supabase.from("claims").select("truck_id, status").eq("user_id", userId),
  ]);
  const me: Me = {
    email: u?.user?.email ?? "", emailConfirmed: !!u?.user?.email_confirmed_at,
    businessName: biz?.name ?? "", truckNames: (mine ?? []).map((t) => t.name),
    website: biz?.website ?? null, facebook: biz?.facebook ?? null, instagram: biz?.instagram ?? null, reddit: biz?.reddit ?? null,
  };
  const asked = new Set((claims ?? []).filter((c) => c.status !== "rejected").map((c) => c.truck_id));
  const rows = (open ?? []) as Candidate[];
  const matches = matchClaimCandidates(me, rows, userId).filter((m) => !asked.has(m.id));
  return { me, matches, rows, supabaseAdmin };
}

/** Unclaimed trucks that probably belong to the signed-in owner. Returns only public-safe fields. */
export const suggestMyTrucks = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { me, matches, rows, supabaseAdmin } = await loadMatches(context.userId, context.supabase);
    if (!matches.length) return { emailConfirmed: me.emailConfirmed, items: [] };
    const byId = new Map(rows.map((r) => [r.id, r]));
    const ids = matches.map((m) => m.id);
    const [{ data: full }, { data: covers }] = await Promise.all([
      supabaseAdmin.from("trucks").select("id, emoji, logo_url, base_address, category").in("id", ids),
      supabaseAdmin.from("truck_photos").select("truck_id, path").in("truck_id", ids).eq("is_cover", true),
    ]);
    const paths = (covers ?? []).filter((c) => c.path.startsWith(`${c.truck_id}/`) && byId.get(c.truck_id)?.status === "active");
    const { data: signed } = paths.length ? await supabaseAdmin.storage.from("truck-photos").createSignedUrls(paths.map((p) => p.path), 3600) : { data: [] };
    const urlByTruck = new Map(paths.map((p, i) => [p.truck_id, signed?.[i]?.signedUrl ?? ""]));
    const info = new Map((full ?? []).map((f) => [f.id, f]));
    return {
      emailConfirmed: me.emailConfirmed,
      items: matches.slice(0, 5).map((m) => {
        const f = info.get(m.id);
        return {
          id: m.id, name: byId.get(m.id)!.name, city: cityOf(f?.base_address), category: f?.category ?? "",
          emoji: f?.emoji ?? "🚚", cover: urlByTruck.get(m.id) || f?.logo_url || null,
          reasons: m.reasons.map((r) => REASON_LABEL[r]), automatic: m.automatic,
        };
      }),
    };
  });

/**
 * Claim a suggested truck. Same rules as the "Claim it" button: signed in, confirmed email, the admin approves.
 * A pending truck submitted with this confirmed email is linked right away so the owner can set it up while it waits.
 */
export const claimSuggestedTruck = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => z.object({ truckId: z.string().min(1).max(120) }).parse(input))
  .handler(async ({ data, context }) => {
    const { me, matches, supabaseAdmin } = await loadMatches(context.userId, context.supabase);
    if (!me.emailConfirmed) return { ok: false as const, error: "Confirm your email first — check your inbox for the link." };
    const m = matches.find((x) => x.id === data.truckId);
    if (!m) return { ok: false as const, error: "This truck can't be claimed from here. Open its page and tap \"Claim it\"." };
    const { data: t } = await supabaseAdmin.from("trucks").select("status").eq("id", m.id).maybeSingle();
    if (m.automatic && t?.status === "pending") await supabaseAdmin.from("trucks").update({ created_by: context.userId }).eq("id", m.id).is("claimed_by", null);
    const { error } = await context.supabase.from("claims").insert({
      truck_id: m.id, user_id: context.userId, user_email: me.email,
      message: `Suggested match in owner setup (${m.reasons.map((r) => REASON_LABEL[r]).join(", ")})`,
    });
    if (error) return { ok: false as const, error: "Couldn't send the claim. Try again." };
    return { ok: true as const, linked: m.automatic && t?.status === "pending" };
  });
