// web/src/components/FinalLeaderboard.tsx

import React, { useEffect, useMemo, useState } from "react";
import bitUrl from "../assets/bit.png";
import giftUrl from "../assets/gift.png";
import medalUrl from "../assets/medal.png";
import { getLevelProgress } from "../utils/experience";

type Row = {
  id: string;
  name: string;
  score: number;
  img?: string | null;
  bits?: number;
  xp?: number;
  experience?: number;
};

const XP_SEGMENTS = 10;
const SEGMENT_ANIMATION_MS = 450;
const SEGMENT_STAGGER_MS = 325;

export function FinalLeaderboard({
  rows,
  selfId,
  selfName,
}: {
  rows: Row[];
  selfId?: string | null;
  selfName?: string | null;
}) {
  const isSelfRow = (r: Row) =>
    (!!selfId && r.id === selfId) ||
    (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase());

  const podiumSlots = useMemo(
    () =>
      [
        { h: 62, ring: "ring-slate-300/60", rank: 2 },
        { h: 82, ring: "ring-amber-300/70", rank: 1 },
        { h: 54, ring: "ring-orange-300/60", rank: 3 },
      ].map((slot) => ({ ...slot, row: rows[slot.rank - 1] })),
    [rows]
  );

  const selfIndex = useMemo(() => rows.findIndex(isSelfRow), [rows, selfId, selfName]);
  const selfRow = selfIndex >= 0 ? rows[selfIndex] : null;

  const selfPosition = selfIndex >= 0 ? selfIndex + 1 : null;
  const selfScore = Math.max(0, selfRow?.score ?? 0);
  const selfBits = Math.max(0, selfRow?.bits ?? 0);
  const xpGained = Math.max(0, selfRow?.xp ?? 0);
  const baseExperience = Math.max(0, selfRow?.experience ?? 0);
  const nextExperience = baseExperience + xpGained;

  const currentLevelProgress = getLevelProgress(baseExperience);
  const nextLevelProgress = getLevelProgress(nextExperience);

  const currentLevel = currentLevelProgress.level;
  const nextLevel = nextLevelProgress.level;
  const leveledUp = nextLevel > currentLevel;
  const xpTargetProgress = nextLevelProgress.progress;

  const [animatedSegmentFills, setAnimatedSegmentFills] = useState<number[]>(
    () => Array.from({ length: XP_SEGMENTS }, () => 0)
  );
  const [disableSegmentTransition, setDisableSegmentTransition] = useState(false);
  const [displayLevelLeft, setDisplayLevelLeft] = useState(currentLevel);
  const [displayLevelRight, setDisplayLevelRight] = useState(currentLevel + 1);
  const [displayXpLabel, setDisplayXpLabel] = useState(`+ ${xpGained} XP`);

  const targetSegmentFills = useMemo(
    () =>
      Array.from({ length: XP_SEGMENTS }, (_, segmentIndex) => {
        const start = segmentIndex / XP_SEGMENTS;
        const end = (segmentIndex + 1) / XP_SEGMENTS;
        return Math.max(0, Math.min(1, (xpTargetProgress - start) / (end - start)));
      }),
    [xpTargetProgress]
  );

  useEffect(() => {
    let phaseOneRaf: number | null = null;
    let phaseTwoRaf: number | null = null;
    let phaseTwoRafStep2: number | null = null;
    let phaseTwoTimeout: number | null = null;

    setDisplayLevelLeft(currentLevel);
    setDisplayLevelRight(currentLevel + 1);
    setDisplayXpLabel(`+ ${xpGained} XP`);
    setDisableSegmentTransition(false);
    setAnimatedSegmentFills(Array.from({ length: XP_SEGMENTS }, () => 0));
    if (!leveledUp) {
      phaseOneRaf = requestAnimationFrame(() => {
        setAnimatedSegmentFills(targetSegmentFills);
      });
    } else {
      const fullSegments = Array.from({ length: XP_SEGMENTS }, () => 1);
      phaseOneRaf = requestAnimationFrame(() => {
        setAnimatedSegmentFills(fullSegments);
      });

      const phaseOneDuration =
        (XP_SEGMENTS - 1) * SEGMENT_STAGGER_MS + SEGMENT_ANIMATION_MS;

      phaseTwoTimeout = window.setTimeout(() => {
        setDisplayXpLabel("Niveau supérieur");
        setDisplayLevelLeft(nextLevel);
        setDisplayLevelRight(nextLevel + 1);
        setDisableSegmentTransition(true);
        setAnimatedSegmentFills(Array.from({ length: XP_SEGMENTS }, () => 0));

        phaseTwoRaf = requestAnimationFrame(() => {
          setDisableSegmentTransition(false);
          phaseTwoRafStep2 = requestAnimationFrame(() => {
            setAnimatedSegmentFills(targetSegmentFills);
          });
        });
      }, phaseOneDuration);
    }

    return () => {
      if (phaseOneRaf !== null) cancelAnimationFrame(phaseOneRaf);
      if (phaseTwoRaf !== null) cancelAnimationFrame(phaseTwoRaf);
      if (phaseTwoRafStep2 !== null) cancelAnimationFrame(phaseTwoRafStep2);
      if (phaseTwoTimeout !== null) window.clearTimeout(phaseTwoTimeout);
    };
  }, [currentLevel, leveledUp, nextLevel, targetSegmentFills, xpGained]);

  const defaultProfile = "/img/profiles/0.avif";
  const profileSrc = selfRow?.img ?? defaultProfile;

  return (
    <div className="px-2 pb-2">
      {/* Podium */}
      <div className="px-3 md:px-6 pb-1">
        <div className="relative overflow-hidden">
          <div className="relative grid grid-cols-1 md:grid-cols-3 items-end gap-7 py-3">
            {podiumSlots.map((slot) => {
              const { row, h, ring, rank } = slot;
              const isSelf = row ? isSelfRow(row) : false;
              const shouldShowAvatarFrame = !!row || rank === 1;
              const podiumFrameGradientByRank: Record<number, string> = {
                1: "bg-[linear-gradient(to_bottom,#A28130_0%,#FDE38F_50%,#A28130_100%)]",
                2: "bg-[linear-gradient(to_bottom,#93989B_0%,#ECECEC_50%,#93989B_100%)]",
                3: "bg-[linear-gradient(to_bottom,#644014_0%,#BC812E_50%,#644014_100%)]",
              };
              const avatarFrameClass = podiumFrameGradientByRank[rank]
                ? ["p-[4px]", podiumFrameGradientByRank[rank]].join(" ")
                : ["ring-4", ring].join(" ");

              return (
                <div key={rank} className="flex flex-col items-center">
                  {shouldShowAvatarFrame ? (
                    <div
                      className={[
                        "w-14 h-14 md:w-16 md:h-16 rounded-[6px]",
                        avatarFrameClass,
                        "shadow-[0_10px_40px_rgba(0,0,0,.45)]",
                      ].join(" ")}
                      aria-label={row ? `Avatar de ${row.name}` : "Aucun joueur"}
                    >
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

                  <div className="mt-1.5 mb-2 text-center max-w-[160px] md:max-w-[180px] px-1">
                    <div
                      className={[
                        "font-semibold truncate text-[13px] md:text-[14px]",
                        isSelf ? "text-white" : "text-white/90",
                      ].join(" ")}
                    >
                      {row ? row.name : "—"}
                    </div>
                  </div>

                  <div
                    className="relative w-full max-w-[260px] flex flex-col justify-end"
                    style={{ height: h + 18 }}
                  >
                    <div
                      className="w-full h-[18px]"
                      style={{ background: "linear-gradient(to top, #1A1D2C 0%, #13141F 100%)" }}
                    />
                    <div className="relative w-full bg-[#212539]" style={{ height: h }}>
                      <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                        <span
                          className={[
                            "font-extrabold tabular-nums select-none text-[#D6DAE7]",
                            rank === 1 ? "text-[36px]" : rank === 2 ? "text-[32px]" : "text-[28px]",
                          ].join(" ")}
                          style={{
                            textShadow: "0 1px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.15)",
                            opacity: 0.92,
                          }}
                        >
                          {rank}
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Carte résultat joueur (remplace le tableau) */}
      <div className="px-3 md:px-6 mt-10">
        <div className="mx-auto max-w-[740px]">
          <div className="w-3/4 mx-auto">
            <div className="mb-2 flex items-end justify-between text-white">
              <span
                className="text-[32px] leading-[0.9]"
                style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
              >
                {displayLevelLeft}
              </span>
              <span
                className="text-[20px] leading-none text-white/90"
                style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
              >
                {displayXpLabel}
              </span>
              <span
                className="text-[32px] leading-[0.9]"
                style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
              >
                {displayLevelRight}
              </span>
            </div>

            <div className="grid grid-cols-10 gap-1.5">
              {Array.from({ length: XP_SEGMENTS }).map((_, segmentIndex) => {
                const fill = animatedSegmentFills[segmentIndex] ?? 0;
                const hasFill = fill > 0;

                return (
                  <div
                    key={segmentIndex}
                    className="relative h-4"
                  >
                    <div
                      className="pointer-events-none absolute inset-y-0 left-0 rounded-[2px] transition-[width] ease-out"
                      style={{
                        width: `${fill * 100}%`,
                        transitionDuration: disableSegmentTransition ? "0ms" : `${SEGMENT_ANIMATION_MS}ms`,
                      transitionDelay: disableSegmentTransition
                        ? "0ms"
                        : hasFill
                          ? `${segmentIndex * SEGMENT_STAGGER_MS}ms`
                          : "0ms",
                        boxShadow: hasFill
                          ? "0 0 4px rgba(248, 213, 72, 0.66), 0 0 8px rgba(248, 213, 72, 0.32)"
                          : "none",
                    }}
                  />
                    <div className="relative h-full overflow-hidden rounded-[2px] bg-[#454254]">
                      <div
                        className="absolute inset-y-0 left-0 bg-[#F8D548] transition-[width] ease-out"
                        style={{
                          width: `${fill * 100}%`,
                          transitionDuration: disableSegmentTransition ? "0ms" : `${SEGMENT_ANIMATION_MS}ms`,
                          transitionDelay: disableSegmentTransition
                            ? "0ms"
                            : hasFill
                              ? `${segmentIndex * SEGMENT_STAGGER_MS}ms`
                              : "0ms",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="mt-12 w-[90%] mx-auto grid grid-cols-3 items-start gap-4 text-white">
            <div className="flex items-center gap-3 justify-self-start">
              <img src={medalUrl} alt="Médaille" className="h-12 w-12 object-contain" draggable={false} />
              <div className="leading-tight">
                <div
                  className="text-[26px] leading-[0.85]"
                  style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
                >
                  #{selfPosition ?? "--"}
                </div>
                <div
                  className="mt-1 text-[19px] leading-[0.9] text-white/90"
                  style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
                >
                  {selfScore} points
                </div>
              </div>
            </div>

            <div className="flex w-fit items-center justify-center gap-3 justify-self-center">
              <img
                src={profileSrc}
                alt="Avatar joueur"
                className="h-14 w-14 rounded-[2px] object-cover"
                draggable={false}
                loading="lazy"
              />
              <div className="leading-tight">
                <div
                  className="max-w-[220px] truncate text-[26px] leading-[0.85]"
                  style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
                >
                  {selfRow?.name ?? "Joueur"}
                </div>
                <div
                  className="mt-1 text-[17px] leading-[0.9] text-white/90"
                  style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
                >
                  Classement indisponible
                </div>
              </div>
            </div>

            <div className="flex items-center gap-3 justify-self-end">
              <img src={giftUrl} alt="Récompenses" className="h-12 w-12 object-contain" draggable={false} />
              <div className="mt-2 flex items-center gap-1">
                <div
                  className="text-[26px] leading-none"
                  style={{ fontFamily: '"Acumin Pro Extra Condensed Bold Italic", sans-serif' }}
                >
                  + {selfBits}
                </div>
                <img src={bitUrl} alt="Bits" className="h-8 w-8 object-contain" draggable={false} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
