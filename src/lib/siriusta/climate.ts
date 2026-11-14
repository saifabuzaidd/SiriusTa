// SECTION 1C — Static climatology + AEZ01-AEZ10 prefix derivation.
// Ports testz.py get_static_climate_and_aez. Primary source: NASA POWER
// Agroclimatology point API. Falls back to a latitude-band climate estimate
// (clearly labelled) so the pipeline always produces a valid AEZ code.

import type { ClimateInfo, SoilInfo } from "./types";

export interface NasaClimatology {
  annual_temp: number;
  annual_precip_mm: number;
  monthly_temps: number[];
}

async function fetchNasaClimatology(lat: number, lon: number, timeoutMs = 20000): Promise<NasaClimatology | null> {
  const url =
    `https://power.larc.nasa.gov/api/temporal/climatology/point` +
    `?parameters=T2M,PRECTOTCORR&community=AG&longitude=${lon}&latitude=${lat}&format=JSON`;
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const payload = await res.json();
    const param = payload?.properties?.parameter;
    if (!param || !param.T2M || !param.PRECTOTCORR) throw new Error("unexpected NASA response");

    const t2m = param.T2M as Record<string, number>;
    const precip = param.PRECTOTCORR as Record<string, number>;
    const annualTemp = t2m["ANN"];
    const annualPrecipMm = precip["ANN"] * 365.0;
    const months = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
    const monthlyTemps = months.map((m) => t2m[m]).filter((v) => v !== undefined);
    return { annual_temp: annualTemp, annual_precip_mm: annualPrecipMm, monthly_temps: monthlyTemps };
  } catch {
    return null;
  }
}

// Coarse latitude-band climate used only when NASA POWER is unreachable.
function fallbackClimate(lat: number): NasaClimatology {
  const absLat = Math.abs(lat);
  let annualTemp: number;
  let annualPrecipMm: number;
  if (absLat < 10) {
    annualTemp = 27;
    annualPrecipMm = 1500;
  } else if (absLat < 23.5) {
    annualTemp = 25;
    annualPrecipMm = 950;
  } else if (absLat < 35) {
    annualTemp = 21;
    annualPrecipMm = 280;
  } else if (absLat < 50) {
    annualTemp = 14;
    annualPrecipMm = 650;
  } else if (absLat < 66) {
    annualTemp = 4;
    annualPrecipMm = 480;
  } else {
    annualTemp = -6;
    annualPrecipMm = 240;
  }
  const amplitude = 0.3 * absLat;
  const hemiSign = lat >= 0 ? 1 : -1;
  const monthlyTemps = Array.from({ length: 12 }, (_, i) => {
    // July (index 6) peak for NH, January (index 0) peak for SH.
    const phase = (i - 6) / 12;
    return annualTemp + hemiSign * amplitude * Math.cos(phase * 2 * Math.PI);
  });
  return { annual_temp: annualTemp, annual_precip_mm: annualPrecipMm, monthly_temps: monthlyTemps };
}

interface AezResult {
  aez_code: string;
  climate_zone: string;
  aez_label: string;
}

export function deriveAez(climate: NasaClimatology, soil: SoilInfo): AezResult {
  const { annual_temp: annualTemp, annual_precip_mm: annualPrecipMm, monthly_temps: monthlyTemps } = climate;
  const minMonthTemp = Math.min(...monthlyTemps);
  const maxMonthTemp = Math.max(...monthlyTemps);

  if (maxMonthTemp < 10.0) {
    return { aez_code: "AEZ06", climate_zone: "Polar / Subarctic Tundra (ET - Cold Limit)", aez_label: "AEZ06 (Cold Continental / Boreal Limit)" };
  }
  if (minMonthTemp < 0.0) {
    return { aez_code: "AEZ06", climate_zone: "Temperate / Continental (Dfa/Dfb)", aez_label: "AEZ06 (Temperate Continental Prairie - Dfa/Dfb)" };
  }
  if (annualPrecipMm < 250.0) {
    if (soil.wrb_class.toLowerCase().includes("fluvisol") || soil.clay_pct >= 30.0) {
      return { aez_code: "AEZ01", climate_zone: "Hot Arid (BWh)", aez_label: "AEZ01 (Hot Arid Alluvial Valley - BWh)" };
    }
    return { aez_code: "AEZ02", climate_zone: "Hot Arid (BWh)", aez_label: "AEZ02 (Hot Arid Desert / Steppe - BWh/BWk)" };
  }
  if (annualPrecipMm < 500.0) {
    return { aez_code: "AEZ04", climate_zone: "Semi-Arid Subtropical Steppe (BSh)", aez_label: "AEZ04 (Semi-Arid Subtropical Loam - BSh)" };
  }
  if (annualPrecipMm > 1800.0 && minMonthTemp >= 22.0) {
    return { aez_code: "AEZ10", climate_zone: "Equatorial Humid Rainforest (Af)", aez_label: "AEZ10 (Equatorial Humid Rainforest - Af)" };
  }
  if (annualPrecipMm > 1400.0 && minMonthTemp >= 18.0) {
    return { aez_code: "AEZ09", climate_zone: "Tropical Monsoon Delta (Am)", aez_label: "AEZ09 (Tropical Monsoon Delta - Am)" };
  }
  if (minMonthTemp >= 18.0 && annualTemp < 23.5) {
    return { aez_code: "AEZ08", climate_zone: "Tropical Highland Volcanic (Cwb/Cfb)", aez_label: "AEZ08 (Tropical Highland Volcanic - Cwb)" };
  }
  if (minMonthTemp >= 18.0) {
    return { aez_code: "AEZ07", climate_zone: "Tropical Wet-Dry Savanna (Aw)", aez_label: "AEZ07 (Tropical Wet-Dry Savanna - Aw)" };
  }
  if (annualPrecipMm >= 900.0) {
    return { aez_code: "AEZ05", climate_zone: "Humid Subtropical Plain (Cfa/Cwa)", aez_label: "AEZ05 (Humid Subtropical Plain - Cfa/Cwa)" };
  }
  return { aez_code: "AEZ03", climate_zone: "Mediterranean Warm-Temperate Alluvial (Csa)", aez_label: "AEZ03 (Mediterranean Warm-Temperate Alluvial - Csa)" };
}

export async function getStaticClimateAndAez(lat: number, lon: number, soil: SoilInfo): Promise<ClimateInfo> {
  let climate = await fetchNasaClimatology(lat, lon);
  if (!climate) climate = fallbackClimate(lat);
  return buildClimateInfo(climate, soil);
}

// Split exports so the engine can fetch climate in parallel with soil and
// derive the AEZ code only once the real soil texture is known.
export async function fetchRawClimate(lat: number, lon: number): Promise<NasaClimatology> {
  const c = await fetchNasaClimatology(lat, lon);
  return c ?? fallbackClimate(lat);
}

export function buildClimateInfo(climate: NasaClimatology, soil: SoilInfo): ClimateInfo {
  const aez = deriveAez(climate, soil);
  return {
    aez_code: aez.aez_code,
    climate_zone: aez.climate_zone,
    annual_temp_c: Math.round(climate.annual_temp * 10) / 10,
    annual_precip_mm: Math.round(climate.annual_precip_mm * 10) / 10,
    aez_profile: aez.aez_label,
  };
}
