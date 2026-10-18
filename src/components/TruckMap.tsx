import { useEffect, useRef, useState } from "react";
import { LocateFixed, Search } from "lucide-react";
import "leaflet/dist/leaflet.css";
import "leaflet.markercluster/dist/MarkerCluster.css";
import type { Status } from "@/data/trucks";

/* eslint-disable @typescript-eslint/no-explicit-any */
export interface MapPin { id: string; lat: number; lng: number; status: Status; emoji: string; name: string }

interface Props {
  pins: MapPin[];
  center: { lat: number; lng: number };
  radiusMi: number;
  onSelect: (id: string) => void;
  onCenterChange: (c: { lat: number; lng: number }) => void;
  showRadius?: boolean;
  draggable?: boolean;
  zoom?: number;
  onFail?: () => void;
  highlightId?: string | null;
  pillClass?: string;
  locateClass?: string;
}

const PIN_VAR: Record<Status, string> = { open: "var(--pin-open)", today: "var(--pin-today)", none: "var(--pin-none)" };

/** Leaflet + OpenStreetMap tiles — no API key. Loaded only in the browser. */
export default function TruckMap({ pins, center, radiusMi, onSelect, onCenterChange, showRadius = true, draggable = true, zoom = 12, onFail, highlightId = null, pillClass = "top-3", locateClass = "bottom-6 right-3" }: Props) {
  const [moved, setMoved] = useState(false);
  const [ready, setReady] = useState(false);
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});
  const cbs = useRef({ onSelect, onCenterChange, onFail });
  cbs.current = { onSelect, onCenterChange, onFail };
  const latest = useRef({ pins, center, radiusMi, highlightId });
  latest.current = { pins, center, radiusMi, highlightId };

  const syncPins = () => {
    const { L, cluster } = st.current;
    if (!cluster) return;
    cluster.clearLayers();
    cluster.addLayers(latest.current.pins.map((p) => {
      const hi = p.id === latest.current.highlightId;
      const w = hi ? 52 : 40, h = hi ? 62 : 48;
      const icon = L.divIcon({
        className: "",
        iconSize: [w, h], iconAnchor: [w / 2, h - 2],
        html: `<div style="width:${w}px;height:${h}px;position:relative;filter:drop-shadow(0 2px 4px rgb(0 0 0 / .25));transition:all .15s"><svg width="${w}" height="${h}" viewBox="0 0 44 52" style="position:absolute;inset:0"><path d="M22 50 C22 50 4 30 4 19 A18 18 0 0 1 40 19 C40 30 22 50 22 50Z" style="fill:${PIN_VAR[p.status]};stroke:#fff;stroke-width:${hi ? 4 : 2.5}"/></svg><span style="position:absolute;top:${hi ? 9 : 7}px;left:0;right:0;text-align:center;font-size:${hi ? 22 : 17}px">${p.emoji}</span></div>`,
      });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name, zIndexOffset: hi ? 2000 : p.status === "open" ? 200 : p.status === "today" ? 100 : 0 });
      m.on("click", () => cbs.current.onSelect(p.id));
      return m;
    }));
  };
  const syncCenter = () => {
    const { map, ring, ref } = st.current;
    if (!map) return;
    const { center: c, radiusMi: r } = latest.current;
    ring?.setLatLng(c); ring?.setRadius(r * 1609.34);
    ref?.setLatLng(c);
    if (ring && r > 0) map.fitBounds(ring.getBounds(), { padding: [24,24], maxZoom: 13 });
    else map.panTo(c);
    setMoved(false);
  };

  useEffect(() => {
    let dead = false;
    let ro: ResizeObserver | null = null;
    (async () => {
      try {
        const L = (await import("leaflet")).default;
        (window as any).L = L;
        await import("leaflet.markercluster");
        if (dead || !el.current) return;
        const map = L.map(el.current, { zoomControl: true, attributionControl: true }).setView(latest.current.center, zoom);
        let tileErrors = 0, tileOk = false;
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          maxZoom: 19, subdomains: "abc", attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        }).on("tileload", () => { tileOk = true; }).on("tileerror", () => { if (!tileOk && ++tileErrors > 6) cbs.current.onFail?.(); }).addTo(map);
        const ring = showRadius ? L.circle(latest.current.center, { radius: latest.current.radiusMi * 1609.34, color: getComputedStyle(document.documentElement).getPropertyValue("--primary").trim() || "#e85d2a", weight: 1.5, fillOpacity: 0.05, interactive: false }).addTo(map) : null;
        if (ring && latest.current.radiusMi > 0) map.fitBounds(ring.getBounds(), { padding:[24,24], maxZoom:13 });
        const ref = draggable ? L.marker(latest.current.center, {
          draggable: true, title: "Search from here", zIndexOffset: 1000,
          icon: L.divIcon({ className: "", iconSize: [28, 44], iconAnchor: [14, 14], html: `<div style="position:relative;width:28px;height:28px"><div style="width:28px;height:28px;border-radius:9999px;background:var(--primary);border:4px solid #fff;box-shadow:0 2px 8px rgb(0 0 0 / .3)"></div><span style="position:absolute;top:30px;left:50%;transform:translateX(-50%);background:var(--primary);color:#fff;font:600 11px Inter,sans-serif;padding:1px 6px;border-radius:9999px">You</span></div>` }),
        }).addTo(map) : null;
        ref?.on("dragend", () => { const p = ref.getLatLng(); cbs.current.onCenterChange({ lat: p.lat, lng: p.lng }); });
        const cluster = (L as any).markerClusterGroup({
          showCoverageOnHover: false, maxClusterRadius: 50,
          iconCreateFunction: (c: any) => L.divIcon({ className: "", iconSize: [40, 40], html: `<div style="width:40px;height:40px;border-radius:9999px;display:grid;place-items:center;background:var(--primary);color:#fff;border:3px solid #fff;font-weight:700;box-shadow:0 2px 8px rgb(0 0 0 / .25)">${c.getChildCount()}</div>` }),
        }).addTo(map);
        map.on("dragend", () => setMoved(true));
        st.current = { L, map, ring, ref, cluster };
        setReady(true);
        syncPins();
        ro = new ResizeObserver(() => map.invalidateSize());
        ro.observe(el.current);
      } catch {
        cbs.current.onFail?.();
      }
    })();
    return () => { dead = true; ro?.disconnect(); st.current.map?.remove(); st.current = {}; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(syncPins, [pins, highlightId]);
  useEffect(syncCenter, [center, radiusMi]);

  const searchArea = () => { const c = st.current.map?.getCenter(); if (c) cbs.current.onCenterChange({ lat: c.lat, lng: c.lng }); setMoved(false); };
  const locate = () => navigator.geolocation?.getCurrentPosition(
    (p) => { const c = { lat: p.coords.latitude, lng: p.coords.longitude }; st.current.map?.setView(c, 13); cbs.current.onCenterChange(c); },
    () => {}, { timeout: 8000 },
  );

  return (
    <div className="relative h-full w-full">
      <div ref={el} className="h-full w-full bg-muted" />
      {ready && draggable && moved && (
        <button onClick={searchArea} className={`absolute left-1/2 ${pillClass} z-[500] inline-flex h-10 -translate-x-1/2 items-center gap-2 rounded-full bg-card px-4 text-sm font-semibold shadow-pop-sm transition-all duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
          <Search className="h-4 w-4" /> Search this area
        </button>
      )}
      {ready && draggable && (
        <button onClick={locate} aria-label="Locate me" className={`absolute ${locateClass} z-[500] grid h-12 w-12 place-items-center rounded-full bg-card text-primary shadow-pop-sm transition-all duration-150 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring`}>
          <LocateFixed className="h-5 w-5" />
        </button>
      )}
    </div>
  );
}
