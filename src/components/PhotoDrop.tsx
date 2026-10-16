import { ImagePlus } from "lucide-react";
import { useId, useState } from "react";
import { PHOTO_ACCEPT } from "@/lib/images";

/** Drag-and-drop / tap-to-pick area. On phones the picker offers the camera too. */
export function PhotoDrop({ label, hint, onFiles, disabled }: { label: string; hint: string; onFiles: (files: File[]) => void; disabled?: boolean }) {
  const id = useId();
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={id}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); if (!disabled) onFiles([...e.dataTransfer.files]); }}
      className={`flex min-h-28 cursor-pointer flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed p-4 text-center ${over ? "border-primary bg-accent" : "border-input bg-card"} ${disabled ? "pointer-events-none opacity-60" : ""}`}
    >
      <ImagePlus className="h-6 w-6" strokeWidth={2} aria-hidden="true" />
      <span className="font-semibold">{label}</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
      <input id={id} type="file" multiple accept={PHOTO_ACCEPT} className="sr-only" disabled={disabled}
        onChange={(e) => { onFiles([...(e.target.files ?? [])]); e.target.value = ""; }} />
    </label>
  );
}
