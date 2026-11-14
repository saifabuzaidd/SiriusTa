"use client";

import dynamic from "next/dynamic";
import { MapPin, Satellite as SatIcon, ZoomIn } from "lucide-react";
import { SunStage, MoistureStage, WindStage, HumidityStage, SoilStage } from "./VisualStages";
import type { RecommendationResponse } from "@/lib/siriusta/types";
import { cn } from "@/lib/utils";

const FieldMap = dynamic(() => import("./FieldMap").then((m) => m.FieldMap), {
  ssr: false,
  loading: () => <div className="flex h-44 items-center justify-center text-xs text-muted-foreground">Loading map…</div>,
});

type State = "danger" | "warning" | "good";

interface ParamCard {
  key: string;
  title: string;
  subtitle: string;
  state: State;
  badge: string;
  belowLabel?: string;
  description: string;
  stage: React.ReactNode;
}

// Vertical traffic-light capsule: red / yellow / green, one lit by state.
function TrafficLight({ state }: { state: State }) {
  const lit = state === "danger" ? 0 : state === "warning" ? 1 : 2;
  const colors = ["#dc2626", "#f59e0b", "#16a34a"];
  return (
    <div className="flex flex-col items-center gap-1 rounded-full bg-slate-900 px-1.5 py-2" aria-label={`Status: ${state}`}>
      {colors.map((c, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full transition-all"
          style={{
            backgroundColor: c,
            opacity: i === lit ? 1 : 0.18,
            boxShadow: i === lit ? `0 0 7px ${c}` : "none",
          }}
        />
      ))}
    </div>
  );
}

function deriveParams(data: RecommendationResponse): ParamCard[] {
  const t = data.target;
  const dec = t.decision;
  const last = t.hist[t.hist.length - 1];
  const temp = dec.features_7.temperature;
  const maxTemp7d = Math.max(...t.forecast.map((f) => f.fc_temp_max_c || 0));
  const maxWind = Math.max(...t.forecast.map((f) => f.fc_wind_kmh || 0));
  const rh = dec.features_7.humidity;
  const rootH2O = last.GWETROOT_filtered;

  // 1. Sun & Heat
  let sun: State = "good", sunSub = "Cool Mild Sun", sunBadge = "Light Intensity: Low";
  if (maxTemp7d > 35 || temp > 33) { sun = "danger"; sunSub = "Scorching Heat"; sunBadge = "Light Intensity: Very High"; }
  else if (temp >= 25) { sun = "warning"; sunSub = "Bright Midday Sun"; sunBadge = "Light Intensity: Moderate-High"; }

  // 2. Surface & Root Moisture
  let moist: State = "good", moistSub = "Light Dew & Healthy Roots", moistBadge = "Above: Light Film | Roots: Ideal", moistBelow = "Below Ground: Balanced Root Zone";
  if (dec.tier1.irrigation.level === "HIGH" || rootH2O < 0.42) { moist = "danger"; moistSub = "Dry Top & Thirsty Roots"; moistBadge = "Above: Dry | Roots: Low"; moistBelow = "Below Ground: Low Root Moisture"; }
  else if (rootH2O < 0.62) { moist = "warning"; moistSub = "Moderate Surface Damp"; moistBadge = "Above: Light Film | Roots: Moderate"; moistBelow = "Below Ground: Moderate Root Zone"; }

  // 3. Wind & Canopy Airflow
  let wind: State = "good", windSub = "Gentle Breeze", windBadge = "Airflow: Calm", windKind: "strong" | "moderate" | "calm" = "calm";
  if (maxWind > 38) { wind = "danger"; windSub = "Strong Gusty Winds"; windBadge = "Airflow: Strong Gusts"; windKind = "strong"; }
  else if (maxWind > 25) { wind = "warning"; windSub = "Breezy Airflow"; windBadge = "Airflow: Moderate"; windKind = "moderate"; }

  // 4. Air Humidity & Dew
  let hum: State = "good", humSub = "Comfortable Air", humBadge = "Atmosphere: Balanced", humDew: "heavy" | "moderate" | "dry" = "moderate";
  if (rh > 72) { hum = "danger"; humSub = "Heavy Humid Mist"; humBadge = "Atmosphere: Heavy Mist"; humDew = "heavy"; }
  else if (rh >= 62) { hum = "warning"; humSub = "Moderate Humidity"; humBadge = "Atmosphere: Moderate Dew"; humDew = "moderate"; }
  else if (rh < 30) { hum = "danger"; humSub = "Dry Crisp Air"; humBadge = "Atmosphere: Dry"; humDew = "dry"; }
  else { humDew = "moderate"; }

  // 5. Soil Vitality & Nutrients
  let soil: State = "good", soilSub = "Rich & Active Earth", soilBadge = "Soil Reserves: Rich", soilVit: "rich" | "moderate" | "low" = "rich";
  if (dec.tier1.nutrition.level === "HIGH") { soil = "danger"; soilSub = "Depleted Post-Harvest"; soilBadge = "Soil Reserves: Low"; soilVit = "low"; }
  else if (dec.tier1.nutrition.level === "MID") { soil = "warning"; soilSub = "Moderate Reserves"; soilBadge = "Soil Reserves: Moderate"; soilVit = "moderate"; }

  const sunIntensity = sun === "danger" ? "high" : sun === "warning" ? "mid" : "low";
  const moistRoot = moist === "danger" ? "dry" : moist === "warning" ? "moderate" : "ideal";

  return [
    {
      key: "sun", title: "Sun & Heat Intensity", subtitle: sunSub, state: sun, badge: sunBadge,
      description: "Strong afternoon sunlight warms the upper leaves; light intensity peaks around midday, driving evapotranspiration demand.",
      stage: <SunStage badge={sunBadge} intensity={sunIntensity as "high" | "mid" | "low"} />,
    },
    {
      key: "moisture", title: "Surface & Root Moisture", subtitle: moistSub, state: moist, badge: moistBadge, belowLabel: moistBelow,
      description: rootH2O < 0.42
        ? "No standing moisture above ground and deep root-zone dampness has dropped low — irrigation needed."
        : "Surface holds light dampness while the deep sub-soil surrounds roots with balanced moisture.",
      stage: <MoistureStage badge={moistBadge} belowLabel={moistBelow} rootHealth={moistRoot as "dry" | "moderate" | "ideal"} />,
    },
    {
      key: "wind", title: "Wind & Canopy Airflow", subtitle: windSub, state: wind, badge: windBadge,
      description: maxWind > 38
        ? "Strong wind gusts are bending stalks and accelerating moisture evaporation from leaves."
        : "Gentle airflow through the canopy keeps the leaf boundary layer refreshed without drying stress.",
      stage: <WindStage badge={windBadge} wind={windKind} />,
    },
    {
      key: "humidity", title: "Air Humidity & Dew", subtitle: humSub, state: hum, badge: humBadge,
      description: rh > 72
        ? "Thick moisture droplets cling to leaves; high risk of fungal spots if warmth persists."
        : rh < 30
          ? "Very dry air stresses leaf tissue and favours spider-mite pressure; monitor closely."
          : "Comfortable humidity keeps the leaf surface balanced between dew and drying.",
      stage: <HumidityStage badge={humBadge} dew={humDew} />,
    },
    {
      key: "soil", title: "Soil Vitality & Nutrients", subtitle: soilSub, state: soil, badge: soilBadge,
      description: dec.tier1.nutrition.level === "HIGH"
        ? `Reserves depleted after a heavy feeder crop (NPK ${dec.features_7.N}/${dec.features_7.P}/${dec.features_7.K}); replenishment required.`
        : "Soil reserves are healthy and biologically active; hold synthetic fertilizer for now.",
      stage: <SoilStage badge={soilBadge} vitality={soilVit as "rich" | "moderate" | "low"} />,
    },
  ];
}

function ParamCardView({ card }: { card: ParamCard }) {
  return (
    <article className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">{card.title}</h3>
          <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">{card.subtitle}</p>
        </div>
        <TrafficLight state={card.state} />
      </div>
      {card.stage}
      <p className="mt-2 text-xs leading-relaxed text-slate-600 dark:text-slate-400">{card.description}</p>
    </article>
  );
}

export function FieldConditions({ data }: { data: RecommendationResponse }) {
  const cards = deriveParams(data);
  return (
    <div className="space-y-4">
      {/* intro */}
      <div className="flex items-end justify-between gap-2">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">Field Conditions</h2>
          <p className="text-xs text-muted-foreground">Visual field status — derived from live satellite & soil data</p>
        </div>
        <span className="hidden rounded-full bg-emerald-50 px-2.5 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 sm:inline">
          {data.target.climate.aez_code} · {data.target.climate.climate_zone}
        </span>
      </div>

      {/* Agro Map card */}
      <article className="rounded-2xl border border-border bg-card p-3 shadow-sm sm:p-4">
        <div className="mb-2 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="relative flex h-2.5 w-2.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-sm font-bold text-slate-900 dark:text-slate-100">
              Agro Map · {data.target.meta.plot_name}
            </span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300">
              <SatIcon className="h-3 w-3" /> Agro Satellite
            </span>
            <span className="inline-flex items-center gap-1 rounded-md border border-border bg-white px-2 py-1 text-[10px] font-semibold text-slate-600 dark:bg-slate-900 dark:text-slate-300">
              <ZoomIn className="h-3 w-3" /> Field Zoom
            </span>
          </div>
        </div>
        <div className="relative h-52 w-full overflow-hidden rounded-xl sm:h-60">
          <FieldMap
            target={{ lat: data.target.meta.lat, lon: data.target.meta.lon, label: data.target.meta.plot_name }}
            twin={{ lat: data.example.meta.lat, lon: data.example.meta.lon, label: data.example.meta.plot_name }}
            distKm={data.matched_example.geo_dist_km}
          />
          <span className="pointer-events-none absolute bottom-2 left-2 z-[5] rounded-md bg-slate-900/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
            🌾 Crop Fields · Zoomed to Field
          </span>
        </div>
        <div className="mt-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <MapPin className="h-3 w-3" />
          Target ({data.target.meta.lat}, {data.target.meta.lon}) · Twin {data.matched_example.city_basin}, {data.matched_example.country}
        </div>
      </article>

      {/* 5 parameter cards */}
      <div className="grid gap-4 sm:grid-cols-2">
        {cards.map((c) => (
          <ParamCardView key={c.key} card={c} />
        ))}
      </div>
    </div>
  );
}
