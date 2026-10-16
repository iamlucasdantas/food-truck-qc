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
