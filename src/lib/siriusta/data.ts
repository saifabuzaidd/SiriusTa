// Data layer: loads the three bundled CSVs once (server-side singleton) and
// precomputes the per-crop statistics + dataset quantiles that the decision
// engine needs. Also hosts the nearest-centroid crop classifier that replaces
// the Python RandomForest (deterministic, no native deps).

import fs from "node:fs";
import path from "node:path";
import { parseCSVToObjects, quantile, mean, maxOf, minOf, num } from "./csv";

const DATA_DIR = path.join(process.cwd(), "src", "data");

function readDataFile(name: string): string {
  return fs.readFileSync(path.join(DATA_DIR, name), "utf8");
}

export interface DatasetRow {
  record_id: string;
  aez_mjo_key: string;
  aez_code: string;
  mjo_code: string;
  mjo_phase_num: number;
  aez_name: string;
  mjo_convective_region: string;
  N: number;
  P: number;
  K: number;
  temperature: number;
  humidity: number;
  ph: number;
  rainfall: number;
  label: string;
  mjo_rain_multiplier: number;
  mjo_temp_offset_c: number;
  mjo_humidity_offset_pct: number;
  mjo_teleconnection_regime: string;
  global_irrigation_modifier: string;
  global_benchmark_basins: string;
  global_export_corridor: string;
}

export interface MatrixRow {
  matrix_id: string;
  aez_mjo_key: string;
  aez_code: string;
  mjo_code: string;
  mjo_phase_num: number;
  aez_name: string;
  mjo_convective_region: string;
  dataset_sample_count: number;
  expected_temp_c: number;
  expected_humidity_pct: number;
  expected_ph: number;
  expected_water_mm: number;
  mjo_rain_multiplier: number;
  recommended_crops_top3: string;
  global_irrigation_modifier: string;
  mjo_teleconnection_regime: string;
  global_benchmark_basins: string;
  global_export_corridor: string;
}

export interface Example12 {
  id: number;
  country: string;
  city_basin: string;
  lat: number;
  lon: number;
  annual_rain: string;
  soil_profile: string;
  output_profile: string;
  parsed_aez: string;
}

export interface CropCentroid {
  label: string;
  N: number;
  P: number;
  K: number;
  temperature: number;
  humidity: number;
  ph: number;
  rainfall: number;
  count: number;
}

export interface CropMeta {
  role: string;
  dN: number;
  dP: number;
  dK: number;
  water_tier: "LOW" | "MID" | "HIGH";
  mean_N: number;
  mean_P: number;
  mean_K: number;
  mean_rainfall: number;
}

export interface DatasetStats {
  n_q35: number;
  n_q65: number;
  p_q35: number;
  p_q65: number;
  k_q35: number;
  rain_q35: number;
  rain_q65: number;
  n_max: number;
  p_max: number;
  k_max: number;
  rain_max: number;
  rain_min: number;
}

interface LoadedData {
  dataset: DatasetRow[];
  matrix: MatrixRow[];
  examples: Example12[];
  cropCentroids: Map<string, CropCentroid>;
  cropMeta: Map<string, CropMeta>;
  stats: DatasetStats;
  featureRanges: { N: number; P: number; K: number; temperature: number; humidity: number; ph: number; rainfall: number };
}

let cache: LoadedData | null = null;

function parseDataset(rows: ReturnType<typeof parseCSVToObjects>): DatasetRow[] {
  return rows.map((r) => ({
    record_id: r.record_id ?? "",
    aez_mjo_key: (r.aez_mjo_key ?? "").trim(),
    aez_code: (r.aez_code ?? "").trim(),
    mjo_code: (r.mjo_code ?? "").trim(),
    mjo_phase_num: num(r.mjo_phase_num, 0),
    aez_name: r.aez_name ?? "",
    mjo_convective_region: r.mjo_convective_region ?? "",
    N: num(r.N),
    P: num(r.P),
    K: num(r.K),
    temperature: num(r.temperature),
    humidity: num(r.humidity),
    ph: num(r.ph),
    rainfall: num(r.rainfall),
    label: (r.label ?? "").trim().toLowerCase(),
    mjo_rain_multiplier: num(r.mjo_rain_multiplier, 1.0),
    mjo_temp_offset_c: num(r.mjo_temp_offset_c, 0.0),
    mjo_humidity_offset_pct: num(r.mjo_humidity_offset_pct, 0.0),
    mjo_teleconnection_regime: r.mjo_teleconnection_regime ?? "",
    global_irrigation_modifier: r.global_irrigation_modifier ?? "",
    global_benchmark_basins: r.global_benchmark_basins ?? "",
    global_export_corridor: r.global_export_corridor ?? "",
  }));
}

function parseMatrix(rows: ReturnType<typeof parseCSVToObjects>): MatrixRow[] {
  return rows.map((r) => ({
    matrix_id: r.matrix_id ?? "",
    aez_mjo_key: (r.aez_mjo_key ?? "").trim(),
    aez_code: (r.aez_code ?? "").trim(),
    mjo_code: (r.mjo_code ?? "").trim(),
    mjo_phase_num: num(r.mjo_phase_num, 0),
    aez_name: r.aez_name ?? "",
    mjo_convective_region: r.mjo_convective_region ?? "",
    dataset_sample_count: num(r.dataset_sample_count, 0),
    expected_temp_c: num(r.expected_temp_c, 0),
    expected_humidity_pct: num(r.expected_humidity_pct, 0),
    expected_ph: num(r.expected_ph, 0),
    expected_water_mm: num(r.expected_water_mm, 0),
    mjo_rain_multiplier: num(r.mjo_rain_multiplier, 1.0),
    recommended_crops_top3: r.recommended_crops_top3 ?? "",
    global_irrigation_modifier: r.global_irrigation_modifier ?? "",
    mjo_teleconnection_regime: r.mjo_teleconnection_regime ?? "",
    global_benchmark_basins: r.global_benchmark_basins ?? "",
    global_export_corridor: r.global_export_corridor ?? "",
  }));
}

function parseExamples(rows: ReturnType<typeof parseCSVToObjects>): Example12[] {
  // The 12_ex.csv header uses "#", "Country", "Agricultural City / Basin",
  // "Latitude (--lat)", "Longitude (--lon)", "Annual Rain", "Soil Profile",
  // "Expected testb.py Output Profile"
  const out: Example12[] = [];
  for (const r of rows) {
    const id = num(r["#"] ?? r[Object.keys(r)[0]], NaN);
    if (!Number.isFinite(id)) continue;
    const profile = r["Expected testb.py Output Profile"] ?? "";
    const m = profile.toUpperCase().match(/AEZ\d{2}/);
    out.push({
      id,
      country: (r.Country ?? "").trim(),
      city_basin: (r["Agricultural City / Basin"] ?? "").trim(),
      lat: num(r["Latitude (--lat)"], NaN),
      lon: num(r["Longitude (--lon)"], NaN),
      annual_rain: (r["Annual Rain"] ?? "").trim(),
      soil_profile: (r["Soil Profile"] ?? "").trim(),
      output_profile: profile,
      parsed_aez: m ? m[0] : "AEZ01",
    });
  }
  return out;
}

function buildCentroids(dataset: DatasetRow[]): Map<string, CropCentroid> {
  const acc = new Map<string, { N: number[]; P: number[]; K: number[]; t: number[]; h: number[]; ph: number[]; r: number[] }>();
  for (const d of dataset) {
    let g = acc.get(d.label);
    if (!g) {
      g = { N: [], P: [], K: [], t: [], h: [], ph: [], r: [] };
      acc.set(d.label, g);
    }
    g.N.push(d.N);
    g.P.push(d.P);
    g.K.push(d.K);
    g.t.push(d.temperature);
    g.h.push(d.humidity);
    g.ph.push(d.ph);
    g.r.push(d.rainfall);
  }
  const centroids = new Map<string, CropCentroid>();
  for (const [label, g] of acc) {
    centroids.set(label, {
      label,
      N: mean(g.N),
      P: mean(g.P),
      K: mean(g.K),
      temperature: mean(g.t),
      humidity: mean(g.h),
      ph: mean(g.ph),
      rainfall: mean(g.r),
      count: g.N.length,
    });
  }
  return centroids;
}

// Build centroids from an arbitrary subset of dataset rows (used by Tier 3
// when restricting the crop classifier to a single AEZ/MJO slice).
export function buildCentroidsFromRows(rows: DatasetRow[]): Map<string, CropCentroid> {
  return buildCentroids(rows);
}

function buildCropMeta(centroids: Map<string, CropCentroid>, stats: DatasetStats): Map<string, CropMeta> {
  const meta = new Map<string, CropMeta>();
  for (const [label, c] of centroids) {
    let role: string;
    let dN: number;
    if (c.N <= stats.n_q35) {
      role = "Low-N / Restorative";
      dN = 18.0;
    } else if (c.N >= stats.n_q65) {
      role = "Heavy-N Feeder";
      dN = -28.0;
    } else {
      role = "Moderate Feeder";
      dN = -12.0;
    }
    const dP = -Math.round(c.P * 0.14 * 10) / 10;
    const dK = -Math.round(c.K * 0.14 * 10) / 10;
    const water_tier = c.rainfall <= stats.rain_q35 ? "LOW" : c.rainfall >= stats.rain_q65 ? "HIGH" : "MID";
    meta.set(label, { role, dN, dP, dK, water_tier, mean_N: Math.round(c.N * 10) / 10, mean_P: c.P, mean_K: c.K, mean_rainfall: c.rainfall });
  }
  return meta;
}

export function loadData(): LoadedData {
  if (cache) return cache;

  const dsRaw = parseCSVToObjects(readDataFile("SiriusTa_AEZXX_MJO_Dataset.csv"));
  const matRaw = parseCSVToObjects(readDataFile("SiriusTa_AEZXX_MJO_90_Matrix.csv"));
  const exRaw = parseCSVToObjects(readDataFile("12_ex.csv"));

  const dataset = parseDataset(dsRaw);
  const matrix = parseMatrix(matRaw);
  const examples = parseExamples(exRaw);

  const nVals = dataset.map((d) => d.N).sort((a, b) => a - b);
  const pVals = dataset.map((d) => d.P).sort((a, b) => a - b);
  const kVals = dataset.map((d) => d.K).sort((a, b) => a - b);
  const rVals = dataset.map((d) => d.rainfall).sort((a, b) => a - b);

  const stats: DatasetStats = {
    n_q35: quantile(nVals, 0.35),
    n_q65: quantile(nVals, 0.65),
    p_q35: quantile(pVals, 0.35),
    p_q65: quantile(pVals, 0.65),
    k_q35: quantile(kVals, 0.35),
    rain_q35: quantile(rVals, 0.35),
    rain_q65: quantile(rVals, 0.65),
    n_max: maxOf(nVals),
    p_max: maxOf(pVals),
    k_max: maxOf(kVals),
    rain_max: maxOf(rVals),
    rain_min: minOf(rVals),
  };

  const centroids = buildCentroids(dataset);
  const cropMeta = buildCropMeta(centroids, stats);

  const featureRanges = {
    N: maxOf(nVals) - minOf(nVals) || 1,
    P: maxOf(pVals) - minOf(pVals) || 1,
    K: maxOf(kVals) - minOf(kVals) || 1,
    temperature: maxOf(dataset.map((d) => d.temperature)) - minOf(dataset.map((d) => d.temperature)) || 1,
    humidity: maxOf(dataset.map((d) => d.humidity)) - minOf(dataset.map((d) => d.humidity)) || 1,
    ph: maxOf(dataset.map((d) => d.ph)) - minOf(dataset.map((d) => d.ph)) || 1,
    rainfall: maxOf(rVals) - minOf(rVals) || 1,
  };

  cache = { dataset, matrix, examples, cropCentroids: centroids, cropMeta, stats, featureRanges };
  return cache;
}

// ---- Nearest-centroid crop classifier (replaces sklearn RandomForest) ----
// Computes a softmax over exp(-weighted_distance^2 / (2 sigma^2)) to every
// crop centroid. Returns a probability-like distribution over crop labels.

export interface FeatureVec {
  N: number;
  P: number;
  K: number;
  temperature: number;
  humidity: number;
  ph: number;
  rainfall: number;
}

export function classifyCrops(
  trainRows: DatasetRow[],
  query: FeatureVec,
  opts?: { centroids?: Map<string, CropCentroid>; ranges?: LoadedData["featureRanges"]; topK?: number }
): { label: string; prob: number }[] {
  const data = loadData();
  const centroids = opts?.centroids ?? data.cropCentroids;
  const ranges = opts?.ranges ?? data.featureRanges;

  // Restrict centroid set to labels present in trainRows when a subset is given.
  let activeLabels: string[];
  if (trainRows && trainRows.length > 0) {
    const set = new Set(trainRows.map((r) => r.label));
    activeLabels = [...centroids.values()].filter((c) => set.has(c.label)).map((c) => c.label);
    if (activeLabels.length === 0) {
      activeLabels = [...centroids.keys()];
    }
  } else {
    activeLabels = [...centroids.keys()];
  }

  // Weighted, range-normalized squared distance to each centroid.
  const weights = { N: 1, P: 1, K: 1, temperature: 1, humidity: 1, ph: 1, rainfall: 1 };
  const dists: { label: string; d2: number }[] = [];
  for (const label of activeLabels) {
    const c = centroids.get(label)!;
    let d2 = 0;
    (Object.keys(weights) as (keyof typeof weights)[]).forEach((k) => {
      const range = ranges[k];
      const w = weights[k];
      const diff = (query[k] - c[k]) / range;
      d2 += w * diff * diff;
    });
    dists.push({ label, d2 });
  }

  // sigma chosen so the softest reasonable distances produce a spread of probs.
  // Using average d2 as the temperature keeps behaviour scale-invariant.
  const avgD2 = mean(dists.map((d) => d.d2)) || 1;
  const sigma2 = avgD2 * 0.5 || 1;
  const raw = dists.map((d) => ({ label: d.label, score: Math.exp(-d.d2 / (2 * sigma2)) }));
  const sum = raw.reduce((s, r) => s + r.score, 0) || 1;
  const probs = raw.map((r) => ({ label: r.label, prob: r.score / sum }));
  probs.sort((a, b) => b.prob - a.prob);
  return probs;
}

// ---- Convenience accessors ----

export function getMatrixRow(aezCode: string, mjoCode: string): MatrixRow | null {
  const { matrix } = loadData();
  const key = `${aezCode}_${mjoCode}`;
  const exact = matrix.find((m) => m.aez_mjo_key === key);
  if (exact) return exact;
  const byAez = matrix.find((m) => m.aez_code === aezCode);
  return byAez ?? null;
}

export function getDatasetSubset(aezCode: string, mjoCode: string): { exact: DatasetRow[]; byAez: DatasetRow[] } {
  const { dataset } = loadData();
  const key = `${aezCode}_${mjoCode}`;
  const exact = dataset.filter((d) => d.aez_mjo_key === key);
  const byAez = dataset.filter((d) => d.aez_code === aezCode);
  return { exact, byAez };
}
