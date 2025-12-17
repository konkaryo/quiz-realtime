import React, { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import Background from "../components/Background";

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
    <div className="relative min-h-screen text-slate-50">
      <Background />

      <div className="relative z-10 mx-auto flex min-h-screen max-w-5xl flex-col items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full rounded-[38px] border border-slate-800/70 bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.96),rgba(15,23,42,0.98)),radial-gradient(circle_at_bottom,_rgba(37,99,255,0.12),#020617)] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.85)] sm:p-8">
          <header className="mb-8 text-center">
            <h1 className="font-brand text-4xl leading-tight text-white sm:text-5xl">SAISIR LE CODE</h1>
          </header>

          <div className="flex flex-col items-center gap-6">
            {/* Zone cliquable qui focus un input caché */}
            <div
              onClick={() => hiddenInput.current?.focus()}
              role="group"
              aria-label="Saisir le code du salon"
              className="relative w-full max-w-3xl rounded-[28px] border border-slate-800/70 bg-black/30 p-5 shadow-inner shadow-black/60 backdrop-blur"
            >
              <div className="flex flex-wrap justify-center gap-4 sm:gap-5">
                {chars.map((ch, idx) => (
                  <div
                    key={idx}
                    className="flex h-20 w-20 items-center justify-center rounded-2xl border border-slate-700 bg-slate-900/60 text-4xl font-semibold uppercase tracking-[0.2em] text-white shadow-[0_14px_35px_rgba(0,0,0,0.45)] transition hover:border-slate-200/70 hover:text-white sm:h-24 sm:w-24"
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
                  className="absolute h-0 w-0 opacity-0"
                />
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => handleChange("")}
                className="rounded-full border border-slate-700 bg-slate-900/60 px-4 py-2 text-sm font-semibold text-slate-100 shadow-[0_12px_30px_rgba(0,0,0,0.45)] transition hover:border-slate-300/70 hover:text-white"
              >
                Effacer
              </button>
              <button
                type="button"
                onClick={resolveAndGo}
                disabled={loading}
                className="rounded-full border border-[#2563ff] bg-gradient-to-r from-[#2563ff] to-[#7c3aed] px-6 py-2 text-sm font-semibold uppercase tracking-wide text-white shadow-[0_18px_35px_rgba(37,99,255,0.35)] transition hover:shadow-[0_22px_40px_rgba(124,58,237,0.35)] disabled:cursor-not-allowed disabled:opacity-70"
              >
                {loading ? "Connexion…" : "Rejoindre"}
              </button>
            </div>

            {err && <div className="text-sm font-semibold text-rose-200">{err}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
