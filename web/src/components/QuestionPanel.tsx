// web/src/components/QuestionPanel.tsx
import { RefObject, KeyboardEvent, useRef } from "react";
import { ThumbsUp, ThumbsDown } from "lucide-react";

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
    <div className="flex items-center justify-start gap-0.5">
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
 *
 * ✅ Segmentation FIXE :
 * - Le nombre total de segments = nombre total de secondes du timer
 * - Ce total est "gelé" au départ d'une question (ne varie plus pendant le compte à rebours)
 * - Les segments allumés = secondes restantes (1 segment = 1 seconde)
 */
export function OverwatchTimerBadge({
  seconds,
  progress,
}: {
  seconds: number | null;
  progress: number;
}) {
  const s = Math.max(0, Math.floor(seconds ?? 0));
  const warning = s <= 3;

  const size = 92;
  const cx = size / 2;
  const cy = size / 2;

  const totalSecondsRef = useRef<number | null>(null);

  if (seconds !== null) {
    const cur = Math.max(0, Math.floor(seconds));
    const prev = totalSecondsRef.current;
    if (prev === null) {
      totalSecondsRef.current = Math.max(1, cur);
    } else {
      const p = Math.max(0, Math.min(1, progress));
      if (cur > prev || p >= 0.98) {
        totalSecondsRef.current = Math.max(1, cur);
      }
    }
  }

  const totalSeconds = Math.max(1, totalSecondsRef.current ?? 60);
  const tickCount = totalSeconds;
  const litTicks = Math.max(0, Math.min(tickCount, s));

  const rArc = 28;
  const circ = 2 * Math.PI * rArc;

  const gapRatio = 0.14;
  const segLen = circ / tickCount;
  const dashLen = segLen * (1 - gapRatio);
  const gapLen = segLen - dashLen;

  const dasharrayBg = Array.from({ length: tickCount })
    .flatMap(() => [dashLen, gapLen])
    .join(" ");

  const dasharrayFg = Array.from({ length: tickCount })
    .flatMap((_, i) => {
      const isLit = i < litTicks;
      return isLit ? [dashLen, gapLen] : [0, segLen];
    })
    .join(" ");

  const violet = "#3E4566";

  return (
    <div aria-live="polite" className="flex items-center justify-center">
      <div className="relative">
        <svg
          width={size}
          height={size}
          className="drop-shadow-[0_10px_18px_rgba(0,0,0,0.55)]"
        >
          <circle cx={cx} cy={cy} r={34} className="fill-[#141827]" />

          <g transform={`rotate(-90 ${cx} ${cy})`}>
            <circle
              cx={cx}
              cy={cy}
              r={rArc}
              className="fill-none"
              stroke="#64748B"
              opacity={0.18}
              strokeWidth={5}
              strokeLinecap="butt"
              strokeDasharray={dasharrayBg}
            />

            <circle
              cx={cx}
              cy={cy}
              r={rArc}
              fill="none"
              stroke={warning ? "#FCD34D" : violet}
              opacity={0.8}
              strokeWidth={5}
              strokeLinecap="butt"
              strokeDasharray={dasharrayFg}
            />
          </g>
        </svg>

        <div className="absolute inset-0 flex items-center justify-center">
          <span className="font-semibold tabular-nums text-[22px] leading-none text-white">
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
  wrongTextAnswer?: string | null;
};

export default function DailyQuestionPanel(props: Props) {
  const {
    question,
    lives,
    totalLives,
    playerScore = 0, // (gardé pour compat, mais plus affiché ici)
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
    // ✅ on ne les affiche plus, mais on garde les props pour compat
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
    wrongTextAnswer = null,
  } = props;

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
    "relative z-10 h-full w-full rounded-[14px] border border-slate-700/70 bg-[#1C1F2E] px-3 py-1 md:px-5 md:py-2";

  const bottomPanelClass =
    "relative w-full bg-[#1C1F2E] rounded-[9px] p-3 md:p-4";

  const topPanelStyle = { boxShadow: "none" as const };

  const bottomPanelStyle = {
    boxShadow: "4px 8px 8px rgba(0,0,0,0.6)" as const,
  };

  const isQcmMode = showChoices && !!choices;

  // ✅ meta correct (texte uniquement)
  const showCorrectMeta = feedbackWasCorrect === true;
  const pointsText =
    showCorrectMeta && typeof feedbackPoints === "number"
      ? `+${Math.max(0, feedbackPoints)} pts`
      : null;
  const timeText =
    showCorrectMeta && typeof feedbackResponseMs === "number"
      ? `${Math.max(0, feedbackResponseMs)} ms`
      : null;

  const showLeft = showCorrectMeta && !!pointsText;
  const showRight = showCorrectMeta && !!timeText;

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col items-center">
      {/* TIMER */}
      <div className="w-[700px] max-w-full">
        <div className="relative flex justify-center">
          <OverwatchTimerBadge
            seconds={isReveal ? 0 : remainingSeconds}
            progress={isReveal ? 0 : timerProgress}
          />
        </div>
      </div>

      {/* PANNEAU SUPÉRIEUR */}
      <div className="relative mt-14 w-[430px] max-w-full aspect-[2.24/1]">
        {/* NOM DU THÈME */}
        {question.theme && (
          <div className="absolute -top-7 left-1/2 -translate-x-1/2 text-center">
            <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-white/70">
              {question.theme}
            </div>
          </div>
        )}

        {/* BOUTONS THUMB UP / DOWN */}
        <div className="absolute top-3 -right-12 flex flex-col gap-2 z-20">
          <button className="group p-2 transition">
            <ThumbsUp
              size={18}
              className="stroke-white/50 fill-none group-hover:stroke-white group-hover:fill-white transition"
            />
          </button>

          <button className="group p-2 transition">
            <ThumbsDown
              size={18}
              className="stroke-white/50 fill-none group-hover:stroke-white group-hover:fill-white transition"
            />
          </button>
        </div>

        <div
          className="pointer-events-none absolute inset-0 translate-y-2 rounded-[14px]"
          style={{ backgroundColor: "#6F5BD4" }}
        />
        <div className={topPanelClass} style={topPanelStyle}>
          <div className="flex h-full items-center justify-center">
            <p className="mx-auto max-h-[8.4em] max-w-[86%] overflow-hidden text-center text-[13px] font-semibold leading-snug text-slate-50 md:text-[16px]">
              {question.text}
            </p>
          </div>
        </div>
      </div>

      {/* ✅ MODE QCM : uniquement les cellules (moins longues + texte centré) */}
      {isQcmMode ? (
        <div className="mt-20 w-[640px] max-w-full flex justify-center">
          <div className="grid gap-3 md:grid-cols-2 w-full max-w-[520px]">
            {choices!.map((choice) => {
              const isSelected = selectedChoice === choice.id;
              const isCorrect = correctChoiceId === choice.id;

              return (
                <button
                  key={choice.id}
                  onClick={() => onSelectChoice(choice)}
                  className={[
                    "rounded-[10px] border px-4 py-3 text-center text-[12px] font-semibold transition",
                    isCorrect
                      ? "border-emerald-600 bg-emerald-600 text-slate-50"
                      : isSelected
                      ? "border-[#AF2D33] bg-[#AF2D33] text-slate-50"
                      : "border-slate-700/70 bg-[#1C1F2E] text-slate-50 hover:bg-[#23263A]",
                  ].join(" ")}
                >
                  {choice.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
        /* MODE TEXTE : panneau inférieur original (boutons intégrés) */
        <div className="mt-20 w-[580px] max-w-full">
          {/* ✅ Coeurs AU-DESSUS du panneau, horizontaux, alignés à gauche */}
          <div className="mx-auto w-full mb-3 -mt-1 pl-2 flex items-center justify-between gap-3">
            <Lives lives={lives} total={totalLives} />
            {wrongTextAnswer ? (
              <div className="max-w-[58%] inline-flex items-center rounded-[6px] border border-red-500/70 bg-red-500/20 px-3 py-1 text-[11px] font-medium text-red-100">
                <span className="truncate" title={wrongTextAnswer}>
                  {wrongTextAnswer}
                </span>
              </div>
            ) : null}
          </div>

          {/* Panneau de saisie */}
          <div className="relative mx-auto w-full">
            <div className={bottomPanelClass} style={bottomPanelStyle}>
              <div className="flex items-center gap-3">
                <div className="flex-1 rounded-[9px] border border-slate-700/80 bg-black/70 px-2 py-0.5 shadow-inner shadow-black/80">
                  <input
                    ref={inputRef}
                    value={textAnswer}
                    onChange={(e) => onChangeText(e.target.value)}
                    onKeyDown={handleKeyDown}
                    disabled={textInputDisabled}
                    spellCheck={false}
                    autoCorrect="off"
                    autoCapitalize="off"
                    autoComplete="off"
                    className={[
                      "w-full bg-transparent px-2 py-2 text-[12px] font-medium focus:outline-none",
                      textInputColorClass,
                      textInputDisabled ? "opacity-60 cursor-not-allowed" : "",
                    ].join(" ")}
                    placeholder={textPlaceholder}
                  />
                </div>

                <div className="flex gap-3">
                  <button
                    onClick={onSubmitText}
                    disabled={textInputDisabled}
                    className="rounded-[6px] bg-[#6F5BD4] px-4 py-2 text-[10px] font-semibold tracking-[0.12em] text-slate-50 hover:brightness-110 disabled:opacity-60"
                  >
                    Valider
                  </button>

                  <button
                    onClick={onShowChoices}
                    disabled={textInputDisabled}
                    className="
                      rounded-[6px]
                      border border-slate-600/60
                      bg-[#1A1D28]
                      px-4 py-2
                      text-[10px]
                      font-semibold tracking-[0.12em]
                      text-white/85
                      hover:text-white
                      hover:border-slate-500
                      hover:bg-[#23263A]
                      transition
                      disabled:opacity-60
                    "
                  >
                    Propositions
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* ✅ points | bonne réponse | temps */}
          {showCorrectLabelCell && (
            <div className="mt-4 flex justify-center">
              <div className="inline-flex max-w-full items-center gap-3">
                {showLeft ? (
                  <span className="text-[12px] font-semibold tabular-nums text-white/70">
                    {pointsText}
                  </span>
                ) : null}

                {showLeft ? (
                  <span className="text-white/35" aria-hidden>
                    |
                  </span>
                ) : null}

                <div className="inline-flex items-center rounded-[6px] border border-emerald-600 bg-emerald-600 px-3 py-1.5 text-[13px] font-semibold text-slate-50">
                  {feedbackCorrectLabel}
                </div>

                {showRight ? (
                  <span className="text-white/35" aria-hidden>
                    |
                  </span>
                ) : null}

                {showRight ? (
                  <span className="text-[13px] font-semibold tabular-nums text-white/70">
                    {timeText}
                  </span>
                ) : null}
              </div>
            </div>
          )}

          {/* ✅ Ligne de feedback du dessous supprimée (devenue inutile) */}
          {reserveFeedbackSpace ? <div className="mt-2" /> : null}
        </div>
      )}

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
