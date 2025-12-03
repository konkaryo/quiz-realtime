// web/src/pages/RacePage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";

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

type EnergyTier = {
  speed: number;      // km/h
  tierEnergy: number; // énergie propre au palier (sert pour la décroissance)
  cumEnergy: number;  // énergie totale minimale pour atteindre ce palier
};

type EnergyInfo = {
  tier: EnergyTier;
  index: number;
  prevCum: number; // énergie totale au moment d'entrer dans ce palier
  nextCum: number; // énergie totale nécessaire pour atteindre le palier suivant
  isMax: boolean;
};

const STAGE_LENGTH_KM = 100;
const SEGMENT_KM = 10;
const NB_SAMPLES = 400;

const MAX_SEG_SLOPE_PCT = 12;
const SLOPE_STD_PCT = 4;

// --------------------- Energie / vitesse ---------------------

// Données de base : vitesse & énergie propre du palier
// (énergie nécessaire pour passer AU palier suivant et utilisée pour la décroissance)
const BASE_ENERGY_DATA: { speed: number; tierEnergy: number }[] = [
  { speed: 0, tierEnergy: 0 },    // Palier 0 : départ, 0 énergie
  { speed: 1000, tierEnergy: 40 }, // Palier 1
  { speed: 2000, tierEnergy: 50 }, // Palier 2
  { speed: 3000, tierEnergy: 70 },
  { speed: 4000, tierEnergy: 100 },
  { speed: 5000, tierEnergy: 140 },
  { speed: 6000, tierEnergy: 190 },
  { speed: 7000, tierEnergy: 250 },
  { speed: 8000, tierEnergy: 320 },
  { speed: 9000, tierEnergy: 400 },
  { speed: 10000, tierEnergy: 490 }, // adapte si tu veux 590 ici
];

// On calcule cumEnergy[i] = énergie totale minimale pour être au palier i.
// cumEnergy[0] = 0
// cumEnergy[1] = 40  (il a fallu 40 énergie pour passer de 0 → 1)
// cumEnergy[2] = 90  (40 + 50), etc.
const ENERGY_TIERS: EnergyTier[] = (() => {
  let cum = 0;
  return BASE_ENERGY_DATA.map((t, idx) => {
    if (idx === 0) {
      // palier 0 : énergie totale min = 0
      return { speed: t.speed, tierEnergy: t.tierEnergy, cumEnergy: 0 };
    }
    cum += BASE_ENERGY_DATA[idx].tierEnergy;
    return { speed: t.speed, tierEnergy: t.tierEnergy, cumEnergy: cum };
  });
})();

// On commence au palier 0, avec 0 énergie
const DEFAULT_ENERGY = 0;

// Incrément / décrément d’énergie par clic
const ENERGY_STEP = 50;

// Facteur de vitesse en fonction de la pente (en %)
const SLOPE_SPEED_MAP: Record<number, number> = {
  [-14]: 2.2,
  [-13]: 2.1,
  [-12]: 2.0,
  [-11]: 1.9,
  [-10]: 1.8,
  [-9]: 1.7,
  [-8]: 1.6,
  [-7]: 1.5,
  [-6]: 1.4,
  [-5]: 1.3,
  [-4]: 1.2,
  [-3]: 1.15,
  [-2]: 1.1,
  [-1]: 1.05,
  [0]: 1.0,
  [1]: 0.9,
  [2]: 0.8,
  [3]: 0.7,
  [4]: 0.6,
  [5]: 0.5,
  [6]: 0.45,
  [7]: 0.4,
  [8]: 0.35,
  [9]: 0.3,
  [10]: 0.28,
  [11]: 0.26,
  [12]: 0.24,
  [13]: 0.22,
  [14]: 0.2,
};

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

/** facteur de vitesse à partir de la pente locale (en %) */
function getSlopeSpeedFactor(slopePct: number): number {
  const rounded = Math.round(slopePct);
  const clamped = Math.max(-14, Math.min(14, rounded));
  const factor = SLOPE_SPEED_MAP[clamped];
  return factor ?? 1.0;
}

/** pente locale (en %) à partir de f(x), dérivée numérique */
function getSlopePctAt(xKm: number, f: StageFunction): number {
  const h = 0.01; // ≈ 10 m
  const x0 = Math.max(0, xKm - h);
  const x1 = Math.min(STAGE_LENGTH_KM, xKm + h);
  const y0 = f(x0);
  const y1 = f(x1);
  const dAlt = y1 - y0; // m
  const dKm = Math.max(1e-6, x1 - x0); // km
  return (dAlt / (dKm * 1000)) * 100;
}

/** renvoie les infos de palier pour une énergie totale donnée */
function getEnergyInfoForEnergy(energy: number): EnergyInfo {
  let idx = 0;
  for (let i = 0; i < ENERGY_TIERS.length; i++) {
    if (energy >= ENERGY_TIERS[i].cumEnergy) {
      idx = i;
    } else {
      break;
    }
  }
  const tier = ENERGY_TIERS[idx];
  const isMax = idx === ENERGY_TIERS.length - 1;

  // énergie totale quand on vient JUSTE d’entrer dans ce palier
  const prevCum = tier.cumEnergy;
  const nextCum = isMax ? tier.cumEnergy : ENERGY_TIERS[idx + 1].cumEnergy;

  return { tier, index: idx, prevCum, nextCum, isMax };
}

// --------------------- Génération du profil ------------------------------

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

    const rawSlopePct = randomNormal() * SLOPE_STD_PCT;
    const slopePct = Math.max(
      -MAX_SEG_SLOPE_PCT,
      Math.min(MAX_SEG_SLOPE_PCT, rawSlopePct)
    );

    const deltaY = (slopePct / 100) * segmentKm * 1000; // m
    let nextAlt = prevAlt + deltaY;

    nextAlt = Math.max(0, Math.min(2600, nextAlt));

    currentAlt = nextAlt;
    anchors.push({ x: i * segmentKm, y: currentAlt });
  }

  return anchors;
}

function createStageProfile(lengthKm: number): StageProfile {
  const anchors = generateAnchorsEquidistant(lengthKm, SEGMENT_KM);
  return { anchors };
}

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

// -------------------------------------------------------------------------

const RacePage: React.FC = () => {
  const [seed, setSeed] = useState(0);
  const [hover, setHover] = useState<HoverInfo | null>(null);

  const [playerKm, setPlayerKm] = useState(0);
  const [energy, setEnergy] = useState<number>(DEFAULT_ENERGY);
  const energyRef = useRef(energy);
  useEffect(() => {
    energyRef.current = energy;
  }, [energy]);

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

    const p = points[i];
    const svgPos = toSvg(p);

    const slopePct = getSlopePctAt(p.x, stageFunction);
    const arcLenKm = arcLengths[i] ?? 0;

    setHover({
      km: p.x,
      alt: p.y,
      slope: slopePct,
      arcLenKm,
      svgX: svgPos.x,
      svgY: svgPos.y,
    });
  };

  const handleMouseLeave = () => setHover(null);

  const tooltipWidth = 190;
  const tooltipHeight = 62;

  // Représentation explicite de la fonction
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

  // Infos énergie / palier en cours
  const energyInfo = useMemo(
    () => getEnergyInfoForEnergy(energy),
    [energy]
  );
  const baseSpeedKmh = energyInfo.tier.speed;

  // énergie déjà accumulée dans CE palier
  const energyInCurrentTier = Math.max(0, energy - energyInfo.prevCum);
  // énergie nécessaire pour atteindre le palier suivant
  const capacityCurrentTier = energyInfo.isMax
    ? energyInfo.tier.tierEnergy
    : energyInfo.nextCum - energyInfo.prevCum;

  const energyProgress =
    capacityCurrentTier > 0
      ? Math.max(
          0,
          Math.min(1, energyInCurrentTier / capacityCurrentTier)
        )
      : 0;

  // Animation du joueur avec vitesse impactée par pente + énergie
  useEffect(() => {
    let animationId: number;
    let lastTs: number | null = null;

    const tick = (ts: number) => {
      if (lastTs === null) {
        lastTs = ts;
        animationId = requestAnimationFrame(tick);
        return;
      }
      const dtSec = (ts - lastTs) / 1000;
      lastTs = ts;

      const energyNow = energyRef.current;
      const infoNow = getEnergyInfoForEnergy(energyNow);
      const baseSpeed = infoNow.tier.speed;
      const decayPerSec = 0.05 * infoNow.tier.tierEnergy;

      // 1) décroissance naturelle de l’énergie
      let newEnergy = energyNow - decayPerSec * dtSec;
      if (newEnergy < 0) newEnergy = 0;
      energyRef.current = newEnergy;
      setEnergy(newEnergy);

      // 2) déplacement du joueur
      setPlayerKm((prevKm) => {
        if (prevKm >= STAGE_LENGTH_KM) return prevKm;

        const slopePct = getSlopePctAt(prevKm, stageFunction);
        const factor = getSlopeSpeedFactor(slopePct);
        const effectiveSpeed = baseSpeed * factor; // km/h

        const deltaKm = (effectiveSpeed * dtSec) / 3600;
        let next = prevKm + deltaKm;
        if (next > STAGE_LENGTH_KM) next = STAGE_LENGTH_KM;
        if (next < 0) next = 0;
        return next;
      });

      animationId = requestAnimationFrame(tick);
    };

    animationId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animationId);
  }, [stageFunction]);

  // Position du joueur
  const playerAlt = stageFunction(playerKm);
  const playerSvg = toSvg({ x: playerKm, y: playerAlt });

  const currentSlopePct = getSlopePctAt(playerKm, stageFunction);
  const currentFactor = getSlopeSpeedFactor(currentSlopePct);
  const effectiveSpeedKmh = baseSpeedKmh * currentFactor;

  // Boutons énergie
  const addEnergy = (delta: number) => {
    setEnergy((prev) => {
      let next = prev + delta;
      if (next < 0) next = 0;
      energyRef.current = next;
      return next;
    });
  };

  return (
    <div className="min-h-[calc(100vh-56px)] bg-gradient-to-b from-slate-900 via-slate-950 to-black text-white">
      <div className="mx-auto max-w-5xl px-4 py-8 flex flex-col gap-6">
        {/* Bandeau énergie / vitesse joueur */}
        <div className="flex flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="text-xs font-mono text-sky-200 space-x-2">
            <span>
              Palier vitesse :{" "}
              <span className="font-semibold">
                {baseSpeedKmh.toFixed(0)} km/h
              </span>
            </span>
            <span>
              Pente locale :{" "}
              <span className="font-semibold">
                {currentSlopePct.toFixed(1)}%
              </span>
            </span>
            <span>
              Facteur pente :{" "}
              <span className="font-semibold">
                {(currentFactor * 100).toFixed(0)}%
              </span>
            </span>
            <span>
              Vitesse effective :{" "}
              <span className="font-semibold">
                {effectiveSpeedKmh.toFixed(0)} km/h
              </span>
            </span>
            <span>
              Position :{" "}
              <span className="font-semibold">
                {playerKm.toFixed(1)} km
              </span>
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => addEnergy(-ENERGY_STEP)}
              className="rounded-lg border border-emerald-400/40 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-100 hover:bg-emerald-400/20"
            >
              ⬇️ Consommer énergie (-{ENERGY_STEP})
            </button>
            <button
              type="button"
              onClick={() => addEnergy(ENERGY_STEP)}
              className="rounded-lg border border-emerald-400/60 bg-emerald-400/20 px-3 py-1 text-xs font-semibold text-emerald-50 hover:bg-emerald-400/30"
            >
              ⬆️ Générer énergie (+{ENERGY_STEP})
            </button>
          </div>
        </div>

        {/* Barre d'énergie = énergie nécessaire pour passer au palier suivant */}
        <div className="rounded-xl border border-emerald-400/30 bg-slate-900/70 px-3 py-2">
          <div className="flex items-center justify-between text-[11px] text-slate-100/80">
            <span>
              Énergie palier actuel :{" "}
              <span className="font-semibold">
                {energyInCurrentTier.toFixed(0)}
              </span>{" "}
              /{" "}
              <span className="font-semibold">
                {capacityCurrentTier.toFixed(0)}
              </span>{" "}
              pts
            </span>
            {energyInfo.isMax ? (
              <span className="text-emerald-400 font-semibold">
                Palier max atteint
              </span>
            ) : (
              <span>
                Prochain palier :{" "}
                <span className="font-semibold">
                  {
                    ENERGY_TIERS[energyInfo.index + 1].speed
                  }{" "}
                  km/h
                </span>
              </span>
            )}
          </div>
          <div className="mt-1 h-2 w-full rounded-full bg-slate-800/80 overflow-hidden">
            <div
              className="h-full bg-emerald-400"
              style={{ width: `${energyProgress * 100}%` }}
            />
          </div>
        </div>

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
              On part du palier 0 avec 0 énergie. Chaque palier nécessite une
              certaine quantité d&apos;énergie supplémentaire pour atteindre le
              suivant (40, puis 50, puis 70, etc.). L&apos;énergie décroit de 5 % de
              l&apos;énergie du palier par seconde, et la pente modifie la vitesse
              effective du joueur.
            </p>
          </div>

          <button
            onClick={() => {
              setHover(null);
              setSeed((s) => s + 1);
              setPlayerKm(0);
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

            {/* Profil */}
            <path
              d={pathD}
              fill="#ffd800"
              stroke="#c79200"
              strokeWidth={2}
            />

            {/* Curseur joueur */}
            <g pointerEvents="none">
              <line
                x1={playerSvg.x}
                y1={baselineY}
                x2={playerSvg.x}
                y2={playerSvg.y}
                stroke="#2563eb"
                strokeWidth={1.5}
                strokeDasharray="4 3"
              />
              <circle
                cx={playerSvg.x}
                cy={playerSvg.y}
                r={6}
                fill="#2563eb"
                stroke="#ffffff"
                strokeWidth={2}
              />
            </g>

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

            {/* Tooltip pente / longueur d'arc */}
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
