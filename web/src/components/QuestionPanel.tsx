// web/src/components/QuestionPanel.tsx
import { RefObject, KeyboardEvent } from "react";
import enterKey from "@/assets/enter-key.svg";
import tabKey from "@/assets/tab-key.svg";
import { getThemeMeta } from "../lib/themeMeta";

export type Choice = { id: string; label: string };

export type QuestionLite = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  slotLabel: string | null;
};

export type QuestionProgress = "pending" | "correct" | "wrong";

function Lives({ lives, total }: { lives: number; total: number }) {
  const full = Array.from({ length: lives }).map((_, i) => (
    <span key={`f${i}`} className="text-[14px] leading-none whitespace-nowrap">
      ❤️
    </span>
  ));
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span
      key={`e${i}`}
      className="text-[14px] leading-none opacity-25 whitespace-nowrap"
    >
      ❤️
    </span>
  ));

  return (
    <div className="inline-flex items-center whitespace-nowrap gap-1 px-4 py-1.5">
      {full}
      {empty}
    </div>
  );
}

function TimerBadge({ seconds }: { seconds: number | null }) {
  const total = Math.max(0, seconds ?? 0);
  const minutes = Math.floor(total / 60);
  const secs = total % 60;
  const display = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
  const urgent = total <= 5;

  return (
    <div
      aria-live="polite"
      className={[
        "inline-flex items-center font-semibold tabular-nums whitespace-nowrap",
        "gap-2 text-[14px]",
        "tracking-[0.30em]",
        urgent
          ? "text-rose-400 drop-shadow-none animate-pulse"
          : "text-slate-100",
      ].join(" ")}
    >
      <span className="text-[14px]">⏱</span>
      <span>{display}</span>
    </div>
  );
}

type Props = {
  // données de la question
  question: QuestionLite;
  index: number;
  totalQuestions: number | null;
  lives: number;
  totalLives: number;

  // timing
  remainingSeconds: number | null;
  timerProgress: number;
  isReveal: boolean; // phase === "reveal" && remainingSeconds === 0
  isPlaying: boolean; // phase === "playing" && socketStatus === "connected"

  // saisie texte
  inputRef: RefObject<HTMLInputElement | null>;
  textAnswer: string;
  textLocked: boolean;
  onChangeText: (val: string) => void;
  onSubmitText: () => void;
  onShowChoices: () => void;

  // feedback
  feedback: string | null;
  feedbackResponseMs: number | null;
  feedbackWasCorrect: boolean | null;
  feedbackCorrectLabel: string | null;
  feedbackPoints?: number | null;
  answerMode: "text" | "choice" | null;
  choicesRevealed: boolean;

  // QCM
  showChoices: boolean;
  choices: Choice[] | null;
  selectedChoice: string | null;
  correctChoiceId: string | null;
  onSelectChoice: (choice: Choice) => void;

  // barre de progression des questions
  questionProgress: QuestionProgress[];
};

export default function DailyQuestionPanel(props: Props) {
  const {
    question,
    index,
    totalQuestions,
    lives,
    totalLives,
    remainingSeconds,
    timerProgress,
    isReveal,
    isPlaying,
    inputRef,
    textAnswer,
    textLocked,
    onChangeText,
    onSubmitText,
    onShowChoices,
    feedback,
    feedbackResponseMs,
    feedbackWasCorrect,
    feedbackCorrectLabel,
    feedbackPoints = null,
    answerMode,
    choicesRevealed,
    showChoices,
    choices,
    selectedChoice,
    correctChoiceId,
    onSelectChoice,
    questionProgress,
  } = props;

  const themeMeta = getThemeMeta(question.theme ?? null);

  const showResponseTime = feedbackWasCorrect === true && feedbackResponseMs !== null;
  const showFeedbackPoints = typeof feedbackPoints === "number";
  const showCorrectLabelCell =
    !!feedbackCorrectLabel &&
    (answerMode === "text" ||
      (answerMode === null && feedback === "Temps écoulé !" && !choicesRevealed));

  const textInputDisabled = !isPlaying || textLocked;
  const textPlaceholder = textLocked ? "Choisissez une réponse..." : "Tapez votre réponse ici...";
  const textInputColorClass = textInputDisabled
    ? "text-slate-400 caret-slate-600 placeholder:text-slate-500/60"
    : "text-slate-50 caret-[#cccccc] placeholder:text-slate-500/70";

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (textInputDisabled && e.key === "Enter") {
      e.preventDefault();
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      onSubmitText();
    }
    if (e.key === "Tab") {
      e.preventDefault();
      onShowChoices();
    }
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      {/* panneau principal */}
      <div className="relative">
        <div
          className={[
            "relative w-full shadow-none ring-0 outline-none filter-none",
            "bg-[#1F2128]",
            "rounded-[9px]",
            "p-6",
            "border border-white/30",
          ].join(" ")}
        >
          {/* bandeau supérieur : timer / info / vies */}
          <div className="flex flex-col md:flex-row md:flex-nowrap md:items-center md:justify-between gap-3">
            <div className="order-2 md:order-1 whitespace-nowrap font-medium text-slate-100 text-[14px] leading-[18px]">
              Question {index + 1}
              {typeof totalQuestions === "number" && totalQuestions > 0 && (
                <span className="text-slate-500"> / {totalQuestions}</span>
              )}
            </div>

            <div className="order-1 md:order-2 flex justify-center whitespace-nowrap">
              {isReveal ? (
                <div className="font-semibold uppercase text-slate-300/80 whitespace-nowrap text-[10px] tracking-[0.30em]">
                  En attente...
                </div>
              ) : (
                <TimerBadge seconds={remainingSeconds} />
              )}
            </div>

            <div className="order-3 md:order-3 flex justify-end whitespace-nowrap">
              <Lives lives={lives} total={totalLives} />
            </div>
          </div>

          {/* barre de progression */}
          <div
            className="mt-4 h-[2px] w-full rounded-full"
            style={{ backgroundColor: "#15171E" }}
          >
            <div
              className="h-full rounded-full transition-all"
              style={{
                width: `${timerProgress * 100}%`,
                backgroundColor: "#02B0FF",
              }}
            />
          </div>

          {/* question + image */}
          <div className="flex flex-col md:flex-row md:items-stretch mt-6 gap-4 md:min-h-[14rem]">
            <div className={question.img ? "md:w-3/5" : "md:w-full"}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <div
                  className={[
                    "inline-flex items-center border border-slate-700/80 bg-[#15171E] font-semibold uppercase text-slate-100 whitespace-nowrap",
                    "gap-2",
                    "rounded-[9px]",
                    "px-3 py-1.5",
                    "text-[8px]",
                    "tracking-[0.18em]",
                  ].join(" ")}
                >
                  <span
                    aria-hidden
                    className="inline-block rounded-full"
                    style={{
                      backgroundColor: themeMeta.color,
                      height: 8,
                      width: 8,
                    }}
                  />
                  {themeMeta.label}
                </div>

                {question.slotLabel && (
                  <span
                    className={[
                      "rounded-full bg-slate-900/90 font-semibold uppercase text-slate-200 whitespace-nowrap",
                      "px-3 py-1",
                      "text-[8px]",
                      "tracking-[0.22em]",
                    ].join(" ")}
                  >
                    {question.slotLabel}
                  </span>
                )}
              </div>

              <p className="mt-4 font-semibold leading-snug text-slate-50 text-[15px]">
                {question.text}
              </p>
            </div>

            {question.img && (
              <div className="md:w-2/5">
                <div className="relative h-full">
                  <img
                    src={question.img}
                    alt=""
                    className="relative w-full object-cover shadow-none max-h-[168px] rounded-[20px]"
                    loading="lazy"
                  />
                </div>
              </div>
            )}
          </div>

          {/* zone saisie & boutons */}
          {/* ✅ FIX : mt-1.5 sur le conteneur commun + labels en absolute pour ne pas impacter l'alignement */}
          <div className="mt-1.5 flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <div className="border border-slate-700/80 bg-black/70 shadow-inner shadow-black/80 rounded-[9px] px-2.5 py-1">
                <input
                  ref={inputRef}
                  value={textAnswer}
                  onChange={(e) => onChangeText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={textInputDisabled}
                  aria-disabled={textLocked}
                  spellCheck={false}
                  autoCorrect="off"
                  autoCapitalize="off"
                  className={[
                    "w-full border-none bg-transparent font-medium antialiased focus:outline-none focus:ring-0",
                    "px-2 py-2",
                    "text-[11px]",
                    "tracking-[0.02em]",
                    textInputColorClass,
                    textInputDisabled ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  placeholder={textPlaceholder}
                />
              </div>
            </div>

            <div className="flex flex-nowrap whitespace-nowrap gap-4 md:ml-3">
              {/* VALIDER */}
              <div className="relative flex items-center justify-center">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-[0.18em] text-white/60">
                  [Entrée]
                </div>

                <button
                  type="button"
                  onClick={onSubmitText}
                  disabled={textInputDisabled}
                  className={[
                    "inline-flex items-center justify-center bg-[#02B0FF] text-slate-50 transition duration-150 hover:brightness-110",
                    "rounded-[9px]",
                    "px-4 py-2",
                    "font-semibold uppercase",
                    "text-[8px]",
                    "tracking-[0.18em]",
                    textInputDisabled ? "opacity-60" : "shadow-none",
                  ].join(" ")}
                >
                  Valider
                </button>
              </div>

              {/* PROPOSITIONS */}
              <div className="relative flex items-center justify-center">
                <div className="absolute -top-5 left-1/2 -translate-x-1/2 text-[10px] font-semibold tracking-[0.18em] text-white/60">
                  [Tab]
                </div>

                <button
                  type="button"
                  onClick={onShowChoices}
                  disabled={textInputDisabled}
                  className={[
                    "inline-flex items-center justify-center bg-[#15171E] text-slate-50 transition duration-150 hover:brightness-110",
                    "rounded-[9px]",
                    "px-3.5 py-2",
                    "font-semibold uppercase",
                    "text-[8px]",
                    "tracking-[0.18em]",
                    textInputDisabled ? "opacity-60" : "shadow-none",
                  ].join(" ")}
                >
                  Propositions
                </button>
              </div>
            </div>
          </div>

          {/* feedback + temps de réponse + bonne réponse */}
          {feedback && (
            <div className="flex flex-col md:flex-row md:items-stretch mt-3 gap-2 md:gap-3">
              {/* feedback */}
              <div className="inline-flex items-center border border-slate-700/80 bg-black/80 text-slate-100 shadow-inner shadow-black/80 min-h-[32px] gap-2 rounded-[9px] px-4 py-2 text-[11px]">
                <span
                  className={[
                    "text-[12px]",
                    feedback === "Temps écoulé !"
                      ? "text-amber-300"
                      : feedback.includes("Bravo")
                      ? "text-emerald-400"
                      : "text-red-500",
                  ].join(" ")}
                >
                  {feedback === "Temps écoulé !" ? "⏳" : feedback.includes("Bravo") ? "✅" : "❌"}
                </span>
                <div>
                  <span className="font-medium">{feedback}</span>
                </div>
              </div>

              {/* bonne réponse (mode texte) */}
              {showCorrectLabelCell && (
                <div className="inline-flex items-center border border-emerald-600 bg-emerald-600 text-slate-50 shadow-none min-h-[32px] rounded-[9px] px-3.5 py-2">
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold uppercase text-emerald-100 whitespace-nowrap text-[8px] tracking-[0.22em]">
                      Bonne réponse
                    </span>
                    <span className="mt-1 font-medium text-[10px]">{feedbackCorrectLabel}</span>
                  </div>
                </div>
              )}

              {/* points gagnés */}
              {showFeedbackPoints && (
                <div className="inline-flex items-center border border-slate-700/80 bg-black/80 text-slate-100 shadow-inner shadow-black/80 min-h-[32px] rounded-[9px] px-3.5 py-2 text-[10px]">
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold uppercase text-slate-400 whitespace-nowrap text-[8px] tracking-[0.22em]">
                      Points gagnés
                    </span>
                    <span className="mt-1 font-mono text-[11px] text-slate-50 whitespace-nowrap">
                      + {feedbackPoints.toLocaleString("fr-FR")} pts
                    </span>
                  </div>
                </div>
              )}

              {/* temps de réponse */}
              {showResponseTime && feedbackResponseMs !== null && (
                <div className="inline-flex items-center border border-slate-700/80 bg-black/80 text-slate-100 shadow-inner shadow-black/80 min-h-[32px] rounded-[9px] px-3.5 py-2 text-[10px]">
                  <div className="flex flex-col leading-tight">
                    <span className="font-semibold uppercase text-slate-400 whitespace-nowrap text-[8px] tracking-[0.22em]">
                      Temps de réponse
                    </span>
                    <span className="mt-1 font-mono text-[11px] text-slate-50 whitespace-nowrap">
                      {feedbackResponseMs.toLocaleString("fr-FR")} ms
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* choix multiples */}
          {showChoices && choices && (
            <div className="mt-4 grid gap-2 md:grid-cols-2">
              {choices.map((choice) => {
                const isSelected = selectedChoice === choice.id;
                const isCorrect = correctChoiceId === choice.id;
                const hoverClasses =
                  selectedChoice === null ? "hover:border-white hover:bg-slate-900" : "";

                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => onSelectChoice(choice)}
                    disabled={!isPlaying && !isSelected}
                    className={[
                      "group relative overflow-hidden border text-left font-medium transition backdrop-blur-xl shadow-none",
                      "rounded-[9px]",
                      "px-3.5 py-2.5",
                      "text-[11px]",
                      isCorrect
                        ? "border-emerald-600 bg-emerald-600 text-slate-50"
                        : isSelected
                        ? "border-red-500 bg-red-500 text-slate-50"
                        : `border-slate-700/90 bg-black/75 text-slate-50 ${hoverClasses}`,
                      !isPlaying ? "cursor-default" : "",
                    ].join(" ")}
                  >
                    {choice.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* barre de progression des questions sous le cadre */}
      {questionProgress.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {questionProgress.map((state, i) => {
            let colorClasses = "bg-slate-700/60 text-slate-200"; // pending
            if (state === "correct") colorClasses = "bg-emerald-600 text-slate-50";
            else if (state === "wrong") colorClasses = "bg-red-500 text-slate-50";

            return (
              <div
                key={i}
                className={[
                  "flex items-center justify-center rounded-md font-semibold whitespace-nowrap",
                  "w-[27px] h-[27px]",
                  "sm:w-[30px] sm:h-[30px]",
                  "text-[11px]",
                  colorClasses,
                ].join(" ")}
              >
                {i + 1}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
