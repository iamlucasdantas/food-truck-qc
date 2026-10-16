import { useEffect, useRef } from "react";
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
}

const PIN_VAR: Record<Status, string> = { open: "var(--pin-open)", today: "var(--pin-today)", none: "var(--pin-none)" };

/** Leaflet + OpenStreetMap tiles — no API key. Loaded only in the browser. */
export default function TruckMap({ pins, center, radiusMi, onSelect, onCenterChange, showRadius = true, draggable = true, zoom = 12, onFail }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});
  const cbs = useRef({ onSelect, onCenterChange, onFail });
  cbs.current = { onSelect, onCenterChange, onFail };
  const latest = useRef({ pins, center, radiusMi });
  latest.current = { pins, center, radiusMi };

  const syncPins = () => {
    const { L, cluster } = st.current;
    if (!cluster) return;
    cluster.clearLayers();
    cluster.addLayers(latest.current.pins.map((p) => {
      const icon = L.divIcon({
        className: "",
        iconSize: [40, 48], iconAnchor: [20, 46],
        html: `<div style="width:40px;height:48px;position:relative"><svg width="40" height="48" viewBox="0 0 44 52" style="position:absolute;inset:0"><path d="M22 50 C22 50 4 30 4 19 A18 18 0 0 1 40 19 C40 30 22 50 22 50Z" fill="${PIN_VAR[p.status]}" stroke="var(--foreground)" stroke-width="2.5"/></svg><span style="position:absolute;top:7px;left:0;right:0;text-align:center;font-size:17px">${p.emoji}</span></div>`,
      });
      const m = L.marker([p.lat, p.lng], { icon, title: p.name, zIndexOffset: p.status === "open" ? 200 : p.status === "today" ? 100 : 0 });
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
    map.panTo(c);
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
        const ring = showRadius ? L.circle(latest.current.center, { radius: latest.current.radiusMi * 1609.34, color: "var(--primary)", weight: 2, fillOpacity: 0.06, interactive: false }).addTo(map) : null;
        const ref = draggable ? L.marker(latest.current.center, {
          draggable: true, title: "Search from here", zIndexOffset: 1000,
          icon: L.divIcon({ className: "", iconSize: [28, 28], iconAnchor: [14, 14], html: `<div style="width:28px;height:28px;border-radius:9999px;background:var(--primary);border:3px solid var(--foreground);box-shadow:2px 2px 0 var(--foreground)"></div>` }),
        }).addTo(map) : null;
        ref?.on("dragend", () => { const p = ref.getLatLng(); cbs.current.onCenterChange({ lat: p.lat, lng: p.lng }); });
        const cluster = (L as any).markerClusterGroup({
          showCoverageOnHover: false, maxClusterRadius: 50,
          iconCreateFunction: (c: any) => L.divIcon({ className: "", iconSize: [40, 40], html: `<div style="width:40px;height:40px;border-radius:9999px;display:grid;place-items:center;background:var(--card);color:var(--foreground);border:2px solid var(--foreground);font-weight:800;box-shadow:2px 2px 0 var(--foreground)">${c.getChildCount()}</div>` }),
        }).addTo(map);
        st.current = { L, map, ring, ref, cluster };
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

  useEffect(syncPins, [pins]);
  useEffect(syncCenter, [center, radiusMi]);

  return <div ref={el} className="h-full w-full bg-muted" />;
}
