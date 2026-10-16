import { useRef, useState } from "react";
import Cropper, { type Area } from "react-easy-crop";
import { Camera, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function AvatarEditor({ value, initials, onChange }: { value: string | null; initials: string; onChange: (url: string | null) => void }) {
  const input = useRef<HTMLInputElement>(null);
  const [src, setSrc] = useState<string | null>(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  async function apply() {
    if (!src || !area) return;
    const img = new Image(); img.src = src;
    await img.decode();
    const c = document.createElement("canvas"); c.width = 256; c.height = 256;
    const ctx = c.getContext("2d"); if (!ctx) return;
    ctx.drawImage(img, area.x, area.y, area.width, area.height, 0, 0, 256, 256);
    onChange(c.toDataURL("image/jpeg", .82)); setSrc(null);
  }
  return <><div className="relative size-24 shrink-0"><div className="grid size-24 place-items-center overflow-hidden rounded-full border-4 border-background bg-accent text-2xl font-semibold">{value ? <img src={value} className="size-full object-cover" alt="Your avatar"/> : initials}</div><Button variant="secondary" size="icon" className="absolute -bottom-1 -right-1 size-10 rounded-full border border-border" title="Change avatar" aria-label="Change avatar" onClick={() => input.current?.click()}><Camera/></Button><input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (!f) return; if(f.size > 5*1024*1024) return void toast.error("Choose a photo under 5 MB."); const reader = new FileReader(); reader.onload = () => {setCrop({x:0,y:0});setZoom(1);setSrc(String(reader.result));};reader.readAsDataURL(f);e.target.value=""; }}/></div><Dialog open={!!src} onOpenChange={v => { if(!v)setSrc(null); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Make it yours</DialogTitle></DialogHeader><div className="relative h-72 overflow-hidden rounded-lg bg-muted">{src && <Cropper image={src} crop={crop} zoom={zoom} aspect={1} cropShape="round" onCropChange={setCrop} onZoomChange={setZoom} onCropComplete={(_, pixels) => setArea(pixels)}/>}</div><label className="space-y-2 text-sm">Zoom<input aria-label="Avatar zoom" type="range" min="1" max="3" step="0.05" value={zoom} onChange={e=>setZoom(Number(e.target.value))} className="w-full accent-primary"/></label><div className="flex justify-between gap-2"><Button variant="ghost" onClick={()=>{onChange(null);setSrc(null);}}><Trash2/>Remove</Button><Button onClick={()=>void apply()}>Use photo</Button></div></DialogContent></Dialog></>;
}