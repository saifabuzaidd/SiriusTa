"use client";

import { cn } from "@/lib/utils";
import type { Level } from "@/lib/siriusta/types";

// SiriusTa star+orbit logo (inline SVG, no external asset needed).
export function SiriusTaLogo({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 120 80"
      className={className}
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="SiriusTa logo"
    >
      <defs>
        <linearGradient id="gOrbit" x1="12" y1="62" x2="108" y2="16" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#15803d" />
          <stop offset="55%" stopColor="#22c55e" />
          <stop offset="100%" stopColor="#84cc16" />
        </linearGradient>
        <linearGradient id="gStar" x1="26" y1="44" x2="78" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#ea580c" />
          <stop offset="50%" stopColor="#f97316" />
          <stop offset="100%" stopColor="#facc15" />
        </linearGradient>
      </defs>
      <path d="M 56 24 C 74 17, 89 17, 94 23" stroke="url(#gOrbit)" strokeWidth="4.5" strokeLinecap="round" />
      <path d="M 38 32 C 16 44, 10 58, 22 63 C 38 69, 82 52, 93 29" stroke="url(#gOrbit)" strokeWidth="5.5" strokeLinecap="round" />
      <path d="M 92 29 C 91 17, 101 11, 113 11 C 113 23, 106 32, 92 29 Z" fill="url(#gOrbit)" />
      <path d="M 52 9 Q 55 37 81 39 Q 55 41 52 69 Q 49 41 23 39 Q 49 37 52 9 Z" fill="url(#gStar)" stroke="#7c2d12" strokeWidth="1" />
      <path d="M 52 24 Q 53.5 38 66 39 Q 53.5 40 52 54 Q 50.5 40 38 39 Q 50.5 38 52 24 Z" fill="#fefce8" />
    </svg>
  );
}

// 3-lens traffic light (red/yellow/green) reflecting a HIGH/MID/LOW level.
export function TrafficLight({ level, className }: { level: Level; className?: string }) {
  const on = level === "HIGH" ? 0 : level === "MID" ? 1 : 2;
  return (
    <div className={cn("flex gap-1.5", className)} aria-label={`Status: ${level}`}>
      {["#dc2626", "#f59e0b", "#16a34a"].map((c, i) => (
        <span
          key={i}
          className="h-2.5 w-2.5 rounded-full transition-opacity"
          style={{ backgroundColor: c, opacity: i === on ? 1 : 0.22, boxShadow: i === on ? `0 0 6px ${c}` : "none" }}
        />
      ))}
    </div>
  );
}

const LEVEL_STYLES: Record<Level, string> = {
  HIGH: "bg-red-100 text-red-700 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900",
  MID: "bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  LOW: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900",
};

export function LevelBadge({ level, className }: { level: Level | string; className?: string }) {
  const key = (level as Level) in LEVEL_STYLES ? (level as Level) : "LOW";
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold tracking-wide",
        LEVEL_STYLES[key],
        className,
      )}
    >
      {level}
    </span>
  );
}

export function StatTile({
  label,
  value,
  unit,
  hint,
  className,
}: {
  label: string;
  value: string | number | null;
  unit?: string;
  hint?: string;
  className?: string;
}) {
  return (
    <div className={cn("rounded-lg border border-border bg-card p-3", className)}>
      <div className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5 font-mono text-base font-semibold text-foreground">
        {value === null || value === undefined ? "—" : value}
        {unit ? <span className="ml-0.5 text-xs font-normal text-muted-foreground">{unit}</span> : null}
      </div>
      {hint ? <div className="mt-0.5 truncate text-[10px] text-muted-foreground" title={hint}>{hint}</div> : null}
    </div>
  );
}

export function SectionHeading({
  index,
  title,
  subtitle,
  icon,
}: {
  index: string;
  title: string;
  subtitle?: string;
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-primary/10 font-mono text-sm font-bold text-primary">
        {index}
      </div>
      <div className="min-w-0">
        <h3 className="flex items-center gap-2 text-base font-bold text-foreground">
          {icon}
          {title}
        </h3>
        {subtitle ? <p className="text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export function CropChip({ crop, prob }: { crop: string; prob?: number }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 text-xs font-medium capitalize text-secondary-foreground">
      {crop.replace(/_/g, " ")}
      {prob !== undefined ? <span className="font-mono text-[10px] text-muted-foreground">{prob.toFixed(1)}%</span> : null}
    </span>
  );
}
