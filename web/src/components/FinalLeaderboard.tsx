// web/src/components/FinalLeaderboard.tsx

import React, { useMemo } from "react";
import podiumImage from "../assets/podium.png";
import goldMedalImage from "../assets/gold_medal.png";
import silverMedalImage from "../assets/silver_medal.png";
import bronzeMedalImage from "../assets/bronze_medal.png";
import crownImage from "../assets/crown.png";

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
      </div>
    </div>
  );
}
