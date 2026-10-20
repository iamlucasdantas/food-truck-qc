export function socialSourceUrl(raw: string, kind: string): string | null {
  let value = raw.trim();
  if (kind === "instagram" && /^@?[A-Za-z0-9._-]+$/.test(value)) value = `https://www.instagram.com/${value.replace(/^@/, "")}/`;
  value = value.replace(/^\/\//, "");
  try {
    const url = new URL(/^https?:\/\//i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) return null;
    const host = url.hostname.toLowerCase();
    if (kind === "instagram") {
      if (!/^(www\.)?instagram\.com$/.test(host) || !/^\/[A-Za-z0-9._-]+(\/.*)?$/.test(url.pathname)) return null;
      url.hostname = "www.instagram.com";
    } else if (kind === "page" || kind === "group") {
      if (!/^(www\.|m\.|web\.)?facebook\.com$/.test(host) || url.pathname === "/") return null;
    } else if (kind === "reddit" && !/^(www\.|old\.)?reddit\.com$/.test(host)) return null;
    url.protocol = "https:";
    url.hash = "";
    return url.toString();
  } catch { return null; }
}