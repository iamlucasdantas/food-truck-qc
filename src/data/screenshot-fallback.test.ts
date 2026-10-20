import { expect, it } from "vitest";
import { screenshotFallback } from "./screenshot-fallback";

const location = { name: "Lindquist Ford", address: "3950 Middle Rd, Bettendorf, IA", city: "Bettendorf", lat: 41.55, lng: -90.49, source: "Apify" };
it("uses Plan A Apify before Plan B Google Maps and Plan C context.dev", async () => {
  const calls: string[] = [];
  const result = await screenshotFallback(["Apify", "Google Maps", "context.dev"].map(name => ({ name, lookup: async () => { calls.push(name); return { location }; } })));
  expect(calls).toEqual(["Apify"]);
  expect(result.location).toEqual(location);
});
it("falls through Apify errors and empty Maps results to context.dev", async () => {
  const calls: string[] = [];
  const result = await screenshotFallback([
    { name: "Apify", lookup: async () => { calls.push("Apify"); throw new Error("502"); } },
    { name: "Google Maps", lookup: async () => { calls.push("Google Maps"); return {}; } },
    { name: "context.dev", lookup: async () => { calls.push("context.dev"); return { address: location.address }; } },
  ]);
  expect(calls).toEqual(["Apify", "Google Maps", "context.dev"]);
  expect(result.address).toBe("3950 Middle Rd, Bettendorf, IA");
  expect(result.location).toBeUndefined();
});
it("stops at asynchronous Apify then allows Maps after terminal failure", async () => {
  let mapsCalls = 0;
  const maps = { name: "Google Maps", lookup: async () => { mapsCalls++; return { location }; } };
  expect(await screenshotFallback([{ name: "Apify", lookup: async () => ({ runId: "run123" }) }, maps])).toEqual({ runId: "run123" });
  expect(mapsCalls).toBe(0);
  expect((await screenshotFallback([{ name: "Apify", lookup: async () => ({ issue: "TIMED-OUT" }) }, maps])).location).toEqual(location);
  expect(mapsCalls).toBe(1);
});
it("retains a review draft when all three plans fail", async () => {
  const result = await screenshotFallback(["Apify", "Google Maps", "context.dev"].map(name => ({ name, lookup: async () => { throw new Error("unavailable"); } })));
  expect(result.location).toBeUndefined();
  expect(result.issue).toContain("Apify: unavailable");
  expect(result.issue).toContain("Google Maps: unavailable");
  expect(result.issue).toContain("context.dev: unavailable");
});