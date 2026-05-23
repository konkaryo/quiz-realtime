// web/src/components/FinalLeaderboard.tsx

import React, { useMemo } from "react";
import podiumImage from "../assets/podium.png";
import goldMedalImage from "../assets/gold_medal.png";
import silverMedalImage from "../assets/silver_medal.png";
import bronzeMedalImage from "../assets/bronze_medal.png";

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
                1: "bg-[radial-gradient(circle,#FEF7BE_0%,#FEF7BE_67%,#FED865_73%,#DCA023_86%,#DCA023_100%)]",
                2: "bg-[radial-gradient(circle,#FBFBFB_0%,#FBFBFB_67%,#D3D3D5_73%,#C0C0C2_86%,#C0C0C2_100%)]",
                3: "bg-[radial-gradient(circle,#FECD9E_0%,#FECD9E_67%,#BA7649_73%,#B26C40_86%,#B26C40_100%)]",
              };
              const frameSizeByRank: Record<number, number> = {
                1: 100,
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
                        "relative z-10",
                        "rounded-[6px]",
                        avatarFrameClass,
                        "shadow-[0_10px_40px_rgba(0,0,0,.45)]",
                      ].join(" ")}
                      style={podiumFrameGradientByRank[rank] ? { padding: `${framePadding}px` } : undefined}
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

                  <img
                    src={medalByRank[rank]}
                    alt={`Médaille rang ${rank}`}
                    className={[
                      "h-auto select-none pointer-events-none relative z-20",
                      rank === 1
                        ? "w-[58px] -mt-[16px]"
                        : rank === 2
                        ? "w-[52px] -mt-[8px] ml-[280px]"
                        : "w-[52px] -mt-[14px] mr-[280px]",
                    ].join(" ")}
                    draggable={false}
                    loading="lazy"
                  />

                  <div className="mt-1.5 mb-2 h-[32px] md:h-[36px] flex items-center justify-center text-center max-w-[160px] md:max-w-[180px] px-1">
                    <div
                      className={[
                        "font-semibold truncate text-[13px] md:text-[14px]",
                        isSelf ? "text-white" : "text-white/90",
                      ].join(" ")}
                    >
                      {row ? row.name : "—"}
                    </div>
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
