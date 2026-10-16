import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Emails are sent by the owner's HighLevel CRM; the app only fires its inbound-webhook workflows. */

async function postToHighLevel(secret: string | undefined, payload: Record<string, unknown>) {
  if (!secret) return { skipped: true as const };
  let res: Response;
  try {
    res = await fetch(secret, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error("[HighLevel] webhook request failed", err);
    return { ok: false as const };
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.error(`[HighLevel] webhook failed [${res.status}]: ${body}`);
    return { ok: false as const, status: res.status };
  }
  return { ok: true as const };
}

interface ClaimsLike {
  email?: string;
  user_metadata?: { name?: string; full_name?: string; given_name?: string; family_name?: string };
}

/** Add the signed-up user to HighLevel (idempotent; runs once per account). */
export const syncCrmContact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId, claims } = context;
    const { data: prof } = await supabase
      .from("profiles")
      .select("crm_synced_at, display_name")
      .eq("id", userId)
      .maybeSingle();
    if (prof?.crm_synced_at) return { ok: true, skipped: true };

    const c = claims as ClaimsLike;
    const email = c?.email;
    if (!email) return { ok: false };
    const meta = c?.user_metadata ?? {};
    const name: string = (prof?.display_name ?? meta.full_name ?? meta.name ?? "").trim() || (email.split("@")[0] ?? email);
    const [first = "", ...rest] = name.split(" ");

    const result = await postToHighLevel(process.env["HIGHLEVEL_USER_WEBHOOK_URL"], {
      event: "user_signup",
      email,
      first_name: first,
      last_name: rest.join(" "),
      name,
      tags: ["usuario"],
    });
    if (!("ok" in result) || result.ok === false) return result;
    await supabase.from("profiles").update({ crm_synced_at: new Date().toISOString() }).eq("id", userId);
    return { ok: true };
  });

interface LiveAlertInput {
  truckName: string;
  truckId: string;
  venue?: string | null;
  endsAt?: string | null;
}

/** Tell HighLevel to email a user that a favorited truck just went live. */
export const notifyCrmLiveAlert = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: LiveAlertInput) => input)
  .handler(async ({ data, context }) => {
    const { supabase, userId, claims } = context;
    const c = claims as ClaimsLike;
    const email = c?.email;
    if (!email || !data.truckName || !data.truckId) return { ok: false };
    const { data: prof } = await supabase
      .from("profiles")
      .select("display_name, notify_favorites")
      .eq("id", userId)
      .maybeSingle();
    if (prof && prof.notify_favorites === false) return { ok: true, skipped: true };
    const meta = c?.user_metadata ?? {};
    const displayName = prof?.display_name ?? meta.full_name ?? meta.name ?? "";

    return postToHighLevel(process.env["HIGHLEVEL_ALERT_WEBHOOK_URL"], {
      event: "favorite_truck_live",
      email,
      first_name: displayName.split(" ")[0] ?? "",
      truck_name: data.truckName,
      venue: data.venue ?? "",
      truck_url: `https://app.foodtruckqc.com/truck/${data.truckId}`,
      opened_at: new Date().toISOString(),
    });
  });

interface TruckDecisionInput {
  truckId: string;
  decision: "approved" | "rejected";
  reason?: string;
}

/** Tell HighLevel a pending truck was approved or rejected. Never throws — the admin decision stands even if the webhook fails. */
export const notifyCrmTruckDecision = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: TruckDecisionInput) => input)
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!isAdmin) throw new Error("Forbidden");
    const hook = process.env["HIGHLEVEL_APPROVAL_WEBHOOK_URL"];
    if (!hook) return { ok: true, skipped: true };

    const { data: t } = await context.supabase.from("trucks").select("*").eq("id", data.truckId).maybeSingle();
    if (!t) return { ok: false, error: "Truck not found" };

    // Owner contact: embed trucks keep it in the description; account-created trucks via the creator's auth email.
    let email = "", name = "", phone = t.phone ?? "";
    const m = t.description.match(/Owner contact:\s*([^·\n]+)(?:·\s*([^\s·]+@[^\s·]+))?(?:·\s*([^\n]+))?/);
    if (m) { name = (m[1] ?? "").trim(); email = (m[2] ?? "").trim(); phone = phone || (m[3] ?? "").trim(); }
    if (!email && t.created_by) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(t.created_by);
      email = u?.user?.email ?? "";
      name = name || (u?.user?.user_metadata?.["full_name"] as string) || (u?.user?.user_metadata?.["name"] as string) || "";
    }
    // Same business name for every truck of a business: the owner's business profile, else the name saved with the submission.
    let businessName = t.business_name || (t.description.match(/Business:\s*([^\n]+)/)?.[1] ?? "").trim();
    const ownerId = t.claimed_by ?? t.created_by;
    if (ownerId) {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: biz } = await supabaseAdmin.from("businesses").select("name").eq("owner_id", ownerId).maybeSingle();
      if (biz?.name) businessName = biz.name;
    }
    const [first = "", ...rest] = name.trim().split(" ");
    const truckUrl = `https://app.foodtruckqc.com/truck/${t.id}`;
    const approved = data.decision === "approved";

    const result = await postToHighLevel(hook, {
      event: approved ? "truck_approved" : "truck_rejected",
      email,
      first_name: first,
      last_name: rest.join(" "),
      name: name.trim(),
      phone,
      business_name: businessName,
      truck_name: t.name,
      truck_type: t.truck_type,
      cuisine: t.category,
      city: t.base_address ?? "",
      truck_url: truckUrl,
      owner_dashboard_url: "https://app.foodtruckqc.com/owner",
      claim_url: truckUrl,
      rejection_reason: approved ? "" : (data.reason ?? ""),
      next_steps: approved
        ? "Create your FoodTruckQC account, open your truck page and tap Claim it to take over the listing."
        : "Reply to this email if you think this was a mistake or want to fix the listing and reapply.",
      tags: [approved ? "owner-approved" : "owner-rejected"],
    });
    if ("ok" in result && result.ok === false) console.error(`[HighLevel] approval webhook failed for truck ${t.id}`);
    return { ok: true };
  });
