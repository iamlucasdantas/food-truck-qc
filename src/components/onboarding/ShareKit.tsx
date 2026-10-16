import { useEffect, useRef, useState } from "react";
import { Check, Copy, Download, Share2 } from "lucide-react";
import { toast } from "sonner";

/** Share kit for the finish screen: copy link, QR code to print, social share links. */
export function ShareKit({ truckId, truckName }: { truckId: string; truckName: string }) {
  const url = `https://app.foodtruckqc.com/truck/${truckId}`;
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void import("qrcode").then((QR) => {
      if (!cancelled && canvasRef.current) void QR.toCanvas(canvasRef.current, url, { width: 160, margin: 1, color: { dark: "#271610", light: "#ffffff" } });
    }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [url]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — long-press the link instead.");
    }
  }

  function downloadQr() {
    const c = canvasRef.current;
    if (!c) return;
    const a = document.createElement("a");
    a.href = c.toDataURL("image/png");
    a.download = `${truckName.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "truck"}-qr.png`;
    a.click();
  }

  const text = encodeURIComponent(`Find ${truckName} on FoodTruckQC — the Quad Cities food truck map:`);
  const links = [
    { label: "Facebook", href: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
    { label: "Instagram", href: "https://www.instagram.com/", note: "Paste the link in your bio or story" },
    { label: "WhatsApp", href: `https://wa.me/?text=${text}%20${encodeURIComponent(url)}` },
  ];

  return (
    <div className="space-y-3">
      <h2 className="font-bold">Share your page</h2>
      <div className="flex items-center gap-2">
        <code className="min-w-0 flex-1 truncate rounded-xl border border-input bg-muted px-3 py-2 text-sm">{url}</code>
        <button type="button" onClick={copy} className="chip" aria-label="Copy your truck page link">
          {copied ? <Check className="h-4 w-4" aria-hidden /> : <Copy className="h-4 w-4" aria-hidden />}
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="flex items-start gap-4">
        <div className="shrink-0 rounded-xl border border-border bg-card p-2">
          <canvas ref={canvasRef} width={160} height={160} aria-label={`QR code linking to ${truckName}'s page`} />
        </div>
        <div className="space-y-2 text-sm">
          <p className="text-muted-foreground">Print this QR code and stick it on your truck or menu board — it opens your live page.</p>
          <button type="button" onClick={downloadQr} className="chip"><Download className="h-4 w-4" aria-hidden />Download QR sticker</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {links.map((l) => (
          <a key={l.label} href={l.href} target="_blank" rel="noopener" title={l.note} className="chip">
            <Share2 className="h-4 w-4" aria-hidden />{l.label}
          </a>
        ))}
      </div>
    </div>
  );
}
