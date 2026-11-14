<div align="center">

# 🌱 SiriusTa — Guiding Every Harvest

# **[🚀 LIVE DEMO: https://sirius-ta.vercel.app/](https://sirius-ta.vercel.app/)**

</div>

---

An agro-satellite intelligence web app that takes any field coordinate and returns a
visual field report plus a full dual-coordinate agronomic examination — combining
**FAO HWSD / ISRIC SoilGrids** soil chemistry, **NASA POWER** climatology, **SMAP / MODIS**
telemetry, **Open-Meteo** forecast and **NOAA MJO** teleconnection into irrigation,
nutrition and crop-rotation advice.

---

## What it does

Enter a field coordinate (pick a city, use GPS, or type exact lat/lon) and name the
previous harvested crop. The engine:

1. **Static baseline** — resolves soil (clay/sand/silt/pH/NPK) via ISRIC SoilGrids,
   SRTM elevation + slope, and NASA POWER climatology → derives the AEZ code (AEZ01–AEZ10).
2. **Dynamic telemetry** — ingests 45 days of NASA POWER daily data (temp, humidity,
   rain, radiation, wind, root-zone & surface moisture), runs a coupled soil-nitrogen
   mass-balance, fetches NASA MODIS NDVI and a 7-day Open-Meteo forecast.
3. **DSP conditioning** — applies a Savitzky-Golay low-pass filter to the temp, root-H2O
   and nitrogen series.
4. **Decision engine**:
   - **Tier 1** — HIGH/MID/LOW action levels for irrigation, cover crop, nutrition,
     insecticide (each with a concrete action message).
   - **Tier 2** — two 3-season crop-rotation plans (Plan A: soil-restoration;
     Plan B: commercial cash-crop) using a nearest-centroid crop classifier.
   - **Tier 3** — AEZ × live-MJO teleconnection (NOAA OMI phase), rain/temp/RH
     offsets, export-corridor benchmarking, and global plan scoring.
5. **Dual-coordinate examination** — matches the target to the nearest peer agro-zone
   (from `12_ex.csv`), runs the same pipeline on the twin, and produces a normalized
   agronomic-similarity score + delta/parity report.

---

## Tech stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York) + Lucide icons
- **Charts/Map**: Recharts, Leaflet (CDN, no npm dep)
- **Engine**: pure TypeScript (no Python, no native deps) — the RandomForest from the
  original was replaced with a deterministic nearest-centroid softmax classifier

---

## Project structure

```text
src/
  app/
    page.tsx                  # Main UI: header + location drawer + 2-tab dashboard
    layout.tsx                # Root layout (Outfit font, metadata)
    globals.css               # Tailwind + SiriusTa agro theme
    api/
      recommend/route.ts      # POST/GET endpoint → recommendation JSON
  lib/siriusta/
    types.ts                  # Shared TypeScript types
    csv.ts                    # CSV parser + quantile helpers
    data.ts                   # Dataset loader (singleton) + crop classifier
    soil.ts                   # §1A — SoilGrids + NPK/pH derivation
    terrain.ts                # §1B — SRTM elevation + slope
    climate.ts                # §1C — NASA POWER climatology + AEZ derivation
    telemetry.ts              # §2 — 45-day history + MODIS NDVI + forecast + N mass-balance
    dsp.ts                    # §3 — Savitzky-Golay smoothing
    mjo.ts                    # NOAA OMI live MJO phase
    decisions.ts              # §4 — Tier 1 / Tier 2 / Tier 3
    engine.ts                 # Per-coordinate pipeline + matched-zone + comparison
    recommend.ts              # Public entry point
  data/                       # Bundled datasets
    12_ex.csv                 # 12 global agro-zone reference examples
    SiriusTa_AEZXX_MJO_Dataset.csv     # AEZ×MJO crop training data (2200 rows)
    SiriusTa_AEZXX_MJO_90_Matrix.csv   # 90-cell AEZ×MJO teleconnection matrix
  components/siriusta/
    LocationPicker.tsx        # 3-method location input (city / GPS / coords)
    FieldConditions.tsx       # "My Field" tab: agro map + 5 visual parameter cards
    VisualStages.tsx          # 5 animated SVG scenes (sun/moisture/wind/humidity/soil)
    WarningsTips.tsx          # "Warnings & Tips" tab: alert + Tier-1/2/3 + comparison
    FieldMap.tsx              # Leaflet map (target + twin markers)
    primitives.tsx            # Logo, traffic-light, badges, stat tiles
