// SECTION 1B — Static terrain (NASA SRTM elevation + slope + erosion risk).
// Ports testz.py get_static_terrain. Uses OpenTopoData's SRTM 30m endpoint
// with a 5-point stencil (center + N/S/E/W at 0.001 deg) to compute slope.
// Returns null elevation on failure (matches Python graceful skip).

import type { TerrainInfo } from "./types";

export async function getStaticTerrain(lat: number, lon: number, timeoutMs = 12000): Promise<TerrainInfo> {
  const delta = 0.001;
  const locations = [
    `${lat},${lon}`,
    `${lat + delta},${lon}`,
    `${lat - delta},${lon}`,
    `${lat},${lon + delta}`,
    `${lat},${lon - delta}`,
  ].join("|");

  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(
      `https://api.opentopodata.org/v1/srtm30m?locations=${locations}`,
      { signal: controller.signal },
    );
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const results: { elevation: number | null }[] = json?.results ?? [];
    const elevs = results.map((r) => r.elevation);
    if (elevs.length < 5 || elevs.some((e) => e === null)) throw new Error("null elevation");

    const [zC, zN, zS, zE, zW] = elevs as number[];
    const dyM = 2 * delta * 111320.0;
    const dxM = 2 * delta * 111320.0 * Math.max(0.1, Math.cos((lat * Math.PI) / 180));
    const slopePct =
      Math.round(
        Math.sqrt(Math.pow((zE - zW) / dxM, 2) + Math.pow((zN - zS) / dyM, 2)) * 100 * 100,
      ) / 100;

    const erosionRisk = slopePct < 2.0 ? "Low Runoff" : slopePct < 6.0 ? "Moderate Runoff" : "High Erosion Risk";

    return {
      elevation_m: Math.round(zC * 10) / 10,
      slope_pct: slopePct,
      erosion_risk: erosionRisk,
    };
  } catch {
    // Graceful fallback — keep the pipeline moving with a gentle assumed slope.
    return { elevation_m: null, slope_pct: null, erosion_risk: "Unavailable" };
  }
}
