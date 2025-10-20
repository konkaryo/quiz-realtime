import React from "react";

type Row = { id: string; name: string; score: number; img?: string | null };

export function FinalLeaderboard({
  rows,
  selfId,
}: {
  rows: Row[];
  selfId?: string | null;
}) {
  const top3 = rows.slice(0, 3);
  const rest = rows.slice(3);

  // ordre visuel : 2 | 1 | 3
  const order = [top3[1], top3[0], top3[2]].filter(Boolean) as Row[];

  // mêmes couleurs/hauteurs qu’avant
const tier = (idx: number) =>
  [
    // 2e (gauche)
    { h: 120, ring: "ring-slate-300/60",  rank: 2,
      ribbon: { from:"#93A3B8", to:"#5B6B82", edge:"#334155" } }, // argent

    // 1er (centre)
    { h: 170, ring: "ring-amber-300/70",  rank: 1,
      ribbon: { from:"#FACC15", to:"#C08400", edge:"#92400E" } }, // or

    // 3e (droite)
    { h: 100, ring: "ring-orange-300/60", rank: 3,
      ribbon: { from:"#FDBA74", to:"#C2410C", edge:"#7C2D12" } }, // bronze
  ][idx];

  return (
    <div className="px-2 py-2">
      {/* Podium */}
      <div className="px-4 md:px-8 pt-6 pb-2">
        <div className="relative overflow-hidden rounded-xl">
          <div className="absolute inset-0 pointer-events-none" />
          <div className="relative grid grid-cols-1 md:grid-cols-3 items-end gap-8 py-6">
            {order.map((r, i) => {
              const t = tier(i);
              const isSelf = selfId && r.id === selfId;

              return (
                <div key={r.id} className="flex flex-col items-center">
                  {/* Avatar */}
                  <div
                    className={[
                      "w-20 h-20 md:w-24 md:h-24 rounded-2xl overflow-hidden",
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

                  {/* Nom entre avatar et podium */}
                  <div className="mt-3 mb-2 text-center max-w-[220px] px-1">
                    <div className={["font-semibold truncate", isSelf ? "text-white" : "text-white/90"].join(" ")}>
                      {r.name}
                    </div>
                  </div>

                  {/* Marche du podium */}
                  <div
                    className={[
                      "relative w-full max-w-[280px] rounded-t-xl",
                      "bg-gradient-to-b from-white/[.06] to-white/[.02]",
                      "border-x border-t border-white/10",
                      "shadow-[inset_0_1px_0_rgba(255,255,255,.08),0_16px_40px_rgba(0,0,0,.55)]",
                    ].join(" ")}
                    style={{ height: t.h }}
                  >

{/* RUBAN DE RANG — intégré dans la colonne */}
<div
  className="absolute left-1/2 -translate-x-1/2 pointer-events-none"
  style={{ top: "12%" }} // ajuste 10–18% selon ton rendu
>
  <div className="relative">
    {/* Corps du ruban */}
    <div
      className={[
        "px-3 py-[6px] rounded-md text-sm font-extrabold tabular-nums",
        "shadow-[0_12px_26px_rgba(0,0,0,.38)] border border-white/10",
        "backdrop-blur-[2px]",
      ].join(" ")}
      style={{
        // dégradé coloré par rang
        background: `linear-gradient(180deg, ${t.ribbon.from}, ${t.ribbon.to})`,
        color: "#0b0a12",
        boxShadow:
          "inset 0 1px 0 rgba(255,255,255,.18), 0 12px 26px rgba(0,0,0,.38)",
      }}
    >
      {t.rank}
    </div>

    {/* Languettes (plis) — couleurs assorties plus sombres */}
    <div
      className="absolute -bottom-2 left-0 w-2 h-2"
      style={{
        clipPath: "polygon(0 0,100% 0,0 100%)",
        background: t.ribbon.edge,
        opacity: .9,
      }}
    />
    <div
      className="absolute -bottom-2 right-0 w-2 h-2"
      style={{
        clipPath: "polygon(0 0,100% 0,100% 100%)",
        background: t.ribbon.edge,
        opacity: .9,
      }}
    />
  </div>
</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Rangs 4 → N (inchangé) */}
      {rest.length > 0 && (
        <>
          <div className="h-px bg-white/10 mx-4 md:mx-8" />
          <ol className="p-4 md:p-6 pt-4 space-y-2">
            {rest.map((r, idx) => {
              const rank = idx + 4;
              const isSelf = selfId && r.id === selfId;
              return (
                <li
                  key={r.id}
                  className={[
                    "flex items-center justify-between rounded-xl px-3.5 py-2 border shadow-[0_6px_14px_rgba(0,0,0,.25)]",
                    isSelf
                      ? "bg-gradient-to-r from-[#D30E72] to-[#770577] text-white border-transparent"
                      : "bg-[#0f1420]/90 text-white border-white/10",
                  ].join(" ")}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-right opacity-80 tabular-nums">{rank}</span>
                    <img
                      src={r.img ?? "/img/profiles/0.avif"}
                      alt=""
                      className="w-7 h-7 rounded-lg object-cover border border-white/15"
                      draggable={false}
                      loading="lazy"
                    />
                    <div className="min-w-0">
                      <div className="truncate">{r.name}</div>
                      <div className="text-xs opacity-70">Niveau 1</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="tabular-nums">{r.score}</span>
                    <span className="w-2.5 h-2.5 rounded-full bg-white/20" />
                  </div>
                </li>
              );
            })}
          </ol>
        </>
      )}
    </div>
  );
}
