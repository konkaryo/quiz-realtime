// web/src/pages/JoinPrivateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";

const API_BASE = import.meta.env.VITE_API_BASE as string;

// Ajuste si ta navbar est plus haute/basse
const NAVBAR_HEIGHT_PX = 52;

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
    throw new Error(msg);
  }
  return data;
}

const MAX_LEN = 4;

export default function JoinPrivateRoomPage() {
  const nav = useNavigate();

  const [code, setCode] = useState<string>("");
  const [err, setErr] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const hiddenInput = useRef<HTMLInputElement | null>(null);

  const normalized = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_LEN),
    [code],
  );

  const chars = useMemo(
    () => Array.from({ length: MAX_LEN }).map((_, i) => normalized[i] || ""),
    [normalized],
  );

  // ✅ Empêcher le scroll global (sinon double scrollbar)
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    const prevHtmlOverflow = html.style.overflow;
    const prevBodyOverflow = body.style.overflow;

    html.style.overflow = "hidden";
    body.style.overflow = "hidden";

    return () => {
      html.style.overflow = prevHtmlOverflow;
      body.style.overflow = prevBodyOverflow;
    };
  }, []);

  // focus auto
  useEffect(() => {
    hiddenInput.current?.focus();
  }, []);

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
      let roomId: string | undefined;

      try {
        const r1 = (await fetchJSON("/rooms/resolve", {
          method: "POST",
          body: JSON.stringify({ code: c }),
        })) as { roomId?: string; room?: { id: string } };

        roomId = r1?.roomId ?? r1?.room?.id;
      } catch {
        const r2 = (await fetchJSON(`/rooms/by-code/${encodeURIComponent(c)}`)) as {
          room?: { id: string };
        };
        roomId = r2?.room?.id;
      }

      if (!roomId) throw new Error("Code invalide ou introuvable.");
      nav(`/rooms/${roomId}/lobby`);
    } catch (e: any) {
      setErr(e?.message || "Impossible de rejoindre ce salon.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative text-slate-50">
      <div aria-hidden className="fixed inset-0 bg-[#13141F]" />

      <style>{`
        /* ✅ Scrollbar style appliqué au conteneur scroll (lb-scroll) */
        .lb-scroll {
          scrollbar-width: thin;
          scrollbar-color: #4A4B56 #1E1F28;
        }
        .lb-scroll::-webkit-scrollbar { width: 12px; }
        .lb-scroll::-webkit-scrollbar-track {
          background: #1E1F28;
          border-radius: 999px;
        }
        .lb-scroll::-webkit-scrollbar-button {
          background-color: #4A4B56;
          height: 12px;
        }
        .lb-scroll::-webkit-scrollbar-thumb {
          background: #4A4B56;
          border-radius: 999px;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
        .lb-scroll::-webkit-scrollbar-thumb:hover {
          background: #4A4B56;
          border: 3px solid rgba(0,0,0,0);
          background-clip: padding-box;
        }
      `}</style>

      {/* ✅ Zone scrollable: top = navbar, bottom = 0 */}
      <div
        className="fixed left-0 right-0 bottom-0 z-10 lb-scroll overflow-y-auto"
        style={{ top: `${NAVBAR_HEIGHT_PX}px` }}
      >
        <div className="mx-auto flex max-w-6xl flex-col px-4 py-10 sm:px-8 lg:px-10">
          <header className="mb-12 text-center">
            <h1 className="text-5xl font-brand text-slate-50">REJOINDRE UN SALON PRIVÉ</h1>
          </header>

          {err && (
            <div className="mx-auto mb-6 w-full max-w-3xl rounded-[6px] border border-rose-800/60 bg-rose-950/30 px-4 py-3 text-sm text-rose-200 shadow-[0_18px_40px_rgba(0,0,0,0.25)]">
              {err}
            </div>
          )}

          <div className="mx-auto w-full max-w-3xl rounded-[6px] border border-[#2A2D3C] bg-[#1C1F2E] p-6 shadow-[0_18px_40px_rgba(0,0,0,0.45)]">

            {/* Zone cliquable qui focus un input caché */}
            <div
              onClick={() => hiddenInput.current?.focus()}
              role="group"
              aria-label="Saisir le code du salon"
            >
              <div className="flex justify-center gap-3 sm:gap-4">
                {chars.map((ch, idx) => (
                  <div
                    key={idx}
                    className={[
                      "flex h-16 w-16 items-center justify-center sm:h-20 sm:w-20",
                      "rounded-[10px] border border-[#2A2D3C] bg-[#141625]",
                      "font-mono text-3xl sm:text-4xl font-extrabold tracking-[0.22em] text-slate-50",
                      "shadow-[0_14px_35px_rgba(0,0,0,0.35)]",
                    ].join(" ")}
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

            <div className="sr-only" aria-live="polite">
              {normalized.length === MAX_LEN ? "Code complet." : "Code incomplet."}
            </div>
          </div>

          <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => handleChange("")}
              className={[
                "inline-flex h-12 w-40 items-center justify-center rounded-[6px]",
                "border border-[#2A2D3C] bg-[#181A28]",
                "text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-200",
                "transition hover:text-white",
              ].join(" ")}
            >
              Effacer
            </button>

            <button
              type="button"
              onClick={resolveAndGo}
              disabled={loading || normalized.length !== MAX_LEN}
              className={[
                "inline-flex h-12 w-40 items-center justify-center rounded-[6px]",
                "text-[11px] font-semibold uppercase tracking-[0.22em] transition",
                "border border-transparent bg-[#2D7CFF] text-slate-50 hover:bg-[#1F65DB]",
                loading || normalized.length !== MAX_LEN
                  ? "cursor-not-allowed opacity-40 hover:bg-[#2D7CFF]"
                  : "",
              ].join(" ")}
            >
              {loading ? "Connexion…" : "Rejoindre"}
            </button>
          </div>

          <div className="h-10" />
        </div>
      </div>
    </div>
  );
}
