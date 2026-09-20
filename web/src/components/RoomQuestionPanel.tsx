import { useEffect, useMemo, useState, type CSSProperties, type FormEvent, type KeyboardEvent, type RefObject } from "react";
import { Clock3, Heart, ListChecks, Send, Zap } from "lucide-react";
import { getThemeMeta } from "../lib/themeMeta";

export type RoomQuestionChoice = {
  id: string;
  label: string;
};

type RoomQuestionPanelProps = {
  questionIndex: number;
  questionTotal: number;
  remainingSeconds: number;
  timerDurationMs: number;
  theme?: string | null;
  questionText: string;
  lives: number;
  totalLives: number;
  choices: RoomQuestionChoice[] | null;
  selectedChoiceId: string | null;
  correctChoiceId: string | null;
  isPlaying: boolean;
  isTimerRunning: boolean;
  inputRef: RefObject<HTMLInputElement | null>;
  textAnswer: string;
  textLocked: boolean;
  animateQuestionText: boolean;
  questionRevealStartedAtMs: number | null;
  qcmUsesLeft: number;
  onTextChange: (value: string) => void;
  onSubmitText: () => void;
  onShowChoices: () => void;
  onSelectChoice: (choiceId: string) => void;
  feedback: string | null;
  feedbackWasCorrect: boolean | null;
  feedbackCorrectLabel: string | null;
  feedbackPoints: number | null;
  feedbackResponseMs: number | null;
  wrongTextAnswers: Array<{ answer: string; result: "close" | "wrong" }>;
};

export default function RoomQuestionPanel({
  questionIndex,
  questionTotal,
  remainingSeconds,
  timerDurationMs,
  theme,
  questionText,
  lives,
  totalLives,
  choices,
  selectedChoiceId,
  correctChoiceId,
  isPlaying,
  isTimerRunning,
  inputRef,
  textAnswer,
  textLocked,
  animateQuestionText,
  questionRevealStartedAtMs,
  qcmUsesLeft,
  onTextChange,
  onSubmitText,
  onShowChoices,
  onSelectChoice,
  feedback,
  feedbackWasCorrect,
  feedbackCorrectLabel,
  feedbackPoints,
  feedbackResponseMs,
  wrongTextAnswers,
}: RoomQuestionPanelProps) {
  const revealStepMs = 35;
  const [visibleQuestionLength, setVisibleQuestionLength] = useState(() => animateQuestionText ? 0 : questionText.length);
  const [timerSyncRevision, setTimerSyncRevision] = useState(0);
  const canRetry = !choices && wrongTextAnswers.length > 0 && lives > 0 && feedbackWasCorrect === false;
  const qcmUnavailable = qcmUsesLeft <= 0;
  const timerAnimation = useMemo(() => {
    const duration = Math.max(0, timerDurationMs);
    const startedAt = questionRevealStartedAtMs ?? Date.now();
    const elapsed = Math.max(0, Date.now() - startedAt);
    const remaining = Math.max(0, duration - elapsed);
    const startProgress = duration > 0 ? Math.min(1, remaining / duration) : 0;
    return { remaining, startProgress };
  }, [questionIndex, questionRevealStartedAtMs, timerDurationMs, timerSyncRevision]);

  useEffect(() => {
    const synchronizeTimer = () => {
      if (document.visibilityState === "visible") {
        setTimerSyncRevision((revision) => revision + 1);
      }
    };
    window.addEventListener("focus", synchronizeTimer);
    document.addEventListener("visibilitychange", synchronizeTimer);
    return () => {
      window.removeEventListener("focus", synchronizeTimer);
      document.removeEventListener("visibilitychange", synchronizeTimer);
    };
  }, []);

  useEffect(() => {
    if (!animateQuestionText) {
      setVisibleQuestionLength(questionText.length);
      return;
    }

    const startedAt = questionRevealStartedAtMs ?? Date.now();
    const update = () => setVisibleQuestionLength(Math.min(questionText.length, Math.max(0, Math.floor((Date.now() - startedAt) / revealStepMs))));
    update();
    const interval = window.setInterval(update, revealStepMs);
    window.addEventListener("focus", update);
    document.addEventListener("visibilitychange", update);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", update);
      document.removeEventListener("visibilitychange", update);
    };
  }, [animateQuestionText, questionRevealStartedAtMs, questionText]);

  useEffect(() => {
    if (!choices || !isPlaying || selectedChoiceId) return;
    const selectChoiceFromKeyboard = (event: globalThis.KeyboardEvent) => {
      if (event.repeat || event.altKey || event.ctrlKey || event.metaKey) return;
      const choiceIndex = event.key.toLowerCase().charCodeAt(0) - 97;
      const choice = choices[choiceIndex];
      if (choiceIndex < 0 || choiceIndex > 3 || !choice) return;
      event.preventDefault();
      onSelectChoice(choice.id);
    };
    window.addEventListener("keydown", selectChoiceFromKeyboard);
    return () => window.removeEventListener("keydown", selectChoiceFromKeyboard);
  }, [choices, isPlaying, onSelectChoice, selectedChoiceId]);

  const submitText = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSubmitText();
  };
  const handleTextKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      event.preventDefault();
      if (isPlaying && !textLocked && textAnswer.trim()) onSubmitText();
    } else if (event.key === "Tab") {
      event.preventDefault();
      if (isPlaying && !textLocked && !qcmUnavailable) onShowChoices();
    }
  };

  return (
    <div className="annex-question-stage">
      <div className="annex-round-overview">
        <div><span>QUESTION</span><strong>{String(questionIndex + 1).padStart(2, "0")}<small>/ {String(questionTotal).padStart(2, "0")}</small></strong></div>
        <div><span>TEMPS RESTANT</span><strong>{remainingSeconds} s</strong></div>
      </div>
      <div className="annex-time-progress"><i
        key={`${questionIndex}-${questionRevealStartedAtMs ?? "pending"}-${timerSyncRevision}`}
        className={isTimerRunning ? "is-running" : ""}
        style={isTimerRunning ? {
          "--timer-start": timerAnimation.startProgress,
          animationDuration: `${timerAnimation.remaining}ms`,
        } as CSSProperties : { transform: "scaleX(0)" }}
      /></div>
      <article className="annex-question-card">
        <p>{theme ? getThemeMeta(theme).label : ""}</p>
        <h1 aria-label={questionText}>{questionText.slice(0, visibleQuestionLength)}</h1>
        <span>{String(questionIndex + 1).padStart(2, "0")}</span>
      </article>
      <div className="annex-answer-area">
        {!choices && <div className="annex-answer-head">
          <div className="annex-lives" aria-label={`${lives} vies restantes`}>
            <span className="annex-lives-icons">{Array.from({ length: totalLives }, (_, life) => <Heart key={life} size={15} fill={life < lives ? "currentColor" : "none"} className={life < lives ? "active" : "lost"} />)}</span>
          </div>
          {feedbackWasCorrect && (feedbackResponseMs !== null || feedbackPoints !== null) && <div className="annex-answer-meta">
            {feedbackResponseMs !== null && <span><Clock3 size={17} /><small>TEMPS</small><strong>{(Math.max(0, feedbackResponseMs) / 1000).toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</strong></span>}
            {feedbackPoints !== null && <span><Zap size={17} /><small>SCORE</small><strong>+{feedbackPoints} pts</strong></span>}
          </div>}
        </div>}
        {choices ? (
          <div className="annex-qcm">{choices.map((choice, choiceIndex) => {
            const isCorrect = correctChoiceId === choice.id;
            const isSelected = selectedChoiceId === choice.id;
            const isResolved = Boolean(selectedChoiceId || correctChoiceId);
            const stateClass = isCorrect ? "is-correct" : isSelected ? "is-wrong" : isResolved ? "is-muted" : "";
            const shortcut = String.fromCharCode(65 + choiceIndex);
            return <button className={stateClass} type="button" key={choice.id} aria-keyshortcuts={shortcut} onClick={() => onSelectChoice(choice.id)} disabled={!isPlaying || isResolved}><span>{shortcut}</span>{choice.label}</button>;
          })}</div>
        ) : (
          <form onSubmit={submitText}>
            <input ref={inputRef} value={textAnswer} onChange={(event) => onTextChange(event.target.value)} onKeyDown={handleTextKeyDown} disabled={!isPlaying || textLocked} placeholder="Écrivez votre réponse…" spellCheck={false} autoCorrect="off" autoCapitalize="off" />
            <button className="annex-qcm-toggle" type="button" onClick={onShowChoices} disabled={!isPlaying || textLocked || qcmUnavailable}><ListChecks size={15} /> QCM<span className="annex-qcm-count">{qcmUsesLeft}</span></button>
            <button type="submit" disabled={!isPlaying || !textAnswer.trim()}><Send size={17} /></button>
          </form>
        )}
        {feedback && !choices ? (
          <div className={`annex-feedback ${feedbackWasCorrect ? "correct" : "wrong"}`}>
            <span className="annex-feedback-icon" aria-hidden="true">{feedbackWasCorrect ? "✓" : "✕"}</span>
            <strong>{feedbackCorrectLabel || textAnswer || "Temps écoulé"}</strong>
          </div>
        ) : canRetry ? (
          <div className="annex-failed-attempts">{wrongTextAnswers.map(({ answer, result }, answerIndex) => <span className={result} title={answer} key={`${answer}-${answerIndex}`}>{answer}</span>)}</div>
        ) : choices ? null : (
          <div className="annex-keyboard-hint"><span><kbd>ENTRÉE</kbd> pour valider</span><span><kbd>TAB</kbd> pour le QCM</span></div>
        )}
      </div>
    </div>
  );
}