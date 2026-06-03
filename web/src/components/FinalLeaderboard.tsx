// web/src/components/FinalLeaderboard.tsx

import React, { useCallback, useEffect, useMemo, useState } from "react";
import podiumImage from "../assets/podium.png";
import goldMedalImage from "../assets/gold_medal.png";
import silverMedalImage from "../assets/silver_medal.png";
import bronzeMedalImage from "../assets/bronze_medal.png";
import crownImage from "../assets/crown.png";
import { getLevelProgress } from "../utils/experience";

const confettiPieces = [
  { left: "5%", color: "#FF4FA3", width: 6, height: 10, rotate: -22, drift: -18, delay: "0s", duration: "3.8s" },
  { left: "11%", color: "#A66BFF", width: 5, height: 5, rotate: 36, drift: 14, delay: "-2.1s", duration: "4.6s" },
  { left: "17%", color: "#6B83FF", width: 7, height: 7, rotate: 48, drift: -10, delay: "-1.2s", duration: "4.1s" },
  { left: "24%", color: "#FF9B42", width: 5, height: 9, rotate: 26, drift: 20, delay: "-3.4s", duration: "4.8s" },
  { left: "31%", color: "#8DF7FF", width: 4, height: 8, rotate: -42, drift: -15, delay: "-0.8s", duration: "3.9s" },
  { left: "39%", color: "#FED865", width: 8, height: 8, rotate: 12, drift: 12, delay: "-2.8s", duration: "4.4s" },
  { left: "46%", color: "#E245A4", width: 5, height: 10, rotate: -34, drift: -22, delay: "-1.7s", duration: "5s" },
  { left: "54%", color: "#7CFFB2", width: 6, height: 6, rotate: 41, drift: 16, delay: "-3.9s", duration: "4.2s" },
  { left: "61%", color: "#B162F7", width: 5, height: 9, rotate: -14, drift: -12, delay: "-0.4s", duration: "4.7s" },
  { left: "68%", color: "#FFB15D", width: 6, height: 10, rotate: 28, drift: 18, delay: "-2.4s", duration: "3.7s" },
  { left: "75%", color: "#6C8CFF", width: 5, height: 5, rotate: -38, drift: -16, delay: "-1.4s", duration: "4.5s" },
  { left: "82%", color: "#FF73D4", width: 5, height: 9, rotate: 55, drift: 12, delay: "-3.2s", duration: "4s" },
  { left: "89%", color: "#FED865", width: 7, height: 7, rotate: -12, drift: -18, delay: "-0.9s", duration: "4.9s" },
  { left: "95%", color: "#54DFFF", width: 4, height: 8, rotate: 23, drift: 10, delay: "-2.7s", duration: "4.3s" },
  { left: "14%", color: "#FF5D8F", width: 6, height: 6, rotate: 42, drift: -20, delay: "-3.7s", duration: "5.2s" },
  { left: "58%", color: "#FFFFFF", width: 4, height: 9, rotate: 8, drift: 14, delay: "-1.9s", duration: "4.6s" },
  { left: "2%", color: "#7CFFB2", width: 4, height: 7, rotate: 18, drift: 16, delay: "-1.5s", duration: "4.2s" },
  { left: "8%", color: "#FED865", width: 7, height: 5, rotate: -48, drift: -12, delay: "-4.1s", duration: "5.1s" },
  { left: "21%", color: "#FF73D4", width: 4, height: 10, rotate: 64, drift: 18, delay: "-2.9s", duration: "4.5s" },
  { left: "28%", color: "#54DFFF", width: 6, height: 6, rotate: -8, drift: -16, delay: "-0.6s", duration: "3.8s" },
  { left: "35%", color: "#FFB15D", width: 5, height: 8, rotate: 72, drift: 10, delay: "-3.6s", duration: "4.7s" },
  { left: "42%", color: "#B162F7", width: 7, height: 7, rotate: -28, drift: -14, delay: "-2.2s", duration: "5.3s" },
  { left: "50%", color: "#FF4FA3", width: 4, height: 9, rotate: 34, drift: 20, delay: "-4.5s", duration: "4s" },
  { left: "64%", color: "#8DF7FF", width: 5, height: 10, rotate: -58, drift: -18, delay: "-3.1s", duration: "5s" },
  { left: "71%", color: "#FFFFFF", width: 6, height: 4, rotate: 22, drift: 14, delay: "-0.2s", duration: "4.4s" },
  { left: "79%", color: "#E245A4", width: 4, height: 8, rotate: -18, drift: -10, delay: "-4.8s", duration: "4.9s" },
  { left: "86%", color: "#6B83FF", width: 6, height: 9, rotate: 52, drift: 18, delay: "-2.6s", duration: "4.1s" },
  { left: "98%", color: "#FED865", width: 5, height: 7, rotate: -66, drift: -20, delay: "-3.8s", duration: "5.4s" },
  { left: "4%", color: "#FFFFFF", width: 5, height: 8, rotate: 44, drift: 12, delay: "-2.5s", duration: "4.6s" },
  { left: "12%", color: "#54DFFF", width: 4, height: 10, rotate: -72, drift: -18, delay: "-5.1s", duration: "5.2s" },
  { left: "18%", color: "#FFB15D", width: 6, height: 6, rotate: 16, drift: 20, delay: "-0.7s", duration: "4.1s" },
  { left: "25%", color: "#E245A4", width: 5, height: 9, rotate: -36, drift: -14, delay: "-4.3s", duration: "4.8s" },
  { left: "32%", color: "#7CFFB2", width: 7, height: 5, rotate: 58, drift: 16, delay: "-1.1s", duration: "5.5s" },
  { left: "38%", color: "#6C8CFF", width: 4, height: 8, rotate: -10, drift: -20, delay: "-3.3s", duration: "4.4s" },
  { left: "44%", color: "#FED865", width: 6, height: 10, rotate: 82, drift: 10, delay: "-5.4s", duration: "5s" },
  { left: "52%", color: "#FF73D4", width: 5, height: 5, rotate: -52, drift: -12, delay: "-2.1s", duration: "4.3s" },
  { left: "57%", color: "#A66BFF", width: 6, height: 8, rotate: 30, drift: 18, delay: "-4.9s", duration: "5.1s" },
  { left: "66%", color: "#FFFFFF", width: 4, height: 7, rotate: -24, drift: -16, delay: "-1.6s", duration: "4.7s" },
  { left: "73%", color: "#FF4FA3", width: 7, height: 6, rotate: 68, drift: 14, delay: "-3.5s", duration: "5.3s" },
  { left: "81%", color: "#8DF7FF", width: 5, height: 9, rotate: -80, drift: -18, delay: "-0.3s", duration: "4.5s" },
  { left: "87%", color: "#FF9B42", width: 4, height: 10, rotate: 40, drift: 12, delay: "-5.7s", duration: "5.6s" },
  { left: "92%", color: "#B162F7", width: 6, height: 5, rotate: -44, drift: -10, delay: "-2.8s", duration: "4.2s" },
  { left: "97%", color: "#7CFFB2", width: 5, height: 8, rotate: 20, drift: -22, delay: "-4.6s", duration: "5.4s" },
];

function PodiumConfetti() {
  return (
    <div className="pointer-events-none absolute inset-x-0 top-0 z-10 h-[76%] overflow-hidden rounded-[12px]" aria-hidden="true">
      {confettiPieces.map((piece, index) => (
        <span
          key={`podium-confetti-${index}`}
          className="absolute -top-4 rounded-[2px] opacity-90 will-change-transform shadow-[0_0_10px_rgba(255,255,255,0.16)] animate-[podiumConfettiRain_var(--confetti-duration)_linear_infinite]"
          style={
            {
              left: piece.left,
              width: `${piece.width}px`,
              height: `${piece.height}px`,
              backgroundColor: piece.color,
              animationDelay: piece.delay,
              "--confetti-duration": piece.duration,
              "--confetti-rotate": `${piece.rotate}deg`,
              "--confetti-drift": `${piece.drift}px`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}

type Row = {
  id: string;
  name: string;
  score: number;
  img?: string | null;
  bits?: number;
  xp?: number;
  experience?: number;
};

export function FinalLeaderboard({
  rows,
  selfId,
  selfName,
}: {
  rows: Row[];
  selfId?: string | null;
  selfName?: string | null;
}) {
  const LevelShield = ({ level }: { level: number }) => {
    const gradientId = React.useId();

    return (
      <span className="relative inline-flex h-9 w-8 shrink-0 items-center justify-center text-white">
        <svg
          viewBox="0 0 100 120"
          className="absolute inset-0 h-full w-full overflow-visible"
          aria-hidden="true"
          focusable="false"
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="120" gradientUnits="userSpaceOnUse">
              <stop offset="0%" stopColor="#9D5CFF" />
              <stop offset="100%" stopColor="#E245A4" />
            </linearGradient>
          </defs>
          <path
            d="M6 6 H94 V78 L50 114 L6 78 Z"
            fill="#20284D"
            stroke={`url(#${gradientId})`}
            strokeWidth="3"
            strokeLinejoin="miter"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span className="relative z-10 font-brand text-[18px] leading-none italic">{level}</span>
      </span>
    );
  };
  const isSelfRow = useCallback(
    (r: Row) =>
      (!!selfId && r.id === selfId) ||
      (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase()),
    [selfId, selfName]
  );

  const podiumSlots = useMemo(
    () =>
      [
        { rank: 2 },
        { rank: 1 },
        { rank: 3 },
      ].map((slot) => ({ ...slot, row: rows[slot.rank - 1] })),
    [rows]
  );

  const defaultProfile = "/img/profiles/0.avif";
  const selfSummary = useMemo(() => {
    const idx = rows.findIndex((row) => isSelfRow(row));
    if (idx < 0) return null;
    const row = rows[idx];
    return {
      row,
      rank: idx + 1,
      xp: row.xp ?? 0,
      bits: row.bits ?? 0,
      experience: row.experience ?? 0,
    };
  }, [rows, isSelfRow]);
  const selfLevelProgress = useMemo(
    () => (selfSummary ? getLevelProgress(selfSummary.experience) : null),
    [selfSummary]
  );
  const [showSelfProgress, setShowSelfProgress] = useState(false);

  useEffect(() => {
    if (!selfLevelProgress) {
      setShowSelfProgress(false);
      return;
    }

    setShowSelfProgress(false);

    const intervalId = window.setInterval(() => {
      setShowSelfProgress((value) => !value);
    }, 3500);

    return () => window.clearInterval(intervalId);
  }, [selfLevelProgress]);

  const isSelfProgressVisible = showSelfProgress && !!selfLevelProgress;

  return (
    <div className="px-2 pb-2 flex justify-center">
      {/* Podium */}
      <div className="w-full px-3 md:px-6 pb-1">
        <div className="relative mx-auto flex w-full justify-center">
          <PodiumConfetti />
          <img
            src={podiumImage}
            alt="Podium"
            className="relative z-20 block h-auto w-[130%] max-w-none -mt-[100px] select-none"
            style={{
              WebkitMaskImage:
                "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 14%, #000 100%)",
              WebkitMaskComposite: "source-in",
              maskImage:
                "linear-gradient(to right, transparent 0%, #000 8%, #000 92%, transparent 100%), linear-gradient(to bottom, transparent 0%, #000 14%, #000 100%)",
              maskComposite: "intersect",
            }}
            draggable={false}
            loading="lazy"
          />

          <div className="absolute left-1/2 z-30 -translate-x-1/2 bottom-[18%] w-[130%] grid grid-cols-3 items-end gap-0 px-2">
            {podiumSlots.map((slot) => {
              const { row, rank } = slot;
              const isSelf = row ? isSelfRow(row) : false;
              const shouldShowAvatarFrame = !!row || rank === 1;
              const podiumFrameGradientByRank: Record<number, string> = {
                1: "bg-[radial-gradient(circle,#FEF7BE_0%,#FEF7BE_67%,#FED865_73%,#DCA023_86%,#DCA023_100%)]",
                2: "bg-[radial-gradient(circle,#FBFBFB_0%,#FBFBFB_67%,#D3D3D5_73%,#C0C0C2_86%,#C0C0C2_100%)]",
                3: "bg-[radial-gradient(circle,#FECD9E_0%,#FECD9E_67%,#BA7649_73%,#B26C40_86%,#B26C40_100%)]",
              };
              const frameSizeByRank: Record<number, number> = {
                1: 80,
                2: 80,
                3: 80,
              };
              const bronzeFrameRatio = 4 / 80;
              const framePadding = Math.round((frameSizeByRank[rank] ?? 80) * bronzeFrameRatio);
              const avatarFrameClass = podiumFrameGradientByRank[rank]
                ? podiumFrameGradientByRank[rank]
                : "ring-4 ring-white/60";
              const medalByRank: Record<number, string> = {
                1: goldMedalImage,
                2: silverMedalImage,
                3: bronzeMedalImage,
              };
              const blockScaleByRank: Record<number, string> = {
                1: "scale-[1.2]",
                2: "scale-110",
                3: "scale-100",
              };
              const scoreColorByRank: Record<number, string> = {
                1: "#FAC95A",
                2: "#B7DBF9",
                3: "#D38564",
              };

              return (
                <div
                  key={rank}
                  className={[
                    "relative flex flex-col items-center origin-bottom",
                    rank === 2 ? "translate-x-[140px] translate-y-[29px]" : rank === 3 ? "-translate-x-[140px] translate-y-[36px]" : "",
                    blockScaleByRank[rank] ?? "scale-100",
                  ].join(" ")}
                >
                  {shouldShowAvatarFrame ? (
                    <div
                      className={[
                        rank === 1
                          ? "w-[80px] h-[80px] -mt-[80px]"
                          : rank === 2
                          ? "w-[80px] h-[80px] -mt-[0px]"
                          : "w-[80px] h-[80px] -mt-[24px]",
                        "relative z-10",
                        "rounded-[6px]",
                        avatarFrameClass,
                        "shadow-[0_10px_40px_rgba(0,0,0,.45)]",
                      ].join(" ")}
                      style={podiumFrameGradientByRank[rank] ? { padding: `${framePadding}px` } : undefined}
                      aria-label={row ? `Avatar de ${row.name}` : "Aucun joueur"}
                    >
                      {rank === 1 ? (
                        <img
                          src={crownImage}
                          alt="Couronne du vainqueur"
                          className="h-auto w-[46px] select-none pointer-events-none absolute left-1/2 -translate-x-1/2 -top-[30px] z-30"
                          draggable={false}
                          loading="lazy"
                        />
                      ) : null}
                      <div className="w-full h-full rounded-[2px] overflow-hidden">
                        {row ? (
                          <img
                            src={row.img ?? defaultProfile}
                            alt=""
                            className="w-full h-full object-cover"
                            draggable={false}
                            loading="lazy"
                          />
                        ) : (
                          <div className="w-full h-full bg-white/10" />
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="w-12 h-12 md:w-14 md:h-14" aria-hidden="true" />
                  )}

                  <img
                    src={medalByRank[rank]}
                    alt={`Médaille rang ${rank}`}
                    className="h-auto w-[52px] -mt-[14px] select-none pointer-events-none relative z-20"
                    draggable={false}
                    loading="lazy"
                  />

                  <div className="mt-1.5 mb-2 flex min-h-[62px] flex-col items-center justify-start text-center max-w-[180px] md:max-w-[200px] px-1">
                    <div
                      className={[
                        "font-semibold truncate text-[15px] md:text-[16px] leading-tight",
                        isSelf ? "text-white" : "text-white/90",
                      ].join(" ")}
                    >
                      {row ? row.name : "—"}
                    </div>
                    <div
                      className="mt-2 leading-none"
                      style={{
                        fontFamily:
                          '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif',
                        fontStyle: "italic",
                        color: scoreColorByRank[rank] ?? "#FFFFFF",
                      }}
                    >
                      <span className="text-[34px] md:text-[38px]">{Math.round(row?.score ?? 0)}</span>{" "}
                      <span className="text-[22px] md:text-[24px]">pts</span>
                    </div>
                  </div>

                </div>
              );
            })}
          </div>
        </div>
        {selfSummary ? (
          <div className="mx-auto mt-3 flex min-h-[118px] w-full max-w-[720px] items-center overflow-hidden rounded-[24px] bg-[#11172B]/95 px-8 py-4 shadow-[0_12px_30px_rgba(0,0,0,0.35)]">
            <div className="relative h-[86px] w-full">
              {selfLevelProgress ? (
                <div
                  className={[
                    "absolute inset-0 grid w-full grid-cols-[auto_1fr_auto] items-center gap-4 rounded-[8px] bg-white/5 px-4 py-4 transition-all duration-500 ease-out",
                    isSelfProgressVisible
                      ? "translate-y-0 opacity-100"
                      : "pointer-events-none translate-y-4 opacity-0",
                  ].join(" ")}
                  aria-hidden={!isSelfProgressVisible}
                >
                  <LevelShield level={selfLevelProgress.level} />

                  <div className="w-full min-w-0">
                    <div
                      className="text-center text-[20px] tracking-[0.02em] text-white/90"
                      style={{
                        fontFamily:
                          '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif',
                        fontStyle: "italic",
                        fontWeight: 700,
                      }}
                    >
                      {selfLevelProgress.gained} / {selfLevelProgress.needed || 1} XP
                    </div>

                    <div className="mt-3 h-[8px] w-full overflow-hidden rounded-full bg-white/10">
                      <div
                        className="h-full rounded-full bg-[linear-gradient(90deg,#8541F7_0%,#AF3ECF_50%,#E6388E_100%)]"
                        style={{
                          width: `${Math.max(0, Math.min(100, selfLevelProgress.progress * 100))}%`,
                        }}
                      />
                    </div>
                  </div>
                  <LevelShield level={selfLevelProgress.level + 1} />
                </div>
              ) : null}
              <div
                className={[
                  "absolute inset-0 flex w-full items-center gap-3 transition-all duration-500 ease-out",
                  isSelfProgressVisible
                    ? "pointer-events-none -translate-y-4 opacity-0"
                    : "translate-y-0 opacity-100",
                ].join(" ")}
                aria-hidden={isSelfProgressVisible}
              >
                <div className="w-[70px] text-center font-brand text-[38px] italic leading-none text-white">#{selfSummary.rank}</div>
                <div className="mr-3 h-12 w-px shrink-0 rounded-full bg-white/80" aria-hidden="true" />
                <img
                  src={selfSummary.row.img ?? defaultProfile}
                  alt=""
                  className="h-14 w-14 rounded-[6px] object-cover"
                  draggable={false}
                  loading="lazy"
                />
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[15px] md:text-[16px] leading-tight font-semibold text-white">{selfSummary.row.name}</div>
                  <div
                    className="mt-1 inline-flex rounded px-2 py-0.5 text-[10px] font-semibold uppercase leading-none text-white"
                    style={{ background: "linear-gradient(90deg, #8541F7 0%, #AF3ECF 50%, #E6388E 100%)" }}
                  >
                    Vous
                  </div>
                </div>
                <div className="grid grid-cols-3 gap-2">
                  <div className="min-w-[82px] rounded-[6px] bg-white/5 px-3 py-2 text-center">
                    <div className="font-brand text-[24px] italic leading-none text-white">{Math.round(selfSummary.row.score)}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/70">Points</div>
                  </div>
                  <div className="min-w-[82px] rounded-[6px] bg-white/5 px-3 py-2 text-center">
                    <div className="font-brand text-[24px] italic leading-none text-white">+{selfSummary.xp}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/70">Expérience</div>
                  </div>
                  <div className="min-w-[82px] rounded-[6px] bg-white/5 px-3 py-2 text-center">
                    <div className="font-brand text-[24px] italic leading-none text-white">+{selfSummary.bits}</div>
                    <div className="mt-1 text-[9px] uppercase tracking-[0.16em] text-white/70">Pièces</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
