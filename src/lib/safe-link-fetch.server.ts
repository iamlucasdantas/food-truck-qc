import ipaddr from "ipaddr.js";

type Limits = { maxBytes: number; timeoutMs: number; maxRedirects: number; httpsOnly: boolean; provider: "calendar" | "social" };
export const CALENDAR_FETCH_LIMITS: Limits = { maxBytes: 3_000_000, timeoutMs: 8_000, maxRedirects: 5, httpsOnly: true, provider: "calendar" };
export const PAGE_FETCH_LIMITS: Limits = { maxBytes: 300_000, timeoutMs: 8_000, maxRedirects: 5, httpsOnly: true, provider: "social" };
const redirects = new Set([301, 302, 303, 307, 308]);

export function isPublicAddress(address: string): boolean {
  try { return ipaddr.parse(address).range() === "unicast"; } catch { return false; }
}

export function validateLinkUrl(raw: string, httpsOnly: boolean): URL {
  const url = new URL(raw);
  const host = url.hostname.toLowerCase().replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if ((url.protocol !== "https:" && (httpsOnly || url.protocol !== "http:")) || url.username || url.password
    || (url.port && url.port !== (url.protocol === "https:" ? "443" : "80"))) throw new Error("That link isn't allowed");
  if (!host.includes(".") && !host.includes(":")) throw new Error("That link isn't allowed");
  if (/(^|\.)(localhost|local|internal|lan|home|test|invalid|example|onion)$/.test(host)) throw new Error("That link isn't allowed");
  if (ipaddr.isValid(host) && !isPublicAddress(host)) throw new Error("That link isn't allowed");
  url.hash = "";
  return url;
}

/** Only provider-owned hosts, never arbitrary subdomains or IP literals. */
export function validateProviderLink(raw: string, provider: Limits["provider"]): URL {
  const url = validateLinkUrl(raw, true);
  const host = url.hostname.toLowerCase();
  const allowed = provider === "social"
    ? ["facebook.com", "www.facebook.com", "m.facebook.com", "instagram.com", "www.instagram.com"].includes(host)
    : ["calendar.google.com", "outlook.live.com", "outlook.office.com", "outlook.office365.com", "caldav.icloud.com"].includes(host)
      || /^p\d{2,3}-caldav\.icloud\.com$/.test(host);
  if (!allowed) throw new Error(provider === "calendar"
    ? "Use a Google, Apple iCloud or Outlook calendar link. Custom calendar links aren't supported."
    : "Only Facebook and Instagram links can prefill business details. Enter website details manually.");
  return url;
}

async function boundedText(response: Response, maxBytes: number, signal: AbortSignal): Promise<string> {
  if (Number(response.headers.get("content-length")) > maxBytes) {
    await response.body?.cancel();
    throw new Error("That download is too large");
  }
  const reader = response.body?.getReader();
  if (!reader) return "";
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0, text = "";
  try {
    for (;;) {
      signal.throwIfAborted();
      const chunk = await reader.read();
      signal.throwIfAborted();
      if (chunk.done) return text + decoder.decode();
      bytes += chunk.value.byteLength;
      if (bytes > maxBytes) throw new Error("That download is too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
  } finally {
    signal.removeEventListener("abort", cancel);
    await reader.cancel().catch(() => {});
    reader.releaseLock();
  }
}

/** Fixed HTTPS resolver, both families: reject empty, failed or mixed public/private answers. */
async function validateDestination(url: URL, signal: AbortSignal): Promise<void> {
  const host = url.hostname.replace(/\.$/, "").replace(/^\[|\]$/g, "");
  if (ipaddr.isValid(host)) {
    if (!isPublicAddress(host)) throw new Error("That link isn't allowed");
    return;
  }
  const answers = await Promise.all(["A", "AAAA"].map(async (type) => {
    const resolver = new URL("https://cloudflare-dns.com/dns-query");
    resolver.searchParams.set("name", host);
    resolver.searchParams.set("type", type);
    const response = await fetch(resolver, { headers: { Accept: "application/dns-json" }, redirect: "error", signal });
    if (!response.ok) throw new Error("Couldn't verify that link's destination");
    const result = JSON.parse(await boundedText(response, 64_000, signal)) as { Status?: number; Answer?: { type: number; data: string }[] };
    if (result.Status !== 0) throw new Error("Couldn't verify that link's destination");
    return (result.Answer ?? []).filter((answer) => answer.type === 1 || answer.type === 28).map((answer) => answer.data);
  }));
  const addresses = answers.flat();
  if (!addresses.length || addresses.some((address) => !isPublicAddress(address))) throw new Error("That link isn't allowed");
}

/**
 * Mandatory trusted-provider allowlist and DNS checks at entry and every redirect.
 * This removes attacker-controlled DNS destinations; it is not arbitrary-domain IP pinning.
 */
export async function readPublicLink(raw: string, limits: Limits, headers: Record<string, string>) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      controller.abort(new Error("That link took too long to respond"));
      reject(new Error("That link took too long to respond"));
    }, limits.timeoutMs);
  });
  const run = async () => {
    let url = validateProviderLink(raw, limits.provider);
    for (let hops = 0; ; hops++) {
      controller.signal.throwIfAborted();
      await validateDestination(url, controller.signal);
      controller.signal.throwIfAborted();
      const response = await fetch(url, { headers, redirect: "manual", signal: controller.signal });
      if (redirects.has(response.status)) {
        await response.body?.cancel();
        if (hops >= limits.maxRedirects) throw new Error("That link redirects too many times");
        const location = response.headers.get("location");
        if (!location) throw new Error("That link returned an invalid redirect");
        url = validateProviderLink(new URL(location, url).toString(), limits.provider);
        continue;
      }
      if (!response.ok) {
        await response.body?.cancel();
        return { ok: false, status: response.status, text: "" };
      }
      return { ok: true, status: response.status, text: await boundedText(response, limits.maxBytes, controller.signal) };
    }
  };
  try { return await Promise.race([run(), timeout]); }
  finally { if (timer !== undefined) clearTimeout(timer); controller.abort(); }
}
