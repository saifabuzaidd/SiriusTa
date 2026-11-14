"use client";

import {
  Droplets, Sprout, FlaskConical, Bug, AlertTriangle, CheckCircle2, Info,
  Route, Waves, ArrowRightLeft, ArrowRight,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { CropChip } from "./primitives";
import type { RecommendationResponse } from "@/lib/siriusta/types";
import { cn } from "@/lib/utils";

const STATE_STYLES = {
  danger: { ring: "border-red-200 bg-red-50 dark:border-red-900 dark:bg-red-950", text: "text-red-700 dark:text-red-300", icon: AlertTriangle },
  warning: { ring: "border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950", text: "text-amber-700 dark:text-amber-300", icon: Info },
  good: { ring: "border-emerald-200 bg-emerald-50 dark:border-emerald-900 dark:bg-emerald-950", text: "text-emerald-700 dark:text-emerald-300", icon: CheckCircle2 },
};

function levelToState(level: string): "danger" | "warning" | "good" {
  return level === "HIGH" ? "danger" : level === "MID" ? "warning" : "good";
}

function ActionCard({
  icon, title, item, accent,
}: {
  icon: React.ReactNode;
  title: string;
  item: { level: string; action: string };
  accent: string;
}) {
  const state = levelToState(item.level);
  const st = STATE_STYLES[state];
  const Icon = st.icon;
  return (
    <Card className={cn("border", st.ring)}>
      <CardHeader className="flex flex-row items-center justify-between gap-2 space-y-0 pb-2">
        <CardTitle className="flex items-center gap-2 text-sm font-bold">
          <span style={{ color: accent }}>{icon}</span>
          {title}
        </CardTitle>
        <div className="flex items-center gap-1.5">
          <Icon className={cn("h-4 w-4", st.text)} />
          <span className={cn("text-xs font-bold", st.text)}>{item.level}</span>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs leading-relaxed text-slate-700 dark:text-slate-300">{item.action}</p>
      </CardContent>
    </Card>
  );
}

export function WarningsTips({ data }: { data: RecommendationResponse }) {
  const t = data.target.decision;
  const alertState = t.alert_level.includes("HIGH") ? "danger" : t.alert_level.includes("MODERATE") ? "warning" : "good";
  const ast = STATE_STYLES[alertState];
  const AlertIcon = ast.icon;

  return (
    <div className="space-y-4">
      {/* Alert banner */}
      <div className={cn("flex items-center gap-3 rounded-2xl border p-4", ast.ring)}>
        <AlertIcon className={cn("h-6 w-6 shrink-0", ast.text)} />
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("text-base font-bold", ast.text)}>{t.alert_level}</span>
            <Badge variant="outline" className="text-[10px]">{data.target.climate.aez_code}</Badge>
            <Badge variant="outline" className="text-[10px]">{t.tier3.mjo_code} · amp {t.tier3.mjo_amplitude}</Badge>
          </div>
          <p className="mt-0.5 text-xs text-slate-700 dark:text-slate-300">
            {data.target.meta.plot_name} — previous crop: <span className="font-semibold capitalize">{t.previous_crop}</span>
          </p>
        </div>
      </div>

      {/* Tier 1 actions */}
      <div>
        <h2 className="mb-2 text-sm font-bold text-slate-900 dark:text-slate-100">Tier 1 — Field actions</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <ActionCard icon={<Droplets className="h-4 w-4" />} title="Irrigation" item={t.tier1.irrigation} accent="#1f618d" />
          <ActionCard icon={<Sprout className="h-4 w-4" />} title="Cover crop & protection" item={t.tier1.cover_crop} accent="#16a34a" />
          <ActionCard icon={<FlaskConical className="h-4 w-4" />} title="Nutrition replenishment" item={t.tier1.nutrition} accent="#5b2c6f" />
          <ActionCard icon={<Bug className="h-4 w-4" />} title="Insecticide & bio-spray" item={t.tier1.insecticide} accent="#ea580c" />
        </div>
      </div>

      {/* Tier 2 rotation */}
      <div>
        <h2 className="mb-2 flex items-center gap-1.5 text-sm font-bold text-slate-900 dark:text-slate-100">
          <Route className="h-4 w-4 text-emerald-600" /> Tier 2 — Crop rotation plans
        </h2>
        <div className="grid gap-3 sm:grid-cols-2">
          {[t.tier2.plan_a, t.tier2.plan_b].map((plan, i) => (
            <Card key={i}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between gap-2">
                  <CardTitle className="text-xs font-bold">{plan.title}</CardTitle>
                  <Badge variant="secondary" className="font-mono text-[10px]">Global {i === 0 ? t.tier3.plan_a_global.global_score : t.tier3.plan_b_global.global_score}</Badge>
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  {plan.sequence.map((c, j) => (
                    <span key={j} className="flex items-center gap-1">
                      <CropChip crop={c} />
                      {j < plan.sequence.length - 1 ? <ArrowRight className="h-3 w-3 text-muted-foreground" /> : null}
                    </span>
                  ))}
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">Net soil-N delta (3 seasons)</span>
                  <span className={cn("font-mono font-bold", plan.net_N_delta >= 0 ? "text-emerald-600" : "text-red-600")}>
                    {plan.net_N_delta >= 0 ? "+" : ""}{plan.net_N_delta}
                  </span>
                </div>
                <div className="mt-1 flex items-center justify-between text-[11px]">
                  <span className="text-muted-foreground">WUE / NUE</span>
                  <span className="font-mono text-muted-foreground">
                    {(i === 0 ? t.tier3.plan_a_global.wue_pct : t.tier3.plan_b_global.wue_pct)}% / {(i === 0 ? t.tier3.plan_a_global.nue_pct : t.tier3.plan_b_global.nue_pct)}%
                  </span>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      {/* Tier 3 MJO + twin comparison */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-bold">
              <Waves className="h-4 w-4 text-sky-600" /> Tier 3 — AEZ × MJO teleconnection
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-[11px]">
            <Row label="AEZ × MJO key" value={t.tier3.aez_mjo_key} />
            <Row label="Convective region" value={t.tier3.convective_region} />
            <Row label="Irrigation modifier" value={t.tier3.global_irrigation_modifier} />
            <Row label="Export corridor" value={t.tier3.export_corridor} />
            <Separator className="my-1.5" />
            <div className="flex flex-wrap items-center gap-1">
              <span className="text-muted-foreground">MJO-adjusted crops:</span>
              {t.tier3.mjo_adjusted_crops.map((c) => (
                <CropChip key={c.crop} crop={c.crop} prob={c.pct} />
              ))}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-1.5 text-xs font-bold">
              <ArrowRightLeft className="h-4 w-4 text-emerald-600" /> Twin comparison
            </CardTitle>
          </CardHeader>
          <CardContent className="pt-0 space-y-1 text-[11px]">
            <div className="mb-1.5">
              <div className="mb-0.5 flex justify-between">
                <span className="text-muted-foreground">Agronomic similarity</span>
                <span className="font-mono font-bold text-slate-900 dark:text-slate-100">{data.examination.agronomic_similarity_pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-secondary">
                <div className="h-full rounded-full" style={{ width: `${data.examination.agronomic_similarity_pct}%`, background: "linear-gradient(90deg,#ea580c,#f59e0b,#16a34a)" }} />
              </div>
            </div>
            <Row label="Matched twin" value={`${data.matched_example.city_basin}, ${data.matched_example.country}`} />
            <Row label="Distance" value={`${data.matched_example.geo_dist_km} km`} />
            <Row label="AEZ match" value={data.examination.aez_match} />
            <Row label="Irrigation parity" value={data.examination.irrigation_parity} />
            <Row label="Plan A parity" value={data.examination.plan_a_parity} />
          </CardContent>
        </Card>
      </div>

      {/* warnings */}
      {data.warnings.length > 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 dark:border-amber-900 dark:bg-amber-950">
          <div className="mb-1 flex items-center gap-2 text-xs font-semibold text-amber-800 dark:text-amber-300">
            <AlertTriangle className="h-3.5 w-3.5" />Engine notices ({data.warnings.length})
          </div>
          <ul className="ml-5 list-disc space-y-0.5 text-[11px] text-amber-700 dark:text-amber-400">
            {data.warnings.map((w, i) => <li key={i}>{w}</li>)}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <span className="shrink-0 text-muted-foreground">{label}</span>
      <span className="text-right font-medium text-slate-700 dark:text-slate-300">{value}</span>
    </div>
  );
}
