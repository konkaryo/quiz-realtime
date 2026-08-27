// web/src/components/FinalLeaderboard.tsx

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
  accent: string;
  scoreColor: string;
  size: string;
  scale: string;
  order: string;
};

const winnerCards: WinnerCardConfig[] = [
  {
    rank: 2,
    accent: "#91AFFF",
    scoreColor: "#AFC5FF",
    size: "w-full min-h-[96px] 2xl:w-[200px] 2xl:min-h-[238px]",
    scale: "2xl:scale-[0.90]",
    order: "order-2 2xl:order-1",
  },
  {
    rank: 1,
    accent: "#FFD33F",
    scoreColor: "#FFD33F",
    size: "w-full min-h-[96px] 2xl:w-[200px] 2xl:min-h-[238px]",
    scale: "2xl:scale-[1]",
    order: "order-1 2xl:order-2",
  },
  {
    rank: 3,
    accent: "#FF865E",
    scoreColor: "#FF865E",
    size: "w-full min-h-[96px] 2xl:w-[200px] 2xl:min-h-[238px]",
    scale: "2xl:scale-[0.90]",
    order: "order-3",
  },
];

const defaultProfile = "/img/profiles/0.avif";

function formatScore(score: number) {
  return Math.round(score).toLocaleString("fr-FR");
}

function RankHexagon({ rank, color }: { rank: number; color: string }) {
  return (
    <div
      className="absolute left-0 top-1/2 z-30 grid h-10 w-10 -translate-x-1/2 -translate-y-1/2 place-items-center 2xl:-top-5 2xl:left-1/2 2xl:translate-y-0"
      style={{
        backgroundColor: color,
        clipPath: "polygon(50% 0, 93% 25%, 93% 75%, 50% 100%, 7% 75%, 7% 25%)",
      }}
      aria-label={`${rank}${rank === 1 ? "er" : "e"} au classement`}
    >
      <span className="font-brutal text-[21px] leading-none text-[#11131F]">{rank}</span>
    </div>
  );
}

export function FinalLeaderboard({ rows }: { rows: Row[]; selfId?: string | null; selfName?: string | null }) {
  return (
    <section className="px-2 pb-6 pt-5 2xl:pt-8">
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center">
        <header className="mb-10 text-center 2xl:mb-28">
          <h2 className="font-brand text-[38px] font-black uppercase leading-none tracking-[0.055em] text-white 2xl:text-[54px]">
            Partie terminée
          </h2>
        </header>

        <div className="grid w-full grid-cols-1 place-items-center gap-3 px-5 2xl:max-w-[648px] 2xl:grid-cols-[repeat(3,200px)] 2xl:items-center 2xl:justify-center 2xl:gap-6 2xl:px-0">
          {winnerCards.map((card) => {
            const row = rows[card.rank - 1];
            if (!row) {
              return <div key={card.rank} className={["hidden 2xl:block", card.size].join(" ")} />;
            }

            return (
              <article
                key={row.id}
                className={[
                  "relative overflow-visible rounded-[10px] p-px text-center",
                  card.size,
                  card.scale,
                  card.order,
                ].join(" ")}
                style={{ background: `linear-gradient(180deg, ${card.accent} 0%, #11131F 40%)` }}
              >
                <RankHexagon rank={card.rank} color={card.accent} />

                <span
                  className="pointer-events-none absolute inset-px translate-y-[5px] rounded-[9px]"
                  style={{ backgroundColor: card.accent }}
                  aria-hidden="true"
                />
                <div className="relative flex min-h-[94px] w-full items-center rounded-[9px] bg-[linear-gradient(180deg,#24273C_0%,#151723_100%)] px-8 py-3 text-left 2xl:min-h-[236px] 2xl:flex-col 2xl:px-4 2xl:pb-4 2xl:pt-10 2xl:text-center">
                  <div
                    className="h-14 w-14 shrink-0 rounded-full p-[3px] 2xl:h-[70px] 2xl:w-[70px]"
                    style={{ backgroundColor: card.accent }}
                  >
                    <img
                      src={row.img ?? defaultProfile}
                      alt=""
                      className="h-full w-full rounded-full bg-[#D8DCE3] object-cover"
                      draggable={false}
                      loading="lazy"
                    />
                  </div>

                  <div className="ml-4 min-w-0 flex-1 2xl:ml-0 2xl:mt-3 2xl:max-w-full 2xl:flex-none">
                    <h3 className="truncate font-inter text-[16px] font-semibold leading-tight text-white">{row.name}</h3>
                  </div>
                  <div
                    className="ml-3 shrink-0 leading-none 2xl:ml-0 2xl:mt-5"
                    style={{
                      fontFamily: '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif',
                      fontStyle: "italic",
                      color: card.scoreColor,
                    }}
                  >
                    <span className="text-[32px] 2xl:text-[44px]">{formatScore(row.score)}</span>
                    <span className="ml-1 text-[18px] 2xl:text-[24px]">pts</span>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}
