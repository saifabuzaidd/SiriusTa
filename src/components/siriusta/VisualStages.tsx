"use client";

import { cn } from "@/lib/utils";

// Each visual stage is a rounded scene with a gradient background, an SVG
// illustration, and a dark status badge overlay (top-left). Some stages also
// show a secondary badge. They mirror the SiriusTa index.html param cards.

function Badge({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "absolute left-2 top-2 z-10 rounded-md bg-slate-900/80 px-2 py-1 text-[10px] font-bold leading-tight text-white backdrop-blur-sm",
        className,
      )}
    >
      {children}
    </span>
  );
}

// 1. Sun & Heat Intensity — glowing sun orb on a warm yellow gradient.
export function SunStage({ badge, intensity }: { badge: string; intensity: "high" | "mid" | "low" }) {
  const glow = intensity === "high" ? "#f97316" : intensity === "mid" ? "#f59e0b" : "#fde047";
  const core = intensity === "high" ? "#ea580c" : intensity === "mid" ? "#f59e0b" : "#facc15";
  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl bg-gradient-to-b from-yellow-100 via-amber-200 to-amber-300">
      <Badge>{badge}</Badge>
      <div className="absolute inset-0 flex items-center justify-center">
        {/* glow ring */}
        <div
          className="absolute h-24 w-24 rounded-full opacity-60 blur-xl"
          style={{ background: `radial-gradient(circle, ${glow}, transparent 70%)` }}
        />
        <svg width="120" height="120" viewBox="0 0 120 120" className="relative">
          {/* rays */}
          <g stroke={core} strokeWidth="4" strokeLinecap="round" opacity="0.85">
            {Array.from({ length: 12 }).map((_, i) => {
              const a = (i * 30 * Math.PI) / 180;
              const x1 = 60 + Math.cos(a) * 38;
              const y1 = 60 + Math.sin(a) * 38;
              const x2 = 60 + Math.cos(a) * 50;
              const y2 = 60 + Math.sin(a) * 50;
              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} />;
            })}
          </g>
          <circle cx="60" cy="60" r="26" fill="#fef9c3" />
          <circle cx="60" cy="60" r="22" fill={core} />
        </svg>
      </div>
      {/* heat waves */}
      <svg className="absolute bottom-1 left-0 w-full opacity-50" width="320" height="22" viewBox="0 0 320 22" fill="none">
        <path d="M20 18 Q28 8 20 -2 M70 18 Q78 8 70 -2 M120 18 Q128 8 120 -2 M170 18 Q178 8 170 -2 M220 18 Q228 8 220 -2 M270 18 Q278 8 270 -2" stroke="#fef08a" strokeWidth="3" strokeLinecap="round" />
      </svg>
    </div>
  );
}

// 2. Surface & Root Moisture — sky, surface film, soil layers + plants with roots.
export function MoistureStage({
  badge, belowLabel, rootHealth,
}: { badge: string; belowLabel: string; rootHealth: "dry" | "moderate" | "ideal" }) {
  const deepSoil = rootHealth === "dry" ? "#92644a" : rootHealth === "moderate" ? "#3b5a78" : "#1e3a5f";
  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl">
      {/* sky */}
      <div className="absolute inset-x-0 top-0 h-[45%] bg-gradient-to-b from-sky-100 to-sky-200" />
      {/* surface water film */}
      <div className="absolute inset-x-0 top-[43%] h-[6%] bg-teal-300/70" />
      {/* grass strip */}
      <div className="absolute inset-x-0 top-[47%] h-[5%] bg-green-500/80" />
      {/* topsoil */}
      <div className="absolute inset-x-0 top-[52%] h-[20%] bg-amber-800/80" />
      {/* deep soil */}
      <div className="absolute inset-x-0 top-[72%] bottom-0" style={{ backgroundColor: deepSoil }} />
      {/* dashed separator */}
      <div className="absolute inset-x-0 top-[72%] border-t-2 border-dashed border-white/70" />
      <Badge>{badge}</Badge>
      <span className="absolute right-2 bottom-2 z-10 rounded-md bg-slate-900/80 px-2 py-1 text-[10px] font-bold text-white backdrop-blur-sm">
        {belowLabel}
      </span>
      {/* plants */}
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 180" preserveAspectRatio="none">
        {[80, 240].map((cx) => (
          <g key={cx}>
            {/* stem */}
            <path d={`M${cx} 92 L${cx} 64`} stroke="#16a34a" strokeWidth="3" strokeLinecap="round" />
            {/* sprout leaves */}
            <path d={`M${cx} 70 Q${cx - 12} 60 ${cx - 16} 50`} stroke="#16a34a" strokeWidth="3" strokeLinecap="round" fill="none" />
            <path d={`M${cx} 70 Q${cx + 12} 60 ${cx + 16} 50`} stroke="#16a34a" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* roots */}
            <path d={`M${cx} 92 L${cx} 160`} stroke="#fbbf24" strokeWidth="2.5" strokeLinecap="round" fill="none" />
            <path d={`M${cx} 110 L${cx - 16} 130`} stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none" />
            <path d={`M${cx} 128 L${cx + 18} 148`} stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none" />
          </g>
        ))}
      </svg>
    </div>
  );
}

// 3. Wind & Canopy Airflow — leaning stalks + blue wind streaks.
export function WindStage({ badge, wind }: { badge: string; wind: "strong" | "moderate" | "calm" }) {
  const lean = wind === "strong" ? 28 : wind === "moderate" ? 14 : 4;
  const streakOpacity = wind === "strong" ? 0.85 : wind === "moderate" ? 0.5 : 0.2;
  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl bg-gradient-to-b from-sky-100 via-sky-50 to-emerald-100">
      <Badge>{badge}</Badge>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 180" preserveAspectRatio="none">
        {/* wind streaks */}
        <g stroke="#3b82f6" strokeWidth="3" strokeLinecap="round" opacity={streakOpacity}>
          <line x1="10" y1="40" x2="120" y2="40" />
          <line x1="40" y1="70" x2="180" y2="70" />
          <line x1="20" y1="100" x2="140" y2="100" />
          <line x1="60" y1="130" x2="200" y2="130" />
        </g>
        {/* stalks leaning right */}
        {[60, 130, 200, 260].map((cx) => (
          <g key={cx}>
            <path d={`M${cx} 150 Q${cx + lean / 2} 100 ${cx + lean} 56`} stroke="#16a34a" strokeWidth="3" strokeLinecap="round" fill="none" />
            {/* seed head */}
            <circle cx={cx + lean} cy="52" r="5" fill="#f59e0b" />
            {/* leaves */}
            <path d={`M${cx + lean * 0.6} 90 Q${cx + lean * 0.6 + 14} 82 ${cx + lean * 0.6 + 18} 72`} stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" fill="none" />
          </g>
        ))}
      </svg>
    </div>
  );
}

// 4. Air Humidity & Dew — slate→mint gradient + leaf with water droplets.
export function HumidityStage({ badge, dew }: { badge: string; dew: "heavy" | "moderate" | "dry" }) {
  const dropOpacity = dew === "heavy" ? 0.95 : dew === "moderate" ? 0.6 : 0.2;
  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl bg-gradient-to-b from-slate-400 via-slate-300 to-emerald-100">
      <Badge>{badge}</Badge>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 180" preserveAspectRatio="none">
        {/* leaf */}
        <g transform="translate(160 90) rotate(-30)">
          <path d="M0 0 Q40 -34 70 0 Q40 34 0 0 Z" fill="#15803d" stroke="#14532d" strokeWidth="1.5" />
          <path d="M0 0 L70 0" stroke="#bbf7d0" strokeWidth="1.5" />
          <path d="M16 -4 L26 -14 M30 -4 L42 -10 M44 -2 L54 -6" stroke="#bbf7d0" strokeWidth="1" />
        </g>
        {/* droplets */}
        <g fill="#3b82f6" stroke="#dbeafe" strokeWidth="1" opacity={dropOpacity}>
          <path d="M120 60 q-7 12 0 18 q7 -6 0 -18 Z" />
          <path d="M200 70 q-6 10 0 15 q6 -5 0 -15 Z" />
          <path d="M150 110 q-5 8 0 12 q5 -4 0 -12 Z" />
          <path d="M210 120 q-4 7 0 10 q4 -3 0 -10 Z" />
        </g>
      </svg>
    </div>
  );
}

// 5. Soil Vitality & Nutrients — lime top + brown soil + sprout.
export function SoilStage({ badge, vitality }: { badge: string; vitality: "rich" | "moderate" | "low" }) {
  const soilColor = vitality === "rich" ? "#5d4037" : vitality === "moderate" ? "#6b5240" : "#7c6a55";
  return (
    <div className="relative h-44 w-full overflow-hidden rounded-xl">
      <div className="absolute inset-x-0 top-0 h-[35%] bg-gradient-to-b from-lime-200 to-lime-300" />
      <div className="absolute inset-x-0 top-[35%] bottom-0" style={{ backgroundColor: soilColor }} />
      {/* texture flecks */}
      <div className="absolute inset-x-0 top-[35%] bottom-0 opacity-30" style={{ backgroundImage: "radial-gradient(circle, #4a3328 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
      <Badge>{badge}</Badge>
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 320 180" preserveAspectRatio="none">
        {/* sprout */}
        <g transform="translate(160 92)">
          <path d="M0 0 L0 -50" stroke="#fef3c7" strokeWidth="3" strokeLinecap="round" />
          <path d="M0 -30 Q-16 -40 -22 -50" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M0 -38 Q16 -46 22 -54" stroke="#16a34a" strokeWidth="3" strokeLinecap="round" fill="none" />
          <path d="M0 -50 Q-8 -56 -12 -62 Q-2 -58 0 -50" fill="#16a34a" />
          <path d="M0 -50 Q8 -56 12 -62 Q2 -58 0 -50" fill="#16a34a" />
          {/* roots */}
          <path d="M0 0 L0 40" stroke="#fbbf24" strokeWidth="2" strokeLinecap="round" fill="none" />
          <path d="M0 12 L-12 24" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" fill="none" />
          <path d="M0 22 L12 32" stroke="#fbbf24" strokeWidth="1.5" strokeLinecap="round" fill="none" />
        </g>
      </svg>
    </div>
  );
}
