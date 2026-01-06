// web/src/components/FinalLeaderboard.tsx

import React, { useEffect, useMemo, useRef } from "react";
import laurier from "../assets/laurier.png";
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
        { h: 80, ring: "ring-slate-300/60", rank: 2 },
        { h: 110, ring: "ring-amber-300/70", rank: 1 },
        { h: 70, ring: "ring-orange-300/60", rank: 3 },
      ].map((slot) => ({ ...slot, row: rows[slot.rank - 1] })),
    [rows]
  );

  const isSelfRow = (r: Row) =>
    (!!selfId && r.id === selfId) ||
    (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase());

  const podiumStepBackgroundClass = "bg-[#1A1E33]";
  const listAlternateBackgroundClass = "bg-[#151827]";

  const listWrapRef = useRef<HTMLDivElement | null>(null);
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

  return (
    <div className="px-2 pb-2">
      {/* Podium */}
      <div className="px-3 md:px-6 pb-1">
        <div className="relative overflow-hidden rounded-xl">
          <div className="relative grid grid-cols-1 md:grid-cols-3 items-end gap-7 py-3">
            {podiumSlots.map((slot) => {
              const { row, h, ring, rank } = slot;
              const isSelf = row ? isSelfRow(row) : false;

              return (
                <div key={rank} className="flex flex-col items-center">
                  {/* Avatar */}
                  <div
                    className={[
                      "w-14 h-14 md:w-16 md:h-16 rounded-xl overflow-hidden",
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
                    className={[
                      "relative w-full max-w-[260px] rounded-t-xl",
                      podiumStepBackgroundClass,
                      "border-x border-t border-white/10",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_16px_40px_rgba(0,0,0,.55)]",
                    ].join(" ")}
                    style={{ height: h }}
                  >
                    <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                      <div
                        className={[
                          "flex items-center",
                          rank === 1 ? "flex-col gap-0" : "",
                        ].join(" ")}
                      >
                        <span
                          className={[
                            "font-extrabold tabular-nums select-none",
                            rank === 1
                              ? "text-[40px]"
                              : rank === 2
                              ? "text-[36px]"
                              : "text-[32px]",
                            "text-[#D6DAE7]",
                          ].join(" ")}
                          style={{
                            textShadow:
                              "0 1px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.15)",
                              opacity: .92,
                          }}
                        >
                          {rank}
                        </span>

                        {rank === 1 ? (
                          <img
                            src={laurier}
                            alt=""
                            className="w-12 md:w-16 opacity-80 -mt-6"
                            draggable={false}
                            loading="lazy"
                          />
                        ) : null}
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
        <div className="px-3 md:px-6 mt-6">
          <div
            ref={listWrapRef}
            className="lb-scroll max-h-[28vh] md:max-h-[32vh] overflow-y-auto pr-2"
          >
            {/* ✅ plus dense */}
            <ol className="space-y-1.5">
              {listRows.map((r, idx) => {
                const rank = idx + 1;
                const isSelf = isSelfRow(r);
                const hasAlternateBackground = idx % 2 === 1;

                const bgClass = isSelf
                  ? "border-0 bg-gradient-to-b from-[#D30E72] to-[#770577] text-white"
                  : `${
                      hasAlternateBackground
                        ? listAlternateBackgroundClass
                        : podiumStepBackgroundClass
                    } text-white border-white/10`;

                return (
                  <li
                    key={r.id}
                    ref={isSelf ? activeItemRef : undefined}
                    className={[
                      "flex items-center justify-between",
                      "rounded-[6px]",
                      "pl-2.5 pr-3 py-1",
                      "border",
                      "shadow-[0_3px_8px_rgba(0,0,0,.18)]",
                      "overflow-hidden",
                      bgClass,
                    ].join(" ")}
                    style={{
                      // ✅ ligne vraiment compacte
                      minHeight: 36,
                    }}
                  >
                    {/* LEFT */}
                    <div className="flex items-center gap-2 min-w-0">
                      {/* Rang */}
                      <span className="w-[28px] text-right opacity-80 tabular-nums text-[11px] leading-none flex-shrink-0">
                        #{rank}
                      </span>

                      {/* Avatar (plus petit) */}
                      <img
                        src={r.img ?? "/img/profiles/0.avif"}
                        alt=""
                        className="w-5 h-5 rounded-[5px] object-cover border border-white/15 flex-shrink-0"
                        draggable={false}
                        loading="lazy"
                      />

                      {/* Nom + niveau (typo plus petite) */}
                      <div className="min-w-0">
                        <div className="truncate font-semibold text-[12px] leading-[14px]">
                          {r.name}
                        </div>
                        <div className="text-[10px] leading-[12px] opacity-70">
                          Niveau{" "}
                          {getLevelFromExperience(
                            (r.experience ?? 0) + (r.xp ?? 0)
                          )}
                        </div>
                      </div>
                    </div>

                    {/* RIGHT (compact + largeurs fixes) */}
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <div className="flex items-center justify-end gap-2 w-[84px]">
                        <span className="text-right tabular-nums text-[13px] font-semibold text-white">
                          +{r.xp ?? 0}
                        </span>

                        {/* ✅ SOURCE pour l'animation "flying stars" (uniquement sur la ligne self) */}
                        <span
                          className="relative w-6 h-6 shrink-0"
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
                              className="relative z-[1] text-[9px] font-bold text-white leading-none"
                              style={{
                                textShadow: "0 1px 0 rgba(0,0,0,.55)",
                                transform: "translateX(0.5px)",
                              }}
                            >
                              XP
                            </span>
                          </span>
                        </span>
                      </div>

                      <span className="w-[64px] text-right tabular-nums text-[11px] text-emerald-200/90">
                        +{r.bits ?? 0}b
                      </span>
                      <span className="w-[44px] text-right tabular-nums text-[12px] font-semibold">
                        {r.score}
                      </span>
                    </div>
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
