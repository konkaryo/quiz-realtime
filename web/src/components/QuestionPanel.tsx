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

function clamp(n: number, min: number, max: number) {
  return Math.max(min, Math.min(max, n));
}

function difficultyToStars(difficulty: string | null): number {
  if (!difficulty) return 0;

  // numeric strings: "1".."5"
  const num = Number(difficulty);
  if (Number.isFinite(num) && num > 0) return clamp(Math.round(num), 1, 5);

  const d = difficulty.toLowerCase().trim();

  // common labels
  if (["facile", "easy", "beginner", "débutant"].includes(d)) return 1;
  if (["moyen", "medium", "intermediate", "intermédiaire"].includes(d)) return 3;
  if (["difficile", "hard", "advanced", "avancé"].includes(d)) return 4;
  if (["expert", "very hard", "très difficile"].includes(d)) return 5;

  // fallback: attempt to extract any digit
  const m = d.match(/\d/);
  if (m) return clamp(Number(m[0]), 1, 5);

  return 0;
}

function Stars({ value }: { value: number }) {
  const full = Array.from({ length: clamp(value, 0, 5) });
  const empty = Array.from({ length: Math.max(0, 5 - clamp(value, 0, 5)) });

  return (
    <div
      className="inline-flex items-center gap-1"
      aria-label={`Difficulté : ${value} sur 5`}
      title={`Difficulté : ${value}/5`}
    >
      {full.map((_, i) => (
        <span key={`s-f-${i}`} className="text-[12px] leading-none text-amber-300">
          ★
        </span>
      ))}
      {empty.map((_, i) => (
        <span key={`s-e-${i}`} className="text-[12px] leading-none text-slate-500/70">
          ★
        </span>
      ))}
    </div>
  );
}

export default function DailyQuestionPanel(props: Props) {
  const { question } = props;

  const themeMeta = getThemeMeta(question.theme ?? null);
  const stars = difficultyToStars(question.difficulty);

  // Optionnel : si ton jeu ajoute des marqueurs dans le texte, tu peux nettoyer ici
  const questionText = (question.text ?? "").trim();

  return (
    <div className="mx-auto w-full max-w-6xl px-3">
      <div className="mx-auto w-full max-w-[420px]">
        {/* Carte style "carte à jouer" */}
        <div
          className={[
            "relative overflow-hidden rounded-[26px] border",
            "bg-[#0C0B14]",
            "border-[#3A2B62]/70",
            "shadow-[0_18px_40px_rgba(0,0,0,0.65)]",
          ].join(" ")}
        >
          {/* Liseré + glow */}
          <div
            className="pointer-events-none absolute inset-0"
            style={{
              background:
                "radial-gradient(800px 300px at 20% 0%, rgba(160,120,255,0.18), transparent 55%), radial-gradient(500px 260px at 100% 20%, rgba(80,200,255,0.10), transparent 60%)",
            }}
          />
          <div className="pointer-events-none absolute inset-[10px] rounded-[20px] border border-[#6A4BCB]/30" />

          {/* Motif léger */}
          <div
            className="pointer-events-none absolute -right-10 -top-10 h-48 w-48 rounded-full"
            style={{
              background:
                "conic-gradient(from 240deg, rgba(170,120,255,0.18), rgba(40,20,80,0), rgba(120,220,255,0.12), rgba(170,120,255,0.18))",
              filter: "blur(10px)",
              opacity: 0.8,
            }}
          />

          <div className="relative p-5">
            {/* En-tête : thème + étoiles */}
            <div className="flex items-center justify-between gap-3">
              <div
                className={[
                  "inline-flex items-center gap-2 rounded-full border px-3 py-1.5",
                  "bg-black/40",
                  "border-white/10",
                ].join(" ")}
              >
                <span
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: themeMeta.color }}
                  aria-hidden="true"
                />
                <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-slate-100">
                  {themeMeta.label}
                </span>
              </div>

              <div className="inline-flex items-center gap-2">
                <span className="text-[9px] font-semibold uppercase tracking-[0.22em] text-slate-400">
                  Difficulté
                </span>
                <Stars value={stars} />
              </div>
            </div>

            {/* Titre / question */}
            <div className="mt-4">
              <div className="rounded-[18px] border border-white/10 bg-black/25 px-4 py-4">
                <div className="text-[9px] font-semibold uppercase tracking-[0.30em] text-slate-400">
                  Question
                </div>
                <div className="mt-2 text-[15px] font-semibold leading-snug text-slate-50">
                  {questionText}
                </div>
              </div>
            </div>

            {/* Image : cadre séparé */}
            {question.img && (
              <div className="mt-4">
                <div className="rounded-[18px] border border-white/10 bg-black/25 p-3">
                  <div className="text-[9px] font-semibold uppercase tracking-[0.30em] text-slate-400">
                    Image
                  </div>
                  <div className="mt-2 overflow-hidden rounded-[14px] border border-white/10 bg-black/40">
                    <img
                      src={question.img}
                      alt=""
                      className="h-[190px] w-full object-cover"
                      loading="lazy"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Optionnel : petit “pied” façon carte */}
            <div className="mt-4 flex items-center justify-between">
              <div className="text-[9px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                QUIZ
              </div>
              <div className="text-[9px] font-semibold uppercase tracking-[0.26em] text-slate-500">
                {themeMeta.label}
              </div>
            </div>
          </div>
        </div>

        {/* NOTE:
            Le composant ne rend plus timer/vies/input/choix.
            Il reste compatible niveau props (pour ne rien casser côté parent),
            mais l’affichage est désormais une “carte à jouer” minimaliste.
        */}
      </div>
    </div>
  );
}
