// web/src/pages/JoinPrivateRoomPage.tsx
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "@/hooks/use-toast";
import lockIcon from "../assets/lock.png";

const API_BASE = import.meta.env.VITE_API_BASE as string;
const NAVBAR_HEIGHT_PX = 52;
const MAX_LEN = 4;

type ApiErrorData = { error?: string; message?: string };

function getErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error && error.message ? error.message : fallback;
}

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
    const errorData = data as ApiErrorData | undefined;
    const msg = errorData?.error || errorData?.message || `HTTP ${res.status}`;
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
    () =>
      code
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
        .slice(0, MAX_LEN),
    [code],
  );

  const chars = useMemo(
    () => Array.from({ length: MAX_LEN }).map((_, i) => normalized[i] || ""),
    [normalized],
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
    const next = value
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, MAX_LEN);
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
        const r2 = (await fetchJSON(
          `/rooms/by-code/${encodeURIComponent(c)}`,
        )) as {
          room?: { id: string };
        };

        roomId = r2?.room?.id;
      }

      if (!roomId) {
        throw new Error("Code invalide ou introuvable.");
      }

      nav(`/rooms/${roomId}/lobby`);
    } catch (e: unknown) {
      const message = getErrorMessage(e, "Impossible de rejoindre ce salon.");
      toast({
        title: "Salon introuvable",
        description:
          message === "Not found" ? "Code invalide ou introuvable." : message,
        variant: "destructive",
      });
      setCode("");
      focusHiddenInput();
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden text-white">
      <div aria-hidden className="fixed inset-0 bg-[#060A19]" />
      <div
        aria-hidden
        className="fixed inset-0 bg-[radial-gradient(ellipse_at_16%_38%,rgba(24,36,74,0.42),transparent_46%),radial-gradient(ellipse_at_82%_44%,rgba(22,34,70,0.36),transparent_50%)]"
      />
      <svg
        aria-hidden="true"
        className="fixed inset-0 h-full w-full opacity-70"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        <defs>
          <linearGradient id="joinPrivateWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0A132E" stopOpacity="0.06" />
            <stop offset="45%" stopColor="#1C2A52" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0A132E" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="joinPrivateWaveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#071028" stopOpacity="0.02" />
            <stop offset="52%" stopColor="#22315A" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#071028" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M-120 220 C 180 105 390 270 650 175 C 900 85 1110 175 1560 70 L1560 0 L-120 0 Z"
          fill="url(#joinPrivateWaveA)"
        />
        <path
          d="M-120 500 C 180 390 410 545 700 440 C 980 340 1160 420 1560 330 L1560 170 C 1130 265 970 185 690 290 C 410 395 170 250 -120 350 Z"
          fill="url(#joinPrivateWaveB)"
        />
        <path
          d="M-120 760 C 210 650 430 785 720 690 C 1010 595 1190 675 1560 575 L1560 430 C 1160 535 990 455 715 550 C 425 650 210 520 -120 620 Z"
          fill="url(#joinPrivateWaveA)"
          opacity="0.66"
        />
        <path
          d="M-120 350 C 170 250 410 395 690 290 C 970 185 1130 265 1560 170"
          fill="none"
          stroke="#314474"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
        <path
          d="M-120 620 C 210 520 425 650 715 550 C 990 455 1160 535 1560 430"
          fill="none"
          stroke="#2A3B68"
          strokeOpacity="0.12"
          strokeWidth="2"
        />
      </svg>
      <div
        aria-hidden
        className="fixed inset-0 bg-[linear-gradient(180deg,rgba(6,10,25,0)_0%,rgba(6,10,25,0.16)_58%,#060A19_100%)]"
      />

      <style>{`
        @keyframes inputCaretBlink {
          0%, 49% { opacity: 1; }
          50%, 100% { opacity: 0; }
        }

        .join-room-caret {
          width: 2px;
          height: 30px;
          border-radius: 999px;
          background: rgba(255, 255, 255, 0.9);
          box-shadow: 0 0 12px rgba(126, 87, 255, 0.75);
          animation: inputCaretBlink 1s step-end infinite;
        }

        @media (max-width: 640px) {
          .join-room-caret {
            height: 28px;
          }
        }
      `}</style>

      <main
        className="relative z-10 flex items-start justify-center px-4 sm:px-6"
        style={{
          minHeight: `calc(100vh - ${NAVBAR_HEIGHT_PX}px)`,
          paddingTop: "3.25rem",
        }}
        onClick={() => focusHiddenInput()}
      >
        <div className="w-full max-w-3xl text-center">
          <header className="text-center">
            <h1 className="font-brandUpright text-[42px] uppercase leading-[0.9] tracking-[0.01em] text-slate-50 sm:text-[56px]">
              REJOINDRE UNE PARTIE PRIVÉE
            </h1>
            <p className="mt-5 text-[13px] font-semibold text-slate-200/90 sm:text-sm">
              Saisis le code de la partie privée pour la rejoindre.
            </p>
          </header>

          <div className="mx-auto mt-9 flex w-fit flex-col items-center">
            <div
              aria-hidden
              className="mb-8 flex h-[94px] w-[118px] items-center justify-center"
            >
              <img
                src={lockIcon}
                alt=""
                className="h-[76px] w-[76px] object-contain drop-shadow-[0_0_18px_rgba(255,255,255,0.22)]"
              />
            </div>

            <p className="mb-4 text-[11px] font-black uppercase tracking-[0.22em] text-slate-400">
              Code de la partie
            </p>

            <div
              onClick={() => focusHiddenInput()}
              role="group"
              aria-label="Saisir le code de la partie"
              className="mx-auto mb-8 flex items-center justify-center gap-3 sm:gap-4"
            >
              {chars
                .map((ch, idx) => {
                  const isActive = showCaret && idx === activeIndex;

                  return (
                    <div
                      key={idx}
                      className={[
                        "relative flex h-[62px] w-[58px] items-center justify-center",
                        "rounded-[8px] border border-[#7C4DFF]/85 bg-[#0C1222]",
                        "shadow-[0_0_0_1px_rgba(124,77,255,0.08),0_12px_30px_rgba(0,0,0,0.24),inset_0_0_20px_rgba(124,77,255,0.06)]",
                        "sm:h-[72px] sm:w-[66px]",
                      ].join(" ")}
                    >
                      {ch ? (
                        <span className="font-mono text-3xl font-bold text-slate-100 sm:text-4xl">
                          {ch}
                        </span>
                      ) : isActive ? (
                        <span className="join-room-caret" />
                      ) : null}
                    </div>
                  );
                })
                .reduce<React.ReactNode[]>((acc, node, idx) => {
                  if (idx > 0) {
                    acc.push(
                      <span
                        key={`separator-${idx}`}
                        aria-hidden
                        className="text-base font-bold text-slate-400/80"
                      >
                        -
                      </span>,
                    );
                  }
                  acc.push(node);
                  return acc;
                }, [])}

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
          </div>

          <div className="mx-auto mt-10 flex w-full max-w-[265px] flex-col items-center sm:mt-12">
            <button
              type="button"
              onClick={resolveAndGo}
              disabled={loading || normalized.length !== MAX_LEN}
              className={[
                "inline-flex w-full items-center justify-center",
                "rounded-[7px] border-0 bg-gradient-to-r from-[#6D4CFF] to-[#7B42FF] px-4 py-3.5",
                "text-[13px] font-extrabold text-white shadow-[0_14px_30px_rgba(94,59,235,0.28)] transition",
                "hover:brightness-110",
                loading || normalized.length !== MAX_LEN
                  ? "cursor-not-allowed opacity-50 hover:brightness-100"
                  : "cursor-pointer",
              ].join(" ")}
            >
              {loading ? "Connexion..." : "Rejoindre"}
            </button>

            <div className="my-5 flex w-full items-center gap-4" aria-hidden>
              <div className="h-px flex-1 bg-slate-500/20" />
              <span className="text-[12px] font-black uppercase tracking-[0.12em] text-slate-400">
                ou
              </span>
              <div className="h-px flex-1 bg-slate-500/20" />
            </div>

            <button
              type="button"
              onClick={() => nav("/rooms/new")}
              className="inline-flex w-full items-center justify-center rounded-[7px] border border-slate-400/70 bg-transparent px-4 py-3.5 text-[13px] font-extrabold text-white shadow-[0_12px_28px_rgba(0,0,0,0.22)] transition hover:border-white hover:bg-white/5"
            >
              Créer une partie
            </button>
          </div>

          <div className="sr-only" aria-live="polite">
            {normalized.length === MAX_LEN
              ? "Code complet."
              : "Code incomplet."}
          </div>
        </div>
      </main>
    </div>
  );
}