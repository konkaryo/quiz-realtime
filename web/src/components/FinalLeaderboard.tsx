// web/src/components/FinalLeaderboard.tsx

import { useEffect, useRef } from "react";
import goldMedalImage from "../assets/gold_medal.png";
import silverMedalImage from "../assets/silver_medal.png";
import bronzeMedalImage from "../assets/bronze_medal.png";
import crownImage from "../assets/crown.png";
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

type WinnerCardConfig = {
  rank: 1 | 2 | 3;
  medal: string;
  scoreColor: string;
  cardClassName: string;
  borderColor: string;
  avatarRingClassName: string;
  widthClassName: string;
  topOffsetClassName: string;
};

const winnerCards: WinnerCardConfig[] = [
  {
    rank: 2,
    medal: silverMedalImage,
    scoreColor: "#B9E4FF",
    cardClassName: "shadow-[0_20px_55px_rgba(0,0,0,0.34)]",
    borderColor: "#E7EDF8",
    avatarRingClassName: "bg-[linear-gradient(135deg,#FFFFFF_0%,#CBD3E1_48%,#8D96AA_100%)]",
    widthClassName: "w-[180px] md:w-[200px]",
    topOffsetClassName: "md:mt-8",
  },
  {
    rank: 1,
    medal: goldMedalImage,
    scoreColor: "#FFD33F",
    cardClassName:
      "shadow-[0_24px_70px_rgba(0,0,0,0.44),0_0_32px_rgba(246,195,59,0.12)]",
    borderColor: "#F6C33B",
    avatarRingClassName: "bg-[linear-gradient(135deg,#FFF5A9_0%,#FFD23B_52%,#B76E00_100%)]",
    widthClassName: "w-[195px] md:w-[218px]",
    topOffsetClassName: "md:mt-0",
  },
  {
    rank: 3,
    medal: bronzeMedalImage,
    scoreColor: "#FF9A62",
    cardClassName: "shadow-[0_20px_55px_rgba(0,0,0,0.34)]",
    borderColor: "#E28A4C",
    avatarRingClassName: "bg-[linear-gradient(135deg,#FFD3AE_0%,#E28A4C_50%,#8D4B2A_100%)]",
    widthClassName: "w-[180px] md:w-[200px]",
    topOffsetClassName: "md:mt-8",
  },
];

const defaultProfile = "/img/profiles/0.avif";

function playerLevel(row: Row) {
  return getLevelFromExperience(row.experience ?? 0);
}

function formatScore(score: number) {
  return Math.round(score).toLocaleString("fr-FR");
}

export function FinalLeaderboard({
  rows,
  selfId,
  selfName,
}: {
  rows: Row[];
  selfId?: string | null;
  selfName?: string | null;
}) {
  const isSelfRow = (row: Row) =>
    (!!selfId && row.id === selfId) ||
    (!!selfName && row.name?.toLowerCase() === selfName.toLowerCase());

  const otherRows = rows.slice(3);
  const activeOtherIndex = otherRows.findIndex((row) => isSelfRow(row));
  const rankingScrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = rankingScrollRef.current;
    if (!container || activeOtherIndex < 0) return;

    const activeRow = container.querySelector<HTMLElement>("[data-active-player='true']");
    if (!activeRow) return;

    container.scrollTop = activeRow.offsetTop - container.clientHeight / 2 + activeRow.clientHeight / 2;
  }, [activeOtherIndex, otherRows.length]);

  return (
    <section className="px-2 pb-4 pt-8 md:pt-12">
      <div className="mx-auto flex w-full max-w-[720px] flex-col items-center">
        <div className="grid w-full grid-cols-1 place-items-center gap-4 md:grid-cols-3 md:items-end md:gap-4">
          {winnerCards.map((card) => {
            const row = rows[card.rank - 1];
            if (!row) {
              return (
                <div
                  key={`podium-placeholder-${card.rank}`}
                  className={["hidden md:block", card.widthClassName, card.topOffsetClassName].join(" ")}
                  aria-hidden="true"
                />
              );
            }

            const level = playerLevel(row);

            return (
              <article
                key={row.id}
                className={[
                  "isolate relative flex min-h-[230px] flex-col items-center rounded-[10px] px-4 pb-6 pt-6 text-center backdrop-blur-md transition-transform duration-300",
                  card.rank === 1 ? "md:min-h-[278px]" : "md:min-h-[238px]",
                  card.widthClassName,
                  card.topOffsetClassName,
                  card.cardClassName,
                ].join(" ")}
              >
                <span
                  className="pointer-events-none absolute inset-[3px] z-0 rounded-[8px] bg-[linear-gradient(180deg,#1B2135_0%,#0C1222_100%)]"
                  aria-hidden="true"
                />
                <svg
                  className="pointer-events-none absolute inset-0 z-10 h-full w-full overflow-visible rounded-[10px]"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden="true"
                  focusable="false"
                >
                  <defs>
                    <linearGradient id={`winner-card-border-${card.rank}`} x1="0" y1="0" x2="0" y2="100" gradientUnits="userSpaceOnUse">
                      <stop offset="0%" stopColor={card.borderColor} stopOpacity="1" />
                      <stop offset="42%" stopColor={card.borderColor} stopOpacity="0.55" />
                      <stop offset="92%" stopColor={card.borderColor} stopOpacity="0" />
                    </linearGradient>
                  </defs>
                  <rect
                    x="0.8"
                    y="0.8"
                    width="98.4"
                    height="98.4"
                    rx="5"
                    ry="5"
                    fill="none"
                    stroke={`url(#winner-card-border-${card.rank})`}
                    strokeWidth="1.8"
                    vectorEffect="non-scaling-stroke"
                  />
                </svg>
                {card.rank === 1 ? (

                  <img
                    src={crownImage}
                    alt="Couronne du vainqueur"
                    className="pointer-events-none absolute -top-[44px] left-1/2 z-30 h-auto w-[72px] -translate-x-1/2 select-none drop-shadow-[0_12px_14px_rgba(0,0,0,0.45)]"
                    draggable={false}
                    loading="lazy"
                  />

                ) : null}

                <div className="relative z-20 mb-4 mt-1">
                  <div className={["h-[78px] w-[78px] rounded-full p-[3px]", card.avatarRingClassName].join(" ")}>
                    <img
                      src={row.img ?? defaultProfile}
                      alt=""
                      className="h-full w-full rounded-full bg-[#D8DCE3] object-cover"
                      draggable={false}
                      loading="lazy"
                    />
                  </div>
                  <img
                    src={card.medal}
                    alt={`Médaille rang ${card.rank}`}
                    className="pointer-events-none absolute -bottom-5 left-1/2 h-auto w-[50px] -translate-x-1/2 select-none drop-shadow-[0_10px_14px_rgba(0,0,0,0.4)]"
                    draggable={false}
                    loading="lazy"
                  />
                </div>
                <div className="relative z-20 mt-4 min-w-0 max-w-full">
                  <h3 className="truncate font-inter text-[16px] font-bold leading-tight text-white">{row.name}</h3>
                  <p className="mt-1 text-[13px] font-semibold leading-none text-white/72">Niveau {level}</p>
                </div>
                <div
                  className="relative z-20 mt-4 leading-none"
                  style={{
                    fontFamily: '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif',
                    fontStyle: "italic",
                    color: card.scoreColor,
                  }}
                >
                  <span className={card.rank === 1 ? "text-[44px] md:text-[50px]" : "text-[38px] md:text-[44px]"}>
                    {formatScore(row.score)}
                  </span>
                  <span className="ml-1 text-[22px] md:text-[24px]">pts</span>
                </div>
              </article>
            );
          })}
        </div>

        {otherRows.length > 0 ? (
          <div className="mt-6 w-full max-w-[820px] overflow-hidden rounded-[10px] bg-[#191F31] font-inter shadow-[0_18px_55px_rgba(0,0,0,0.32)] md:mt-7">
            <div ref={rankingScrollRef} className="max-h-[220px] overflow-y-auto py-2 [scrollbar-color:rgba(255,255,255,0.28)_transparent] [scrollbar-width:thin]">
              <ol>
                {otherRows.map((row, index) => {
                  const rank = index + 4;
                  const isSelf = isSelfRow(row);
                  const level = playerLevel(row);
                  const rankClass = isSelf ? "bg-white text-[#191F31]" : "text-white";
                  const activeChipClass = isSelf ? "bg-white text-[#191F31]" : "text-white";
                  const levelClass = isSelf ? "bg-white text-[#191F31]" : "text-white/78";

                  return (
                    <li
                      key={row.id}
                      data-active-player={isSelf ? "true" : undefined}
                      className="grid grid-cols-[34px_minmax(140px,1fr)_120px_76px] items-center gap-3 border-b border-white/[0.07] px-10 py-1.5 last:border-b-0 md:grid-cols-[42px_minmax(180px,1fr)_160px_92px]"
                    >
                      <span className={["inline-flex h-6 w-6 items-center justify-center rounded-[4px] tabular-nums text-[12px] font-extrabold leading-none", rankClass].join(" ")}>{rank}</span>

                      <div className="flex min-w-0 items-center gap-2.5">
                        <img
                          src={row.img ?? defaultProfile}
                          alt=""
                          className="h-6 w-6 shrink-0 rounded-[4px] object-cover"
                          draggable={false}
                          loading="lazy"
                        />
                        <div className={["min-w-0 truncate rounded-[4px] px-2 py-1 text-[12px] font-extrabold leading-none", activeChipClass].join(" ")}>{row.name}</div>
                      </div>

                      <div className={["w-fit rounded-[4px] px-2 py-1 text-[12px] font-bold leading-none", levelClass].join(" ")}>Niveau {level}</div>

                      <div className="flex justify-end"><span className={["rounded-[4px] px-2 py-1 text-right text-[12px] font-extrabold leading-none tabular-nums", activeChipClass].join(" ")}>{formatScore(row.score)}</span></div>
                    </li>
                  );
                })}
              </ol>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
