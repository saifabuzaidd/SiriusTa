# SiriusTa — Guiding Every Harvest

An agro-satellite intelligence web app that takes any field coordinate and returns a
visual field report plus a full dual-coordinate agronomic examination — combining
**FAO HWSD / ISRIC SoilGrids** soil chemistry, **NASA POWER** climatology, **SMAP / MODIS**
telemetry, **Open-Meteo** forecast and **NOAA MJO** teleconnection into irrigation,
nutrition and crop-rotation advice.

This is a faithful **Next.js 16 + TypeScript** port of the original `testz.py` CLI engine
(from [`hero1234532/dfg`](https://github.com/hero1234532/dfg)), as a live web app
with a Nasa Sources API and an interactive dashboard.

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

```
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
```

---

## Getting started

### Prerequisites

- Node.js 18+ or [Bun](https://bun.sh)
- An internet connection (the engine calls live public APIs: NASA POWER, ISRIC
  SoilGrids, OpenTopoData, Open-Meteo, NOAA PSL, ORNL MODIS)

### Install & run

```bash
bun install        # or npm install
bun run dev        # starts on http://localhost:3000
```

Open `http://localhost:3000`, tap the location pill, choose a field, and click
**Generate Recommendation**. The first run takes ~30–40 s (live satellite data).

### API

The engine is also callable directly:

```bash
# GET
curl "http://localhost:3000/api/recommend?lat=30.22&lon=31.375&prevCrop=maize"

# POST
curl -X POST http://localhost:3000/api/recommend \
  -H "Content-Type: application/json" \
  -d '{"lat":30.22,"lon":31.375,"prevCrop":"maize","name":"Nile Delta"}'
```

Returns the full dual-coordinate recommendation JSON (target + matched twin +
examination summary + warnings). No authentication required.

---

## Data sources

All data is fetched live from public, free APIs:

| Layer | Source |
|---|---|
| Soil (clay/sand/silt/N/pH/SOC) | ISRIC SoilGrids v2 (`rest.isric.org`) |
| Elevation & slope | OpenTopoData SRTM 30 m |
| Climatology (AEZ) | NASA POWER Agroclimatology |
| Daily telemetry (45 d) | NASA POWER daily (T2M, RH2M, PRECTOTCORR, SW_DWN, WS2M, GWETROOT/TOP) |
| Vegetation (NDVI) | NASA MODIS MOD13Q1 (ORNL REST) |
| 7-day forecast | Open-Meteo |
| MJO phase | NOAA PSL OMI index |

If any feed is briefly unreachable, the engine falls back to a deterministic
climate-anchored estimate so the pipeline always returns a complete result.

---

## Notes on the port from `testz.py`

- The sklearn `RandomForestClassifier` was replaced with a **nearest-centroid softmax
  classifier** (range-normalized features, exponential kernel). Same multipliers and
  selection logic as the original → comparable crop sequences, fully deterministic.
- `scipy.signal.savgol_filter` is reproduced with hardcoded quadratic SG kernels
  (window 5/7/9) and reflect-padded edges.
- The original MJO parser had an off-by-one column index that always fell back to
  `MJO-P0`; this port parses the OMI file correctly so the **live** phase flows through
  (still `P0` when amplitude < 1.0, which is the common weak-MJO case).
- The local `HWSD2.bil` raster used by the Python script is not bundled (14 MB binary);
  soil is resolved via the SoilGrids API instead, with a loam fallback.

---

## License

Original `testz.py` logic © its author. This port is provided as-is for evaluation.
