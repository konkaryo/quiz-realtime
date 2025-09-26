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

  // 💡 Rendre le body transparent uniquement sur cette page (si utile à ton layout)
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

  return (
    <>
      {/* === Dégradé plein écran — VERSION LINÉAIRE VERTICALE ===
          Ajuste les couleurs/positions ici (top -> bottom) */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          background:
            "linear-gradient(to bottom," +
            " #4A1557 0%," +   // transition 1
            " #2E0F40 33%," +  // transition 2
            " #1A0A2B 66%," +  // bas 1
            " #0A0616 100%" +  // bas 2
            ")",
        }}
      />
      {/* Grain (anti-banding) avec masque VERTICAL */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          inset: 0,
          zIndex: 0,
          backgroundImage:
            "radial-gradient(circle, rgba(255,255,255,0.16) 0.5px, transparent 0.5px)",
          backgroundSize: "4px 4px",
          mixBlendMode: "soft-light",
          opacity: 0.35,
          // masque vertical : grain plus dense au centre, atténué vers le bas
          WebkitMaskImage:
            "linear-gradient(to bottom, rgba(0,0,0,.8), rgba(0,0,0,.5) 60%, rgba(0,0,0,0) 100%)",
          maskImage:
            "linear-gradient(to bottom, rgba(0,0,0,.8), rgba(0,0,0,.5) 60%, rgba(0,0,0,0) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* === Contenu === */}
      <div
        style={{
          position: "relative",
          zIndex: 1,
          maxWidth: 980,
          margin: "40px auto",
          padding: 16,
          color: "white",
          fontFamily: "system-ui, sans-serif",
        }}
      >
        <h1 className="font-brand" style={{ margin: 0 }}>CAMPAGNE</h1>
        <p style={{ marginTop: 8, opacity: 0.85 }}>
          Progressez niveau après niveau. Chaque niveau utilise un set de
          questions calibré. La progression est sauvegardée sur cet appareil.
        </p>

        {/* Progression */}
        <div style={{ margin: "16px 0 10px", fontWeight: 600 }}>Progression</div>
        <div
          style={{
            position: "relative",
            height: 12,
            borderRadius: 999,
            background: "rgba(255,255,255,.25)",
            backdropFilter: "blur(1px)",
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${Math.round((completed / levels.length) * 100)}%`,
              background: "linear-gradient(90deg,#69f,#46c)",
              borderRadius: 999,
              transition: "width .25s ease",
            }}
          />
        </div>
        <div
          style={{
            marginTop: 6,
            fontVariantNumeric: "tabular-nums",
            opacity: 0.85,
          }}
        >
          {completed}/{levels.length} niveaux terminés
        </div>

        {/* Grille des niveaux */}
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))",
            gap: 12,
            marginTop: 18,
          }}
        >
          {levels.map((lv) => {
            const unlocked = lv.id <= nextUnlocked;
            const done = lv.id <= completed;
            return (
              <div
                key={lv.id}
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: 14,
                  padding: 14,
                  background: "rgba(255,255,255,.92)",
                  color: "#111827",
                  backdropFilter: "blur(1px)",
                  opacity: unlocked ? 1 : 0.65,
                  boxShadow: done ? "inset 0 0 0 2px #16a34a20" : undefined,
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <div
                    style={{
                      width: 28,
                      height: 28,
                      borderRadius: 8,
                      display: "grid",
                      placeItems: "center",
                      background: done ? "#16a34a" : unlocked ? "#0f2150" : "#9ca3af",
                      color: "#fff",
                      fontWeight: 800,
                    }}
                  >
                    {lv.id}
                  </div>
                  <div style={{ fontWeight: 700 }}>{lv.title}</div>
                </div>

                <div style={{ marginTop: 8, fontSize: 14, opacity: 0.8 }}>
                  {lv.desc}
                </div>

                {typeof lv.recommendedDifficulty === "number" && (
                  <div style={{ marginTop: 8, fontSize: 13, opacity: 0.7 }}>
                    Difficulté conseillée : <b>{lv.recommendedDifficulty}/10</b>
                  </div>
                )}

                <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
                  <button
                    type="button"
                    disabled={!unlocked}
                    onClick={() => nav(`/solo/campagne/level/${lv.id}`)}
                    style={{
                      padding: "8px 12px",
                      borderRadius: 10,
                      border: "1px solid #0f2150",
                      background: unlocked ? "#0f2150" : "#f3f4f6",
                      color: unlocked ? "#fff" : "#9ca3af",
                      fontWeight: 700,
                      cursor: unlocked ? "pointer" : "not-allowed",
                    }}
                  >
                    {done ? "Rejouer" : unlocked ? "Jouer" : "Verrouillé"}
                  </button>
                  {done && (
                    <button
                      type="button"
                      onClick={() => nav(`/solo/campagne/level/${lv.id}`)}
                      style={{
                        padding: "8px 12px",
                        borderRadius: 10,
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        fontWeight: 600,
                        cursor: "pointer",
                      }}
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
    </>
  );
}
