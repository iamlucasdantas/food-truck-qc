/** Client-side photo prep: HEIC → JPEG, resize to maxDim, compress. Browser-only (call from event handlers). */
export const PHOTO_ACCEPT = "image/jpeg,image/png,image/webp,image/heic,image/heif,.heic,.heif";
export const MAX_INPUT_BYTES = 5 * 1024 * 1024;

const isHeic = (f: File) => /heic|heif/i.test(f.type) || /\.(heic|heif)$/i.test(f.name);

export function checkPhoto(f: File): string | null {
  if (!/^image\/(jpeg|png|webp|heic|heif)$/i.test(f.type) && !isHeic(f)) return `${f.name}: use JPG, PNG, WebP or HEIC.`;
  if (f.size > MAX_INPUT_BYTES) return `${f.name} is over 5 MB.`;
  return null;
}

async function toBitmapSource(f: File): Promise<Blob> {
  if (!isHeic(f)) return f;
  const { default: heic2any } = await import("heic2any");
  const out = await heic2any({ blob: f, toType: "image/jpeg", quality: 0.9 });
  return Array.isArray(out) ? out[0]! : out;
}

/** Returns a compressed Blob (WebP when supported, else JPEG). */
export async function prepareImage(f: File, maxDim = 1600, quality = 0.8, type: "image/webp" | "image/jpeg" = "image/webp"): Promise<Blob> {
  const src = await toBitmapSource(f);
  const bmp = await createImageBitmap(src);
  const scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  bmp.close();
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  if (blob && blob.type === type) return blob;
  return await new Promise<Blob>((r, j) => canvas.toBlob((b) => (b ? r(b) : j(new Error("Couldn't process photo"))), "image/jpeg", quality));
}

export const blobToDataUrl = (b: Blob) => new Promise<string>((r, j) => { const fr = new FileReader(); fr.onload = () => r(String(fr.result)); fr.onerror = j; fr.readAsDataURL(b); });
