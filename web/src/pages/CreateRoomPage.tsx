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
  if (!res.ok) throw new Error(data?.error || data?.message || `HTTP ${res.status}`);
  return data;
}

export default function CreateRoomPage() {
  const nav = useNavigate();
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [difficulty, setDifficulty] = useState<number>(5); // default

  async function createRoom() {
    setLoading(true);
    setErr(null);
    try {
      const payload = { difficulty };
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
        Choisissez une difficulté puis créez la room (vous en serez le propriétaire).
      </p>

      {/* Difficulty slider */}
      <div style={{ marginBottom: 20 }}>
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
