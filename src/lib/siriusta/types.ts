// SiriusTa recommendation engine — shared TypeScript types.
// Mirrors the output shape of testz.py's extract_plot_pipeline + decision engine.

export type Level = "HIGH" | "MID" | "LOW";

export interface SoilInfo {
  wrb_class: string;
  clay_pct: number;
  sand_pct: number;
  silt_pct: number;
  ph: number;
  N_ratio: number;
  P_ratio: number;
  K_ratio: number;
  baseline_nitrogen_g_kg: number;
  source: string;
}

export interface TerrainInfo {
  elevation_m: number | null;
  slope_pct: number | null;
  erosion_risk: string;
}

export interface ClimateInfo {
  aez_code: string;
  climate_zone: string;
  annual_temp_c: number;
  annual_precip_mm: number;
  aez_profile: string;
}

export interface ForecastDaily {
  date: string;
  fc_temp_c: number;
  fc_temp_max_c: number;
  fc_temp_min_c: number;
  fc_precip_mm: number;
  fc_et0_mm: number;
  fc_wind_kmh: number;
  fc_soil_moisture: number | null;
}

export interface HistRow {
  date: string;
  T2M: number;
  T2M_MAX: number;
  T2M_MIN: number;
  RH2M: number;
  PRECTOTCORR: number;
  ALLSKY_SFC_SW_DWN: number;
  WS2M: number;
  GWETROOT: number;
  GWETTOP: number;
  ET0_est_mm: number;
  H2O_balance_mm: number;
  N2_dynamic_g_kg: number;
  N_dynamic_ratio: number;
  T2M_filtered: number;
  GWETROOT_filtered: number;
  N2_filtered: number;
  N_ratio_filtered: number;
}

export interface Tier1Item {
  level: Level;
  action: string;
}

export interface Tier1 {
  irrigation: Tier1Item;
  cover_crop: Tier1Item;
  nutrition: Tier1Item;
  insecticide: Tier1Item;
}

export interface SeasonOut {
  season: string;
  crop: string;
  role: string;
  water_demand: string;
  ml_match_pct: number;
  pre_npk: [number, number, number];
  post_npk: [number, number, number];
}

export interface RotationPlan {
  title: string;
  sequence: string[];
  seasons: SeasonOut[];
  net_N_delta: number;
}

export interface Tier2 {
  starting_crop: string;
  plan_a: RotationPlan;
  plan_b: RotationPlan;
}

export interface MjoAdjustedCrop {
  crop: string;
  pct: number;
}

export interface PlanGlobal {
  wue_pct: number;
  nue_pct: number;
  global_score: number;
}

export interface Tier3 {
  aez_code: string;
  mjo_code: string;
  aez_mjo_key: string;
  prefix_pattern: string;
  mjo_amplitude: number;
  mjo_source: string;
  convective_region: string;
  teleconnection_regime: string;
  global_irrigation_modifier: string;
  benchmark_basins: string;
  export_corridor: string;
  rain_multiplier: number;
  temp_offset_c: number;
  rh_offset_pct: number;
  matched_slice_rows: number;
  aez_total_rows: number;
  matrix_top3_ref: string;
  mjo_adjusted_crops: MjoAdjustedCrop[];
  plan_a_global: PlanGlobal;
  plan_b_global: PlanGlobal;
}

export interface Decision {
  alert_level: string;
  features_7: {
    N: number;
    P: number;
    K: number;
    temperature: number;
    humidity: number;
    ph: number;
    rainfall: number;
  };
  effective_water_mm: number;
  previous_crop: string;
  tier1: Tier1;
  tier2: Tier2;
  tier3: Tier3;
  dataset_file: string;
  modis_ndvi: number | "N/A";
}

export interface PlotMeta {
  lat: number;
  lon: number;
  plot_name: string;
  prev_crop: string;
  country: string;
}

export interface PlotResult {
  meta: PlotMeta;
  soil: SoilInfo;
  terrain: TerrainInfo;
  climate: ClimateInfo;
  hist: HistRow[];
  forecast: ForecastDaily[];
  ndvi: { date: string; ndvi: number }[] | null;
  decision: Decision;
}

export interface MatchedExample {
  ex_id: number;
  country: string;
  city_basin: string;
  lat_ex: number;
  lon_ex: number;
  matched_aez: string;
  geo_dist_km?: number;
  selection_mode: string;
}

export interface ExaminationSummary {
  target_coords: [number, number];
  example_coords: [number, number];
  example_name: string;
  aez_match: string;
  aez_mjo_match: string;
  agronomic_similarity_pct: number;
  delta_temp_c: number;
  delta_rh_pct: number;
  delta_root_h2o: number;
  delta_N_ratio: number;
  delta_ph: number;
  irrigation_parity: string;
  nutrition_parity: string;
  plan_a_parity: string;
}

export interface RecommendationResponse {
  ok: boolean;
  generated_at: string;
  input: { lat: number; lon: number; prev_crop: string; name: string };
  target: PlotResult;
  matched_example: MatchedExample;
  example: PlotResult;
  examination: ExaminationSummary;
  warnings: string[];
}
