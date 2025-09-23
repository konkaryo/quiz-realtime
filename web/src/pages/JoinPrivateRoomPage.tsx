import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE =
  (import.meta as any).env?.VITE_API_BASE ??
  (typeof window !== "undefined" ? window.location.origin : "");

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

const MAX_LEN = 4;

export default function JoinPrivateRoomPage() {
  const nav = useNavigate();
  const [code, setCode] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hiddenInput = useRef<HTMLInputElement | null>(null);

  // focus auto (clic sur la zone)
  useEffect(() => {
    hiddenInput.current?.focus();
  }, []);

  const normalized = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_LEN);
  const chars = Array.from({ length: MAX_LEN }).map((_, i) => normalized[i] || "");

  function handleChange(v: string) {
    const next = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_LEN);
    setCode(next);
    setErr(null);
  }

  async function resolveAndGo() {
    const c = normalized.trim();
    if (c.length !== MAX_LEN) {
      setErr(`Le code doit comporter ${MAX_LEN} caractères.`);
      return;
    }
    setLoading(true);
    setErr(null);
    try {
      // Route principale (POST /rooms/resolve { code }) -> { roomId }
      let roomId: string | undefined;
      try {
        const r1 = (await fetchJSON("/rooms/resolve", {
          method: "POST",
          body: JSON.stringify({ code: c }),
        })) as { roomId?: string; room?: { id: string } };
        roomId = r1?.roomId ?? r1?.room?.id;
      } catch {
        // Fallback GET /rooms/by-code/:code -> { room:{ id } }
        const r2 = (await fetchJSON(`/rooms/by-code/${encodeURIComponent(c)}`)) as { room?: { id: string } };
        roomId = r2?.room?.id;
      }
      if (!roomId) throw new Error("Code invalide ou introuvable.");
      nav(`/room/${roomId}`);
    } catch (e: any) {
      setErr(e?.message || "Impossible de rejoindre ce salon.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 620, margin: "40px auto", padding: 16, fontFamily: "system-ui, sans-serif" }}>
      <h1 style={{ marginTop: 0 }}>Rejoindre un salon privé</h1>

      <div style={{ marginTop: 18, marginBottom: 10, fontWeight: 700, color: "#111827" }}>Code du salon</div>

      {/* Zone cliquable qui focus un input caché */}
      <div
        onClick={() => hiddenInput.current?.focus()}
        role="group"
        aria-label="Saisir le code du salon"
        style={{ display: "flex", gap: 18, alignItems: "center", marginBottom: 14, flexWrap: "wrap" }}
      >
        {chars.map((ch, idx) => (
          <div
            key={idx}
            style={{
              width: 86,
              height: 86,
              display: "grid",
              placeItems: "center",
              borderRadius: 20,
              background: "#fff",
              border: "2px solid #0f2150",
              boxShadow: "0 6px 18px rgba(0,0,0,.12), 0 0 0 4px rgba(15,33,80,.08)",
              fontSize: 40,
              fontWeight: 700,
              color: "#0b1022",
              userSelect: "none",
            }}
          >
            {ch}
          </div>
        ))}
        {/* input invisible pour la saisie/paste */}
        <input
          ref={hiddenInput}
          value={normalized}
          onChange={(e) => handleChange(e.target.value)}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            handleChange(t);
            e.preventDefault();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter") resolveAndGo();
            if (e.key === "Backspace" && normalized.length === 0) setErr(null);
          }}
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          maxLength={MAX_LEN}
          style={{
            position: "absolute",
            opacity: 0,
            pointerEvents: "none",
            width: 0,
            height: 0,
          }}
        />
      </div>

      <div style={{ display: "flex", gap: 10, marginBottom: 6 }}>
        <button
          type="button"
          onClick={() => handleChange("")}
          style={{
            padding: "8px 10px",
            borderRadius: 10,
            border: "1px solid #e5e7eb",
            background: "#fff",
            cursor: "pointer",
            fontWeight: 600,
          }}
        >
          Effacer
        </button>
        <button
          type="button"
          onClick={resolveAndGo}
          disabled={loading}
          style={{
            padding: "10px 14px",
            borderRadius: 12,
            border: "1px solid #0f2150",
            background: "#0f2150",
            color: "#fff",
            fontWeight: 700,
            cursor: loading ? "not-allowed" : "pointer",
          }}
        >
          {loading ? "Connexion…" : "Rejoindre"}
        </button>
      </div>

      {err && <div style={{ color: "#b00020", marginTop: 6 }}>{err}</div>}

      <p style={{ opacity: 0.7, marginTop: 18, fontSize: 14 }}>
        Astuce : vous pouvez coller un code (Ctrl/Cmd-V) directement dans les cases.
      </p>
    </div>
  );
}
