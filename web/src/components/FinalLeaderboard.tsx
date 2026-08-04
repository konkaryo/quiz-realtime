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
};

const winnerCards: WinnerCardConfig[] = [
  {
    rank: 2,
    accent: "#91AFFF",
    scoreColor: "#AFC5FF",
    size: "w-[180px] min-h-[214px] md:w-[200px] md:min-h-[238px]",
    scale: "scale-[0.90]",
  },
  {
    rank: 1,
    accent: "#FFD33F",
    scoreColor: "#FFD33F",
    size: "w-[180px] min-h-[214px] md:w-[200px] md:min-h-[238px]",
    scale: "scale-[1] md:scale-[1]",
  },
  {
    rank: 3,
    accent: "#FF865E",
    scoreColor: "#FF865E",
    size: "w-[180px] min-h-[214px] md:w-[200px] md:min-h-[238px]",
    scale: "scale-[0.90]",
  },
];

const defaultProfile = "/img/profiles/0.avif";

function formatScore(score: number) {
  return Math.round(score).toLocaleString("fr-FR");
}

function RankHexagon({ rank, color }: { rank: number; color: string }) {
  return (
    <div
      className="absolute -top-5 left-1/2 z-30 grid h-10 w-10 -translate-x-1/2 place-items-center"
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
    <section className="px-2 pb-6 pt-5 md:pt-8">
      <div className="mx-auto flex w-full max-w-[760px] flex-col items-center">
        <header className="mb-24 text-center md:mb-28">
          <h2 className="font-brand text-[38px] font-black uppercase leading-none tracking-[0.055em] text-white md:text-[54px]">
            Partie terminée
          </h2>
        </header>

        <div className="grid w-full grid-cols-1 place-items-center gap-3 md:max-w-[640px] md:grid-cols-3 md:items-center md:gap-0">
          {winnerCards.map((card) => {
            const row = rows[card.rank - 1];
            if (!row) {
              return <div key={card.rank} className={["hidden md:block", card.size].join(" ")} />;
            }

            return (
              <article
                key={row.id}
                className={[
                  "relative overflow-visible rounded-[10px] p-px text-center",
                  card.size,
                  card.scale,
                ].join(" ")}
                style={{ background: `linear-gradient(180deg, ${card.accent} 0%, #11131F 40%)` }}
              >
                <RankHexagon rank={card.rank} color={card.accent} />

                <span
                  className="pointer-events-none absolute inset-px translate-y-[5px] rounded-[9px]"
                  style={{ backgroundColor: card.accent }}
                  aria-hidden="true"
                />
                <div className="relative flex min-h-[212px] w-full flex-col items-center rounded-[9px] bg-[linear-gradient(180deg,#24273C_0%,#151723_100%)] px-4 pb-4 pt-10 md:min-h-[236px]">
                  <div
                    className="h-[70px] w-[70px] rounded-full p-[3px]"
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

                  <div className="mt-3 min-w-0 max-w-full">
                    <h3 className="truncate font-inter text-[16px] font-semibold leading-tight text-white">{row.name}</h3>
                  </div>
                  <div
                    className="mt-5 leading-none"
                    style={{
                      fontFamily: '"Acumin Pro Extra Condensed Bold Italic", "Acumin Pro Extra Condensed", sans-serif',
                      fontStyle: "italic",
                      color: card.scoreColor,
                    }}
                  >
                    <span className="text-[38px] md:text-[44px]">{formatScore(row.score)}</span>
                    <span className="ml-1 text-[21px] md:text-[24px]">pts</span>
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
