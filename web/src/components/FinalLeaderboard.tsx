// web/src/components/FinalLeaderboard.tsx

import React, { useMemo } from "react";
import podiumImage from "../assets/podium.png";

type Row = {
  id: string;
  name: string;
  score: number;
  img?: string | null;
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
  const isSelfRow = (r: Row) =>
    (!!selfId && r.id === selfId) ||
    (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase());

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

  return (
    <div className="px-2 pb-2 flex justify-center">
      {/* Podium */}
      <div className="w-full px-3 md:px-6 pb-1">
        <div className="relative mx-auto flex w-full justify-center -mt-20 pt-3">
          <img
            src={podiumImage}
            alt="Podium"
            className="block h-auto w-[130%] max-w-none -mt-[100px] select-none"
            draggable={false}
            loading="lazy"
          />

          <div className="absolute left-1/2 -translate-x-1/2 bottom-[18%] w-[130%] grid grid-cols-3 items-end gap-0 px-2">
            {podiumSlots.map((slot) => {
              const { row, rank } = slot;
              const isSelf = row ? isSelfRow(row) : false;
              const shouldShowAvatarFrame = !!row || rank === 1;
              const podiumFrameGradientByRank: Record<number, string> = {
                1: "bg-[linear-gradient(to_bottom,#A28130_0%,#FDE38F_50%,#A28130_100%)]",
                2: "bg-[linear-gradient(to_bottom,#93989B_0%,#ECECEC_50%,#93989B_100%)]",
                3: "bg-[linear-gradient(to_bottom,#644014_0%,#BC812E_50%,#644014_100%)]",
              };
              const avatarFrameClass = podiumFrameGradientByRank[rank]
                ? ["p-[4px]", podiumFrameGradientByRank[rank]].join(" ")
                : "ring-4 ring-white/60";

              return (
                <div key={rank} className="flex flex-col items-center">
                  {shouldShowAvatarFrame ? (
                    <div
                      className={[
                        rank === 1
                          ? "w-[100px] h-[100px] -mt-[100px]"
                          : rank === 2
                          ? "w-[80px] h-[80px] -mt-[0px] ml-[280px]"
                          : "w-[80px] h-[80px] -mt-[24px] mr-[280px]",
                        "rounded-[6px]",
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

                  <div className="h-[36px] md:h-[42px] flex items-end justify-center">
                    <span
                      className={[
                        "font-extrabold tabular-nums select-none text-[#D6DAE7]",
                        rank === 1 ? "text-[34px]" : rank === 2 ? "text-[30px]" : "text-[26px]",
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
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
