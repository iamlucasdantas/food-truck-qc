// Live checks of the access rules on the real backend, as a signed-out visitor.
// Owner-only writes (photos, menu, business) must be refused; public reads must work.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const env = Object.fromEntries(
  readFileSync(`${process.cwd()}/.env`, "utf8").split("\n").map((l) => l.match(/^(\w+)="?([^"]*)"?$/)).filter(Boolean).map((m) => [m![1], m![2]]),
) as Record<string, string>;
const URL_ = env["VITE_SUPABASE_URL"]!;
const KEY = env["VITE_SUPABASE_PUBLISHABLE_KEY"]!;
const h = { apikey: KEY, "Content-Type": "application/json", Prefer: "return=representation" };
const TRUCK = "floyds-burgers";

describe("access rules (signed-out visitor)", () => {
  it("can read truck photos", async () => {
    const r = await fetch(`${URL_}/rest/v1/truck_photos?select=id&truck_id=eq.${TRUCK}`, { headers: h });
    expect(r.status).toBe(200);
  });
  it("cannot add a truck photo row", async () => {
    const r = await fetch(`${URL_}/rest/v1/truck_photos`, { method: "POST", headers: h, body: JSON.stringify({ truck_id: TRUCK, path: `${TRUCK}/rls-test.webp` }) });
    expect(r.ok).toBe(false);
  });
  it("cannot upload a file into the photo bucket", async () => {
    const r = await fetch(`${URL_}/storage/v1/object/truck-photos/${TRUCK}/rls-test.txt`, { method: "POST", headers: { apikey: KEY, "Content-Type": "text/plain" }, body: "x" });
    expect(r.ok).toBe(false);
  });
  it("cannot publish a menu on someone's truck", async () => {
    const r = await fetch(`${URL_}/rest/v1/trucks?id=eq.${TRUCK}`, { method: "PATCH", headers: h, body: JSON.stringify({ menu_search: "hacked" }) });
    const rows = r.ok ? ((await r.json()) as unknown[]) : [];
    expect(rows).toHaveLength(0);
  });
  it("cannot create or edit a business profile", async () => {
    const r = await fetch(`${URL_}/rest/v1/businesses`, { method: "POST", headers: h, body: JSON.stringify({ owner_id: "00000000-0000-0000-0000-000000000000", name: "x" }) });
    expect(r.ok).toBe(false);
  });
});
