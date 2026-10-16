import { useEffect, useRef } from "react";
import { MarkerClusterer } from "@googlemaps/markerclusterer";
import type { Status } from "@/data/trucks";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global { interface Window { google: any; __ftqcInit?: () => void } }

export interface MapPin { id: string; lat: number; lng: number; status: Status; emoji: string; name: string }

let loader: Promise<void> | null = null;
function loadMaps() {
  if (window.google?.maps?.Map) return Promise.resolve();
  if (loader) return loader;
  loader = new Promise((resolve, reject) => {
    window.__ftqcInit = () => resolve();
    const env = import.meta.env as Record<string, string>;
    const s = document.createElement("script");
    s.src = `https://maps.googleapis.com/maps/api/js?key=${env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_BROWSER_KEY"]}&loading=async&callback=__ftqcInit&channel=${env["VITE_LOVABLE_CONNECTOR_GOOGLE_MAPS_TRACKING_ID"]}`;
    s.async = true;
    s.onerror = reject;
    document.head.appendChild(s);
  });
  return loader;
}

function cssVar(name: string) {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

function pinIcon(status: Status, emoji: string) {
  const fill = cssVar(status === "open" ? "--pin-open" : status === "today" ? "--pin-today" : "--pin-none");
  const ink = cssVar("--foreground");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="44" height="52" viewBox="0 0 44 52"><path d="M22 50 C22 50 4 30 4 19 A18 18 0 0 1 40 19 C40 30 22 50 22 50Z" fill="${fill}" stroke="${ink}" stroke-width="2.5"/><text x="22" y="26" font-size="18" text-anchor="middle">${emoji}</text></svg>`;
  return { url: "data:image/svg+xml;charset=UTF-8," + encodeURIComponent(svg), scaledSize: new window.google.maps.Size(44, 52) };
}

interface Props {
  pins: MapPin[];
  center: { lat: number; lng: number };
  radiusMi: number;
  onSelect: (id: string) => void;
  onCenterChange: (c: { lat: number; lng: number }) => void;
}

export default function TruckMap({ pins, center, radiusMi, onSelect, onCenterChange }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<any>({});
  const cbs = useRef({ onSelect, onCenterChange });
  cbs.current = { onSelect, onCenterChange };

  useEffect(() => {
    let dead = false;
    loadMaps().then(() => {
      if (dead || !el.current) return;
      const g = window.google.maps;
      const map = new g.Map(el.current, {
        center, zoom: 12, clickableIcons: false, disableDefaultUI: true, zoomControl: true,
        styles: [{ featureType: "poi", stylers: [{ visibility: "off" }] }],
      });
      const ring = new g.Circle({
        map, center, radius: radiusMi * 1609.34, strokeColor: cssVar("--primary"), strokeWeight: 2,
        fillColor: cssVar("--primary"), fillOpacity: 0.06, clickable: false,
      });
      const ref = new g.Marker({ map, position: center, draggable: true, title: "Search from here", zIndex: 999 });
      ref.addListener("dragend", () => {
        const p = ref.getPosition();
        cbs.current.onCenterChange({ lat: p.lat(), lng: p.lng() });
      });
      const clusterer = new MarkerClusterer({ map, markers: [] });
      st.current = { map, ring, ref, clusterer, markers: [] };
      setTimeout(() => window.dispatchEvent(new Event("ftqc-map-ready")), 0);
    });
    return () => { dead = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const sync = () => {
      const { map, clusterer } = st.current;
      if (!map) return;
      const g = window.google.maps;
      clusterer.clearMarkers();
      const markers = pins.map((p) => {
        const m = new g.Marker({ position: p, icon: pinIcon(p.status, p.emoji), title: p.name });
        m.addListener("click", () => cbs.current.onSelect(p.id));
        return m;
      });
      clusterer.addMarkers(markers);
    };
    sync();
    window.addEventListener("ftqc-map-ready", sync);
    return () => window.removeEventListener("ftqc-map-ready", sync);
  }, [pins]);

  useEffect(() => {
    const sync = () => {
      const { map, ring, ref } = st.current;
      if (!map) return;
      ring.setCenter(center); ring.setRadius(radiusMi * 1609.34);
      ref.setPosition(center); map.panTo(center);
    };
    sync();
    window.addEventListener("ftqc-map-ready", sync);
    return () => window.removeEventListener("ftqc-map-ready", sync);
  }, [center, radiusMi]);

  return <div ref={el} className="h-full w-full bg-muted" />;
}
