// web/src/components/QuestionPanel.tsx
import { RefObject, KeyboardEvent } from "react";

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
  const empty = Array.from({ length: Math.max(0, total - lives) }).map(
    (_, i) => (
      <span
        key={`e${i}`}
        className="text-[14px] leading-none opacity-25 whitespace-nowrap"
      >
        ❤️
      </span>
    )
  );

  return (
    <div className="inline-flex items-center whitespace-nowrap gap-1 px-4 py-1.5">
      {full}
      {empty}
    </div>
  );
}

/**
 * Timer Overwatch :
 * - Violet custom (#6F5BD4) normalement
 * - Jaune sous 3 secondes
 * - Composants désaturés (ticks + arc)
 * - Texte blanc en normal, jaune en warning
 * - Reveal => timer affiché à 0
 */
function OverwatchTimerBadge({
  seconds,
  progress,
}: {
  seconds: number | null;
  progress: number;
}) {
  const s = Math.max(0, seconds ?? 0);
  const warning = s <= 3;

  const size = 92;
  const cx = size / 2;
  const cy = size / 2;

  const tickCount = 60;
  const rOuter = 40;
  const tickLen = 7;
  const tickWidth = 2;

  const clamped = Math.max(0, Math.min(1, progress));
  const litTicks = Math.round(clamped * tickCount);

  const rArc = 28;
  const circ = 2 * Math.PI * rArc;
  const dash = circ * clamped;
  const gap = circ - dash;

  // 🎨 Couleur exacte demandée
  const violet = "#3E4566";

  // Texte
  const textColor = warning ? "text-amber-300" : "text-white";

  return (
    <div aria-live="polite" className="flex items-center justify-center">
      <div className="relative">
        <svg
          width={size}
          height={size}
          className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
        >
          {/* fond central */}
          <circle cx={cx} cy={cy} r={34} className="fill-[#141827]" />

          {/* arc intérieur */}
          <g transform={`rotate(-90 ${cx} ${cy})`}>
            {/* arc gris de fond */}
            <circle
              cx={cx}
              cy={cy}
              r={rArc}
              className="fill-none stroke-slate-600/25"
              strokeWidth={5}
            />

            {/* arc actif */}
            <circle
              cx={cx}
              cy={cy}
              r={rArc}
              stroke={warning ? "#FCD34D" : violet}
              opacity={0.7}
              fill="none"
              strokeWidth={5}
              strokeLinecap="round"
              strokeDasharray={`${dash} ${gap}`}
            />
          </g>

          {/* ticks autour */}
          <g>
            {Array.from({ length: tickCount }).map((_, i) => {
              const a = (i / tickCount) * Math.PI * 2 - Math.PI / 2;

              const x1 = cx + Math.cos(a) * (rOuter - tickLen);
              const y1 = cy + Math.sin(a) * (rOuter - tickLen);
              const x2 = cx + Math.cos(a) * rOuter;
              const y2 = cy + Math.sin(a) * rOuter;

              const isLit = i < litTicks;

              return (
                <line
                  key={i}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  stroke={isLit ? (warning ? "#FCD34D" : violet) : "#64748B"}
                  opacity={isLit ? 0.7 : 0.15}
                  strokeWidth={tickWidth}
                  strokeLinecap="round"
                />
              );
            })}
          </g>
        </svg>

        {/* secondes au centre */}
        <div className="absolute inset-0 flex items-center justify-center">
          <span
            className={[
              "font-semibold tabular-nums text-[22px] leading-none",
              textColor,
              warning ? "animate-pulse" : "",
            ].join(" ")}
          >
            {s}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ------------------- RESTE DU FICHIER STRICTEMENT ORIGINAL ------------------- */

type Props = {
  question: QuestionLite;
  index: number;
  totalQuestions: number | null;
  lives: number;
  totalLives: number;
  playerScore?: number;
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
  reserveFeedbackSpace?: boolean;
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
    lives,
    totalLives,
    playerScore = 0,
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
    reserveFeedbackSpace = false,
    answerMode,
    choicesRevealed,
    showChoices,
    choices,
    selectedChoice,
    correctChoiceId,
    onSelectChoice,
    questionProgress,
  } = props;

  const showResponseTime =
    feedbackWasCorrect === true && feedbackResponseMs !== null;
  const showFeedbackPoints = typeof feedbackPoints === "number";
  const showCorrectLabelCell =
    !!feedbackCorrectLabel &&
    (answerMode === "text" ||
      (answerMode === null &&
        feedback === "Temps écoulé !" &&
        !choicesRevealed));

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
    "relative z-10 h-full w-full rounded-[14px] border border-slate-700/70 bg-[#1C1F2E] px-3 py-3 md:px-5 md:py-4";
  const bottomPanelClass =
    "relative w-full bg-[#1C1F2E] rounded-[9px] p-3 md:p-4";
  const topPanelStyle = { boxShadow: "none" as const };
  const bottomPanelStyle = {
    boxShadow: "4px 8px 8px rgba(0,0,0,0.6)" as const,
  };

  const showAnyFeedbackRow =
    !!feedback || showCorrectLabelCell || showFeedbackPoints || showResponseTime;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center">
      {/* TIMER */}
      <div className="w-[700px] max-w-full">
        <div className="relative flex justify-center">
          <div
            className="pointer-events-none absolute top-1/2 h-[72px] w-[152px] drop-shadow-[0_8px_14px_rgba(0,0,0,0.4)]"
            style={{
              left: "50%",
              transform: "translate(calc(-100% - 56px), -50%)",
            }}
            aria-label="Score du joueur"
          >
            <svg
              viewBox="0 0 152 72"
              className="h-full w-full"
              aria-hidden="true"
              focusable="false"
            >
              {/* ✅ Concave + rayon plus grand (R=48) + aucune “pointe” :
                  On trace la bordure en UN SEUL path, avec l’arc sur la droite
                  qui “rentre” (bulge vers la gauche) grâce au sweep=0. */}
              <path
                d="
                  M14 0
                  H152
                  A48 48 0 0 0 152 72
                  H14
                  A14 14 0 0 1 0 58
                  V14
                  A14 14 0 0 1 14 0
                  Z
                "
                fill="#1C1F2E"
                stroke="#334155"
                strokeOpacity="0.6"
                strokeLinejoin="round"
              />
            </svg>

            <div className="absolute inset-0 flex items-center px-4">
              <div className="leading-tight">
                <div className="text-[9px] font-semibold uppercase tracking-[0.22em] text-white/55">
                  Score
                </div>
                <div className="mt-1 tabular-nums text-[22px] font-extrabold text-white">
                  {playerScore}
                  <span className="ml-1 align-middle text-[10px] font-semibold text-white/60">
                    pts
                  </span>
                </div>
              </div>
            </div>
          </div>

          <OverwatchTimerBadge
            seconds={isReveal ? 0 : remainingSeconds}
            progress={isReveal ? 0 : timerProgress}
          />
        </div>
      </div>

      {/* PANNEAU SUPÉRIEUR */}
      <div className="relative mt-14 w-[430px] max-w-full aspect-[2.24/1]">
        <div
          className="pointer-events-none absolute inset-0 translate-y-2 rounded-[14px]"
          style={{ backgroundColor: "#6F5BD4" }}
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
      <div className="mt-20 w-[700px] max-w-full">
        <div className="mb-3 flex justify-center">
          <Lives lives={lives} total={totalLives} />
        </div>

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
                className="rounded-[6px] bg-[#6F5BD4] px-4 py-2 text-[8px] font-semibold uppercase tracking-[0.18em] text-slate-50 hover:brightness-110 disabled:opacity-60"
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
        {(showAnyFeedbackRow || reserveFeedbackSpace) && (
          <div
            className={[
              "mt-2 flex flex-wrap items-start justify-start gap-2",
              reserveFeedbackSpace ? "min-h-[38px]" : "",
            ].join(" ")}
          >
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
                  {feedback === "Temps écoulé !"
                    ? "⏳"
                    : feedback.includes("Bravo")
                    ? "✅"
                    : "❌"}
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
