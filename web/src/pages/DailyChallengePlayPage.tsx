// web/src/pages/DailyChallengePlayPage.tsx
import { useNavigate, useParams } from "react-router-dom";

const MONTH_NAMES = [
  "janvier",
  "février",
  "mars",
  "avril",
  "mai",
  "juin",
  "juillet",
  "août",
  "septembre",
  "octobre",
  "novembre",
  "décembre",
];

export default function DailyChallengePlayPage() {
  const navigate = useNavigate();
  const params = useParams<{ day?: string }>();
  const today = new Date();
  const parsed = Number(params.day);
  const maxDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate();
  const dayNumber = Number.isFinite(parsed) && parsed > 0 && parsed <= maxDay ? parsed : null;
  const monthLabel = `${MONTH_NAMES[today.getMonth()]} ${today.getFullYear()}`;

  return (
    <div className="relative">
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-[linear-gradient(135deg,_#12092f,_#281266_45%,_#0b0418_100%)]"
      />
      <div className="relative z-10 mx-auto flex min-h-[70vh] max-w-3xl flex-col items-center justify-center px-6 py-20 text-center text-white">
        <div className="rounded-full border border-white/20 bg-white/10 px-4 py-1 text-xs uppercase tracking-[0.4em] text-white/70">
          Défi du jour
        </div>
        <h1 className="mt-6 text-4xl font-semibold md:text-5xl">
          {dayNumber ? `Défi du ${dayNumber} ${monthLabel}` : "Défi introuvable"}
        </h1>
        {dayNumber ? (
          <p className="mt-4 max-w-xl text-white/80">
            Cette page sera bientôt disponible. Revenez très vite pour découvrir le défi du jour et tenter de battre votre record !
          </p>
        ) : (
          <p className="mt-4 max-w-xl text-white/80">
            Le numéro de défi sélectionné n'est pas valide pour le mois en cours.
          </p>
        )}
        <button
          type="button"
          onClick={() => navigate("/solo/daily")}
          className="mt-8 rounded-full border border-transparent bg-white px-6 py-3 text-sm font-semibold text-slate-900 transition hover:scale-[1.02]"
        >
          Retour au calendrier
        </button>
      </div>
    </div>
  );
}