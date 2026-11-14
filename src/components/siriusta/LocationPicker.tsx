"use client";

import { useState, useEffect } from "react";
import { MapPin, Navigation, Crosshair, Sprout, Sparkles, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

export interface RecommendInput {
  lat: number;
  lon: number;
  prevCrop: string;
  name: string;
}

interface CityPreset {
  name: string;
  lat: number;
  lon: number;
  tag: string;
}

// Diverse presets spanning arid, semi-arid, tropical, temperate & equatorial AEZs.
const CITY_PRESETS: CityPreset[] = [
  { name: "Nile Delta, Egypt", lat: 30.22, lon: 31.375, tag: "Hot Arid Alluvial" },
  { name: "Multan, Pakistan", lat: 30.1575, lon: 71.5249, tag: "Indus Plain" },
  { name: "Deir Alla, Jordan", lat: 32.195, lon: 35.621, tag: "Semi-Arid Valley" },
  { name: "Khartoum, Sudan", lat: 15.5, lon: 32.55, tag: "Arid Savanna" },
  { name: "Nakuru, Kenya", lat: -0.3, lon: 36.08, tag: "Tropical Highland" },
  { name: "Sinop, Brazil", lat: -11.85, lon: -55.5, tag: "Tropical Wet-Dry" },
  { name: "São Paulo, Brazil", lat: -23.55, lon: -46.63, tag: "Humid Subtropical" },
  { name: "Jakarta, Indonesia", lat: -6.2, lon: 106.84, tag: "Equatorial Rainforest" },
  { name: "Fresno, CA, USA", lat: 36.73, lon: -119.79, tag: "Mediterranean" },
  { name: "Des Moines, IA, USA", lat: 41.58, lon: -93.62, tag: "Temperate Continental" },
];

const COMMON_CROPS = [
  "none", "maize", "cotton", "rice", "wheat", "watermelon", "muskmelon",
  "lentil", "mungbean", "chickpea", "banana", "coffee", "jute", "sugarcane",
];

export function LocationPicker({
  onSubmit,
  loading,
  onDisplayName,
}: {
  onSubmit: (input: RecommendInput) => void;
  loading: boolean;
  onDisplayName?: (name: string) => void;
}) {
  const [cityKey, setCityKey] = useState(CITY_PRESETS[0].name);
  const [lat, setLat] = useState(String(CITY_PRESETS[0].lat));
  const [lon, setLon] = useState(String(CITY_PRESETS[0].lon));
  const [name, setName] = useState(CITY_PRESETS[0].name);
  const [prevCrop, setPrevCrop] = useState("maize");
  const [gpsBusy, setGpsBusy] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  useEffect(() => {
    onDisplayName?.(name);
  }, [name, onDisplayName]);

  const applyPreset = (presetName: string) => {
    const p = CITY_PRESETS.find((c) => c.name === presetName);
    if (!p) return;
    setCityKey(p.name);
    setLat(String(p.lat));
    setLon(String(p.lon));
    setName(p.name);
    setFeedback(`Loaded ${p.name} (${p.tag}).`);
  };

  const detectGps = () => {
    if (!navigator.geolocation) {
      setFeedback("Geolocation not supported by this browser.");
      return;
    }
    setGpsBusy(true);
    setFeedback("Detecting your field location via GPS…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const la = pos.coords.latitude;
        const lo = pos.coords.longitude;
        setLat(la.toFixed(4));
        setLon(lo.toFixed(4));
        const gpsName = `GPS Field (${la.toFixed(2)}, ${lo.toFixed(2)})`;
        setName(gpsName);
        setCityKey("__custom");
        setFeedback("GPS coordinates captured. Click Generate to run the engine.");
        setGpsBusy(false);
      },
      (err) => {
        setFeedback(`GPS unavailable: ${err.message}. Enter coordinates manually instead.`);
        setGpsBusy(false);
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };

  const assignCoords = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      setFeedback("Please enter valid numeric latitude and longitude.");
      return;
    }
    if (!(-90 <= la && la <= 90 && -180 <= lo && lo <= 180)) {
      setFeedback("Coordinates out of bounds (-90..90, -180..180).");
      return;
    }
    setCityKey("__custom");
    setName(`Field (${la}, ${lo})`);
    setFeedback(`Coordinates assigned: (${la}, ${lo}).`);
  };

  const submit = () => {
    const la = Number(lat);
    const lo = Number(lon);
    if (!Number.isFinite(la) || !Number.isFinite(lo)) {
      setFeedback("Invalid coordinates.");
      return;
    }
    onSubmit({ lat: la, lon: lo, prevCrop: prevCrop.trim().toLowerCase() || "none", name: name.trim() || `Target Plot (${la}, ${lo})` });
  };

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5">
      <div className="mb-4 flex items-center gap-2">
        <MapPin className="h-5 w-5 text-primary" />
        <h2 className="text-sm font-bold text-foreground">Choose your field location</h2>
      </div>

      {/* Method 1: city presets */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">1. Pick a reference agro-zone</Label>
        <Select value={cityKey} onValueChange={applyPreset}>
          <SelectTrigger className="w-full">
            <SelectValue placeholder="Select a city…" />
          </SelectTrigger>
          <SelectContent>
            {CITY_PRESETS.map((c) => (
              <SelectItem key={c.name} value={c.name}>
                <span className="font-medium">{c.name}</span>
                <span className="ml-2 text-xs text-muted-foreground">{c.tag}</span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Method 2: GPS */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">2. Auto-detect via GPS</Label>
        <Button variant="outline" className="w-full justify-start" onClick={detectGps} disabled={gpsBusy || loading}>
          {gpsBusy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Navigation className="mr-2 h-4 w-4" />}
          Use my current location
        </Button>
      </div>

      <div className="my-3 flex items-center gap-3">
        <div className="h-px flex-1 bg-border" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">or</span>
        <div className="h-px flex-1 bg-border" />
      </div>

      {/* Method 3: exact coords */}
      <div className="space-y-1.5">
        <Label className="text-xs font-semibold text-muted-foreground">3. Enter exact coordinates</Label>
        <div className="grid grid-cols-2 gap-2">
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="Latitude"
            value={lat}
            onChange={(e) => setLat(e.target.value)}
            aria-label="Latitude"
          />
          <Input
            type="number"
            step="any"
            inputMode="decimal"
            placeholder="Longitude"
            value={lon}
            onChange={(e) => setLon(e.target.value)}
            aria-label="Longitude"
          />
        </div>
        <Button variant="secondary" size="sm" className="w-full" onClick={assignCoords} disabled={loading}>
          <Crosshair className="mr-2 h-4 w-4" />
          Assign coordinates
        </Button>
      </div>

      {/* Previous crop */}
      <div className="mt-4 space-y-1.5">
        <Label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
          <Sprout className="h-3.5 w-3.5" />
          Previous harvested crop
        </Label>
        <Input
          list="crop-options"
          value={prevCrop}
          onChange={(e) => setPrevCrop(e.target.value)}
          placeholder="e.g. maize, cotton, none"
        />
        <datalist id="crop-options">
          {COMMON_CROPS.map((c) => (
            <option key={c} value={c} />
          ))}
        </datalist>
      </div>

      {feedback ? (
        <p className={cn("mt-3 text-xs", feedback.includes("unavailable") || feedback.includes("Invalid") || feedback.includes("out of") ? "text-destructive" : "text-muted-foreground")}>
          {feedback}
        </p>
      ) : null}

      <Button className="mt-4 w-full" size="lg" onClick={submit} disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            Running engine…
          </>
        ) : (
          <>
            <Sparkles className="mr-2 h-4 w-4" />
            Generate Recommendation
          </>
        )}
      </Button>
    </div>
  );
}
