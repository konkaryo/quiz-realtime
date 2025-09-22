// web/src/pages/CreateRoomPage.tsx
import { useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

async function fetchJSON(path: string, init?: RequestInit) {
  const res = await fetch(`${API_BASE}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    ...init,
  });
  const ct = res.headers.get("content-type") || "";
  const isJson = ct.includes("application/json");
  const data = isJson ? await res.json() : undefined;
  if (!res.ok) throw new Error((data as any)?.error || (data as any)?.message || `HTTP ${res.status}`);
  return data;
}

// Enum keys côté backend (@prisma/client Theme)
// Garder les clés EXACTEMENT identiques à celles du schema.prisma
const THEME_OPTIONS = [
  { key: "CINEMA_SERIES",       label: "Cinéma & Séries" },
  { key: "ARTS_CULTURE",        label: "Arts & Culture" },
  { key: "JEUX_BD",             label: "Jeux & BD" },
  { key: "GEOGRAPHIE",          label: "Géographie" },
  { key: "LITTERATURE",         label: "Littérature" },
  { key: "ECONOMIE_POLITIQUE",  label: "Économie & Politique" },
  { key: "GASTRONOMIE",         label: "Gastronomie" },
  { key: "CROYANCES",           label: "Croyances" },
  { key: "SPORT",               label: "Sport" },
  { key: "HISTOIRE",            label: "Histoire" },
  { key: "DIVERS",              label: "Divers" },
  { key: "SCIENCES_VIE",        label: "Sciences de la vie" },
  { key: "SCIENCES_EXACTES",    label: "Sciences exactes" },
  { key: "MUSIQUE",             label: "Musique" },
  { key: "ACTUALITES_MEDIAS",   label: "Actualités & Médias" },
  { key: "TECHNOLOGIE",         label: "Technologie" },
] as const;

type ThemeKey = (typeof THEME_OPTIONS)[number]["key"];

export default function CreateRoomPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<number>(5); // default

  // Tous les thèmes sélectionnés par défaut
  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(
    THEME_OPTIONS.map(t => t.key)
  );

  const toggleTheme = (k: ThemeKey) => {
    setSelectedThemes(prev =>
      prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]
    );
  };

  const selectAll = () => setSelectedThemes(THEME_OPTIONS.map(t => t.key));
  const selectNone = () => setSelectedThemes([]);

  async function createRoom() {
    setLoading(true);
    setErr(null);
    try {
      // Les thèmes bannis = ceux qui NE sont PAS sélectionnés
      const bannedThemes = THEME_OPTIONS
        .filter(t => !selectedThemes.includes(t.key))
        .map(t => t.key);

      const payload = { difficulty, bannedThemes };
      const data = await fetchJSON("/rooms", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      const id = data?.result?.id as string | undefined;
      if (!id) throw new Error("Création: id manquant");
      nav(`/room/${id}`);
    } catch (e: any) {
      setErr(e?.message || "Impossible de créer la room");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 640, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Créer une room</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Choisissez une difficulté et les thèmes autorisés, puis créez la room (vous en serez le propriétaire).
      </p>

      {/* Difficulty slider */}
      <div style={{ marginBottom: 24 }}>
        <label htmlFor="difficulty" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
          Difficulté : <span style={{ fontVariantNumeric: "tabular-nums" }}>{difficulty}</span> / 10
        </label>
        <input
          id="difficulty"
          type="range"
          min={1}
          max={10}
          step={1}
          value={difficulty}
          onChange={(e) => setDifficulty(Number(e.target.value))}
          style={{ width: "100%" }}
          aria-label="Sélectionner la difficulté entre 1 et 10"
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7 }}>
          <span>1</span><span>5</span><span>10</span>
        </div>
      </div>

      {/* Thèmes */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 12 }}>
          <div style={{ fontWeight: 600 }}>Thèmes</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button onClick={selectAll}  type="button" style={{ padding: "6px 10px" }}>Tout</button>
            <button onClick={selectNone} type="button" style={{ padding: "6px 10px" }}>Aucun</button>
          </div>
        </div>

        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
            gap: 8,
          }}
        >
          {THEME_OPTIONS.map(({ key, label }) => {
            const active = selectedThemes.includes(key);
            return (
              <button
                key={key}
                type="button"
                onClick={() => toggleTheme(key)}
                aria-pressed={active}
                title={active ? "Sélectionné (inclus)" : "Désélectionné (banni)"}
                style={{
                  textAlign: "left",
                  padding: "8px 10px",
                  borderRadius: 999,
                  border: active ? "1px solid #c7d2fe" : "1px solid #e5e7eb",
                  background: active ? "#eef2ff" : "#fff",
                  fontSize: 14,
                  cursor: "pointer",
                }}
              >
                {label}
              </button>
            );
          })}
        </div>

        <div style={{ marginTop: 8, fontSize: 12, opacity: 0.75 }}>
          {selectedThemes.length}/{THEME_OPTIONS.length} thèmes sélectionnés
        </div>
      </div>

      <button
        onClick={createRoom}
        disabled={loading}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: "#111827",
          color: "#fff",
          fontWeight: 600,
          cursor: loading ? "not-allowed" : "pointer",
        }}
      >
        {loading ? "Création…" : "Créer room"}
      </button>

      {err && <div style={{ marginTop: 12, color: "#b00" }}>{err}</div>}
    </div>
  );
}
