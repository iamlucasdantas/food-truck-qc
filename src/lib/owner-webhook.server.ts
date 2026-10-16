import { ownerWebhookPayload, type NewTruckNotice } from "@/data/business";

/** Fire the owner/admin HighLevel webhook. Never throws; skips quietly when the secret is empty. */
export async function postOwnerWebhook(n: NewTruckNotice) {
  const hook = process.env["HIGHLEVEL_OWNER_WEBHOOK_URL"];
  if (!hook) return;
  try {
    const res = await fetch(hook, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(ownerWebhookPayload(n)) });
    if (!res.ok) console.error(`[HighLevel] owner webhook failed [${res.status}] for ${n.truckId}: ${await res.text().catch(() => "")}`);
  } catch (e) { console.error(`[HighLevel] owner webhook failed for ${n.truckId}`, e); }
}
