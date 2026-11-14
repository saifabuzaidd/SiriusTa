"use client";

import { useEffect, useRef } from "react";

// Leaflet is loaded from CDN at runtime (no npm dep) to keep the bundle lean.
// This component is meant to be dynamically imported with ssr:false.

declare global {
  interface Window {
    L?: typeof import("leaflet");
  }
}

let leafletPromise: Promise<void> | null = null;

function loadLeaflet(): Promise<void> {
  if (window.L) return Promise.resolve();
  if (leafletPromise) return leafletPromise;
  leafletPromise = new Promise<void>((resolve, reject) => {
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.css";
    css.crossOrigin = "";
    document.head.appendChild(css);

    const script = document.createElement("script");
    script.src = "https://unpkg.com/leaflet@1.9.4/dist/leaflet.js";
    script.crossOrigin = "";
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("Leaflet failed to load"));
    document.head.appendChild(script);
  });
  return leafletPromise;
}

interface MapPoint {
  lat: number;
  lon: number;
  label: string;
  color: string;
  kind: "target" | "twin";
}

export function FieldMap({
  target,
  twin,
  distKm,
}: {
  target: { lat: number; lon: number; label: string };
  twin: { lat: number; lon: number; label: string };
  distKm?: number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<unknown>(null);

  useEffect(() => {
    let cancelled = false;
    loadLeaflet()
      .then(() => {
        if (cancelled || !containerRef.current || !window.L) return;
        const L = window.L;
        if (mapRef.current) {
          (mapRef.current as { remove: () => void }).remove();
          mapRef.current = null;
        }
        const map = L.map(containerRef.current, { scrollWheelZoom: false, attributionControl: true }).setView(
          [(target.lat + twin.lat) / 2, (target.lon + twin.lon) / 2],
          5,
        );
        mapRef.current = map;

        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: '&copy; OpenStreetMap contributors',
          maxZoom: 19,
        }).addTo(map);

        const targetIcon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#ea580c;border:3px solid #fff;box-shadow:0 0 0 2px #ea580c,0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });
        const twinIcon = L.divIcon({
          className: "",
          html: `<div style="display:flex;align-items:center;justify-content:center;width:18px;height:18px;border-radius:50%;background:#16a34a;border:3px solid #fff;box-shadow:0 0 0 2px #16a34a,0 1px 4px rgba(0,0,0,.4)"></div>`,
          iconSize: [18, 18],
          iconAnchor: [9, 9],
        });

        L.marker([target.lat, target.lon], { icon: targetIcon }).addTo(map).bindTooltip(`Target: ${target.label}`, { permanent: false });
        L.marker([twin.lat, twin.lon], { icon: twinIcon }).addTo(map).bindTooltip(`Twin: ${twin.label}`, { permanent: false });

        L.polyline(
          [
            [target.lat, target.lon],
            [twin.lat, twin.lon],
          ],
          { color: "#475569", weight: 3, dashArray: "8 6", opacity: 0.9 },
        ).addTo(map);

        const bounds = L.latLngBounds([
          [target.lat, target.lon],
          [twin.lat, twin.lon],
        ]);
        map.fitBounds(bounds, { padding: [40, 40] });

        // ensure correct sizing after mount
        setTimeout(() => map.invalidateSize(), 200);
      })
      .catch(() => {
        if (containerRef.current) {
          containerRef.current.innerHTML =
            '<div class="flex h-full items-center justify-center text-xs text-muted-foreground p-4 text-center">Map unavailable (offline)</div>';
        }
      });

    return () => {
      cancelled = true;
      if (mapRef.current && typeof (mapRef.current as { remove: () => void }).remove === "function") {
        (mapRef.current as { remove: () => void }).remove();
        mapRef.current = null;
      }
    };
  }, [target.lat, target.lon, target.label, twin.lat, twin.lon, twin.label]);

  return (
    <div className="relative h-full w-full overflow-hidden rounded-lg">
      <div ref={containerRef} className="h-full w-full" style={{ minHeight: 220 }} />
      {distKm !== undefined ? (
        <div className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-white/90 px-2 py-1 text-[10px] font-semibold text-foreground shadow-sm backdrop-blur">
          Target ↔ Twin: {distKm} km
        </div>
      ) : null}
    </div>
  );
}
