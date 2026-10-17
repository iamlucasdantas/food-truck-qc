import { afterEach, describe, expect, it, vi } from "vitest";
import { CALENDAR_FETCH_LIMITS, PAGE_FETCH_LIMITS, isPublicAddress, readPublicLink, validateLinkUrl, validateProviderLink } from "./safe-link-fetch.server";

const page = "https://www.facebook.com/";
const calendar = "https://calendar.google.com/";
function mockNetwork(target: (url: URL, init?: RequestInit) => Response | Promise<Response>, records: Record<string, string[]> = {}) {
  const fetcher = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input));
    if (url.hostname === "cloudflare-dns.com") {
      const addresses = records[url.searchParams.get("name") ?? ""] ?? ["93.184.216.34"];
      const type = url.searchParams.get("type") === "A" ? 1 : 28;
      return Response.json({ Status: 0, Answer: addresses.filter((a) => a.includes(":") === (type === 28)).map((data) => ({ type, data })) });
    }
    return target(url, init);
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
}

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });

describe("public link reader security", () => {
  it.each(["https://calendar.google.com/calendar/ical/feed/basic.ics", "https://p123-caldav.icloud.com/published/2/feed", "https://outlook.live.com/owa/calendar/feed/calendar.ics"])("accepts trusted calendar provider %s", (url) => {
    expect(validateProviderLink(url, "calendar").protocol).toBe("https:");
  });
  it.each(["https://facebook.com/truck", "https://www.instagram.com/truck/"])("accepts social provider %s", (url) => {
    expect(validateProviderLink(url, "social").protocol).toBe("https:");
  });
  it.each(["https://facebook.com.attacker.net/", "https://attacker.facebook.com/", "https://93.184.216.34/", "http://facebook.com/", "https://business.example.com/"])("rejects untrusted social destination %s before DNS", async (url) => {
    const fetcher = mockNetwork(() => new Response("no"));
    await expect(readPublicLink(url, PAGE_FETCH_LIMITS, {})).rejects.toThrow();
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("rejects custom calendar hosts", () => {
    expect(() => validateProviderLink("https://custom.example.com/feed.ics", "calendar")).toThrow();
    expect(() => validateProviderLink("https://p12-caldav.icloud.com.attacker.net/feed", "calendar")).toThrow();
  });
  it.each([CALENDAR_FETCH_LIMITS, PAGE_FETCH_LIMITS])("blocks provider redirects to arbitrary public hosts before lookup %j", async (limits) => {
    const target = vi.fn(() => new Response(null, { status: 302, headers: { location: "https://attacker.net/" } }));
    const fetcher = mockNetwork(target);
    await expect(readPublicLink(limits.provider === "calendar" ? calendar : page, limits, {})).rejects.toThrow();
    expect(target).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.some(([url]) => String(url).includes("attacker.net"))).toBe(false);
  });
  it.each(["127.0.0.1", "10.1.2.3", "172.16.0.1", "192.168.1.1", "169.254.169.254", "100.64.0.1", "0.0.0.0", "224.0.0.1", "192.0.2.1", "198.18.0.1", "::1", "fc00::1", "fe80::1", "ff02::1", "::ffff:127.0.0.1", "64:ff9b::a00:1", "2002:7f00:1::", "2001:db8::1"])("rejects nonpublic address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(false);
  });
  it.each(["93.184.216.34", "2606:4700:4700::1111"])("accepts public address %s", (ip) => {
    expect(isPublicAddress(ip)).toBe(true);
  });
  it.each(["https://2130706433/", "https://0x7f000001/", "https://[::ffff:7f00:1]/", "https://localhost/", "https://service.internal/", "https://user:pass@business.example.com/", "https://business.example.com:8443/", "file:///etc/passwd"])("blocks unsafe URL %s", (url) => {
    expect(() => validateLinkUrl(url, false)).toThrow();
  });
  it("preserves public HTTP website support but forbids calendar HTTPS downgrades", () => {
    expect(validateLinkUrl("http://business.example.com/", false).protocol).toBe("http:");
    expect(() => validateLinkUrl("http://business.example.com/", true)).toThrow();
  });
  it.each([{ addresses: ["10.0.0.1"] }, { addresses: ["93.184.216.34", "fc00::1"] }, { addresses: [] }])("rejects DNS results $addresses before contacting target", async ({ addresses }) => {
    const target = vi.fn(() => new Response("private"));
    mockNetwork(target, { "www.facebook.com": addresses });
    await expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow();
    expect(target).not.toHaveBeenCalled();
  });
  it("fails closed on DNS errors and checks both address families", async () => {
    const fetcher = vi.fn(async () => Response.json({ Status: 2 }));
    vi.stubGlobal("fetch", fetcher);
    await expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow();
    expect(fetcher.mock.calls).toHaveLength(2);
  });
  it("checks the DNS destination of every redirect before contacting it", async () => {
    const target = vi.fn(() => new Response(null, { status: 302, headers: { location: "https://m.facebook.com/" } }));
    const fetcher = mockNetwork(target, { "m.facebook.com": ["169.254.169.254"] });
    await expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow();
    expect(target).toHaveBeenCalledTimes(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("name=m.facebook.com"))).toHaveLength(2);
  });
  it.each(["https://127.0.0.1/", "https://[::1]/", "http://business.example.com/"])("rejects unsafe calendar redirect %s", async (location) => {
    const target = vi.fn(() => new Response(null, { status: 302, headers: { location } }));
    mockNetwork(target);
    await expect(readPublicLink(calendar, CALENDAR_FETCH_LIMITS, {})).rejects.toThrow();
    expect(target).toHaveBeenCalledTimes(1);
  });
  it("accepts safe relative redirects, uses manual redirects, preserves headers and content", async () => {
    const target = vi.fn((url: URL, init?: RequestInit) => {
      expect(init?.redirect).toBe("manual");
      expect(init?.headers).toEqual({ Accept: "text/calendar" });
      return url.pathname === "/" ? new Response(null, { status: 302, headers: { location: "/feed.ics" } }) : new Response("BEGIN:VCALENDAR\nEND:VCALENDAR");
    });
    const fetcher = mockNetwork(target);
    expect(await readPublicLink(calendar, CALENDAR_FETCH_LIMITS, { Accept: "text/calendar" })).toEqual({ ok: true, status: 200, text: "BEGIN:VCALENDAR\nEND:VCALENDAR" });
    expect(fetcher.mock.calls.filter(([url]) => String(url).includes("cloudflare-dns.com"))).toHaveLength(4);
  });
  it("allows five redirects, never requests a sixth redirect destination", async () => {
    const target = vi.fn(() => new Response(null, { status: 302, headers: { location: "/again" } }));
    mockNetwork(target);
    await expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow("redirects too many");
    expect(target).toHaveBeenCalledTimes(6);
  });
  it("rejects redirects without Location", async () => {
    mockNetwork(() => new Response(null, { status: 302 }));
    await expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow("invalid redirect");
  });
  it("retains non-success status for existing caller fallbacks", async () => {
    mockNetwork(() => new Response("no", { status: 403 }));
    expect(await readPublicLink(page, PAGE_FETCH_LIMITS, {})).toEqual({ ok: false, status: 403, text: "" });
  });
  it.each([PAGE_FETCH_LIMITS, CALENDAR_FETCH_LIMITS])("rejects declared downloads larger than the limit %j", async (limits) => {
    const cancel = vi.fn();
    mockNetwork(() => new Response(new ReadableStream({ cancel }), { headers: { "content-length": String(limits.maxBytes + 1) } }));
    await expect(readPublicLink(limits.provider === "calendar" ? calendar : page, limits, {})).rejects.toThrow("too large");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("enforces byte limits while streaming, even with false Content-Length", async () => {
    const cancel = vi.fn();
    mockNetwork(() => new Response(new ReadableStream({ start(c) { c.enqueue(new Uint8Array(200_000)); c.enqueue(new Uint8Array(100_001)); }, cancel }), { headers: { "content-length": "1" } }));
    await expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow("too large");
    expect(cancel).toHaveBeenCalledTimes(1);
  });
  it("accepts exactly the page byte limit", async () => {
    mockNetwork(() => new Response("a".repeat(300_000)));
    expect((await readPublicLink(page, PAGE_FETCH_LIMITS, {})).text.length).toBe(300_000);
  });
  it("times out a stalled DNS lookup at the whole-request deadline", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const result = expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(8_000);
    await result;
  });
  it("times out stalled body downloads and cancels the stream", async () => {
    vi.useFakeTimers();
    const cancel = vi.fn();
    mockNetwork(() => new Response(new ReadableStream({ cancel })));
    const result = expect(readPublicLink(page, PAGE_FETCH_LIMITS, {})).rejects.toThrow("too long");
    await vi.advanceTimersByTimeAsync(8_000);
    await result;
    expect(cancel).toHaveBeenCalledTimes(1);
  });
});
