// Live MJO (Madden-Julian Oscillation) phase fetcher.
// Source: NOAA PSL OMI index (https://psl.noaa.gov/mjo/mjoindex/omi.1x.txt)
// Format: "year month day pc1 pc2 amplitude" (6 whitespace-separated tokens).
// Returns MJO-P0 when amplitude < 1.0 (weak/inactive), else MJO-P1..P8 derived
// from the RMM phase angle. Falls back to P0 on any network/parse error.

export interface MjoResult {
  mjo_code: string;
  amplitude: number;
  source: string;
}

export async function fetchLiveMjoPhase(): Promise<MjoResult> {
  const url = "https://psl.noaa.gov/mjo/mjoindex/omi.1x.txt";
  try {
    const controller = new AbortController();
    const to = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(to);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const text = await res.text();

    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter((l) => l.length > 0 && !l.startsWith("#"));

    if (lines.length === 0) throw new Error("empty OMI file");

    const parts = lines[lines.length - 1].split(/\s+/);
    // parts: [year, month, day, pc1, pc2, amplitude]
    if (parts.length < 6) throw new Error("unexpected OMI column count");

    const year = parts[0];
    const month = parts[1].padStart(2, "0");
    const day = parts[2].padStart(2, "0");
    const obsDate = `${year}-${month}-${day}`;

    const pc1 = Number(parts[3]);
    const pc2 = Number(parts[4]);
    const amp = Number(parts[5]);
    if (![pc1, pc2, amp].every(Number.isFinite)) throw new Error("non-numeric OMI values");

    if (amp < 1.0) {
      return { mjo_code: "MJO-P0", amplitude: Math.round(amp * 100) / 100, source: `NOAA PSL OMI (${obsDate})` };
    }

    let angleDeg = (Math.atan2(-pc2, -pc1) * 180) / Math.PI;
    angleDeg = ((angleDeg % 360) + 360) % 360;
    const phaseNum = Math.floor(angleDeg / 45) + 1;
    return { mjo_code: `MJO-P${phaseNum}`, amplitude: Math.round(amp * 100) / 100, source: `NOAA PSL OMI (${obsDate})` };
  } catch {
    return { mjo_code: "MJO-P0", amplitude: 0.0, source: "Offline Climatological Fallback" };
  }
}
