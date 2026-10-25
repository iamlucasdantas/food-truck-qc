import { lookupAddress } from './geocode.functions';

/** Optional form lookup: unresolved addresses return null; strict diagnostics stay server-side. */
export async function geocode(address: string): Promise<{ lat: number; lng: number; label: string; city: string } | null> {
  const trimmed = address.trim();
  if (trimmed.length < 3 || trimmed.length > 500) return null;
  try {
    const response = await lookupAddress({ data: { address: trimmed } });
    return response.error ? null : response.result;
  } catch {
    // Validation, RPC and network failures must reach callers' existing null handling.
    return null;
  }
}

/** Resize an image file to a small data URL (truck logos). */
export function fileToLogo(file: File, size = 256): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, size / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
      const context = c.getContext("2d");
      if (!context) { URL.revokeObjectURL(img.src); reject(Error("Image resizing unavailable")); return; }
      context.drawImage(img, 0, 0, c.width, c.height);
      URL.revokeObjectURL(img.src);
      resolve(c.toDataURL("image/webp", 0.85));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}
