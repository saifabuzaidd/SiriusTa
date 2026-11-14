// SECTION 2 — Dynamic telemetry + SECTION 3 DSP conditioning.
// Ports testz.py get_dynamic_telemetry + apply_dsp_conditioning.
// Sources: NASA POWER daily (45d history), Open-Meteo (7d forecast),
// NASA MODIS MOD13Q1 NDVI (optional). Each feed has a climate-anchored
// deterministic fallback so the engine never crashes on a network blip.

import type { HistRow, ForecastDaily, SoilInfo, ClimateInfo } from "./types";
import { autoSavgol } from "./dsp";

// ---- tiny deterministic PRNG (mulberry32) for stable synthetic fallbacks ----
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

interface RawHistPoint {
  date: string; // YYYYMMDD
  T2M: number;
  T2M_MAX: number;
  T2M_MIN: number;
  RH2M: number;
  PRECTOTCORR: number;
  ALLSKY_SFC_SW_DWN: number;
  WS2M: number;
  GWETROOT: number;
  GWETTOP: number;
}

async function fetchNasaDaily(lat: number, lon: number, timeoutMs = 20000): Promise<RawHistPoint[] | null> {
  const end = new Date();
  const start = new Date(end.getTime() - 45 * 86400000);
  const fmt = (d: Date) =>
    `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}${String(d.getUTCDate()).padStart(2, "0")}`;
  const url =
    `https://power.larc.nasa.gov/api/temporal/daily/point` +
    `?parameters=T2M,T2M_MAX,T2M_MIN,RH2M,PRECTOTCORR,ALLSKY_SFC_SW_DWN,WS2M,GWETROOT,GWETTOP` +
    `&community=AG&longitude=${lon}&latitude=${lat}&start=${fmt(start)}&end=${fmt(end)}&format=JSON`;
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const param = json?.properties?.parameter;
    if (!param) throw new Error("unexpected NASA response");

    const keys = Object.keys(param.T2M ?? {}).sort();
    const points: RawHistPoint[] = [];
    for (const k of keys) {
      points.push({
        date: k,
        T2M: param.T2M?.[k] ?? -999,
        T2M_MAX: param.T2M_MAX?.[k] ?? -999,
        T2M_MIN: param.T2M_MIN?.[k] ?? -999,
        RH2M: param.RH2M?.[k] ?? -999,
        PRECTOTCORR: param.PRECTOTCORR?.[k] ?? -999,
        ALLSKY_SFC_SW_DWN: param.ALLSKY_SFC_SW_DWN?.[k] ?? -999,
        WS2M: param.WS2M?.[k] ?? -999,
        GWETROOT: param.GWETROOT?.[k] ?? -999,
        GWETTOP: param.GWETTOP?.[k] ?? -999,
      });
    }
    return points;
  } catch {
    return null;
  }
}

// Linear per-column interpolation of -999 sentinels (mirrors pandas interpolate+ffill+bfill).
function interpolateColumn(values: number[]): number[] {
  const n = values.length;
  const out = values.slice();
  // forward pass: fill -999 by interpolation / ffill
  for (let i = 0; i < n; i++) {
    if (out[i] === -999 || !Number.isFinite(out[i])) {
      // find next valid
      let j = i + 1;
      while (j < n && (out[j] === -999 || !Number.isFinite(out[j]))) j++;
      if (i > 0 && j < n) {
        const prev = out[i - 1];
        const next = out[j];
        out[i] = prev + ((next - prev) * (1)) / (j - i + 1);
      } else if (i > 0) {
        out[i] = out[i - 1]; // bfill via trailing ffill
      } else if (j < n) {
        out[i] = out[j]; // leading bfill
      } else {
        out[i] = 0;
      }
    }
  }
  // backfill any remaining leading sentinels
  for (let i = n - 1; i >= 0; i--) {
    if (out[i] === -999 || !Number.isFinite(out[i])) {
      if (i < n - 1) out[i] = out[i + 1];
      else out[i] = 0;
    }
  }
  return out;
}

// Deterministic synthetic 45-day series anchored to the resolved climate.
function syntheticHistory(lat: number, lon: number, soil: SoilInfo, climate: ClimateInfo): RawHistPoint[] {
  const seed = Math.floor((Math.abs(lat) * 1000 + Math.abs(lon)) % 2147483647);
  const rng = mulberry32(seed);
  const annualTemp = climate.annual_temp_c;
  const dailyPrecipMean = climate.annual_precip_mm / 365;
  const points: RawHistPoint[] = [];
  const end = new Date();
  for (let d = 45; d >= 1; d--) {
    const date = new Date(end.getTime() - d * 86400000);
    const k = `${date.getUTCFullYear()}${String(date.getUTCMonth() + 1).padStart(2, "0")}${String(date.getUTCDate()).padStart(2, "0")}`;
    const wiggle = (rng() - 0.5) * 4;
    const temp = annualTemp + wiggle;
    // rain: mostly dry days with occasional events scaled by climate aridity
    const isRainDay = rng() < Math.min(0.6, dailyPrecipMean / 6);
    const rain = isRainDay ? Math.round(dailyPrecipMean * (0.5 + rng() * 2.5) * 10) / 10 : 0;
    const rh = clamp(45 + dailyPrecipMean * 0.04 + (rng() - 0.5) * 14, 12, 98);
    const gwt = clamp(0.35 + rain * 0.012 + (rng() - 0.5) * 0.06, 0.05, 0.95);
    const gwr = clamp(0.42 + rain * 0.006 + (rng() - 0.5) * 0.05, 0.08, 0.95);
    points.push({
      date: k,
      T2M: Math.round(temp * 100) / 100,
      T2M_MAX: Math.round((temp + 6 + rng() * 2) * 100) / 100,
      T2M_MIN: Math.round((temp - 5 - rng() * 2) * 100) / 100,
      RH2M: Math.round(rh * 100) / 100,
      PRECTOTCORR: rain,
      ALLSKY_SFC_SW_DWN: Math.round((18 + (rng() - 0.5) * 4) * 100) / 100,
      WS2M: Math.round((2.5 + rng() * 2) * 100) / 100,
      GWETROOT: Math.round(gwr * 1000) / 1000,
      GWETTOP: Math.round(gwt * 1000) / 1000,
    });
  }
  return points;
}

interface ForecastResult {
  daily: ForecastDaily[];
  source: string;
}

async function fetchForecast(lat: number, lon: number, climate: ClimateInfo, timeoutMs = 20000): Promise<ForecastResult> {
  const url =
    `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
    `&daily=temperature_2m_mean,temperature_2m_max,temperature_2m_min,precipitation_sum,et0_fao_evapotranspiration,wind_speed_10m_max` +
    `&hourly=soil_moisture_3_to_9cm&forecast_days=7&timezone=auto`;
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    if (!json?.daily) throw new Error("no daily block");

    const times: string[] = json.daily.time;
    const tMean: number[] = json.daily.temperature_2m_mean;
    const tMax: number[] = json.daily.temperature_2m_max;
    const tMin: number[] = json.daily.temperature_2m_min;
    const precip: number[] = json.daily.precipitation_sum;
    const et0: number[] = json.daily.et0_fao_evapotranspiration;
    const wind: number[] = json.daily.wind_speed_10m_max;

    // mean daily soil moisture from hourly
    const hourlyTime: string[] = json.hourly?.time ?? [];
    const hourlySm: number[] = json.hourly?.soil_moisture_3_to_9cm ?? [];
    const dailySm: (number | null)[] = times.map((day) => {
      const vals: number[] = [];
      for (let i = 0; i < hourlyTime.length; i++) {
        if (hourlyTime[i].startsWith(day) && typeof hourlySm[i] === "number") vals.push(hourlySm[i]);
      }
      return vals.length > 0 ? vals.reduce((s, v) => s + v, 0) / vals.length : null;
    });

    const daily: ForecastDaily[] = times.map((date, i) => ({
      date,
      fc_temp_c: tMean[i],
      fc_temp_max_c: tMax[i],
      fc_temp_min_c: tMin[i],
      fc_precip_mm: precip[i],
      fc_et0_mm: et0[i],
      fc_wind_kmh: wind[i],
      fc_soil_moisture: dailySm[i],
    }));
    return { daily, source: "Open-Meteo" };
  } catch {
    // climate-anchored deterministic fallback
    const rng = mulberry32(Math.floor((Math.abs(lat) * 1000 + Math.abs(lon) * 7) % 2147483647));
    const annualTemp = climate.annual_temp_c;
    const dailyPrecipMean = climate.annual_precip_mm / 365;
    const daily: ForecastDaily[] = [];
    const start = new Date();
    for (let i = 0; i < 7; i++) {
      const date = new Date(start.getTime() + i * 86400000);
      const ds = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
      const temp = annualTemp + (rng() - 0.5) * 3;
      const rain = rng() < 0.4 ? Math.round(dailyPrecipMean * (0.5 + rng() * 2) * 10) / 10 : 0;
      daily.push({
        date: ds,
        fc_temp_c: Math.round(temp * 100) / 100,
        fc_temp_max_c: Math.round((temp + 6 + rng() * 2) * 100) / 100,
        fc_temp_min_c: Math.round((temp - 5) * 100) / 100,
        fc_precip_mm: rain,
        fc_et0_mm: Math.round((3 + rng() * 2) * 100) / 100,
        fc_wind_kmh: Math.round((12 + rng() * 8) * 100) / 100,
        fc_soil_moisture: null,
      });
    }
    return { daily, source: "Estimated (offline fallback)" };
  }
}

async function fetchModisNdvi(lat: number, lon: number, timeoutMs = 15000): Promise<{ date: string; ndvi: number }[] | null> {
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), timeoutMs);
    const dRes = await fetch(
      `https://modis.ornl.gov/rst/api/v1/MOD13Q1/dates?latitude=${lat}&longitude=${lon}`,
      { signal: controller.signal },
    );
    clearTimeout(to);
    if (!dRes.ok) throw new Error(`dates HTTP ${dRes.status}`);
    const dJson = await dRes.json();
    const dates: { modis_date: string; calendar_date: string }[] = dJson?.dates ?? [];
    if (dates.length < 4) throw new Error("insufficient MODIS dates");

    const startModis = dates[dates.length - 8].modis_date;
    const endModis = dates[dates.length - 1].modis_date;
    const subUrl =
      `https://modis.ornl.gov/rst/api/v1/MOD13Q1/subset?latitude=${lat}&longitude=${lon}` +
      `&band=250m_16_days_NDVI&startDate=${startModis}&endDate=${endModis}&kmAboveBelow=0&kmLeftRight=0`;
    const controller2 = new AbortController();
    const to2 = setTimeout(() => controller2.abort(), timeoutMs);
    const sRes = await fetch(subUrl, { signal: controller2.signal });
    clearTimeout(to2);
    if (!sRes.ok) throw new Error(`subset HTTP ${sRes.status}`);
    const sJson = await sRes.json();
    const subsets: { calendar_date: string; data: number[] }[] = sJson?.subset ?? [];

    const records: { date: string; ndvi: number }[] = [];
    for (const item of subsets) {
      const val = item.data?.[0];
      if (typeof val === "number" && val > -2000) {
        records.push({ date: item.calendar_date, ndvi: Math.round(val * 0.0001 * 1000) / 1000 });
      }
    }
    if (records.length === 0) throw new Error("cloud-masked NDVI");
    return records;
  } catch {
    return null;
  }
}

export interface TelemetryResult {
  hist: HistRow[];
  forecast: ForecastDaily[];
  ndvi: { date: string; ndvi: number }[] | null;
  sources: { history: string; forecast: string; ndvi: string };
}

function buildHistRows(raw: RawHistPoint[], soil: SoilInfo): HistRow[] {
  const cols = {
    T2M: interpolateColumn(raw.map((r) => r.T2M)),
    T2M_MAX: interpolateColumn(raw.map((r) => r.T2M_MAX)),
    T2M_MIN: interpolateColumn(raw.map((r) => r.T2M_MIN)),
    RH2M: interpolateColumn(raw.map((r) => r.RH2M)),
    PRECTOTCORR: interpolateColumn(raw.map((r) => r.PRECTOTCORR)),
    ALLSKY_SFC_SW_DWN: interpolateColumn(raw.map((r) => r.ALLSKY_SFC_SW_DWN)),
    WS2M: interpolateColumn(raw.map((r) => r.WS2M)),
    GWETROOT: interpolateColumn(raw.map((r) => r.GWETROOT)),
    GWETTOP: interpolateColumn(raw.map((r) => r.GWETTOP)),
  };

  const n = raw.length;
  const rows: HistRow[] = [];
  const n0 = soil.baseline_nitrogen_g_kg > 0 ? soil.baseline_nitrogen_g_kg : 1.25;
  const sandFrac = soil.sand_pct / 100;
  const infiltrationCapMm = 18 * (1 - 0.5 * sandFrac);
  let currentN = n0;

  for (let i = 0; i < n; i++) {
    const t2m = cols.T2M[i];
    const t2mMax = cols.T2M_MAX[i];
    const t2mMin = cols.T2M_MIN[i];
    const precip = cols.PRECTOTCORR[i];
    const swd = cols.ALLSKY_SFC_SW_DWN[i];
    const gwr = cols.GWETROOT[i];

    const et0 = Math.max(
      0.5,
      0.0023 * (t2m + 17.8) * Math.sqrt(Math.max(0.5, t2mMax - t2mMin)) * (swd * 0.408),
    );
    const h2oBal = precip - et0;

    const excessRain = Math.max(0, precip - infiltrationCapMm);
    const leachLoss = currentN * (0.012 * (0.4 + sandFrac)) * (excessRain / 10);
    const mineralization = 18 <= t2m && t2m <= 32 && 0.35 <= gwr && gwr <= 0.8 ? 0.0015 * n0 : 0;
    currentN = Math.max(0.1, currentN - leachLoss + mineralization);
    const nRatio = clamp(currentN * 38, 0, 140);

    rows.push({
      date: `${raw[i].date.slice(0, 4)}-${raw[i].date.slice(4, 6)}-${raw[i].date.slice(6, 8)}`,
      T2M: Math.round(t2m * 100) / 100,
      T2M_MAX: Math.round(t2mMax * 100) / 100,
      T2M_MIN: Math.round(t2mMin * 100) / 100,
      RH2M: Math.round(cols.RH2M[i] * 100) / 100,
      PRECTOTCORR: Math.round(precip * 100) / 100,
      ALLSKY_SFC_SW_DWN: Math.round(swd * 100) / 100,
      WS2M: Math.round(cols.WS2M[i] * 100) / 100,
      GWETROOT: Math.round(gwr * 1000) / 1000,
      GWETTOP: Math.round(cols.GWETTOP[i] * 1000) / 1000,
      ET0_est_mm: Math.round(et0 * 100) / 100,
      H2O_balance_mm: Math.round(h2oBal * 100) / 100,
      N2_dynamic_g_kg: Math.round(currentN * 10000) / 10000,
      N_dynamic_ratio: Math.round(nRatio * 100) / 100,
      T2M_filtered: 0,
      GWETROOT_filtered: 0,
      N2_filtered: 0,
      N_ratio_filtered: 0,
    });
  }
  return rows;
}

function applyDsp(rows: HistRow[]): HistRow[] {
  if (rows.length >= 5) {
    const t2mF = autoSavgol(rows.map((r) => r.T2M));
    const gwrF = autoSavgol(rows.map((r) => r.GWETROOT));
    const n2F = autoSavgol(rows.map((r) => r.N2_dynamic_g_kg));
    const nRatioF = autoSavgol(rows.map((r) => r.N_dynamic_ratio));
    for (let i = 0; i < rows.length; i++) {
      rows[i].T2M_filtered = Math.round(t2mF[i] * 100) / 100;
      rows[i].GWETROOT_filtered = Math.round(gwrF[i] * 1000) / 1000;
      rows[i].N2_filtered = Math.round(n2F[i] * 10000) / 10000;
      rows[i].N_ratio_filtered = Math.round(nRatioF[i] * 100) / 100;
    }
  } else {
    for (const r of rows) {
      r.T2M_filtered = r.T2M;
      r.GWETROOT_filtered = r.GWETROOT;
      r.N2_filtered = r.N2_dynamic_g_kg;
      r.N_ratio_filtered = r.N_dynamic_ratio;
    }
  }
  return rows;
}

export async function getDynamicTelemetry(
  lat: number,
  lon: number,
  soil: SoilInfo,
  climate: ClimateInfo,
): Promise<TelemetryResult> {
  let raw = await fetchNasaDaily(lat, lon);
  let historySource = "NASA POWER (daily, 45d)";
  if (!raw || raw.length === 0) {
    raw = syntheticHistory(lat, lon, soil, climate);
    historySource = "Synthetic (offline fallback, climate-anchored)";
  }

  const hist = applyDsp(buildHistRows(raw, soil));
  // forecast and MODIS NDVI are independent — fetch in parallel.
  const [forecast, ndvi] = await Promise.all([fetchForecast(lat, lon, climate), fetchModisNdvi(lat, lon)]);

  return {
    hist,
    forecast: forecast.daily,
    ndvi,
    sources: {
      history: historySource,
      forecast: forecast.source,
      ndvi: ndvi ? "NASA MODIS MOD13Q1" : "Unavailable (skipped)",
    },
  };
}
