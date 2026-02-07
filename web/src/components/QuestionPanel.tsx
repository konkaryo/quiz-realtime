// web/src/components/QuestionPanel.tsx
import { RefObject, KeyboardEvent } from "react";
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
  const display = `${String(minutes).padStart(2, "0")}:${String(secs).padStart(
    2,
    "0",
  )}`;
  const urgent = total <= 5;

  return (
    <div
      aria-live="polite"
      className={[
        "inline-flex items-center font-semibold tabular-nums whitespace-nowrap",
        "gap-2 text-[14px]",
        "tracking-[0.30em]",
        urgent ? "text-rose-400 animate-pulse" : "text-slate-100",
      ].join(" ")}
    >
      <span className="text-[14px]">⏱</span>
      <span>{display}</span>
    </div>
  );
}

type Props = {
  question: QuestionLite;
  index: number;
  totalQuestions: number | null;
  lives: number;
  totalLives: number;

  remainingSeconds: number | null;
  timerProgress: number;
  isReveal: boolean;
  isPlaying: boolean;

  inputRef: RefObject<HTMLInputElement | null>;
  textAnswer: string;
  textLocked: boolean;
  onChangeText: (val: string) => void;
  onSubmitText: () => void;
  onShowChoices: () => void;

  feedback: string | null;
  feedbackResponseMs: number | null;
  feedbackWasCorrect: boolean | null;
  feedbackCorrectLabel: string | null;
  feedbackPoints?: number | null;
  answerMode: "text" | "choice" | null;
  choicesRevealed: boolean;

  showChoices: boolean;
  choices: Choice[] | null;
  selectedChoice: string | null;
  correctChoiceId: string | null;
  onSelectChoice: (choice: Choice) => void;

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

  const topPanelClass =
    "relative z-10 h-full w-full rounded-[14px] border border-slate-700/70 bg-[#1C1F2E] px-5 py-5 md:px-8 md:py-6";
  const bottomPanelClass = "relative w-full bg-[#1C1F2E] rounded-[9px] p-3 md:p-4";
  const topPanelStyle = { boxShadow: "none" as const };
  const bottomPanelStyle = { boxShadow: "4px 8px 8px rgba(0,0,0,0.6)" as const };

  const showAnyFeedbackRow =
    !!feedback || showCorrectLabelCell || showFeedbackPoints || showResponseTime;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center">
      <div className="mb-3 w-[700px] max-w-full space-y-3">
        <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="font-medium text-[14px] whitespace-nowrap text-slate-100">
            Question {index + 1}
            {typeof totalQuestions === "number" && totalQuestions > 0 && (
              <span className="text-slate-500"> / {totalQuestions}</span>
            )}
          </div>

          <div className="flex justify-center md:order-3 md:justify-end">
            <Lives lives={lives} total={totalLives} />
          </div>

          <div className="flex justify-start md:order-2 md:justify-center"> 
            {isReveal ? (
              <div className="text-[10px] font-semibold uppercase tracking-[0.30em] text-slate-300/80">
                En attente...
              </div>
            ) : (
              <TimerBadge seconds={remainingSeconds} />
            )}
          </div>

        </div>

        <div className="h-[2px] w-full rounded-full bg-[#13141F]">
          <div
            className="h-full rounded-full transition-all"
            style={{
              width: `${timerProgress * 100}%`,
              backgroundColor: "#7279DA",
            }}
          />
        </div>
      </div>

      {/* PANNEAU SUPÉRIEUR */}
      <div className="relative w-[460px] max-w-full aspect-[2.24/1]">
        <div
          className="pointer-events-none absolute inset-0 translate-y-2.5 rounded-[14px]"
          style={{ backgroundColor: themeMeta.color }}
          aria-hidden="true"
        />
        <div className={topPanelClass} style={topPanelStyle}>
          <div className="flex h-full items-center justify-center">
            <p className="mx-auto max-h-[4.2em] max-w-[86%] overflow-hidden text-center text-[14px] font-semibold leading-snug text-slate-50 md:text-[17px]">
              {question.text}
            </p>
          </div>
        </div>
      </div>

      {/* PANNEAU INFÉRIEUR – saisie + boutons */}
      <div className="mt-10 w-[700px] max-w-full">
        <div className={bottomPanelClass} style={bottomPanelStyle}>
          <div className="flex flex-col md:flex-row md:items-center gap-3">
            <div className="flex-1">
              <div className="rounded-[9px] border border-slate-700/80 bg-black/70 px-2 py-0.5 shadow-inner shadow-black/80">
                <input
                  ref={inputRef}
                  value={textAnswer}
                  onChange={(e) => onChangeText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  disabled={textInputDisabled}
                  className={[
                    "w-full bg-transparent px-2 py-2 text-[11px] font-medium focus:outline-none",
                    textInputColorClass,
                    textInputDisabled ? "opacity-60 cursor-not-allowed" : "",
                  ].join(" ")}
                  placeholder={textPlaceholder}
                />
              </div>
            </div>

            <div className="flex gap-3 whitespace-nowrap">
              <button
                onClick={onSubmitText}
                disabled={textInputDisabled}
                className="rounded-[6px] bg-[#2D7CFF] px-4 py-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-50 hover:brightness-110 disabled:opacity-60"
              >
                Valider
              </button>

              <button
                onClick={onShowChoices}
                disabled={textInputDisabled}
                className="rounded-[6px] bg-[#15171E] px-3.5 py-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-50 hover:brightness-110 disabled:opacity-60"
              >
                Propositions
              </button>
            </div>
          </div>
        </div>

        {/* FEEDBACKS SUR UNE LIGNE, ALIGNÉS À GAUCHE */}
        {showAnyFeedbackRow && (
          <div className="mt-2 flex flex-wrap items-start justify-start gap-2">
            {feedback && (
              <div className="inline-flex items-center gap-2 rounded-[9px] border border-slate-700/80 bg-black/80 px-3 py-1.5 text-[11px] text-slate-100 shadow-inner shadow-black/80">
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
                <span className="font-medium">{feedback}</span>
              </div>
            )}

            {showCorrectLabelCell && (
              <div className="inline-flex items-center rounded-[9px] bg-emerald-600 px-3 py-1.5 text-slate-50">
                <div className="flex flex-col leading-tight">
                  <span className="text-[8px] font-semibold uppercase tracking-[0.22em] text-emerald-100 whitespace-nowrap">
                    Bonne réponse
                  </span>
                  <span className="mt-1 text-[10px] font-medium whitespace-nowrap">
                    {feedbackCorrectLabel}
                  </span>
                </div>
              </div>
            )}

            {showFeedbackPoints && (
              <div className="inline-flex items-center rounded-[9px] border border-slate-700/80 bg-black/80 px-3 py-1.5 text-[10px] text-slate-100 shadow-inner shadow-black/80">
                <div className="flex flex-col leading-tight">
                  <span className="text-[8px] font-semibold uppercase tracking-[0.22em] text-slate-400 whitespace-nowrap">
                    Points gagnés
                  </span>
                  <span className="mt-1 font-mono text-[11px] text-slate-50 whitespace-nowrap">
                    + {feedbackPoints.toLocaleString("fr-FR")} pts
                  </span>
                </div>
              </div>
            )}

            {showResponseTime && feedbackResponseMs !== null && (
              <div className="inline-flex items-center rounded-[9px] border border-slate-700/80 bg-black/80 px-3 py-1.5 text-[10px] text-slate-100 shadow-inner shadow-black/80">
                <div className="flex flex-col leading-tight">
                  <span className="text-[8px] font-semibold uppercase tracking-[0.22em] text-slate-400 whitespace-nowrap">
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

        {/* QCM */}
        {showChoices && choices && (
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {choices.map((choice) => {
              const isSelected = selectedChoice === choice.id;
              const isCorrect = correctChoiceId === choice.id;

              return (
                <button
                  key={choice.id}
                  onClick={() => onSelectChoice(choice)}
                  disabled={!isPlaying && !isSelected}
                  className={[
                    "rounded-[9px] border px-3 py-2 text-left text-[11px] font-medium transition",
                    isCorrect
                      ? "border-emerald-600 bg-emerald-600 text-slate-50"
                      : isSelected
                      ? "border-red-500 bg-red-500 text-slate-50"
                      : "border-slate-700/90 bg-black/75 text-slate-50 hover:bg-slate-900",
                  ].join(" ")}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* progression des questions */}
      {questionProgress.length > 0 && (
        <div className="mt-4 flex flex-wrap justify-center gap-1.5">
          {questionProgress.map((state, i) => {
            const color =
              state === "correct"
                ? "bg-emerald-600"
                : state === "wrong"
                ? "bg-red-500"
                : "bg-slate-700/60";

            return (
              <div
                key={i}
                className={`flex h-[27px] w-[27px] items-center justify-center rounded-md text-[11px] font-semibold text-slate-50 ${color}`}
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
