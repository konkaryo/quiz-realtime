// web/src/pages/CreateRoomPage.tsx
import { useEffect, useMemo, useState } from "react";
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
  if (!res.ok) {
    const msg = (data as any)?.error || (data as any)?.message || `HTTP ${res.status}`;
    const err: any = new Error(msg);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

// mêmes clés que l'enum Prisma Theme
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

  const [difficulty, setDifficulty] = useState<number>(5);
  const [questionCount, setQuestionCount] = useState<number>(10);   // 10–30
  const [questionDuration, setQuestionDuration] = useState<number>(20); // 10–30 (secondes)

  const [selectedThemes, setSelectedThemes] = useState<ThemeKey[]>(
    THEME_OPTIONS.map(t => t.key)
  );
  const bannedThemes = useMemo(
    () => THEME_OPTIONS.filter(t => !selectedThemes.includes(t.key)).map(t => t.key),
    [selectedThemes]
  );

  // 🔑 Code généré… côté serveur
  const [code, setCode] = useState<string>("");
  const [codeMsg, setCodeMsg] = useState<string>("");

  // Récupère un code serveur au chargement
  useEffect(() => {
    let mounted = true;
    (async () => {
      setCodeMsg("Génération du code…");
      try {
        const data = await fetchJSON("/rooms/new-code");
        const c = (data as any)?.code as string | undefined;
        if (mounted) {
          setCode(c ?? "");
          setCodeMsg(c ? "Code prêt" : "Échec de génération");
        }
      } catch (e: any) {
        if (mounted) {
          setCode("");
          setCodeMsg("Échec de génération");
        }
      }
    })();
    return () => { mounted = false; };
  }, []);

  const toggleTheme = (k: ThemeKey) => {
    setSelectedThemes(prev => (prev.includes(k) ? prev.filter(x => x !== k) : [...prev, k]));
  };
  const selectAll = () => setSelectedThemes(THEME_OPTIONS.map(t => t.key));
  const selectNone = () => setSelectedThemes([]);

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCodeMsg("Code copié !");
      setTimeout(() => setCodeMsg("Code prêt"), 1000);
    } catch {
      setCodeMsg("Copie impossible");
      setTimeout(() => setCodeMsg("Code prêt"), 1200);
    }
  }

  async function refreshCodeFromServer() {
    setCodeMsg("Génération du code…");
    try {
      const data = await fetchJSON("/rooms/new-code");
      const c = (data as any)?.code as string | undefined;
      setCode(c ?? "");
      setCodeMsg(c ? "Code prêt" : "Échec de génération");
    } catch {
      setCode("");
      setCodeMsg("Échec de génération");
    }
  }

  async function createRoom() {
    if (!code) {
      setErr("Code indisponible. Réessaie.");
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      const payload = {
        code,                              // ← code généré serveur (pré-affiché)
        difficulty,
        questionCount,
        roundSeconds: questionDuration,    // le serveur convertit en ms
        bannedThemes,
      };

      const data = await fetchJSON("/rooms", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      const id = (data as any)?.result?.id as string | undefined;
      const finalCode = (data as any)?.result?.code as string | undefined;
      if (!id) throw new Error("Création: id manquant");

      // sync d’affichage si jamais le serveur a dû régénérer
      if (finalCode && finalCode !== code) setCode(finalCode);

      nav(`/room/${id}`);
    } catch (e: any) {
      // Si collision improbable (course), on reprend un code serveur
      if (e?.status === 409) {
        setErr("Le code vient d’être pris. Nouveau code généré.");
        await refreshCodeFromServer();
      } else {
        setErr(e?.message || "Impossible de créer la room");
      }
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 820, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Créer une room</h1>
      <p style={{ opacity: 0.8, marginBottom: 16 }}>
        Choisissez la difficulté, le nombre et la durée des questions, les thèmes autorisés, puis créez la room (vous en serez le propriétaire).
      </p>

      {/* --- Code du salon (provenant du serveur) --- */}
      <div
        style={{
          padding: 14,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          marginBottom: 20,
          background: "#fff",
          display: "flex",
          alignItems: "center",
          gap: 12,
          justifyContent: "space-between",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <div style={{ fontWeight: 700 }}>Code du salon</div>
          <div
            style={{
              fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              letterSpacing: 2,
              fontSize: 18,
              fontWeight: 800,
              padding: "6px 10px",
              border: "1px solid #d1d5db",
              borderRadius: 8,
              background: "#f8fafc",
              minWidth: 72,
              textAlign: "center",
            }}
            aria-label="Code d'accès de la room"
          >
            {code || "----"}
          </div>

          <button
            type="button"
            onClick={copyCode}
            title="Copier le code"
            disabled={!code}
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: 8,
              padding: "8px 10px",
              borderRadius: 10,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: code ? "pointer" : "not-allowed",
              fontWeight: 600,
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
              <rect x="9" y="9" width="12" height="12" rx="2" stroke="#334155" strokeWidth="1.8" />
              <rect x="3" y="3" width="12" height="12" rx="2" stroke="#94a3b8" strokeWidth="1.2" />
            </svg>
            Copier
          </button>

          <button
            type="button"
            onClick={refreshCodeFromServer}
            title="Générer un autre code"
            style={{
              padding: "6px 10px",
              borderRadius: 8,
              border: "1px solid #e5e7eb",
              background: "#fff",
              cursor: "pointer",
              fontSize: 12,
            }}
          >
            Régénérer
          </button>

          <span style={{ fontSize: 12, fontWeight: 600, color: "#6b7280" }}>
            {codeMsg}
          </span>
        </div>
      </div>

      {/* Difficulté */}
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
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7 }}>
          <span>1</span><span>5</span><span>10</span>
        </div>
      </div>

      {/* Nombre de questions */}
      <div style={{ marginBottom: 24 }}>
        <label htmlFor="qcount" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
          Nombre de questions : <span style={{ fontVariantNumeric: "tabular-nums" }}>{questionCount}</span>
        </label>
        <input
          id="qcount"
          type="range"
          min={10}
          max={30}
          step={1}
          value={questionCount}
          onChange={(e) => setQuestionCount(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7 }}>
          <span>10</span><span>20</span><span>30</span>
        </div>
      </div>

      {/* Durée des questions */}
      <div style={{ marginBottom: 24 }}>
        <label htmlFor="qdur" style={{ display: "block", fontWeight: 600, marginBottom: 8 }}>
          Durée par question : <span style={{ fontVariantNumeric: "tabular-nums" }}>{questionDuration}</span> s
        </label>
        <input
          id="qdur"
          type="range"
          min={10}
          max={30}
          step={1}
          value={questionDuration}
          onChange={(e) => setQuestionDuration(Number(e.target.value))}
          style={{ width: "100%" }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, opacity: 0.7 }}>
          <span>10s</span><span>20s</span><span>30s</span>
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
            gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))",
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
                  padding: "10px 12px",
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
        disabled={loading || !code}
        style={{
          padding: "10px 14px",
          borderRadius: 12,
          border: "1px solid #e5e7eb",
          background: loading ? "#6b7280" : "#111827",
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
