// Public entry point for the SiriusTa recommendation engine.
// Mirrors testz.py's __main__ flow: extract target -> match zone example ->
// extract example -> examine & compare.

import type { RecommendationResponse, PlotResult } from "./types";
import { loadData } from "./data";
import { extractPlotPipeline, selectMatchedZoneExample, examineComparison, collectWarnings } from "./engine";
import type { PlotPipeline } from "./engine";
import { fetchLiveMjoPhase } from "./mjo";

export interface RecommendInput {
  lat: number;
  lon: number;
  prevCrop?: string;
  name?: string;
  exRow?: number;
}

export function validateInput(input: RecommendInput): { ok: boolean; error?: string; lat: number; lon: number; prevCrop: string; name: string } {
  const lat = Number(input.lat);
  const lon = Number(input.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
    return { ok: false, error: "Latitude and longitude must be valid numeric values.", lat, lon, prevCrop: "", name: "" };
  }
  if (!(-90 <= lat && lat <= 90 && -180 <= lon && lon <= 180)) {
    return { ok: false, error: "Coordinates out of Earth bounds (-90..90, -180..180).", lat, lon, prevCrop: "", name: "" };
  }
  const prevCrop = (input.prevCrop ?? "").trim().toLowerCase() || "none";
  const name = (input.name ?? "").trim() || `Target Plot (${lat}, ${lon})`;
  return { ok: true, lat, lon, prevCrop, name };
}

export async function recommend(input: RecommendInput): Promise<RecommendationResponse> {
  const v = validateInput(input);
  if (!v.ok) {
    throw new Error(v.error ?? "Invalid input");
  }
  const { lat, lon, prevCrop, name } = v;

  // ensure datasets are loaded (warms the singleton on first call)
  loadData();

  // Fetch the live MJO phase once and reuse for both plots (saves a NOAA round-trip).
  const mjoPhase = await fetchLiveMjoPhase();

  const targetPipeline: PlotPipeline = await extractPlotPipeline(
    lat,
    lon,
    name,
    prevCrop,
    "Target Input",
    mjoPhase,
  );

  const matched = selectMatchedZoneExample(
    lat,
    lon,
    targetPipeline.result.climate.aez_code,
    input.exRow,
  );

  const exampleName = `${matched.city_basin} (${matched.country})`;
  const examplePipeline: PlotPipeline = await extractPlotPipeline(
    matched.lat_ex,
    matched.lon_ex,
    exampleName,
    prevCrop,
    matched.country,
    mjoPhase,
  );

  const examination = examineComparison(targetPipeline.result, examplePipeline.result, matched);
  const warnings = collectWarnings(targetPipeline, examplePipeline, matched);

  return {
    ok: true,
    generated_at: new Date().toISOString(),
    input: { lat, lon, prev_crop: prevCrop, name },
    target: targetPipeline.result,
    matched_example: matched,
    example: examplePipeline.result,
    examination,
    warnings,
  };
}

// Re-export the result type for API consumers.
export type { PlotResult };
