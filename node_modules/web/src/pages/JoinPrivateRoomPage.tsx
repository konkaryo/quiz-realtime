// web/src/pages/JoinPrivateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const NAVBAR_HEIGHT_PX = 52;
const MAX_LEN = 4;

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
    const msg =
      (data as any)?.error ||
      (data as any)?.message ||
      `HTTP ${res.status}`;
    throw new Error(msg);
  }

  return data;
}

export default function JoinPrivateRoomPage() {
  const nav = useNavigate();

  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [isFocused, setIsFocused] = useState(false);

  const hiddenInput = useRef<HTMLInputElement | null>(null);

  const normalized = useMemo(
    () => code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_LEN),
    [code]
  );

  const chars = useMemo(
    () => Array.from({ length: MAX_LEN }).map((_, i) => normalized[i] || ""),
    [normalized]
  );

  const activeIndex =
    normalized.length < MAX_LEN ? normalized.length : MAX_LEN - 1;
  const showCaret = isFocused && normalized.length < MAX_LEN;

  function focusHiddenInput() {
    window.requestAnimationFrame(() => {
      hiddenInput.current?.focus();
    });
  }

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

  useEffect(() => {
    focusHiddenInput();
  }, []);

  useEffect(() => {
    function handleWindowPointerDown(event: PointerEvent) {
      const target = event.target as HTMLElement | null;
      if (!target) return;

      const tag = target.tagName;
      const isInteractive =
        tag === "BUTTON" ||
        tag === "A" ||
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        tag === "SELECT" ||
        target.closest("button, a, input, textarea, select");

      if (!isInteractive) {
        focusHiddenInput();
      }
    }

    window.addEventListener("pointerdown", handleWindowPointerDown);

    return () => {
      window.removeEventListener("pointerdown", handleWindowPointerDown);
    };
  }, []);

  function handleChange(value: string) {
    const next = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, MAX_LEN);
    setCode(next);
  }

  async function resolveAndGo() {
    const c = normalized.trim();

    if (c.length !== MAX_LEN) {
      toast({
        title: "Code incomplet",
        description: `Le code doit comporter ${MAX_LEN} caractères.`,
        variant: "destructive",
      });
      focusHiddenInput();
      return;
    }

    setLoading(true);

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

      if (!roomId) {
        throw new Error("Code invalide ou introuvable.");
      }

      nav(`/rooms/${roomId}/lobby`);
    } catch (e: any) {
      const message = typeof e?.message === "string" ? e.message : "Impossible de rejoindre ce salon.";
      toast({
        title: "Salon introuvable",
        description: message === "Not found" ? "Code invalide ou introuvable." : message,
        variant: "destructive",
      });
      setCode("");
      focusHiddenInput();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen text-white">
      <div aria-hidden className="fixed inset-0 bg-[#090b1f]" />

      <style>{`
        @keyframes inputCaretBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        .join-room-caret {
          width: 2px;
          height: 34px;
          border-radius: 999px;
          background: #111827;
          animation: inputCaretBlink 1s step-end infinite;
        }

        @media (max-width: 640px) {
          .join-room-caret {
            height: 28px;
          }
        }
      `}</style>

      <main
        className="relative z-10 flex items-start justify-center px-4"
        style={{
          minHeight: `calc(100vh - ${NAVBAR_HEIGHT_PX}px)`,
          paddingTop: "7.5rem",
        }}
        onClick={() => focusHiddenInput()}
      >
        <div className="w-full max-w-3xl text-center">
          <header className="mb-14 text-center">
            <h1 className="text-5xl font-brand text-slate-50">
              REJOINDRE UN SALON PRIVÉ
            </h1>
          </header>

          <div
            onClick={() => focusHiddenInput()}
            role="group"
            aria-label="Saisir le code du salon"
            className="mx-auto mb-16 flex justify-center gap-5 sm:gap-6"
          >
            {chars.map((ch, idx) => {
              const isActive = showCaret && idx === activeIndex;

              return (
                <div
                  key={idx}
                  className={[
                    "relative flex h-[80px] w-[70px] items-center justify-center",
                    "rounded-[14px] bg-[#efefef]",
                    "shadow-[0_8px_24px_rgba(0,0,0,0.18)]",
                    "sm:h-[88px] sm:w-[76px]",
                  ].join(" ")}
                >
                  {ch ? (
                    <span className="font-mono text-4xl font-bold text-[#111827]">
                      {ch}
                    </span>
                  ) : isActive ? (
                    <span className="join-room-caret" />
                  ) : null}
                </div>
              );
            })}

            <input
              ref={hiddenInput}
              value={normalized}
              onChange={(e) => handleChange(e.target.value)}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onPaste={(e) => {
                const pasted = e.clipboardData.getData("text");
                handleChange(pasted);
                e.preventDefault();
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  resolveAndGo();
                }
              }}
              inputMode="text"
              autoCapitalize="characters"
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              maxLength={MAX_LEN}
              className="absolute h-0 w-0 opacity-0 pointer-events-none"
            />
          </div>

          <button
            type="button"
            onClick={resolveAndGo}
            disabled={loading || normalized.length !== MAX_LEN}
            className={[
              "mx-auto inline-flex w-full max-w-[235px] items-center justify-center",
              "rounded-[8px] border-0 bg-[#6F5BD4] px-4 py-3",
              "text-[15px] font-bold text-white transition",
              "hover:brightness-110",
              loading || normalized.length !== MAX_LEN
                ? "cursor-not-allowed opacity-50 hover:brightness-100"
                : "cursor-pointer",
            ].join(" ")}
          >
            {loading ? "Connexion..." : "Rejoindre"}
          </button>

          <div className="sr-only" aria-live="polite">
            {normalized.length === MAX_LEN ? "Code complet." : "Code incomplet."}
          </div>
        </div>
      </main>
    </div>
  );
}