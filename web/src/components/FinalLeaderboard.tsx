import React, { useEffect, useRef } from "react";

type Row = { id: string; name: string; score: number; img?: string | null; bits?: number };

export function FinalLeaderboard({
  rows,
  selfId,
  selfName,
}: {
  rows: Row[];
  selfId?: string | null;
  selfName?: string | null;
}) {
  const top3 = rows.slice(0, 3);
  const listRows = rows;

  // 2 | 1 | 3
  const order = [top3[1], top3[0], top3[2]].filter(Boolean) as Row[];

  // Hauteurs réduites (~15%)
  const tier = (idx: number) =>
    [
      { h: 105, ring: "ring-slate-300/60",  rank: 2 },
      { h: 145, ring: "ring-amber-300/70",  rank: 1 },
      { h:  90, ring: "ring-orange-300/60", rank: 3 },
    ][idx];

  const isSelfRow = (r: Row) =>
    (!!selfId && r.id === selfId) ||
    (!!selfName && r.name?.toLowerCase() === selfName.toLowerCase());

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
            {order.map((r, i) => {
              const t = tier(i);
              const isSelf = isSelfRow(r);

              return (
                <div key={r.id} className="flex flex-col items-center">
                  {/* Avatar — réduit */}
                  <div
                    className={[
                      "w-16 h-16 md:w-20 md:h-20 rounded-2xl overflow-hidden",
                      "ring-4", t.ring,
                      "shadow-[0_10px_40px_rgba(0,0,0,.45)]",
                    ].join(" ")}
                    aria-label={`Avatar de ${r.name}`}
                  >
                    <img
                      src={r.img ?? "/img/profiles/0.avif"}
                      alt=""
                      className="w-full h-full object-cover"
                      draggable={false}
                      loading="lazy"
                    />
                  </div>

                  {/* Nom */}
                  <div className="mt-2 mb-2 text-center max-w-[220px] px-1">
                    <div className={["font-semibold truncate", isSelf ? "text-white" : "text-white/90"].join(" ")}>
                      {r.name}
                    </div>
                  </div>

                  {/* Marche — hauteur réduite + même style */}
                  <div
                    className={[
                      "relative w-full max-w-[260px] rounded-t-xl",
                      "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)]",
                      "border-x border-t border-white/10",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_16px_40px_rgba(0,0,0,.55)]",
                    ].join(" ")}
                    style={{ height: t.h }}
                  >
                  {/* numéro gravé */}
                  <div className="absolute left-1/2 -translate-x-1/2 pointer-events-none" style={{ top: "16%" }}>
                    <span
                      className={[
                        "font-extrabold tabular-nums select-none",
                        t.rank === 1 ? "text-[50px]" : "text-[44px]",
                        "text-white/20",
                        "text-[#696D77]",
                      ].join(" ")}
                      style={{
                        textShadow:
                          "0 1px 0 rgba(0,0,0,0.6), 0 -1px 0 rgba(255,255,255,0.15)",
                      }}
                    >
                      {t.rank}
                    </span>
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

                return (
                  <li
                    key={r.id}
                    ref={isSelf ? activeItemRef : undefined}
                    className={[
                      "flex items-center justify-between rounded-lg px-3 py-1.5 border shadow-[0_4px_10px_rgba(0,0,0,.22)]",
                      "text-[13px] leading-tight",
                      isSelf
                        ? "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent"
                        : "bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)] text-white border-white/10",
                    ].join(" ")}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <span className="w-5 text-right opacity-80 tabular-nums">{rank}</span>
                      <img
                        src={r.img ?? "/img/profiles/0.avif"}
                        alt=""
                        className="w-6 h-6 rounded-md object-cover border border-white/15"
                        draggable={false}
                        loading="lazy"
                      />
                      <div className="min-w-0">
                        <div className="truncate">{r.name}</div>
                        <div className="text-[11px] opacity-70">Niveau 1</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
