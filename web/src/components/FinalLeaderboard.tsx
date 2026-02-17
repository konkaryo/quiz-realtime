// web/src/components/FinalLeaderboard.tsx

import React, { useEffect, useMemo, useRef } from "react";
import starUrl from "../assets/star.png";
import { getLevelFromExperience } from "../utils/experience";

type Row = {
  id: string;
  name: string;
  score: number;
  img?: string | null;
  bits?: number;
  xp?: number;
  experience?: number;
  stats?: {
    correct?: number;
    correctQcm?: number;
    wrong?: number;
  } | null;
  statsCorrect?: number;
  statsCorrectQcm?: number;
  statsWrong?: number;
  correct?: number;
  correctQcm?: number;
  wrong?: number;
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
  const listRows = rows;

  // 2 | 1 | 3
  const podiumSlots = useMemo(
    () =>
      [
        { h: 62, ring: "ring-slate-300/60", rank: 2 },
        { h: 82, ring: "ring-amber-300/70", rank: 1 },
        { h: 54, ring: "ring-orange-300/60", rank: 3 },
      ].map((slot) => ({ ...slot, row: rows[slot.rank - 1] })),
    [rows]
  );

  const isSelfRow = (r: Row) =>
    (!!selfId && r.id === selfId) ||
    (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase());

  const getRowStats = (row: Row) => {
    const correct = row.stats?.correct ?? row.statsCorrect ?? row.correct ?? 0;
    const correctQcm =
      row.stats?.correctQcm ?? row.statsCorrectQcm ?? row.correctQcm ?? 0;
    const wrong = row.stats?.wrong ?? row.statsWrong ?? row.wrong ?? 0;

    return {
      correct: Number.isFinite(correct) ? Math.max(0, correct) : 0,
      correctQcm: Number.isFinite(correctQcm) ? Math.max(0, correctQcm) : 0,
      wrong: Number.isFinite(wrong) ? Math.max(0, wrong) : 0,
    };
  };

  const podiumStepBackgroundClass = "bg-[#1C1F2E]";
  const activeRowBackground =
    "linear-gradient(to bottom, rgba(162, 143, 255, 0.35), rgba(162,143,255,0.27))";

  const activeItemRef = useRef<HTMLLIElement | null>(null);
  const activeListIndex = listRows.findIndex(isSelfRow);

  useEffect(() => {
    const item = activeItemRef.current;
    if (!item) return;
    const id = requestAnimationFrame(() => {
      item.scrollIntoView({ block: "center", inline: "nearest" });
    });
    return () => cancelAnimationFrame(id);
  }, [activeListIndex, listRows.length]);

  // IMPORTANT: header + rows MUST be in the SAME scroll container
  // otherwise scrollbar width shifts the content and breaks perfect alignment.
  const columns = "52px minmax(0,1.55fr) minmax(118px,0.85fr) 100px 64px 56px";
  const cellLeft = "text-left justify-self-start";

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

              return (
                <div key={rank} className="flex flex-col items-center">
                  {/* Avatar */}
                  {shouldShowAvatarFrame ? (
                    <div
                      className={[
                        "w-12 h-12 md:w-14 md:h-14 rounded-[6px] overflow-hidden",
                        "ring-4",
                        ring,
                        "shadow-[0_10px_40px_rgba(0,0,0,.45)]",
                      ].join(" ")}
                      aria-label={row ? `Avatar de ${row.name}` : "Aucun joueur"}
                    >
                      {row ? (
                        <img
                          src={row.img ?? "/img/profiles/0.avif"}
                          alt=""
                          className="w-full h-full object-cover"
                          draggable={false}
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-full h-full bg-white/10" />
                      )}
                    </div>
                  ) : (
                    <div className="w-12 h-12 md:w-14 md:h-14" aria-hidden="true" />
                  )}

                  {/* Nom */}
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

                  {/* Marche */}
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

      {/* Liste */}
      {listRows.length > 0 && (
        <div className="px-3 md:px-6 mt-4">
          {/* Scroll container UNIQUE (header sticky + rows) => alignement parfait malgré la scrollbar */}
          <div className="lb-scroll max-h-[28vh] md:max-h-[32vh] overflow-y-auto pr-2">
            {/* Header sticky */}
            <div
              className={[
                "sticky top-0 z-10",
                "grid items-center px-3 py-1",
                "font-mono text-[10px] font-semibold uppercase tracking-[0.05em] text-white/60",
                "bg-[#111322]/90 backdrop-blur",
                "border-b border-white/5",
              ].join(" ")}
              style={{ gridTemplateColumns: columns }}
            >
              <span className={cellLeft}>#</span>
              <span className={cellLeft}>Joueur</span>
              <span className={cellLeft}>Statistiques</span>
              <span className={cellLeft}>Expérience</span>
              <span className={cellLeft}>Bits</span>
              <span className={cellLeft}>Score</span>
            </div>

            <ol className="space-y-1 pb-1 pt-1">
              {listRows.map((r, idx) => {
                const rank = idx + 1;
                const isSelf = isSelfRow(r);

                const bgClass = isSelf
                  ? "text-white"
                  : `${podiumStepBackgroundClass} text-white`;

                const stats = getRowStats(r);

                return (
                  <li
                    key={r.id}
                    ref={isSelf ? activeItemRef : undefined}
                    className={["grid items-center px-3 py-1.5 overflow-hidden", bgClass].join(" ")}
                    style={{
                      minHeight: 38,
                      gridTemplateColumns: columns,
                      background: isSelf ? activeRowBackground : "#202334",
                    }}
                  >
                    <span className={[cellLeft, "tabular-nums text-[11px] opacity-80"].join(" ")}>
                      #{rank}
                    </span>

                    <div className={[cellLeft, "flex items-center gap-2 min-w-0"].join(" ")}>
                      <img
                        src={r.img ?? "/img/profiles/0.avif"}
                        alt=""
                        className="w-5 h-5 rounded-[5px] object-cover flex-shrink-0"
                        draggable={false}
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[12px] leading-[14px]">
                          {r.name}
                        </div>
                        <div className="text-[10px] leading-[12px] opacity-70">
                          Niveau {getLevelFromExperience((r.experience ?? 0) + (r.xp ?? 0))}
                        </div>
                      </div>
                    </div>

                    <div className={[cellLeft, "flex items-center justify-start gap-3 text-[11px] tabular-nums"].join(" ")}>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{stats.correct}</span>
                        <span className="text-emerald-400 text-[10px]">▲</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{stats.correctQcm}</span>
                        <span className="text-amber-400 text-[10px]">■</span>
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span>{stats.wrong}</span>
                        <span className="text-red-400 text-[10px]">▼</span>
                      </span>
                    </div>

                    <div className={[cellLeft, "flex items-center justify-start gap-2"].join(" ")}>
                      <span className="tabular-nums text-[11px] font-semibold text-white">
                        +{r.xp ?? 0}
                      </span>

                      <span
                        className="relative w-5 h-5 shrink-0"
                        aria-hidden="true"
                        data-xp-source={isSelf ? "final-leaderboard-self" : undefined}
                      >
                        <img
                          src={starUrl}
                          alt=""
                          aria-hidden
                          className="absolute inset-0 w-full h-full object-contain"
                          draggable={false}
                        />
                        <span className="absolute inset-0 flex items-center justify-center">
                          <span
                            className="relative z-[1] text-[8px] font-bold text-white leading-none"
                            style={{ textShadow: "0 1px 0 rgba(0,0,0,.55)", transform: "translateX(0.5px)" }}
                          >
                            XP
                          </span>
                        </span>
                      </span>
                    </div>

                    <span className={[cellLeft, "tabular-nums text-[11px] text-emerald-200/90"].join(" ")}>
                      +{r.bits ?? 0}b
                    </span>

                    <span className={[cellLeft, "tabular-nums text-[12px] font-semibold"].join(" ")}>
                      {r.score}
                    </span>
                  </li>
                );
              })}
            </ol>
          </div>
        </div>
      )}
    </div>
  );
}
