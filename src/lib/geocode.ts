import { lookupAddress } from './geocode.functions';

/** Browser-compatible wrapper; credentials and provider calls stay on the server. */
export async function geocode(address: string): Promise<{ lat: number; lng: number; label: string; city: string } | null> {
  if (!address.trim()) return null;
  const response = await lookupAddress({ data: { address } });
  if (response.error) throw Error(response.error);
  return response.result;
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
