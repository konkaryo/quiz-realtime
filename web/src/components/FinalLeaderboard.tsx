import React, { useEffect, useMemo, useRef } from "react";
import laurier from "../assets/laurier.png";
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
        { h: 105, ring: "ring-slate-300/60", rank: 2 },
        { h: 145, ring: "ring-amber-300/70", rank: 1 },
        { h: 90, ring: "ring-orange-300/60", rank: 3 },
      ].map((slot) => ({ ...slot, row: rows[slot.rank - 1] })),
    [rows]
  );

  const isSelfRow = (r: Row) =>
    (!!selfId && r.id === selfId) ||
    (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase());

  const podiumStepBackgroundClass = "bg-[#11182A]";
  const listAlternateBackgroundClass = "bg-[#1B2132]";

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
    <div className="px-2 pt-1 pb-2">
      {/* Podium */}
      <div className="px-3 md:px-6 pt-2 pb-1">
        <div className="relative overflow-hidden rounded-xl">
          <div className="relative grid grid-cols-1 md:grid-cols-3 items-end gap-7 py-3">
            {podiumSlots.map((slot) => {
              const { row, h, ring, rank } = slot;
              const isSelf = row ? isSelfRow(row) : false;

              return (
                <div key={rank} className="flex flex-col items-center">
                  {/* Avatar — réduit */}
                  <div
                    className={[
                      "w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden",
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
                  <div className="mt-2 mb-2 text-center max-w-[220px] px-1">
                    <div
                      className={[
                        "font-semibold truncate",
                        isSelf ? "text-white" : "text-white/90",
                      ].join(" ")}
                    >
                      {row ? row.name : "—"}
                    </div>
                  </div>

                  {/* Marche — hauteur réduite + même style */}
                  <div
                    className={[
                      "relative w-full max-w-[260px] rounded-t-xl",
                      podiumStepBackgroundClass,
                      "border-x border-t border-white/10",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_16px_40px_rgba(0,0,0,.55)]",
                    ].join(" ")}
                    style={{ height: h }}
                  >
                  {/* numéro gravé */}
                  <div className="absolute inset-0 pointer-events-none flex items-center justify-center">
                    <div className={["flex items-center", rank === 1 ? "flex-col gap-0" : ""].join(" ")}>
                      <span
                        className={[
                          "font-extrabold tabular-nums select-none",
                          rank === 1 ? "text-[52px]" : rank === 2 ? "text-[48px]" : "text-[44px]",
                          "text-white/20",
                          "text-[#696D77]",
                        ].join(" ")}
                        style={{
                          textShadow:
                            "0 1px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.15)",
                        }}
                      >
                        {rank}
                      </span>
                      {rank === 1 ? (
                        <img
                          src={laurier}
                          alt=""
                          className="w-16 md:w-20 opacity-80 -mt-6"
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
            <ol className="space-y-1.5">
              {listRows.map((r, idx) => {
                const rank = idx + 1;
                const isSelf = isSelfRow(r);
                const hasAlternateBackground = idx % 2 === 1;

                return (
                  <li
                    key={r.id}
                    ref={isSelf ? activeItemRef : undefined}
                    className={[
                      "flex items-center justify-between rounded-lg px-3 py-1.5 border shadow-[0_4px_10px_rgba(0,0,0,.22)] overflow-hidden",
                      "text-[13px] leading-tight",
                      isSelf
                        ? "border-0 bg-gradient-to-b from-[#D30E72] to-[#770577] text-white"
                        : `${
                            hasAlternateBackground
                              ? listAlternateBackgroundClass
                              : podiumStepBackgroundClass
                          } text-white border-white/10`,
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 text-right opacity-80 tabular-nums">#{rank}</span>
                      <img
                        src={r.img ?? "/img/profiles/0.avif"}
                        alt=""
                        className="w-6 h-6 rounded-md object-cover border border-white/15"
                        draggable={false}
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <div className="truncate">{r.name}</div>
                        <div className="text-[11px] opacity-70">
                          Niveau {getLevelFromExperience((r.experience ?? 0) + (r.xp ?? 0))}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="tabular-nums text-[12px] text-cyan-200/90">
                        +{r.xp ?? 0} xp
                      </span>
                      <span className="tabular-nums text-[12px] text-emerald-200/90">
                        +{r.bits ?? 0} bits
                      </span>
                      <span className="tabular-nums text-sm">{r.score}</span>
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
