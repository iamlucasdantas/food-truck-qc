/** Free-text address → coordinates via OpenStreetMap Nominatim (keep to ~1 request/second). */
export async function geocode(address: string): Promise<{ lat: number; lng: number; label: string; city: string } | null> {
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&addressdetails=1&countrycodes=us&q=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) return null;
  const [hit] = (await res.json()) as { lat: string; lon: string; display_name: string; address?: Record<string, string> }[];
  if (!hit) return null;
  const a = hit.address ?? {};
  return { lat: Number(hit.lat), lng: Number(hit.lon), label: hit.display_name, city: a["city"] ?? a["town"] ?? a["village"] ?? "" };
}

/** Resize an image file to a small data URL (truck logos). */
export function fileToLogo(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
