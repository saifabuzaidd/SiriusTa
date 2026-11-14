// Engine orchestration: per-coordinate extraction pipeline, matched-zone
// example selection, and dual-coordinate examination. Ports testz.py
// extract_plot_pipeline / select_matched_zone_example /
// examine_and_save_comparison_csv (examination-summary portion).

import type {
  PlotResult,
  PlotMeta,
  MatchedExample,
  ExaminationSummary,
  SoilInfo,
  TerrainInfo,
  ClimateInfo,
  HistRow,
  ForecastDaily,
} from "./types";
import { loadData } from "./data";
import { getStaticSoil } from "./soil";
import { getStaticTerrain } from "./terrain";
import { fetchRawClimate, buildClimateInfo } from "./climate";
import { getDynamicTelemetry } from "./telemetry";
import type { TelemetryResult } from "./telemetry";
import { runDecisionEngine } from "./decisions";
import { fetchLiveMjoPhase } from "./mjo";

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

export interface PlotPipeline {
  result: PlotResult;
  telemetrySources: TelemetryResult["sources"];
}

export async function extractPlotPipeline(
  lat: number,
  lon: number,
  plotName: string,
  prevCrop: string,
  country: string,
  mjoPhase?: Awaited<ReturnType<typeof fetchLiveMjoPhase>>,
): Promise<PlotPipeline> {
  // soil / terrain / climate-fetch are independent — run in parallel.
  const [soil, terrain, rawClimate] = await Promise.all([
    getStaticSoil(lat, lon),
    getStaticTerrain(lat, lon),
    fetchRawClimate(lat, lon),
  ]);
  // AEZ derivation needs the real soil (fluvisol/clay check) — do it now.
  const climate = buildClimateInfo(rawClimate, soil);
  const telemetry = await getDynamicTelemetry(lat, lon, soil, climate);
  const decision = await runDecisionEngine(
    telemetry.hist,
    telemetry.forecast,
    telemetry.ndvi,
    climate,
    soil,
    terrain,
    prevCrop,
    mjoPhase,
  );

  const meta: PlotMeta = { lat, lon, plot_name: plotName, prev_crop: prevCrop, country };
  return {
    result: {
      meta,
      soil,
      terrain,
      climate,
      hist: telemetry.hist,
      forecast: telemetry.forecast,
      ndvi: telemetry.ndvi,
      decision,
    },
    telemetrySources: telemetry.sources,
  };
}

// ---- Matched-zone example selection (12_ex.csv) ----

export function selectMatchedZoneExample(
  targetLat: number,
  targetLon: number,
  targetAezCode: string,
  preferredRowNum?: number,
): MatchedExample {
  const { examples } = loadData();

  if (preferredRowNum !== undefined) {
    const hit = examples.find((e) => e.id === preferredRowNum);
    if (hit) {
      return {
        ex_id: hit.id,
        country: hit.country,
        city_basin: hit.city_basin,
        lat_ex: hit.lat,
        lon_ex: hit.lon,
        matched_aez: hit.parsed_aez,
        selection_mode: `Manual Row #${preferredRowNum}`,
      };
    }
  }

  let matched = examples.filter((e) => e.parsed_aez === targetAezCode);
  let mode: string;
  if (matched.length === 0) {
    matched = examples.slice();
    mode = `Fallback Peer Example (no ${targetAezCode} entry in 12_ex.csv)`;
  } else {
    mode = `Matched AEZ Zone (${targetAezCode})`;
  }

  // exclude near-identical coords (<~1.5 km)
  const nonIdentical = matched.filter((e) => Math.hypot(e.lat - targetLat, e.lon - targetLon) > 0.015);
  if (nonIdentical.length > 0) matched = nonIdentical;

  // geo distance with longitude cosine correction
  let best = matched[0];
  let bestDist = Infinity;
  for (const e of matched) {
    const latDiff = e.lat - targetLat;
    const lonDiff = (e.lon - targetLon) * Math.cos((targetLat * Math.PI) / 180);
    const distKm = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff) * 111.32;
    if (distKm < bestDist) {
      bestDist = distKm;
      best = e;
    }
  }

  return {
    ex_id: best.id,
    country: best.country,
    city_basin: best.city_basin,
    lat_ex: best.lat,
    lon_ex: best.lon,
    matched_aez: best.parsed_aez,
    geo_dist_km: Math.round(bestDist * 10) / 10,
    selection_mode: mode,
  };
}

// ---- Dual-coordinate examination ----

function featureVector(p: PlotResult): {
  N: number;
  P: number;
  K: number;
  temp: number;
  rh: number;
  ph: number;
  water: number;
  rootH2O: number;
} {
  const last = p.hist[p.hist.length - 1];
  return {
    N: p.decision.features_7.N,
    P: p.soil.P_ratio,
    K: p.soil.K_ratio,
    temp: p.decision.features_7.temperature,
    rh: last.RH2M,
    ph: p.soil.ph,
    water: p.decision.effective_water_mm,
    rootH2O: last.GWETROOT_filtered,
  };
}

export function examineComparison(
  target: PlotResult,
  example: PlotResult,
  matchMeta: MatchedExample,
): ExaminationSummary {
  const vt = featureVector(target);
  const ve = featureVector(example);

  const scales = [60, 60, 80, 12, 35, 1.5, 120];
  const vT = [vt.N, vt.P, vt.K, vt.temp, vt.rh, vt.ph, vt.water];
  const vE = [ve.N, ve.P, ve.K, ve.temp, ve.rh, ve.ph, ve.water];
  let sumSq = 0;
  for (let i = 0; i < 7; i++) {
    const d = (vT[i] - vE[i]) / scales[i];
    sumSq += d * d;
  }
  const normDist = Math.sqrt(sumSq / 7);
  const similarity = Math.round(clamp((1 - normDist) * 100, 0, 99.9) * 10) / 10;

  const parity = (a: string, b: string) => (a === b ? "MATCH" : `DIFF (${a} vs ${b})`);

  return {
    target_coords: [target.meta.lat, target.meta.lon],
    example_coords: [example.meta.lat, example.meta.lon],
    example_name: `${matchMeta.city_basin}, ${matchMeta.country}`,
    aez_match: `${target.climate.aez_code} vs ${example.climate.aez_code}`,
    aez_mjo_match: `${target.decision.tier3.aez_mjo_key} vs ${example.decision.tier3.aez_mjo_key}`,
    agronomic_similarity_pct: similarity,
    delta_temp_c: Math.round((vt.temp - ve.temp) * 1000) / 1000,
    delta_rh_pct: Math.round((vt.rh - ve.rh) * 1000) / 1000,
    delta_root_h2o: Math.round((vt.rootH2O - ve.rootH2O) * 1000) / 1000,
    delta_N_ratio: Math.round((vt.N - ve.N) * 1000) / 1000,
    delta_ph: Math.round((vt.ph - ve.ph) * 1000) / 1000,
    irrigation_parity: parity(target.decision.tier1.irrigation.level, example.decision.tier1.irrigation.level),
    nutrition_parity: parity(target.decision.tier1.nutrition.level, example.decision.tier1.nutrition.level),
    plan_a_parity: parity(target.decision.tier2.plan_a.sequence.join(" -> "), example.decision.tier2.plan_a.sequence.join(" -> ")),
  };
}

// ---- Warnings collected from fallback sources ----

export function collectWarnings(
  target: PlotPipeline,
  example: PlotPipeline,
  matched: MatchedExample,
): string[] {
  const warnings: string[] = [];
  const check = (p: PlotPipeline, which: string) => {
    if (p.result.soil.source.includes("offline")) warnings.push(`${which}: soil feed offline — using estimated default.`);
    if (p.result.terrain.erosion_risk === "Unavailable") warnings.push(`${which}: SRTM elevation feed offline — terrain estimated.`);
    if (p.telemetrySources.history.includes("Synthetic")) warnings.push(`${which}: NASA POWER daily history offline — using climate-anchored synthetic series.`);
    if (p.telemetrySources.forecast.includes("offline")) warnings.push(`${which}: Open-Meteo forecast offline — using climate-anchored fallback.`);
    if (p.telemetrySources.ndvi.includes("Unavailable")) warnings.push(`${which}: MODIS NDVI unavailable — skipped.`);
  };
  check(target, "Target");
  check(example, "Matched twin");
  if (matched.selection_mode.startsWith("Fallback")) {
    warnings.push(`No ${target.result.climate.aez_code} example in 12_ex.csv — using nearest peer (${matched.city_basin}, ${matched.country}).`);
  }
  return warnings;
}
