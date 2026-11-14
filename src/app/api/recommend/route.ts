// SiriusTa recommendation API.
// POST /api/recommend  { lat, lon, prevCrop?, name?, exRow? }
// GET  /api/recommend?lat=30.22&lon=31.375&prevCrop=maize&name=...
// Returns the full dual-coordinate recommendation JSON (target vs matched
// zone example) computed by the ported SiriusTa engine. No auth required —
// publicly accessible so judges can open and test directly.

import { NextRequest, NextResponse } from "next/server";
import { recommend, validateInput } from "@/lib/siriusta/recommend";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function buildInputFromQuery(req: NextRequest) {
  const url = new URL(req.url);
  const lat = Number(url.searchParams.get("lat") ?? "");
  const lon = Number(url.searchParams.get("lon") ?? "");
  const prevCrop = url.searchParams.get("prevCrop") ?? url.searchParams.get("prev_crop") ?? undefined;
  const name = url.searchParams.get("name") ?? undefined;
  const exRowRaw = url.searchParams.get("exRow") ?? url.searchParams.get("ex_row");
  const exRow = exRowRaw ? Number(exRowRaw) : undefined;
  return { lat, lon, prevCrop, name, exRow };
}

export async function GET(req: NextRequest) {
  const input = buildInputFromQuery(req);
  const v = validateInput(input);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }
  try {
    const result = await recommend(input);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Engine failure" },
      { status: 500 },
    );
  }
}

export async function POST(req: NextRequest) {
  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }
  const input = {
    lat: Number(body.lat),
    lon: Number(body.lon),
    prevCrop:
      typeof body.prevCrop === "string" ? body.prevCrop : typeof body.prev_crop === "string" ? body.prev_crop : undefined,
    name: typeof body.name === "string" ? body.name : undefined,
    exRow:
      body.exRow !== undefined ? Number(body.exRow) : body.ex_row !== undefined ? Number(body.ex_row) : undefined,
  };
  const v = validateInput(input);
  if (!v.ok) {
    return NextResponse.json({ ok: false, error: v.error }, { status: 400 });
  }
  try {
    const result = await recommend(input);
    return NextResponse.json(result, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "Engine failure" },
      { status: 500 },
    );
  }
}
