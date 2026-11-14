"use client";

import { useState, useCallback, useEffect } from "react";
import { ChevronDown, Loader2, Sparkles, Satellite, Github, BookOpen } from "lucide-react";
import { LocationPicker } from "@/components/siriusta/LocationPicker";
import type { RecommendInput } from "@/components/siriusta/LocationPicker";
import { FieldConditions } from "@/components/siriusta/FieldConditions";
import { WarningsTips } from "@/components/siriusta/WarningsTips";
import { SiriusTaLogo } from "@/components/siriusta/primitives";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { RecommendationResponse } from "@/lib/siriusta/types";
import { cn } from "@/lib/utils";

const LOADING_STEPS = [
  "Resolving soil chemistry (ISRIC SoilGrids)…",
  "Fetching SRTM elevation & slope…",
  "Pulling NASA POWER climatology → AEZ code…",
  "Ingesting 45-day SMAP / MODIS telemetry…",
  "Fetching 7-day Open-Meteo forecast…",
  "Reading live NOAA MJO phase…",
  "Running Tier 1 field actions…",
  "Simulating Tier 2 crop rotation plans…",
  "Computing Tier 3 AEZ×MJO teleconnection…",
  "Extracting matched-zone twin & comparing…",
];

function LoadingPanel() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 3200);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-sm">
      <div className="flex items-center gap-3">
        <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
        <div>
          <div className="text-sm font-bold text-slate-900 dark:text-slate-100">Running the SiriusTa engine</div>
          <div className="text-xs text-muted-foreground">Live satellite + soil + MJO data — ~30 seconds.</div>
        </div>
      </div>
      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-secondary">
        <div
          className="h-full rounded-full bg-gradient-to-r from-[#ea580c] via-[#f59e0b] to-[#16a34a] transition-all duration-[3000ms] ease-linear"
          style={{ width: `${((step + 1) / LOADING_STEPS.length) * 100}%` }}
        />
      </div>
      <ul className="mt-3 space-y-1">
        {LOADING_STEPS.map((s, i) => (
          <li
            key={i}
            className={cn(
              "flex items-center gap-2 text-xs transition-opacity",
              i < step ? "text-muted-foreground line-through opacity-50" : i === step ? "font-semibold text-slate-900 dark:text-slate-100" : "text-muted-foreground opacity-40",
            )}
          >
            {i === step ? <Loader2 className="h-3 w-3 animate-spin" /> : i < step ? "✓" : "·"}
            {s}
          </li>
        ))}
      </ul>
    </div>
  );
}

export default function Home() {
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [displayName, setDisplayName] = useState("Nile Delta, Egypt");
  const [activeTab, setActiveTab] = useState("field");

  const handleSubmit = useCallback(async (input: RecommendInput) => {
    setLoading(true);
    setError(null);
    setData(null);
    setDrawerOpen(false);
    try {
      const res = await fetch("/api/recommend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) throw new Error(json.error || `Request failed (HTTP ${res.status})`);
      setData(json as RecommendationResponse);
      setDisplayName(input.name);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  return (
    <div className="flex min-h-screen flex-col bg-slate-100 dark:bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 border-b border-slate-200 bg-white/95 backdrop-blur-md dark:border-slate-800 dark:bg-slate-900/95">
        <div className="mx-auto flex w-full max-w-lg items-center justify-between gap-2 px-4 py-3">
          <div className="flex items-center gap-2">
            <SiriusTaLogo className="h-8 w-11" />
            <div className="leading-tight">
              <div className="text-lg font-extrabold tracking-tight text-emerald-900 dark:text-emerald-200">
                Sirius<span className="bg-gradient-to-br from-[#ea580c] to-[#f59e0b] bg-clip-text text-transparent">Ta</span>
              </div>
              <div className="text-[10px] font-medium text-slate-500 dark:text-slate-400">Guiding Every Harvest</div>
            </div>
          </div>
          <button
            onClick={() => setDrawerOpen((v) => !v)}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-800 transition-colors hover:bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
            aria-expanded={drawerOpen}
          >
            <span className="text-red-500">📍</span>
            <span className="max-w-[140px] truncate">{displayName}</span>
            <ChevronDown className={cn("h-3.5 w-3.5 transition-transform", drawerOpen && "rotate-180")} />
          </button>
        </div>
      </header>

      {/* Location drawer */}
      {drawerOpen ? (
        <div className="z-40 border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
          <div className="mx-auto w-full max-w-lg px-4 py-3">
            <LocationPicker onSubmit={handleSubmit} loading={loading} onDisplayName={setDisplayName} />
          </div>
        </div>
      ) : null}

      {/* Main */}
      <main className="mx-auto w-full max-w-lg flex-1 px-4 py-4">
        {loading ? (
          <LoadingPanel />
        ) : error ? (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-5 dark:border-red-900 dark:bg-red-950">
            <div className="text-sm font-bold text-red-700 dark:text-red-300">Engine error</div>
            <p className="mt-1 text-sm text-slate-700 dark:text-slate-300">{error}</p>
            <p className="mt-2 text-xs text-muted-foreground">Try again — external feeds may be briefly unavailable.</p>
          </div>
        ) : data ? (
          <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="field">
                <span className="mr-1">🌱</span> My Field
              </TabsTrigger>
              <TabsTrigger value="advice">
                <span className="mr-1">⚠️</span> Warnings &amp; Tips
              </TabsTrigger>
            </TabsList>
            <TabsContent value="field" className="mt-4">
              <FieldConditions data={data} />
            </TabsContent>
            <TabsContent value="advice" className="mt-4">
              <WarningsTips data={data} />
            </TabsContent>
          </Tabs>
        ) : (
          <div className="flex min-h-[60vh] flex-col items-center justify-center rounded-2xl border border-dashed border-slate-300 bg-white/60 p-8 text-center dark:border-slate-700 dark:bg-slate-900/40">
            <SiriusTaLogo className="h-16 w-24" />
            <h1 className="mt-4 text-lg font-bold text-slate-900 dark:text-slate-100">SiriusTa — Guiding Every Harvest</h1>
            <p className="mt-1 max-w-xs text-sm text-muted-foreground">
              Tap the location pill above to choose your field, then run the agro-satellite engine for a visual field report.
            </p>
            <button
              onClick={() => setDrawerOpen(true)}
              className="mt-4 inline-flex items-center gap-1.5 rounded-full bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-emerald-700"
            >
              <Sparkles className="h-4 w-4" />
              Choose field location
            </button>
            <div className="mt-6 flex items-center gap-2 text-[10px] text-muted-foreground">
              <Satellite className="h-3.5 w-3.5" />
              NASA POWER · SoilGrids · MODIS · Open-Meteo · NOAA MJO
            </div>
          </div>
        )}
      </main>

      {/* Sticky footer */}
      <footer className="mt-auto border-t border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex w-full max-w-lg flex-col items-center justify-between gap-1.5 px-4 py-3 text-[11px] text-muted-foreground sm:flex-row">
          <div className="flex items-center gap-1.5">
            <SiriusTaLogo className="h-4 w-6" />
            <span><span className="font-semibold text-slate-700 dark:text-slate-300">SiriusTa</span> — ported engine · live API</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><BookOpen className="h-3 w-3" />No login — public</span>
            <span className="flex items-center gap-1"><Github className="h-3 w-3" />FAO · NASA · ISRIC · NOAA</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
