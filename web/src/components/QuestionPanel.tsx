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
    <span key={`f${i}`} className="text-[18px] leading-none">
      ❤️
    </span>
  ));
  const empty = Array.from({ length: Math.max(0, total - lives) }).map((_, i) => (
    <span key={`e${i}`} className="text-[18px] leading-none opacity-25">
      ❤️
    </span>
  ));
  return (
    <div className="inline-flex items-center gap-1 px-5 py-2">
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
        "inline-flex items-center gap-2 text-[18px] font-semibold tabular-nums tracking-[0.3em]",
        urgent
          ? "text-rose-400 drop-shadow-[0_0_12px_rgba(248,113,113,0.9)] animate-pulse"
          : "text-slate-100",
      ].join(" ")}
    >
      <span className="text-[18px]">⏱</span>
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
  isReveal: boolean;       // phase === "reveal" && remainingSeconds === 0
  isPlaying: boolean;      // phase === "playing" && socketStatus === "connected"

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
  const textPlaceholder = textLocked
    ? "Choisissez une réponse..."
    : "Tapez votre réponse ici...";
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
      {/* panneau principal style hero samouraï */}
      <div className="relative">
        <div className="pointer-events-none absolute -inset-[2px] rounded-[46px] opacity-70 blur-xl" />
        <div
          className={[
            "relative w-full rounded-[40px] border border-slate-800/80",
            {/*"bg-[radial-gradient(circle_at_top,_rgba(15,23,42,0.95),rgba(15,23,42,0.99)),radial-gradient(circle_at_bottom,_rgba(127,29,29,0.9),#020617)]", */},
            "bg-[#0A1024]",
            "shadow-[0_0_5px_rgba(248,248,248,0.8)]",
            "sm:p-8 lg:p-8",
          ].join(" ")}
        >
          {/* bandeau supérieur : timer / info / vies */}
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
<div className="order-2 gap-4 font-medium text-slate-100 md:order-1">
  Question {index + 1}
  {typeof totalQuestions === "number" && totalQuestions > 0 && (
    <span className="text-slate-500"> / {totalQuestions}</span>
  )}
</div>

            <div className="order-1 flex justify-center md:order-2">
              {isReveal ? (
                <div className="text-[13px] font-semibold uppercase tracking-[0.3em] text-slate-300/80">
                  En attente...
                </div>
              ) : (
                <TimerBadge seconds={remainingSeconds} />
              )}
            </div>

            <div className="order-3 flex justify-end md:order-3">
              <Lives lives={lives} total={totalLives} />
            </div>
          </div>

          {/* barre de progression rouge */}
          <div className="mt-5 h-[3px] w-full rounded-full bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-cyan-400 via-sky-400 to-white transition-all"
              style={{ width: `${timerProgress * 100}%` }}
            />
          </div>

          {/* question + image */}
          <div className="mt-8 flex flex-col gap-6 md:min-h-[14rem] md:flex-row md:items-stretch">
            <div className={question.img ? "md:w-3/5" : "md:w-full"}>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <div className="inline-flex items-center gap-2 rounded-[12px] border border-slate-700/80 bg-black/70 px-4 py-2 text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-100">
                  <span
                    aria-hidden
                    className="inline-block h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: themeMeta.color }}
                  />
                  {themeMeta.label}
                </div>
                {question.slotLabel && (
                  <span className="rounded-full bg-slate-900/90 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-slate-200">
                    {question.slotLabel}
                  </span>
                )}
              </div>

              <p className="mt-5 text-[20px] font-semibold leading-snug text-slate-50 sm:text-[20px]">
                {question.text}
              </p>
            </div>
{question.img && (
  <div className="md:w-2/5">
    <div className="relative h-full">
      <img
        src={question.img}
        alt=""
        className="relative max-h-56 w-full rounded-[26px] object-cover shadow-[0_20px_50px_rgba(0,0,0,0.95)]"
        loading="lazy"
      />
    </div>
  </div>
)}
          </div>

          {/* zone saisie & boutons */}
          <div className="mt-8 flex flex-col gap-4 md:flex-row md:items-end">
            <div className="flex-1">
              <div className="mt-2 rounded-[12px] border border-slate-700/80 bg-black/70 px-3 py-1 shadow-inner shadow-black/80">
                <input
                  ref={inputRef}
                  value={textAnswer}
                  onChange={(e) => onChangeText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={textInputDisabled}
                  aria-disabled={textLocked}
                  className={[
                    "w-full border-none bg-transparent px-2 py-2 text-[15px] font-medium tracking-[0.02em] antialiased focus:outline-none focus:ring-0",
                    textInputColorClass,
                    textInputDisabled ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  placeholder={textPlaceholder}
                />
              </div>
            </div>

            <div className="flex gap-2 md:ml-3">
              {/* Bouton principal : Valider */}
              <button
                type="button"
                onClick={onSubmitText}
                disabled={textInputDisabled}
                className={[
                  "inline-flex items-center justify-center rounded-[12px] px-5 py-2.5",
                  "text-[11px] font-semibold uppercase tracking-[0.18em]",
                  "bg-[#421D9E] text-slate-50",
                  "transition duration-150 hover:brightness-110",
                  textInputDisabled ? "opacity-60" : "shadow-[0_0_5px_rgba(121,58,198,0.45)]",
                ].join(" ")}
              >
                <img src={enterKey} alt="Entrée" className="mr-2 h-5 w-5" />
                Valider
              </button>

              {/* Bouton secondaire : voir les choix */}
              <button
                type="button"
                onClick={onShowChoices}
                disabled={textInputDisabled}
className={[
  "inline-flex items-center justify-center rounded-[12px] px-4 py-2.5",
  "text-[11px] font-semibold uppercase tracking-[0.18em]",
  "bg-[#223F81] text-slate-50",
  "transition duration-150 hover:bg-slate-100",
  textInputDisabled
    ? "opacity-60"
    : "shadow-[0_2px_6px_rgba(34,63,129,0.45)]",
].join(" ")}
              >
                <img src={tabKey} alt="Tab" className="mr-2 h-5 w-5" />
                Propositions
              </button>
            </div>
          </div>

          {/* feedback + temps de réponse + bonne réponse */}
          {feedback && (
            <div className="mt-4 flex flex-col gap-3 md:flex-row md:items-stretch md:gap-4">
              {/* feedback */}
              <div className="inline-flex min-h-[42px] items-center gap-3 rounded-[12px] border border-slate-700/80 bg-black/80 px-6 py-2.5 text-sm text-slate-100 shadow-inner shadow-black/80">
                <span
                  className={[
                    "text-base",
                    feedback === "Temps écoulé !"
                      ? "text-amber-300"
                      : feedback.includes("Bravo")
                      ? "text-emerald-400"
                      : "text-rose-400",
                  ].join(" ")}
                >
                  {feedback === "Temps écoulé !"
                    ? "⏳"
                    : feedback.includes("Bravo")
                    ? "✅"
                    : "❌"}
                </span>
                <div>
                  <span className="font-medium">{feedback}</span>
                </div>
              </div>

              {/* bonne réponse (mode texte) */}
              {showCorrectLabelCell && (
                <div className="inline-flex min-h-[42px] items-center rounded-[12px] border border-emerald-600 bg-emerald-600 px-5 py-2.5 text-xs text-slate-50 shadow-[0_0_0px_rgba(52,211,153,0.75)]">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-emerald-100">
                      Bonne réponse
                    </span>
                    <span className="mt-1 font-medium text-[13px]">
                      {feedbackCorrectLabel}
                    </span>
                  </div>
                </div>
              )}

              {/* points gagnés */}
              {showFeedbackPoints && (
                <div className="inline-flex min-h-[42px] items-center rounded-[12px] border border-slate-700/80 bg-black/80 px-5 py-2.5 text-xs text-slate-100 shadow-inner shadow-black/80">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Points gagnés
                    </span>
                    <span className="mt-1 font-mono text-sm text-slate-50">
                      + {feedbackPoints.toLocaleString("fr-FR")} pts
                    </span>
                  </div>
                </div>
              )}

              {/* temps de réponse */}
              {showResponseTime && feedbackResponseMs !== null && (
                <div className="inline-flex min-h-[42px] items-center rounded-[12px] border border-slate-700/80 bg-black/80 px-5 py-2.5 text-xs text-slate-100 shadow-inner shadow-black/80">
                  <div className="flex flex-col leading-tight">
                    <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                      Temps de réponse
                    </span>
                    <span className="mt-1 font-mono text-sm text-slate-50">
                      {feedbackResponseMs.toLocaleString("fr-FR")} ms
                    </span>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* choix multiples */}
          {showChoices && choices && (
            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {choices.map((choice) => {
                const isSelected = selectedChoice === choice.id;
                const isCorrect = correctChoiceId === choice.id;
                const hoverClasses =
                  selectedChoice === null
                    ? "hover:border-white hover:bg-slate-900"
                    : "";

                return (
                  <button
                    key={choice.id}
                    type="button"
                    onClick={() => onSelectChoice(choice)}
                    disabled={!isPlaying && !isSelected}
                    className={[
                      "group relative overflow-hidden rounded-[12px] border px-4 py-3 text-left text-[15px] font-medium transition",
                      "backdrop-blur-xl",
                      isCorrect
                        ? "border-emerald-600 bg-emerald-600 text-slate-50 shadow-[0_0_0px_rgba(52,211,153,0.75)]"
                        : isSelected
                        ? "border-rose-700 bg-rose-700 text-slate-50 shadow-[0_0_0px_rgba(248,113,113,0.8)]"
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
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          {questionProgress.map((state, i) => {
            const base =
              "w-9 h-9 sm:w-10 sm:h-10 flex items-center justify-center rounded-md text-sm font-semibold";
            let colorClasses =
              "border-slate-700/90 bg-slate-700/60 text-slate-200"; // pending

            if (state === "correct") {
              colorClasses =
                "border-emerald-600 bg-emerald-600 text-slate-50 shadow-[0_0_0px_rgba(52,211,153,0.75)]";
            } else if (state === "wrong") {
              colorClasses =
                "border-rose-700 bg-rose-700 text-slate-50 shadow-[0_0_0px_rgba(248,113,113,0.8)]";
            }

            return (
              <div key={i} className={`${base} ${colorClasses}`}>
                {i + 1}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
