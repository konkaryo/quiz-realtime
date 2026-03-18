import { useEffect, useMemo, useState } from "react";
import swordsUrl from "@/assets/swords.png";
import bitUrl from "@/assets/bit.png";

type HistoryQuestionResult = {
  questionId: string;
  text: string;
  result: "correct" | "wrong" | "skipped";
  points: number;
};

type HistoryItem = {
  playerGameId: string;
  playedAt: string;
  gameId: string;
  finalScore: number;
  gameDifficulty: number;
  totalPlayers: number;
  finalRank: number;
  xpGained: number;
  bitsGained: number;
  questionResults: HistoryQuestionResult[];
};

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

function difficultyTheme(level: number) {
  if (level <= 34) {
    return {
      label: "Facile",
      bg: "#8ED64F",
      text: "#FFFFFF",
    };
  }
  if (level <= 67) {
    return {
      label: "Modéré",
      bg: "#E8C21A",
      text: "#1F1A00",
    };
  }
  return {
    label: "Difficile",
    bg: "#E34B4B",
    text: "#FFFFFF",
  };
}

function formatDate(dateIso: string) {
  const date = new Date(dateIso);
  return new Intl.DateTimeFormat("fr-FR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(date);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("fr-FR").format(value);
}

function getQuestionColor(result: HistoryQuestionResult["result"]) {
  if (result === "correct") return "#7FAE4D";
  if (result === "wrong") return "#D70B0B";
  return "#E1B61A";
}

function chunkArray<T>(items: T[], size: number) {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function SummaryPill({
  count,
  color,
  direction,
}: {
  count: number;
  color: string;
  direction: "up" | "down";
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[16px] font-bold leading-none text-white">
        {count}
      </span>

      <span className="flex h-8 w-8 items-center justify-center bg-[#1A1D2A]">
        <span className="text-[14px]" style={{ color }}>
          {direction === "up" ? "▲" : "▼"}
        </span>
      </span>
    </div>
  );
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let mounted = true;

    (async () => {
      try {
        const res = await fetch(`${API_BASE}/players/me/history`, {
          credentials: "include",
        });

        if (!res.ok) {
          if (mounted) setHistory([]);
          return;
        }

        const payload = (await res.json()) as { history?: HistoryItem[] };
        if (!mounted) return;

        setHistory(Array.isArray(payload.history) ? payload.history : []);
      } catch {
        if (mounted) setHistory([]);
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, []);

  const hasHistory = useMemo(() => history.length > 0, [history]);

  return (
    <div className="relative min-h-full overflow-hidden text-white">
      <div aria-hidden className="fixed inset-0 bg-[#060A19]" />

      <div className="relative z-10 mx-auto w-full max-w-[760px] px-4 py-8 sm:px-5">
        <header className="mb-7">
          <h1 className="text-[34px] font-brand italic leading-none text-white sm:text-[46px]">
            Historique
          </h1>
        </header>

        {loading ? <p className="text-sm text-white/75">Chargement…</p> : null}

        {!loading && !hasHistory ? (
          <div className="rounded-[10px] border border-white/10 bg-white/[0.04] p-4 text-sm text-white/75">
            Aucune partie terminée trouvée pour le moment.
          </div>
        ) : null}

        <div className="flex flex-col gap-4">
          {history.map((item) => {
            const difficulty = difficultyTheme(item.gameDifficulty);
            const correctCount = item.questionResults.filter(
              (q) => q.result === "correct"
            ).length;

            const skippedCount = item.questionResults.filter(
              (q) => q.result === "skipped"
            ).length;

            const wrongCount = item.questionResults.filter(
              (q) => q.result === "wrong"
            ).length;

            const rows = chunkArray(item.questionResults, 7);

            return (
              <article
                key={item.playerGameId}
                className="w-full rounded-[14px] border border-white/10 bg-[#232733] px-4 py-3 shadow-[0_12px_28px_rgba(0,0,0,0.32)]"
              >
                <div className="grid gap-4 md:grid-cols-[170px_1fr_150px] md:items-center">

                  {/* LEFT */}
                  <section className="min-w-0 md:border-r md:border-white/10 md:pr-4">
                    <span
                      className="inline-flex h-[30px] items-center rounded-[8px] px-3 text-[12px] font-semibold"
                      style={{
                        backgroundColor: difficulty.bg,
                        color: difficulty.text,
                      }}
                    >
                      {difficulty.label}
                    </span>

                    <div className="mt-3 flex items-center gap-3">
                      <img
                        src={swordsUrl}
                        alt="Partie"
                        className="h-16 w-16 shrink-0 object-contain"
                      />

                      <div className="min-w-0">
                        <div className="flex items-end gap-1.5 leading-none">
                          <span className="text-[28px] font-extrabold text-white">
                            #{item.finalRank}
                          </span>

                          <span className="pb-[2px] text-[18px] font-semibold text-white/90">
                            / {item.totalPlayers}
                          </span>
                        </div>

                        <p className="mt-1 text-[18px] font-semibold leading-none text-white">
                          {formatNumber(item.finalScore)} pts
                        </p>
                      </div>
                    </div>
                  </section>

                  {/* CENTER */}
                  <section className="min-w-0 md:px-1">
                    <div className="mx-auto flex w-fit flex-col items-center">

                      <div className="mb-3 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
                        <SummaryPill
                          count={correctCount}
                          color="#39D78F"
                          direction="up"
                        />

                        <SummaryPill
                          count={skippedCount}
                          color="#F1C63B"
                          direction="up"
                        />

                        <SummaryPill
                          count={wrongCount}
                          color="#FF5B60"
                          direction="down"
                        />
                      </div>

                      <div className="flex flex-col items-center gap-2">
                        {rows.map((row, rowIndex) => (
                          <div
                            key={`${item.playerGameId}-row-${rowIndex}`}
                            className="flex flex-wrap justify-center gap-2"
                          >
                            {row.map((question) => (
                              <span
                                key={`${item.playerGameId}-${question.questionId}`}
                                title={question.text}
                                className="block h-7 w-7 shrink-0"
                                style={{
                                  backgroundColor: getQuestionColor(
                                    question.result
                                  ),
                                }}
                              />
                            ))}
                          </div>
                        ))}
                      </div>
                    </div>
                  </section>

                  {/* RIGHT */}
                  <section className="min-w-0 md:border-l md:border-white/10 md:pl-4">
                    <div className="flex flex-col items-start text-left md:items-end md:text-right">

                      <p className="max-w-full truncate text-[17px] font-bold leading-none text-white">
                        {formatDate(item.playedAt)}
                      </p>

                      <p className="mt-3 text-[16px] font-semibold leading-none text-white">
                        + {formatNumber(item.xpGained)} XP
                      </p>

                      <p className="mt-2 inline-flex items-center gap-2 text-[16px] font-semibold leading-none text-white">
                        <span>+ {formatNumber(item.bitsGained)}</span>
                        <img
                          src={bitUrl}
                          alt="Bits"
                          className="h-6 w-6 shrink-0"
                        />
                      </p>

                    </div>
                  </section>

                </div>
              </article>
            );
          })}
        </div>
      </div>
    </div>
  );
}