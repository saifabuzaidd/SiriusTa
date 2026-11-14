// SECTION 4 — Decision engine: Tier 1 simple actions, Tier 2 two rotation
// plans, Tier 3 AEZxx x MJO global teleconnection. Ports testz.py
// run_tier1_simple_decisions / run_tier2_two_rotation_plans /
// run_tier3_aez_mjo_connection / run_decision_engine.

import type {
  HistRow,
  ForecastDaily,
  SoilInfo,
  TerrainInfo,
  ClimateInfo,
  Tier1,
  Tier2,
  Tier3,
  Tier1Item,
  SeasonOut,
  RotationPlan,
  Level,
  Decision,
  PlanGlobal,
  MjoAdjustedCrop,
} from "./types";
import { loadData, classifyCrops, getMatrixRow, getDatasetSubset, buildCentroidsFromRows } from "./data";
import type { FeatureVec } from "./data";
import { fetchLiveMjoPhase } from "./mjo";
import type { MjoResult } from "./mjo";

const HEAVY_FEEDER_CROPS = new Set([
  "maize",
  "cotton",
  "rice",
  "banana",
  "watermelon",
  "muskmelon",
  "jute",
  "coffee",
]);

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

// ---- Tier 1: simple HIGH/MID/LOW action levels ----

export function runTier1(
  hist: HistRow[],
  fc: ForecastDaily[],
  features7: Decision["features_7"],
  soil: SoilInfo,
  terrain: TerrainInfo,
  previousCrop: string,
): Tier1 {
  const last = hist[hist.length - 1];
  const rootH2O = last.GWETROOT_filtered;
  const tempC = features7.temperature;
  const rhPct = features7.humidity;
  const nVal = features7.N;
  const pVal = features7.P;
  const kVal = features7.K;

  const rain7d = fc.reduce((s, d) => s + (d.fc_precip_mm || 0), 0);
  const et07d = fc.reduce((s, d) => s + (d.fc_et0_mm || 0), 0);
  const waterDeficit7d = Math.round((et07d - rain7d) * 10) / 10;
  const maxWindKmh = Math.max(...fc.map((d) => d.fc_wind_kmh || 0));
  const maxTemp7d = Math.max(...fc.map((d) => d.fc_temp_max_c || 0));
  const slopePct = terrain.slope_pct !== null ? terrain.slope_pct : 1.0;

  // 1. Irrigation
  let irrLevel: Level;
  let irrAction: string;
  if (rootH2O < 0.42 && rain7d < 5.0) {
    irrLevel = "HIGH";
    irrAction = `Root H2O low (${rootH2O.toFixed(2)}) with ${waterDeficit7d} mm weekly water deficit. Run full evening irrigation cycle within 24h.`;
  } else if ((0.42 <= rootH2O && rootH2O <= 0.62 && rain7d < 12.0) || (12.0 <= waterDeficit7d && waterDeficit7d <= 30.0 && rootH2O < 0.65)) {
    irrLevel = "MID";
    irrAction = `Root H2O moderate (${rootH2O.toFixed(2)}). Apply 50% maintenance drip pulse to cover ${et07d.toFixed(1)} mm weekly ET0 demand.`;
  } else {
    irrLevel = "LOW";
    irrAction = `Hold irrigation: Root H2O sufficient (${rootH2O.toFixed(2)}) or incoming rain (${rain7d.toFixed(1)} mm) satisfies crop demand.`;
  }

  // 2. Cover crop & weather protection
  let coverLevel: Level;
  let coverAction: string;
  if ((rain7d > 25.0 && slopePct >= 3.0) || maxWindKmh > 38.0) {
    coverLevel = "HIGH";
    coverAction = `Heavy rain (${rain7d.toFixed(1)} mm on ${slopePct}% slope) or gale wind (${maxWindKmh.toFixed(1)} km/h). Maintain dense cover crop (Berseem Clover / Rye) + perimeter windbreak.`;
  } else if ((12.0 <= rain7d && rain7d <= 25.0) || (25.0 <= maxWindKmh && maxWindKmh <= 38.0) || maxTemp7d > 35.0) {
    coverLevel = "MID";
    coverAction = `Moderate wind (${maxWindKmh.toFixed(1)} km/h) or thermal load (${maxTemp7d.toFixed(1)} C max). Apply inter-row organic mulch to prevent erosion and evaporation.`;
  } else {
    coverLevel = "LOW";
    coverAction = `Calm wind (${maxWindKmh.toFixed(1)} km/h), low rain (${rain7d.toFixed(1)} mm), gentle slope (${slopePct}%). Standard open-field soil surface management.`;
  }

  // 3. Nutrition replenishment
  const { stats } = loadData();
  const prevClean = previousCrop.trim().toLowerCase();
  const wasHeavyCrop = HEAVY_FEEDER_CROPS.has(prevClean);
  const leachNote = rain7d > 20.0 && soil.sand_pct > 45.0 ? " [Split dose: rain >20mm in sandy soil]" : "";

  let nutrLevel: Level;
  let nutrAction: string;
  if (wasHeavyCrop || nVal < stats.n_q35 || pVal < stats.p_q35 || kVal < stats.k_q35) {
    nutrLevel = "HIGH";
    const trigger = wasHeavyCrop ? `post-heavy crop (${prevClean})` : "below dataset 35th percentile";
    nutrAction = `Replenishment required (${trigger}): NPK=(${nVal}/${pVal}/${kVal}). Apply balanced NPK + compost recovery dose${leachNote}.`;
  } else if (nVal < stats.n_q65 || pVal < stats.p_q65) {
    nutrLevel = "MID";
    nutrAction = `Moderate reserves (prev: ${prevClean}): NPK=(${nVal}/${pVal}/${kVal}). Apply light maintenance fertigation${leachNote}.`;
  } else {
    nutrLevel = "LOW";
    nutrAction = `High soil reserves: NPK=(${nVal}/${pVal}/${kVal}); hold synthetic fertilizer.`;
  }

  // 4. Insecticide & bio-spray
  const windGate = maxWindKmh > 25.0 ? " [DELAY SPRAY UNTIL CALM DAWN: Wind >25 km/h drift risk]" : "";
  let pestLevel: Level;
  let pestAction: string;
  if (20.0 <= tempC && tempC <= 33.0 && rhPct > 72.0) {
    pestLevel = "HIGH";
    pestAction = `Warm + humid (${tempC.toFixed(1)} C, ${rhPct.toFixed(0)}% RH) triggers larvae/fungal outbreak. Apply targeted bio-insecticide within 48h${windGate}.`;
  } else if (tempC > 33.0 && rhPct < 30.0) {
    pestLevel = "HIGH";
    pestAction = `Hot-dry stress (${tempC.toFixed(1)} C, ${rhPct.toFixed(0)}% RH) favors spider mites/thrips. Apply evening miticide / horticultural oil${windGate}.`;
  } else if (20.0 <= tempC && tempC <= 33.0 && 62.0 <= rhPct && rhPct <= 72.0) {
    pestLevel = "MID";
    pestAction = `Moderate humidity (${rhPct.toFixed(0)}% RH). Deploy sticky/pheromone traps and preventative neem oil spray${windGate}.`;
  } else {
    pestLevel = "LOW";
    pestAction = `Low pest pressure (${tempC.toFixed(1)} C, ${rhPct.toFixed(0)}% RH); routine scouting only.`;
  }

  const make = (level: Level, action: string): Tier1Item => ({ level, action });
  return {
    irrigation: make(irrLevel, irrAction),
    cover_crop: make(coverLevel, coverAction),
    nutrition: make(nutrLevel, nutrAction),
    insecticide: make(pestLevel, pestAction),
  };
}

// ---- Tier 2: two crop rotation plans ----

interface SimState {
  N: number;
  P: number;
  K: number;
  temperature: number;
  humidity: number;
  ph: number;
  rainfall: number;
}

function simulatePlan(
  strategy: "plan_a_restoration" | "plan_b_commercial",
  baseState: SimState,
  history0: string[],
  numSeasons: number,
  irrLevel: Level,
  blockedBySeason: Map<number, Set<string>>,
): { sequence: string[]; seasons: SeasonOut[]; net_N_delta: number } {
  const { cropMeta, stats } = loadData();
  const state: SimState = { ...baseState };
  const initialN = state.N;
  const history = history0.slice();
  const seasonsOut: SeasonOut[] = [];

  for (let s = 1; s <= numSeasons; s++) {
    const query: FeatureVec = {
      N: state.N,
      P: state.P,
      K: state.K,
      temperature: state.temperature,
      humidity: state.humidity,
      ph: state.ph,
      rainfall: state.rainfall,
    };
    const probs = classifyCrops(loadData().dataset, query);
    const classProbs = new Map<string, number>(probs.map((p) => [p.label, p.prob]));

    const lastHistIdx = history.length - 1;
    const prevCropLabel = lastHistIdx >= 0 ? history[lastHistIdx] : "";
    const prevRole = prevCropLabel && cropMeta.has(prevCropLabel) ? cropMeta.get(prevCropLabel)!.role : "Fallow / Neutral";

    let bestCrop = "";
    let bestScore = -1;
    let bestProb = 0;

    for (const { label, prob: mlProb } of probs) {
      // skip last 2 crops
      const last2 = history.slice(-2);
      if (last2.includes(label)) continue;
      if (blockedBySeason.get(s)?.has(label)) continue;

      const m = cropMeta.get(label);
      if (!m) continue;
      let multiplier = 1.0;

      if (strategy === "plan_a_restoration") {
        if (m.role === "Low-N / Restorative") multiplier += 1.2;
        else if (m.role === "Moderate Feeder") multiplier += 0.45;
        if (m.water_tier === "LOW") multiplier += irrLevel === "HIGH" || irrLevel === "MID" ? 0.85 : 0.35;
        else if (m.water_tier === "HIGH") multiplier *= 0.35;
        if (prevRole === "Heavy-N Feeder" && m.role === "Low-N / Restorative") multiplier += 0.6;
      } else {
        // plan_b_commercial
        if (m.role === "Heavy-N Feeder" && state.N >= 50.0) multiplier += 1.35;
        else if (m.role === "Moderate Feeder") multiplier += 0.9;
        else if (prevRole === "Heavy-N Feeder" && m.role === "Low-N / Restorative") multiplier += 0.85;
        if (irrLevel === "HIGH" && m.water_tier === "HIGH") multiplier *= 0.5;
      }

      const score = (mlProb + 0.005) * multiplier;
      if (score > bestScore) {
        bestScore = score;
        bestCrop = label;
        bestProb = mlProb;
      }
    }

    if (!bestCrop) {
      // degenerate: pick top prob ignoring blocks
      bestCrop = probs[0]?.label ?? "fallow";
      bestProb = probs[0]?.prob ?? 0;
    }

    const chosen = cropMeta.get(bestCrop)!;
    const preNpk: [number, number, number] = [
      Math.round(state.N * 10) / 10,
      Math.round(state.P * 10) / 10,
      Math.round(state.K * 10) / 10,
    ];
    state.N = clamp(state.N + chosen.dN, 5.0, stats.n_max);
    state.P = clamp(state.P + chosen.dP, 5.0, stats.p_max);
    state.K = clamp(state.K + chosen.dK, 5.0, stats.k_max);
    const postNpk: [number, number, number] = [
      Math.round(state.N * 10) / 10,
      Math.round(state.P * 10) / 10,
      Math.round(state.K * 10) / 10,
    ];

    seasonsOut.push({
      season: `Season ${s}`,
      crop: bestCrop,
      role: chosen.role,
      water_demand: chosen.water_tier,
      ml_match_pct: Math.round(bestProb * 1000) / 10,
      pre_npk: preNpk,
      post_npk: postNpk,
    });
    history.push(bestCrop);
  }

  return {
    sequence: seasonsOut.map((s) => s.crop),
    seasons: seasonsOut,
    net_N_delta: Math.round((state.N - initialN) * 10) / 10,
  };
}

export function runTier2(
  features7: Decision["features_7"],
  effectiveWaterMm: number,
  tier1: Tier1,
  previousCrop: string,
  numSeasons = 3,
): Tier2 {
  const { stats } = loadData();
  const baseState: SimState = {
    N: features7.N,
    P: features7.P,
    K: features7.K,
    temperature: features7.temperature,
    humidity: features7.humidity,
    ph: features7.ph,
    rainfall: effectiveWaterMm,
  };
  const nutrLevel = tier1.nutrition.level;
  if (nutrLevel === "HIGH") {
    baseState.N = Math.min(stats.n_max, baseState.N + 18.0);
    baseState.P = Math.min(stats.p_max, baseState.P + 12.0);
    baseState.K = Math.min(stats.k_max, baseState.K + 12.0);
  } else if (nutrLevel === "MID") {
    baseState.N = Math.min(stats.n_max, baseState.N + 8.0);
    baseState.P = Math.min(stats.p_max, baseState.P + 5.0);
    baseState.K = Math.min(stats.k_max, baseState.K + 5.0);
  }

  const irrLevel = tier1.irrigation.level;
  const prevClean = previousCrop.trim().toLowerCase();
  const isFallowStart = ["", "none", "fallow", "n/a"].includes(prevClean);
  const startLabel = isFallowStart ? "none (Fallow)" : prevClean;
  const history0 = isFallowStart ? [] : [prevClean];

  const planA = simulatePlan("plan_a_restoration", baseState, history0, numSeasons, irrLevel, new Map());
  const blocked = new Map<number, Set<string>>([
    [1, new Set([planA.sequence[0]])],
    [3, new Set([planA.sequence[2]])],
  ]);
  const planB = simulatePlan("plan_b_commercial", baseState, history0, numSeasons, irrLevel, blocked);

  const makePlan = (title: string, p: { sequence: string[]; seasons: SeasonOut[]; net_N_delta: number }): RotationPlan => ({
    title,
    sequence: p.sequence,
    seasons: p.seasons,
    net_N_delta: p.net_N_delta,
  });

  return {
    starting_crop: startLabel,
    plan_a: makePlan("Plan A: Soil-Restoration & Water-Saving Cycle", planA),
    plan_b: makePlan("Plan B: Commercial Cash-Crop & Balanced-NPK Cycle", planB),
  };
}

// ---- Tier 3: AEZ x MJO global teleconnection ----

function scorePlan(
  sequence: string[],
  centroids: Map<string, { rainfall: number; N: number }>,
  rainMax: number,
  nMax: number,
): PlanGlobal {
  const wueList: number[] = [];
  const nueList: number[] = [];
  for (const c of sequence) {
    const cent = centroids.get(c);
    if (cent) {
      wueList.push(Math.max(10, 100 * (1 - cent.rainfall / rainMax)));
      nueList.push(Math.max(10, 100 * (1 - cent.N / nMax)));
    }
  }
  const wue = wueList.length > 0 ? wueList.reduce((s, v) => s + v, 0) / wueList.length : 55.0;
  const nue = nueList.length > 0 ? nueList.reduce((s, v) => s + v, 0) / nueList.length : 55.0;
  return {
    wue_pct: Math.round(wue * 10) / 10,
    nue_pct: Math.round(nue * 10) / 10,
    global_score: Math.round((0.55 * wue + 0.45 * nue) * 10) / 10,
  };
}

export async function runTier3(
  aezCode: string,
  features7: Decision["features_7"],
  effectiveWaterMm: number,
  tier2: Tier2,
  mjoPhase?: MjoResult,
): Promise<Tier3> {
  const { dataset, stats } = loadData();
  const mjo = mjoPhase ?? (await fetchLiveMjoPhase());
  const compositeKey = `${aezCode}_${mjo.mjo_code}`;

  const matRow = getMatrixRow(aezCode, mjo.mjo_code);
  const { exact: subExact, byAez: subAez } = getDatasetSubset(aezCode, mjo.mjo_code);

  // choose training subset (exact key >=25, else aez >=20, else full dataset)
  let trainRows = subExact;
  if (trainRows.length < 25) trainRows = subAez.length >= 20 ? subAez : dataset;

  // subset centroids for the chosen training rows
  const trainCentroids = buildCentroidsFromRows(trainRows);

  // MJO offsets (from any rows matching the mjo_code)
  const mjoRows = dataset.filter((d) => d.mjo_code === mjo.mjo_code);
  const tempOffset = mjoRows.length > 0 ? mjoRows[0].mjo_temp_offset_c : 0.0;
  const rhOffset = mjoRows.length > 0 ? mjoRows[0].mjo_humidity_offset_pct : 0.0;
  const rainMult = matRow ? matRow.mjo_rain_multiplier : 1.0;

  const queryVec: FeatureVec = {
    N: features7.N,
    P: features7.P,
    K: features7.K,
    temperature: Math.round((features7.temperature + tempOffset) * 100) / 100,
    humidity: Math.round(clamp(features7.humidity + rhOffset, 15, 98) * 100) / 100,
    ph: features7.ph,
    rainfall: Math.round(effectiveWaterMm * rainMult * 10) / 10,
  };

  const probs = classifyCrops(trainRows, queryVec, { centroids: trainCentroids });
  const mjoTop3: MjoAdjustedCrop[] = probs.slice(0, 3).map((p) => ({
    crop: p.label,
    pct: Math.round(p.prob * 1000) / 10,
  }));

  // stats for plan scoring: sub_aez centroids if >=10 rows else global
  const scoreCentroids =
    subAez.length >= 10
      ? new Map(
          [...buildCentroidsFromRows(subAez).values()].map((c) => [c.label, { rainfall: c.rainfall, N: c.N }]),
        )
      : new Map(
          [...loadData().cropCentroids.values()].map((c) => [c.label, { rainfall: c.rainfall, N: c.N }]),
        );

  return {
    aez_code: aezCode,
    mjo_code: mjo.mjo_code,
    aez_mjo_key: compositeKey,
    prefix_pattern: `${compositeKey}_NNNN`,
    mjo_amplitude: mjo.amplitude,
    mjo_source: mjo.source,
    convective_region: matRow?.mjo_convective_region ?? "Inactive / Weak MJO (RMM Amplitude < 1.0)",
    teleconnection_regime: matRow?.mjo_teleconnection_regime ?? "Climatological Baseline (Local AEZ Control Dominant)",
    global_irrigation_modifier: matRow?.global_irrigation_modifier ?? "NEUTRAL (Follow Local Soil H2O)",
    benchmark_basins: matRow?.global_benchmark_basins ?? "N/A",
    export_corridor: matRow?.global_export_corridor ?? "N/A",
    rain_multiplier: rainMult,
    temp_offset_c: tempOffset,
    rh_offset_pct: rhOffset,
    matched_slice_rows: subExact.length,
    aez_total_rows: subAez.length,
    matrix_top3_ref: matRow?.recommended_crops_top3 ?? "N/A",
    mjo_adjusted_crops: mjoTop3,
    plan_a_global: scorePlan(tier2.plan_a.sequence, scoreCentroids, stats.rain_max, stats.n_max),
    plan_b_global: scorePlan(tier2.plan_b.sequence, scoreCentroids, stats.rain_max, stats.n_max),
  };
}

// ---- Decision engine orchestration ----

export async function runDecisionEngine(
  hist: HistRow[],
  fc: ForecastDaily[],
  ndvi: { date: string; ndvi: number }[] | null,
  climate: ClimateInfo,
  soil: SoilInfo,
  _terrain: TerrainInfo,
  previousCrop: string,
  mjoPhase?: MjoResult,
): Promise<Decision> {
  const last = hist[hist.length - 1];
  const latestTemp = last.T2M_filtered;
  const latestHumidity = last.RH2M;
  const latestRootH2O = last.GWETROOT_filtered;
  const latestNRatio = Math.round(last.N_ratio_filtered * 10) / 10;
  const latestNdvi = ndvi && ndvi.length > 0 ? ndvi[ndvi.length - 1].ndvi : null;

  const obs30dRain = hist.slice(-30).reduce((s, r) => s + r.PRECTOTCORR, 0);
  const next7dRain = fc.reduce((s, d) => s + (d.fc_precip_mm || 0), 0);
  const totalWindowRainMm = Math.round((obs30dRain + next7dRain) * 10) / 10;

  const { stats } = loadData();
  const effectiveWaterMm =
    totalWindowRainMm >= stats.rain_min
      ? totalWindowRainMm
      : Math.round(Math.max(stats.rain_min + 2.0, latestRootH2O * 115.0) * 10) / 10;

  const features7 = {
    N: latestNRatio,
    P: soil.P_ratio,
    K: soil.K_ratio,
    temperature: Math.round(latestTemp * 100) / 100,
    humidity: Math.round(latestHumidity * 100) / 100,
    ph: soil.ph,
    rainfall: totalWindowRainMm,
  };

  const tier1 = runTier1(hist, fc, features7, soil, _terrain, previousCrop);
  const tier2 = runTier2(features7, effectiveWaterMm, tier1, previousCrop);
  const tier3 = await runTier3(climate.aez_code, features7, effectiveWaterMm, tier2, mjoPhase);

  const levels = [tier1.irrigation.level, tier1.cover_crop.level, tier1.nutrition.level, tier1.insecticide.level];
  const alertLevel = levels.includes("HIGH")
    ? "HIGH PRIORITY ACTION"
    : levels.includes("MID")
      ? "MODERATE MONITORING"
      : "LOW / OPTIMAL";

  return {
    alert_level: alertLevel,
    features_7: features7,
    effective_water_mm: effectiveWaterMm,
    previous_crop: previousCrop,
    tier1,
    tier2,
    tier3,
    dataset_file: "SiriusTa_AEZXX_MJO_Dataset.csv",
    modis_ndvi: latestNdvi !== null ? Math.round(latestNdvi * 1000) / 1000 : "N/A",
  };
}
