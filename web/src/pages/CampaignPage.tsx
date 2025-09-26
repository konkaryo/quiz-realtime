// web/src/pages/CampaignPage.tsx
import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";

type Level = {
  id: number;
  title: string;
  desc: string;
  recommendedDifficulty?: number; // 1..10
};

const LEVELS: Level[] = Array.from({ length: 12 }).map((_, i) => ({
  id: i + 1,
  title: `Niveau ${i + 1}`,
  desc:
    i === 0
      ? "Mise en jambe : questions faciles pour se lancer."
      : i < 4
      ? "Échauffement."
      : i < 8
      ? "Ça se corse un peu…"
      : "Pour experts !",
  recommendedDifficulty: i < 3 ? 3 : i < 6 ? 5 : i < 9 ? 7 : 9,
}));

const STORAGE_KEY = "campaignProgress:v1";

function getProgress(): number {
  const raw = localStorage.getItem(STORAGE_KEY);
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : 0;
}

export default function CampaignPage() {
  const nav = useNavigate();
  const [progress, setProg] = useState<number>(getProgress());

  // (optionnel) marqueur de page si tu en as l’usage ailleurs
  useEffect(() => {
    const prev = document.body.getAttribute("data-page");
    document.body.setAttribute("data-page", "campaign");
    return () => {
      if (prev) document.body.setAttribute("data-page", prev);
      else document.body.removeAttribute("data-page");
    };
  }, []);

  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setProg(getProgress());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const levels = useMemo(() => LEVELS, []);
  const completed = progress;
  const nextUnlocked = Math.min(progress + 1, levels.length);
  const pct = Math.round((completed / levels.length) * 100);

  return (
    <div className="relative">
      {/* ====== Dégradé de fond (vertical) ====== */}
      <div
        aria-hidden
        className="
          fixed inset-0 z-0
          bg-[linear-gradient(to_bottom,_#4A1557_0%,_#2E0F40_33%,_#1A0A2B_66%,_#0A0616_100%)]
        "
      />
      {/* ====== Grain anti-banding + masque vertical ====== */}
      <div
        aria-hidden
        className="
          fixed inset-0 z-0 pointer-events-none opacity-35 mix-blend-soft-light
          bg-[radial-gradient(circle,_rgba(255,255,255,0.16)_0.5px,_transparent_0.5px)]
          bg-[length:4px_4px]
          [mask-image:linear-gradient(to_bottom,rgba(0,0,0,.8),rgba(0,0,0,.5)_60%,transparent_100%)]
          [-webkit-mask-image:linear-gradient(to_bottom,rgba(0,0,0,.8),rgba(0,0,0,.5)_60%,transparent_100%)]
        "
      />

      {/* ====== Contenu ====== */}
      <div className="relative z-10 mx-auto max-w-[980px] px-4 py-10 text-white">
        <h1 className="font-brand m-0 text-4xl md:text-5xl tracking-wide">CAMPAGNE</h1>
        <p className="mt-2/3 md:mt-2 text-white/85">
          Progressez niveau après niveau. Chaque niveau utilise un set de questions
          calibré. La progression est sauvegardée sur cet appareil.
        </p>

        {/* Progression */}
        <div className="mt-4 font-semibold">Progression</div>
        <div className="relative mt-2 h-3 rounded-full bg-white/25 backdrop-blur-sm">
          <div
            className="
              absolute inset-0 rounded-full
              bg-gradient-to-r from-[#6699ff] to-[#4466cc]
              transition-[width] duration-200
            "
            style={{ width: `${pct}%` }}
          />
        </div>
        <div className="mt-1 text-white/85 tabular-nums">
          {completed}/{levels.length} niveaux terminés
        </div>

        {/* Grille des niveaux */}
        <div className="mt-5 grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
          {levels.map((lv) => {
            const unlocked = lv.id <= nextUnlocked;
            const done = lv.id <= completed;

            return (
              <div
                key={lv.id}
                className={`
                  rounded-[14px] border border-slate-200/80 bg-white/90 p-4 text-slate-900 backdrop-blur
                  ${unlocked ? "opacity-100" : "opacity-65"}
                `}
                style={done ? { boxShadow: "inset 0 0 0 2px #16a34a33" } : undefined}
              >
                <div className="flex items-center gap-2">
                  <div
                    className={`
                      grid h-7 w-7 place-items-center rounded-lg font-extrabold text-white
                      ${done ? "bg-green-600" : unlocked ? "bg-[#0f2150]" : "bg-gray-400"}
                    `}
                  >
                    {lv.id}
                  </div>
                  <div className="font-bold">{lv.title}</div>
                </div>

                <div className="mt-2 text-sm opacity-80">{lv.desc}</div>

                {typeof lv.recommendedDifficulty === "number" && (
                  <div className="mt-2 text-[13px] opacity-70">
                    Difficulté conseillée : <b>{lv.recommendedDifficulty}/10</b>
                  </div>
                )}

                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    disabled={!unlocked}
                    onClick={() => nav(`/solo/campagne/level/${lv.id}`)}
                    className={`
                      rounded-[10px] border px-3 py-2 font-bold
                      ${unlocked
                        ? "border-[#0f2150] bg-[#0f2150] text-white hover:opacity-95"
                        : "border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed"}
                    `}
                  >
                    {done ? "Rejouer" : unlocked ? "Jouer" : "Verrouillé"}
                  </button>

                  {done && (
                    <button
                      type="button"
                      onClick={() => nav(`/solo/campagne/level/${lv.id}`)}
                      className="
                        rounded-[10px] border border-gray-200 bg-white px-3 py-2 font-semibold
                        text-slate-900 hover:bg-gray-50
                      "
                    >
                      Score à battre
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
