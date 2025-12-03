// web/src/pages/RacePage.tsx
import React, { useMemo, useState } from "react";

type StageFunction = (xKm: number) => number;
type Point = { x: number; y: number };
type HoverInfo = {
  km: number;
  alt: number;
  slope: number;
  arcLenKm: number;
  svgX: number;
  svgY: number;
};

type StageProfile = {
  anchors: Point[]; // points tous les 10 km
};

const STAGE_LENGTH_KM = 100;
const SEGMENT_KM = 10;
const NB_SAMPLES = 400;

// pente max entre ancres (en %)
const MAX_SEG_SLOPE_PCT = 12;
// écart-type de la pente (en %) → joue sur le "relief"
const SLOPE_STD_PCT = 4; // plus petit = plus plat, plus grand = plus montagneux

/** interpolation sinusoidale entre 0 et 1 (cosinus) */
function sinusoidEase(t: number): number {
  const u = Math.max(0, Math.min(1, t));
  return 0.5 * (1 - Math.cos(Math.PI * u));
}

/** tirage normal(0,1) via Box–Muller */
function randomNormal(): number {
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2.0 * Math.log(u)) * Math.cos(2.0 * Math.PI * v);
}

/**
 * Génère 11 ancres : x = 0, 10, 20, ..., 100.
 * La pente moyenne entre deux points consécutifs suit une loi normale
 * centrée en 0 % (σ = SLOPE_STD_PCT) puis bornée dans [-12 %, 12 %].
 */
function generateAnchorsEquidistant(
  lengthKm: number,
  segmentKm: number
): Point[] {
  const nSegments = Math.round(lengthKm / segmentKm);
  const anchors: Point[] = [];

  let currentAlt = 150 + Math.random() * 350; // 150–500 m
  anchors.push({ x: 0, y: currentAlt });

  for (let i = 1; i <= nSegments; i++) {
    const prevAlt = currentAlt;

    // pente en % tirée sur loi normale puis clampée
    const rawSlopePct = randomNormal() * SLOPE_STD_PCT;
    const slopePct = Math.max(
      -MAX_SEG_SLOPE_PCT,
      Math.min(MAX_SEG_SLOPE_PCT, rawSlopePct)
    );

    const deltaY = (slopePct / 100) * segmentKm * 1000; // m
    let nextAlt = prevAlt + deltaY;

    // bornes globales d'altitude
    nextAlt = Math.max(0, Math.min(2600, nextAlt));

    currentAlt = nextAlt;
    anchors.push({ x: i * segmentKm, y: currentAlt });
  }

  return anchors;
}

/** Crée un profil : ancres à 0,10,...,100 km. */
function createStageProfile(lengthKm: number): StageProfile {
  const anchors = generateAnchorsEquidistant(lengthKm, SEGMENT_KM);
  return { anchors };
}

/**
 * Construit la fonction f(x) :
 * pour chaque segment [x_k, x_{k+1}], interpolation sinusoidale entre y_k et y_{k+1}.
 */
function makeStageFunction(profile: StageProfile): StageFunction {
  const { anchors } = profile;

  return (xKm: number): number => {
    if (xKm <= anchors[0].x) return anchors[0].y;
    if (xKm >= anchors[anchors.length - 1].x) {
      return anchors[anchors.length - 1].y;
    }

    let k = Math.floor(xKm / SEGMENT_KM);
    if (k < 0) k = 0;
    if (k >= anchors.length - 1) k = anchors.length - 2;

    const a = anchors[k];
    const b = anchors[k + 1];

    const dx = b.x - a.x || 1e-6;
    const t = (xKm - a.x) / dx;
    const s = sinusoidEase(t);

    return a.y + (b.y - a.y) * s;
  };
}

/** Échantillonne f(x) sur toute l’étape */
function sampleStageFunction(
  f: StageFunction,
  lengthKm: number,
  samples: number
): Point[] {
  const pts: Point[] = [];
  for (let i = 0; i < samples; i++) {
    const x = (lengthKm * i) / (samples - 1);
    pts.push({ x, y: f(x) });
  }
  return pts;
}

const RacePage: React.FC = () => {
  const [seed, setSeed] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const profile = useMemo(
    () => createStageProfile(STAGE_LENGTH_KM),
    [seed]
  );

  const stageFunction = useMemo(
    () => makeStageFunction(profile),
    [profile]
  );

  const points = useMemo(
    () => sampleStageFunction(stageFunction, STAGE_LENGTH_KM, NB_SAMPLES),
    [stageFunction]
  );

  // Longueur d’arc cumulée (en km)
  const arcLengths = useMemo(() => {
    const arr: number[] = new Array(points.length).fill(0);
    let acc = 0;
    arr[0] = 0;
    for (let i = 1; i < points.length; i++) {
      const dxKm = points[i].x - points[i - 1].x;
      const dyKm = (points[i].y - points[i - 1].y) / 1000;
      const slopeDec = dxKm === 0 ? 0 : dyKm / dxKm;
      const dsKm = Math.sqrt(1 + slopeDec * slopeDec) * dxKm;
      acc += dsKm;
      arr[i] = acc;
    }
    return arr;
  }, [points]);

  const width = 960;
  const height = 280;
  const margin = { top: 30, right: 40, bottom: 45, left: 46 };

  const minY = Math.min(...points.map((p) => p.y), 0);
  const maxY = Math.max(...points.map((p) => p.y)) + 200;

  const scaleX =
    (width - margin.left - margin.right) / STAGE_LENGTH_KM;
  const scaleY =
    (height - margin.top - margin.bottom) / (maxY - minY);

  const baselineY = height - margin.bottom;

  const toSvg = (p: Point) => ({
    x: margin.left + p.x * scaleX,
    y: baselineY - (p.y - minY) * scaleY,
  });

  const first = toSvg(points[0]);
  const last = toSvg(points[points.length - 1]);

  let pathD = `M ${first.x} ${baselineY} L ${first.x} ${first.y}`;
  for (let i = 1; i < points.length; i++) {
    const { x, y } = toSvg(points[i]);
    pathD += ` L ${x} ${y}`;
  }
  pathD += ` L ${last.x} ${baselineY} Z`;

  const ticks: number[] = [];
  for (let km = 0; km <= STAGE_LENGTH_KM; km += 10) ticks.push(km);

  // Survol : pente locale + longueur d’arc
  const handleMouseMove = (
    e: React.MouseEvent<SVGRectElement, MouseEvent>
  ) => {
    const svg = e.currentTarget.ownerSVGElement;
    if (!svg) return;

    const rect = svg.getBoundingClientRect();
    const xClient = e.clientX;
    const xView = ((xClient - rect.left) / rect.width) * width;

    const km = Math.max(
      0,
      Math.min(STAGE_LENGTH_KM, (xView - margin.left) / scaleX)
    );
    if (!isFinite(km)) return;

    const approxIndex = Math.round(
      (km / STAGE_LENGTH_KM) * (points.length - 1)
    );
    const i = Math.max(
      0,
      Math.min(points.length - 1, approxIndex)
    );

    const i0 = Math.max(0, i - 1);
    const i1 = Math.min(points.length - 1, i + 1);
    if (i1 === i0) {
      setHover(null);
      return;
    }

    const p0 = points[i0];
    const p1 = points[i1];
    const dAlt = p1.y - p0.y;
    const dKm = Math.max(1e-6, p1.x - p0.x);
    const slopePct = (dAlt / (dKm * 1000)) * 100;

    const p = points[i];
    const svgPos = toSvg(p);

    const clampedSlope = Math.max(-30, Math.min(30, slopePct));
    const arcLenKm = arcLengths[i] ?? 0;

    setHover({
      km: p.x,
      alt: p.y,
      slope: clampedSlope,
      arcLenKm,
      svgX: svgPos.x,
      svgY: svgPos.y,
    });
  };

  const handleMouseLeave = () => setHover(null);

  const tooltipWidth = 190;
  const tooltipHeight = 62;

  // === Représentation explicite de la fonction ===
  const anchors = profile.anchors;
  const piecewiseLines = useMemo(() => {
    const lines: string[] = [];
    for (let k = 0; k < anchors.length - 1; k++) {
      const a = anchors[k];
      const b = anchors[k + 1];
      const x0 = a.x.toFixed(1);
      const x1 = b.x.toFixed(1);
      const y0 = a.y.toFixed(0);
      const y1 = b.y.toFixed(0);
      const dx = (b.x - a.x).toFixed(1);
      lines.push(
        `${x0} ≤ x ≤ ${x1} : f(x) = ${y0} + (${y1} - ${y0}) · ½ · (1 - cos(π · (x - ${x0}) / ${dx}))`
      );
    }
    return lines;
  }, [anchors]);

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-6">
        {/* HEADER */}
        <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.25em] text-sky-300/70">
              Multijoueur · Mode course
            </p>
            <h1 className="mt-1 text-3xl md:text-4xl font-semibold">
              Profil d&apos;étape dynamique
            </h1>
            <p className="mt-2 text-sm text-slate-100/80 max-w-2xl">
              Étape générée avec des points tous les 10 km. La pente entre deux
              points suit une loi normale centrée en 0 % (σ = {SLOPE_STD_PCT}
              %) et est bornée entre -12 % et 12 %. Entre les points, la courbe
              est une interpolation sinusoidale lisse.
            </p>
          </div>

          <button
            onClick={() => {
              setHover(null);
              setSeed((s) => s + 1);
            }}
            className="mt-2 rounded-xl border border-sky-400/50 bg-sky-400/10 px-4 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-400/20"
          >
            🔁 Re-générer le parcours
          </button>
        </header>

        {/* SVG */}
        <section className="rounded-3xl border border-white/10 bg-black/40 p-4 shadow-xl">
          <svg
            viewBox={`0 0 ${width} ${height}`}
            className="w-full rounded-2xl bg-white"
          >
            <rect
              x={0}
              y={0}
              width={width}
              height={height}
              fill="#ffffff"
              rx={18}
            />

            <path
              d={pathD}
              fill="#ffd800"
              stroke="#c79200"
              strokeWidth={2}
            />

            {/* Axe horizontal */}
            <line
              x1={margin.left}
              y1={baselineY}
              x2={width - margin.right}
              y2={baselineY}
              stroke="#000"
              strokeWidth={1.5}
            />

            {/* Graduation km */}
            {ticks.map((km) => {
              const x = margin.left + km * scaleX;
              return (
                <g key={km}>
                  <line
                    x1={x}
                    y1={baselineY}
                    x2={x}
                    y2={baselineY + 6}
                    stroke="#000"
                  />
                  <text
                    x={x}
                    y={baselineY + 18}
                    textAnchor="middle"
                    fontSize={10}
                  >
                    {km}
                  </text>
                </g>
              );
            })}

            <text
              x={width - margin.right}
              y={baselineY + 32}
              textAnchor="end"
              fontSize={11}
              fontWeight="bold"
            >
              {STAGE_LENGTH_KM.toFixed(1)} km
            </text>

            <text
              x={margin.left}
              y={margin.top}
              fill="#0054a6"
              fontSize={12}
              fontWeight="bold"
            >
              DÉPART
            </text>
            <text
              x={width - margin.right}
              y={margin.top}
              textAnchor="end"
              fill="#d60000"
              fontSize={12}
              fontWeight="bold"
            >
              ARRIVÉE
            </text>

            {/* Overlay de survol */}
            <rect
              x={margin.left}
              y={margin.top}
              width={width - margin.left - margin.right}
              height={baselineY - margin.top}
              fill="transparent"
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
            />

            {/* Marker + tooltip */}
            {hover && (
              <g pointerEvents="none">
                <circle
                  cx={hover.svgX}
                  cy={hover.svgY}
                  r={4}
                  fill="#ffffff"
                  stroke="#c79200"
                  strokeWidth={2}
                />

                {(() => {
                  const tx = Math.min(
                    width - margin.right - tooltipWidth - 4,
                    hover.svgX + 12
                  );
                  const ty = Math.max(
                    margin.top + 4,
                    hover.svgY - tooltipHeight - 8
                  );

                  return (
                    <>
                      <rect
                        x={tx}
                        y={ty}
                        width={tooltipWidth}
                        height={tooltipHeight}
                        rx={6}
                        ry={6}
                        fill="#111827"
                        stroke="#facc15"
                        strokeWidth={1}
                        opacity={0.9}
                      />
                      <text
                        x={tx + 8}
                        y={ty + 16}
                        fontSize={11}
                        fill="#e5e7eb"
                      >
                        {hover.km.toFixed(1)} km ·{" "}
                        {hover.alt.toFixed(0)} m
                      </text>
                      <text
                        x={tx + 8}
                        y={ty + 30}
                        fontSize={11}
                        fill="#e5e7eb"
                      >
                        L arc(0→x) : {hover.arcLenKm.toFixed(2)} km
                      </text>
                      <text
                        x={tx + 8}
                        y={ty + 46}
                        fontSize={12}
                        fontWeight="bold"
                        fill={
                          hover.slope > 0.5
                            ? "#22c55e"
                            : hover.slope < -0.5
                            ? "#ef4444"
                            : "#e5e7eb"
                        }
                      >
                        Pente : {hover.slope >= 0 ? "+" : ""}
                        {hover.slope.toFixed(1)}%
                      </text>
                    </>
                  );
                })()}
              </g>
            )}
          </svg>

          {/* Fonction mathématique exacte affichée sous la courbe */}
          <div className="mt-3 rounded-xl bg-black/40 px-3 py-2 text-[11px] text-slate-100/80 font-mono space-y-2">
            <div className="font-semibold">
              Points d&apos;ancrage (xₖ, yₖ) en km / m :
            </div>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {anchors.map((a, idx) => (
                <div key={idx}>
                  k={idx} → ({a.x.toFixed(1)} km, {a.y.toFixed(0)} m)
                </div>
              ))}
            </div>

            <div className="mt-2 font-semibold">Définition pièce par pièce :</div>
            <div className="space-y-1">
              {piecewiseLines.map((line, idx) => (
                <div key={idx}>{line}</div>
              ))}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
};

export default RacePage;
