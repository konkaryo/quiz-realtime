import { useEffect, useMemo, useState } from "react";
import { Check, ChevronDown, Clock3, Eye, ImageIcon, ListChecks, LoaderCircle, RotateCcw, Sparkles } from "lucide-react";
import { getThemeMeta } from "../lib/themeMeta";
import "./GeneratorPage.css";

const API_BASE = import.meta.env.VITE_API_BASE ?? window.location.origin;

const THEME_OPTIONS = [
  { value: "CULTURE_CLASSIQUE", label: "Culture classique" },
  { value: "CULTURE_GENERALE", label: "Culture générale" },
  { value: "CULTURE_MODERNE", label: "Culture moderne" },
  { value: "GEOGRAPHIE", label: "Géographie" },
  { value: "HISTOIRE", label: "Histoire" },
  { value: "MUSIQUE", label: "Musique" },
  { value: "NATURE", label: "Nature" },
  { value: "SCIENCE", label: "Science" },
  { value: "SPORT", label: "Sport" },
  { value: "TRADITION", label: "Tradition" },
] as const;

const DIFFICULTY_OPTIONS = [
  { value: "1", label: "Facile" },
  { value: "2", label: "Modérée" },
  { value: "3", label: "Difficile" },
  { value: "4", label: "Extrême" },
] as const;

const DURATION_OPTIONS = [10, 15, 20, 30, 45, 60] as const;

type GeneratorQuestion = {
  id: string;
  text: string;
  theme: string | null;
  difficulty: string | null;
  img: string | null;
  choices: Array<{ id: string; label: string }>;
  correctChoiceId: string | null;
  correctAnswer: string;
};

function SelectField({
  id,
  label,
  value,
  onChange,
  children,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: React.ReactNode;
}) {
  return (
    <label className="generator-field" htmlFor={id}>
      <span>{label}</span>
      <div className="generator-select-wrap">
        <select id={id} value={value} onChange={(event) => onChange(event.target.value)}>
          {children}
        </select>
        <ChevronDown size={17} aria-hidden="true" />
      </div>
    </label>
  );
}

export default function GeneratorPage() {
  const [theme, setTheme] = useState<string>(THEME_OPTIONS[0].value);
  const [difficulty, setDifficulty] = useState("2");
  const [duration, setDuration] = useState("20");
  const [question, setQuestion] = useState<GeneratorQuestion | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showAnswer, setShowAnswer] = useState(false);
  const [showQcm, setShowQcm] = useState(false);
  const [remainingSeconds, setRemainingSeconds] = useState(Number(duration));

  useEffect(() => {
    if (!question || remainingSeconds <= 0) return;
    const timer = window.setInterval(() => {
      setRemainingSeconds((current) => Math.max(0, current - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [question, remainingSeconds]);

  const durationSeconds = Number(duration);
  const timerProgress = useMemo(
    () => Math.max(0, Math.min(1, remainingSeconds / Math.max(1, durationSeconds))),
    [durationSeconds, remainingSeconds],
  );

  const generateQuestion = async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ theme, difficulty });
      const response = await fetch(`${API_BASE}/questions/random?${params}`, { credentials: "include" });
      const data = await response.json().catch(() => null) as { question?: GeneratorQuestion; error?: string } | null;
      if (!response.ok || !data?.question) {
        throw new Error(response.status === 404 ? "Aucune question ne correspond à ces critères." : "Impossible de générer la question.");
      }
      setQuestion(data.question);
      setShowAnswer(false);
      setShowQcm(false);
      setRemainingSeconds(durationSeconds);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Impossible de générer la question.");
    } finally {
      setLoading(false);
    }
  };

  const resetGenerator = () => {
    setQuestion(null);
    setShowAnswer(false);
    setShowQcm(false);
    setError(null);
    setRemainingSeconds(Number(duration));
  };

  if (!question) {
    return (
      <div className="generator-page">
        <section className="generator-setup" aria-labelledby="generator-title">
          <div className="generator-kicker"><Sparkles size={15} /> Mode libre</div>
          <h1 id="generator-title">Générateur</h1>
          <p>Composez votre question, puis révélez la réponse à votre rythme.</p>

          <div className="generator-form">
            <SelectField id="generator-theme" label="Thème de la question" value={theme} onChange={setTheme}>
              {THEME_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </SelectField>
            <SelectField id="generator-difficulty" label="Difficulté de la question" value={difficulty} onChange={setDifficulty}>
              {DIFFICULTY_OPTIONS.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
            </SelectField>
            <SelectField id="generator-duration" label="Durée de la question" value={duration} onChange={setDuration}>
              {DURATION_OPTIONS.map((seconds) => <option value={seconds} key={seconds}>{seconds} secondes</option>)}
            </SelectField>
          </div>

          {error && <p className="generator-error" role="alert">{error}</p>}
          <button className="generator-primary" type="button" onClick={generateQuestion} disabled={loading}>
            {loading ? <LoaderCircle className="generator-spin" size={17} /> : <Sparkles size={17} />}
            {loading ? "Génération…" : "Générer"}
          </button>
        </section>
      </div>
    );
  }

  const themeMeta = getThemeMeta(question.theme);

  return (
    <div className="generator-page generator-question-page">
      <div className="generator-room-layout">
        <aside className="generator-media-panel">
          <div className="room-question-image generator-question-image">
            {question.img ? <img src={question.img} alt="Illustration de la question" /> : (
              <div className="room-image-placeholder"><ImageIcon size={25} /><span>Question sans image</span></div>
            )}
          </div>
          <div className="generator-question-meta">
            <span><i style={{ background: themeMeta.color }} />{themeMeta.label}</span>
            <span>Niveau {question.difficulty ?? difficulty}</span>
          </div>
        </aside>

        <main className="generator-play-area" aria-live="polite">
          <div className="annex-question-stage generator-question-stage">
            <div className="annex-round-overview">
              <div><span>QUESTION</span><strong>01<small>/ 01</small></strong></div>
              <div><span>TEMPS RESTANT</span><strong>{remainingSeconds} s</strong></div>
            </div>
            <div className="annex-time-progress"><i style={{ transform: `scaleX(${timerProgress})` }} /></div>
            <article className="annex-question-card">
              <p style={{ color: themeMeta.color }}>{themeMeta.label}</p>
              <h1>{question.text}</h1>
              <span>01</span>
            </article>

            {showQcm && (
              <div className="annex-qcm generator-qcm">
                {question.choices.map((choice, index) => (
                  <div className={showAnswer && choice.id === question.correctChoiceId ? "is-correct" : ""} key={choice.id}>
                    <span>{String.fromCharCode(65 + index)}</span>{choice.label}
                    {showAnswer && choice.id === question.correctChoiceId && <Check size={16} />}
                  </div>
                ))}
              </div>
            )}

            {showAnswer ? (
              <div className="generator-reveal">
                <div className="annex-feedback correct"><span className="annex-feedback-icon">✓</span><strong>{question.correctAnswer}</strong></div>
                <button className="generator-primary" type="button" onClick={resetGenerator}><RotateCcw size={17} />Nouvelle question</button>
              </div>
            ) : (
              <div className="generator-actions">
                <button type="button" onClick={() => setShowAnswer(true)}><Eye size={17} />Afficher la réponse</button>
                <button type="button" onClick={() => setShowQcm((current) => !current)} aria-pressed={showQcm}><ListChecks size={17} />{showQcm ? "Masquer QCM" : "Afficher QCM"}</button>
              </div>
            )}
            <div className="generator-duration-note"><Clock3 size={14} />Durée sélectionnée : {durationSeconds} secondes</div>
          </div>
        </main>
      </div>
    </div>
  );
}
