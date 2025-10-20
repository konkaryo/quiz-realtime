// /web/src/components/QuestionRecapList.tsx

import React from "react";

export type RecapItem = {
  index: number;
  questionId: string;
  text: string;
  img?: string | null;
  correctLabel?: string | null;
  yourAnswer?: string | null;
  correct: boolean;
  responseMs: number;
  points: number;
};

export function QuestionRecapList({ items }: { items: RecapItem[] }) {
  if (!items?.length) {
    return <div className="opacity-70">Aucune donnée de la partie.</div>;
  }

  return (
    <div className="w-full md:w-[88%] mx-auto">
      <h3 className="m-0 mb-3 text-[15px] font-semibold tracking-wide opacity-85">
        Récapitulatif des questions
      </h3>

      <ol className="space-y-2 max-h-[560px] overflow-y-auto lb-scroll pr-2">
        {items.map((q) => {
          const chip =
            q.correct
              ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/30"
              : "bg-rose-500/15 text-rose-300 border-rose-400/30";

          return (
            <li
              key={q.questionId + ":" + q.index}
              className="rounded-xl border border-white/10 bg-[#0f1420]/80 text-white shadow-[0_6px_14px_rgba(0,0,0,.25)]"
            >
              <div className="flex items-center gap-3 p-2.5">
                <span className={`px-2 py-[2px] rounded-md text-[11px] border ${chip}`}>
                  {q.correct ? "✔ Correct" : "✘ Faux"}
                </span>
                <span className="text-xs opacity-75">Q{q.index + 1}</span>
                <div className="ml-auto text-xs opacity-75 tabular-nums">
                  {q.responseMs >= 0 ? `${q.responseMs} ms` : "—"}
                </div>
                <div className="text-xs font-semibold ml-2 tabular-nums">
                  {q.points > 0 ? `+${q.points}` : "+0"}
                </div>
              </div>

              <div className="px-2.5 pb-2.5 flex items-start gap-3">
                {q.img ? (
                  <img
                    src={q.img}
                    alt=""
                    className="w-[56px] h-[42px] rounded-md object-cover border border-white/10 flex-shrink-0"
                    loading="lazy"
                    draggable={false}
                  />
                ) : null}
                <div className="min-w-0">
                  <div className="text-[13px] leading-snug">{q.text}</div>
                  {q.correctLabel ? (
                    <div className="text-[12px] mt-1 opacity-80">
                      Bonne réponse : <span className="font-medium">{q.correctLabel}</span>
                      {q.yourAnswer && q.yourAnswer !== q.correctLabel && (
                        <>
                          {" "}/ Ta réponse : <span className="opacity-90">{q.yourAnswer}</span>
                        </>
                      )}
                    </div>
                  ) : q.yourAnswer ? (
                    <div className="text-[12px] mt-1 opacity-80">
                      Ta réponse : <span className="opacity-90">{q.yourAnswer}</span>
                    </div>
                  ) : null}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
