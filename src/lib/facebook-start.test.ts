import { afterEach, expect, it, vi } from "vitest";
import { startFacebookRun } from "./facebook.server";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("persists successful Facebook runs when Instagram startup is rejected", async () => {
  vi.stubEnv("LOVABLE_API_KEY", "test-only");
  vi.stubEnv("APIFY_API_KEY", "test-only");
  const sources = [
    { id: "fb", name: "Coffee & Crumb", kind: "page", url: "https://www.facebook.com/coffeeandcrumbtruck" },
    { id: "ig", name: "Instagram", kind: "instagram", url: "https://www.instagram.com/validtruck/" },
    { id: "bad", name: "Bad link", kind: "instagram", url: "https://www.instagram.com/" },
  ];
  const calls: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (url: string) => {
    calls.push(url);
    return url.includes("instagram") ? new Response("invalid-input", { status: 400 }) : new Response(JSON.stringify({ data: { id: "facebook-run" } }));
  }));
  const writes: { table: string; row: Record<string, unknown> }[] = [];
  const db = { from: (table: string) => {
    const q: Record<string, any> = {};
    for (const method of ["select", "eq", "neq", "in"]) q[method] = () => q;
    q["update"] = (row: Record<string, unknown>) => { writes.push({ table, row }); return q; };
    q["insert"] = (row: Record<string, unknown>) => { writes.push({ table, row }); return q; };
    q["single"] = async () => ({ data: { id: "tracked-run" }, error: null });
    q["then"] = (resolve: (value: unknown) => unknown) => Promise.resolve({ data: sources, error: null }).then(resolve);
    return q;
  } };
  const result = await startFacebookRun(db as unknown as Parameters<typeof startFacebookRun>[0], sources.map(s => s.id));
  expect(result.id).toBe("tracked-run");
  expect(calls).toHaveLength(2);
  const tracked = writes.find(w => w.table === "ingestion_runs")?.row;
  expect(tracked?.["meta"]).toMatchObject({ runs: { page: "facebook-run" } });
  expect(tracked?.["cities_done"]).toEqual(["bad", "ig"]);
  expect(tracked?.["error"]).toContain("Apify instagram start failed [400]");
  expect(writes.some(w => w.row["last_reason"] === "Invalid instagram source URL — correct the link in Admin.")).toBe(true);
});