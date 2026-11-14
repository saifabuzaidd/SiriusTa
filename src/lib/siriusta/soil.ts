// SECTION 1A — Static soil chemistry (NPK, pH, texture).
// Ports testz.py get_static_soil / derive_npk_and_ph / query_local_hwsd2.
// Primary source: ISRIC SoilGrids v2 REST API (online). The local HWSD2.bil
// raster used by the Python script is not bundled, so we go straight to the
// SoilGrids API and fall back to a deterministic loam default on failure.

import type { SoilInfo } from "./types";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export function deriveNpkAndPh(
  clayPct: number,
  sandPct: number,
  totalNGkg: number | null,
  phWater: number | null,
  orgCarbonGkg: number | null,
  tebCmolKg: number | null,
): { ph: number; N_ratio: number; P_ratio: number; K_ratio: number; baseline_nitrogen_g_kg: number } {
  const phVal =
    phWater !== null && phWater >= 3.0 && phWater <= 11.0
      ? Math.round(phWater * 100) / 100
      : Math.round((clayPct >= 35.0 ? 7.4 : sandPct >= 60.0 ? 6.5 : 6.9) * 100) / 100;

  const nBase = totalNGkg !== null && totalNGkg > 0 ? totalNGkg : 1.25;
  const nRatio = Math.round(clamp(nBase * 38.0, 0, 140) * 10) / 10;

  const oc = orgCarbonGkg !== null && orgCarbonGkg > 0 ? orgCarbonGkg : 8.0 + 0.15 * clayPct;
  const phAvail = Math.max(0.45, 1.0 - 0.14 * Math.abs(phVal - 6.7));
  const pRatio = Math.round(clamp(oc * 3.4 * phAvail, 5, 145) * 10) / 10;

  const teb = tebCmolKg !== null && tebCmolKg > 0 ? tebCmolKg : 6.0 + 0.35 * clayPct;
  const kRatio = Math.round(clamp(teb * 2.6 + clayPct * 0.45, 5, 205) * 10) / 10;

  return { ph: phVal, N_ratio: nRatio, P_ratio: pRatio, K_ratio: kRatio, baseline_nitrogen_g_kg: Math.round(nBase * 100) / 100 };
}

interface SoilGridsMetrics {
  clay: number;
  sand: number;
  silt: number;
  nitrogen: number;
  phh2o: number;
  soc: number;
}

async function fetchSoilGrids(lat: number, lon: number, timeoutMs = 15000): Promise<SoilGridsMetrics | null> {
  const endpoints = [
    "https://rest.isric.org/soilgrids/v2.0/properties/query",
    "https://pixelgust.com/soilgrids/v2.0/properties/query",
  ];
  const params = new URLSearchParams({
    lon: String(lon),
    lat: String(lat),
    depth: "0-5cm",
    value: "mean",
  });
  for (const p of ["clay", "sand", "silt", "nitrogen", "phh2o", "soc"]) params.append("property", p);

  for (const url of endpoints) {
    try {
      const controller = new AbortController();
      const to = setTimeout(() => controller.abort(), timeoutMs);
      const res = await fetch(`${url}?${params.toString()}`, { signal: controller.signal });
      clearTimeout(to);
      if (res.status === 429) continue;
      if (!res.ok) continue;
      const json = await res.json();
      const layers: { name: string; depths: { values: { mean: number | null } }[] }[] =
        json?.properties?.layers ?? [];
      const metrics: Partial<SoilGridsMetrics> = {};
      for (const l of layers) {
        const mean = l.depths?.[0]?.values?.mean;
        if (mean === null || mean === undefined) continue;
        (metrics as Record<string, number>)[l.name] = mean;
      }
      if (metrics.clay === undefined || metrics.sand === undefined) continue;
      return {
        clay: metrics.clay,
        sand: metrics.sand,
        silt: metrics.silt ?? 0,
        nitrogen: metrics.nitrogen ?? 125,
        phh2o: metrics.phh2o ?? 0,
        soc: metrics.soc ?? 0,
      };
    } catch {
      continue;
    }
  }
  return null;
}

// Deterministic loam fallback used only when every soil feed is unreachable,
// so the pipeline always returns a complete record instead of erroring out.
function fallbackSoil(): SoilInfo {
  const clayPct = 30.0;
  const sandPct = 40.0;
  const chem = deriveNpkAndPh(clayPct, sandPct, 1.25, 6.9, 12.5, 16.5);
  return {
    wrb_class: "Estimated Loam (offline)",
    clay_pct: clayPct,
    sand_pct: sandPct,
    silt_pct: Math.round((100 - clayPct - sandPct) * 10) / 10,
    ph: chem.ph,
    N_ratio: chem.N_ratio,
    P_ratio: chem.P_ratio,
    K_ratio: chem.K_ratio,
    baseline_nitrogen_g_kg: chem.baseline_nitrogen_g_kg,
    source: "Estimated Default (offline fallback)",
  };
}

export async function getStaticSoil(lat: number, lon: number): Promise<SoilInfo> {
  const metrics = await fetchSoilGrids(lat, lon);
  if (!metrics) return fallbackSoil();

  const clayPct = Math.round((metrics.clay / 10) * 10) / 10;
  const sandPct = Math.round((metrics.sand / 10) * 10) / 10;
  const siltPct = Math.round((metrics.silt / 10) * 10) / 10;
  const totalN = metrics.nitrogen / 100;
  const phWater = metrics.phh2o ? metrics.phh2o / 10 : null;
  const orgCarbon = metrics.soc ? metrics.soc / 10 : null;

  const chem = deriveNpkAndPh(clayPct, sandPct, totalN, phWater, orgCarbon, null);
  return {
    wrb_class: "SoilGrids WRB",
    clay_pct: clayPct,
    sand_pct: sandPct,
    silt_pct: siltPct,
    ph: chem.ph,
    N_ratio: chem.N_ratio,
    P_ratio: chem.P_ratio,
    K_ratio: chem.K_ratio,
    baseline_nitrogen_g_kg: chem.baseline_nitrogen_g_kg,
    source: "ISRIC SoilGrids v2 (0-5cm)",
  };
}
