"use client";

import { FormEvent, useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, Clock3, Heart, ImageIcon, ListChecks, RotateCcw, Send, Trophy, X, Zap } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const questions = [
  {
    category: "GÉOGRAPHIE",
    text: "Quel monument français est représenté sur cette photographie ?",
    answers: ["mont saint-michel", "le mont saint-michel", "mont st michel", "le mont st michel"],
    choices: ["Le Mont-Saint-Michel", "La Cité de Carcassonne", "L’abbaye de Cluny", "Le château de Chambord"],
    displayAnswer: "Le Mont-Saint-Michel",
    image: "https://cdn12.picryl.com/photo/2016/12/31/mont-st-michel-normandy-twilight-b6900c-1024.jpg",
    credit: "Mont-Saint-Michel · Normandie",
  },
  {
    category: "SCIENCES",
    text: "Quel élément chimique, de symbole W, possède le point de fusion le plus élevé de tous les métaux ?",
    answers: ["tungstène", "tungstene", "tungsten", "le tungstène", "le tungstene"],
    choices: ["Le tungstène", "Le titane", "L’osmium", "Le platine"],
    displayAnswer: "Le tungstène",
    image: null,
    credit: null,
  },
  {
    category: "LITTÉRATURE",
    text: "Quel écrivain a créé le personnage de Meursault ?",
    answers: ["albert camus", "camus"],
    choices: ["Albert Camus", "Jean-Paul Sartre", "André Malraux", "Louis-Ferdinand Céline"],
    displayAnswer: "Albert Camus",
    image: null,
    credit: null,
  },
  {
    category: "HISTOIRE",
    text: "En quelle année débute la Révolution française ?",
    answers: ["1789", "mille sept cent quatre vingt neuf"],
    choices: ["1789", "1776", "1792", "1815"],
    displayAnswer: "1789",
    image: null,
    credit: null,
  },
  {
    category: "ARTS",
    text: "Quel peintre néerlandais a réalisé La Nuit étoilée ?",
    answers: ["vincent van gogh", "van gogh", "vincent van-gogh"],
    choices: ["Vincent van Gogh", "Piet Mondrian", "Rembrandt", "Johannes Vermeer"],
    displayAnswer: "Vincent van Gogh",
    image: null,
    credit: null,
  },
  {
    category: "SPORT",
    text: "Combien de joueurs une équipe de football aligne-t-elle au coup d’envoi ?",
    answers: ["11", "onze", "11 joueurs", "onze joueurs"],
    choices: ["11 joueurs", "10 joueurs", "12 joueurs", "9 joueurs"],
    displayAnswer: "11 joueurs",
    image: null,
    credit: null,
  },
  {
    category: "ASTRONOMIE",
    text: "Quelle planète du Système solaire est surnommée la planète rouge ?",
    answers: ["mars", "la planete mars", "la planète mars"],
    choices: ["Mars", "Vénus", "Jupiter", "Mercure"],
    displayAnswer: "Mars",
    image: null,
    credit: null,
  },
  {
    category: "GÉOGRAPHIE",
    text: "Quelle est la capitale de l’Australie ?",
    answers: ["canberra"],
    choices: ["Canberra", "Sydney", "Melbourne", "Perth"],
    displayAnswer: "Canberra",
    image: null,
    credit: null,
  },
  {
    category: "MUSIQUE",
    text: "Quel compositeur a écrit la Neuvième Symphonie et son Ode à la joie ?",
    answers: ["ludwig van beethoven", "beethoven", "ludwig van bethoven", "bethoven"],
    choices: ["Ludwig van Beethoven", "Wolfgang Amadeus Mozart", "Franz Schubert", "Johann Sebastian Bach"],
    displayAnswer: "Ludwig van Beethoven",
    image: null,
    credit: null,
  },
  {
    category: "NATURE",
    text: "Quel animal terrestre peut atteindre la vitesse de pointe la plus élevée ?",
    answers: ["guepard", "guépard", "le guepard", "le guépard"],
    choices: ["Le guépard", "L’antilope", "Le lion", "L’autruche"],
    displayAnswer: "Le guépard",
    image: null,
    credit: null,
  },
];

const playerSeeds = [
  { name: "Milo", isYou: false, avatar: "https://randomuser.me/api/portraits/men/32.jpg" },
  { name: "Anouk", isYou: false, avatar: "https://randomuser.me/api/portraits/women/44.jpg" },
  { name: "Sasha", isYou: false, avatar: "https://randomuser.me/api/portraits/women/68.jpg" },
  { name: "Nina", isYou: false, avatar: "https://randomuser.me/api/portraits/women/33.jpg" },
  { name: "Élio", isYou: true, avatar: "https://randomuser.me/api/portraits/men/46.jpg" },
];

const normalize = (value: string) =>
  value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");

const roomNames: Record<string, string> = {
  discovery: "Facile",
  intermediate: "Intermédiaire",
  expert: "Difficile",
};

type SpeedLeader = {
  name: string;
  avatar: string;
  time: number;
  points: number;
  isYou: boolean;
};

type PlayerState = "thinking" | "correct" | "wrong";

type GamePlayer = (typeof playerSeeds)[number] & {
  score: number;
  state: PlayerState;
  responseTime: number | null;
  lastPoints: number;
};

type BotPlan = {
  name: string;
  time: number;
  correct: boolean;
  points: number;
};

const createPlayers = (): GamePlayer[] => playerSeeds.map((player) => ({
  ...player,
  score: 0,
  state: "thinking",
  responseTime: null,
  lastPoints: 0,
}));

export default function GamePage() {
  const [roomName, setRoomName] = useState("Intermédiaire");
  const [questionIndex, setQuestionIndex] = useState(0);
  const [time, setTime] = useState(15);
  const [lives, setLives] = useState(3);
  const [answer, setAnswer] = useState("");
  const [wrongAnswers, setWrongAnswers] = useState<string[]>([]);
  const [isMultipleChoice, setIsMultipleChoice] = useState(false);
  const [result, setResult] = useState<"idle" | "correct" | "timeout">("idle");
  const [questionResults, setQuestionResults] = useState<Array<"correct" | "wrong" | null>>(() => questions.map(() => null));
  const [showInterlude, setShowInterlude] = useState(false);
  const [showFinal, setShowFinal] = useState(false);
  const [speedLeaders, setSpeedLeaders] = useState<SpeedLeader[]>([]);
  const [gamePlayers, setGamePlayers] = useState<GamePlayer[]>(createPlayers);
  const botPlansRef = useRef<BotPlan[]>([]);
  const questionStartedAtRef = useRef(0);
  const gamePlayersRef = useRef(gamePlayers);
  const inputRef = useRef<HTMLInputElement>(null);
  const question = questions[questionIndex];
  const liveStandings = [...gamePlayers].sort((a, b) => b.score - a.score);
  const finalStandings = liveStandings;
  const currentPlayer = gamePlayers.find((player) => player.isYou);
  const score = currentPlayer?.score ?? 0;
  const finalRank = finalStandings.findIndex((player) => player.isYou) + 1;
  const correctCount = questionResults.filter((item) => item === "correct").length;
  const currentSpeedRank = currentPlayer?.state === "correct"
    ? Math.max(1, speedLeaders.findIndex((player) => player.isYou) + 1)
    : speedLeaders.length + 1;

  useEffect(() => {
    gamePlayersRef.current = gamePlayers;
  }, [gamePlayers]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.has("private") || params.has("code")) {
      setRoomName("Partie privée");
      return;
    }

    setRoomName(roomNames[params.get("room") ?? ""] ?? "Intermédiaire");
  }, []);

  const nextQuestion = useCallback(() => {
    if (questionIndex === questions.length - 1) {
      setShowInterlude(false);
      setShowFinal(true);
      return;
    }

    setQuestionIndex((current) => current + 1);
    setTime(15);
    setLives(3);
    setAnswer("");
    setWrongAnswers([]);
    setIsMultipleChoice(false);
    setShowInterlude(false);
    setResult("idle");
  }, [questionIndex]);

  const restartGame = useCallback(() => {
    setQuestionIndex(0);
    setTime(15);
    setLives(3);
    setAnswer("");
    setWrongAnswers([]);
    setIsMultipleChoice(false);
    setResult("idle");
    setQuestionResults(questions.map(() => null));
    setShowInterlude(false);
    setShowFinal(false);
    setSpeedLeaders([]);
    setGamePlayers(createPlayers());
    botPlansRef.current = [];
  }, []);

  useEffect(() => {
    if (showFinal) return;

    questionStartedAtRef.current = Date.now();

    const botSeeds = playerSeeds.filter((player) => !player.isYou);
    const plans = botSeeds.map((player, index) => {
      const responseTime = Number((1.25 + Math.random() * 3.7 + index * 0.24).toFixed(2));
      const accuracy = [0.86, 0.78, 0.67, 0.73][index];
      const correct = Math.random() < accuracy;
      return {
        name: player.name,
        time: responseTime,
        correct,
        points: correct ? Math.max(50, Math.round((15 - responseTime) * 18)) : 0,
      };
    });

    if (plans.filter((plan) => plan.correct).length < 2) {
      plans[0].correct = true;
      plans[0].points = Math.round((15 - plans[0].time) * 18);
      plans[1].correct = true;
      plans[1].points = Math.round((15 - plans[1].time) * 18);
    }

    botPlansRef.current = plans;
    setGamePlayers((current) => current.map((player) => ({
      ...player,
      state: "thinking",
      responseTime: null,
      lastPoints: 0,
    })));

    const timers = plans.map((plan) => window.setTimeout(() => {
      setGamePlayers((current) => current.map((player) => player.name === plan.name ? {
        ...player,
        state: plan.correct ? "correct" : "wrong",
        responseTime: plan.time,
        lastPoints: plan.points,
        score: player.score + plan.points,
      } : player));
    }, plan.time * 1000));

    return () => timers.forEach((timer) => window.clearTimeout(timer));
  }, [questionIndex, showFinal]);

  const openInterlude = useCallback(() => {
    const botRanking = botPlansRef.current
      .filter((plan) => plan.correct)
      .map((plan) => {
        const player = playerSeeds.find((item) => item.name === plan.name)!;
        return { name: player.name, avatar: player.avatar, time: plan.time, points: plan.points, isYou: false };
      });
    const currentPlayer = gamePlayersRef.current.find((player) => player.isYou);
    const userRanking = currentPlayer?.state === "correct" && currentPlayer.responseTime !== null
      ? [{ name: currentPlayer.name, avatar: currentPlayer.avatar, time: currentPlayer.responseTime, points: currentPlayer.lastPoints, isYou: true }]
      : [];
    const ranking = [...botRanking, ...userRanking]
      .sort((a, b) => a.time - b.time);

    setSpeedLeaders(ranking);
    setShowInterlude(true);
  }, []);

  useEffect(() => {
    if (result !== "idle") return;
    if (time <= 0) {
      setGamePlayers((current) => current.map((player) => player.isYou ? { ...player, state: "wrong", responseTime: null, lastPoints: 0 } : player));
      setQuestionResults((items) => items.map((item, index) => index === questionIndex ? "wrong" : item));
      setResult("timeout");
      return;
    }
    const timer = window.setTimeout(() => setTime((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [time, result]);

  useEffect(() => inputRef.current?.focus(), [questionIndex]);

  useEffect(() => {
    const activateQcm = (event: KeyboardEvent) => {
      if (event.key !== "Tab" || result !== "idle" || isMultipleChoice) return;
      event.preventDefault();
      setIsMultipleChoice(true);
      window.requestAnimationFrame(() => document.querySelector<HTMLButtonElement>(".qcm-grid button")?.focus());
    };

    window.addEventListener("keydown", activateQcm);
    return () => window.removeEventListener("keydown", activateQcm);
  }, [isMultipleChoice, result]);

  useEffect(() => {
    if (result === "idle" || showInterlude || showFinal) return;
    const reveal = window.setTimeout(openInterlude, 1800);
    return () => window.clearTimeout(reveal);
  }, [openInterlude, result, showFinal, showInterlude]);

  useEffect(() => {
    if (!showInterlude) return;
    const advance = window.setTimeout(nextQuestion, 4200);
    return () => window.clearTimeout(advance);
  }, [nextQuestion, showInterlude]);

  const validateAnswer = (rawValue: string) => {
    const value = rawValue.trim();
    if (!value || result !== "idle") return;

    const accepted = question.answers.some((candidate) => normalize(candidate) === normalize(value));
    if (accepted) {
      const points = time * 18;
      const responseTime = Math.min(15, Number(((Date.now() - questionStartedAtRef.current) / 1000).toFixed(2)));
      setGamePlayers((current) => current.map((player) => player.isYou ? {
        ...player,
        state: "correct",
        responseTime,
        lastPoints: points,
        score: player.score + points,
      } : player));
      setQuestionResults((items) => items.map((item, index) => index === questionIndex ? "correct" : item));
      setResult("correct");
      return;
    }

    setWrongAnswers((items) => [...items, value]);
    setLives((current) => Math.max(0, current - 1));
    setAnswer("");
    if (lives <= 1) {
      setGamePlayers((current) => current.map((player) => player.isYou ? { ...player, state: "wrong", responseTime: null, lastPoints: 0 } : player));
      setQuestionResults((items) => items.map((item, index) => index === questionIndex ? "wrong" : item));
      setResult("timeout");
    }
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    validateAnswer(answer);
  };

  return (
    <main className="game-shell">
      <header className="game-header create-header">
        <div className="game-header-left create-header-left">
          <Link href="/" className="game-brand create-brand" aria-label="Retour à l’accueil"><span className="brand-mark" aria-hidden="true"><img className="brand-logo logo-light" src="/logo-light.png" alt="" /><img className="brand-logo logo-dark" src="/logo-dark.png" alt="" /></span> SYNAPZ</Link>
          <span className="game-nav-divider create-nav-divider" aria-hidden="true">/</span>
          <nav className="game-nav create-nav" aria-label="Navigation de la partie">
            <Link href="/">Accueil</Link>
            <Link href="/#salons">Salons</Link>
            <span className="game-nav-current create-nav-current" aria-current="page">Partie en cours</span>
          </nav>
        </div>
        <div className="game-actions create-header-actions">
          <div className="game-room"><i /><strong>{roomName}</strong></div>
          <ThemeToggle />
          <span className="create-profile" aria-label="Profil de Yoann">YL</span>
          <Link href="/" className="quit-button create-close">Quitter <X size={14} /></Link>
        </div>
      </header>

      <div className="game-stage">
        <aside className="left-rail">
          <div className={`visual-panel ${question.image ? "has-image" : "no-image"}`}>
            <div className="image-frame">
              {question.image ? <img src={question.image} alt="Vue aérienne du monument à identifier" /> : <div className="image-placeholder"><ImageIcon size={25} /><span>Question sans image</span></div>}
              {question.credit && <div className="image-caption">{question.credit}</div>}
            </div>
          </div>
          <section className="leaderboard" aria-label="Classement en direct">
            <div className="players">
              {liveStandings.map((player, index) => {
                const statusLabel = player.state === "correct" ? "Bonne réponse" : player.state === "wrong" ? "Erreur" : "Réflexion en cours";
                return (
                  <div className={`player ${player.state} ${player.isYou ? "you" : ""}`} key={player.name}>
                    <span className="rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="avatar"><img src={player.avatar} alt="" /></span>
                    <span className="player-name"><strong>{player.name}</strong></span>
                    <span className="player-score">{player.score.toLocaleString("fr-FR")}</span>
                    <span className={`player-status ${player.state}`} aria-label={statusLabel} title={statusLabel}>
                      {player.state === "correct" ? <Check size={12} /> : player.state === "wrong" ? <X size={12} /> : <Clock3 size={11} />}
                    </span>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>

        <section className="play-area" aria-live="polite">
          {showFinal ? (
            <div className="final-screen">
              <div className="final-topline"><span><Trophy size={14} /> Partie terminée</span><small>{roomName.toLocaleUpperCase("fr")}</small></div>
              <div className="final-summary">
                <div className="final-rank"><span>VOTRE RANG</span><strong>{String(finalRank).padStart(2, "0")}</strong><small>sur {gamePlayers.length} joueurs</small></div>
                <div className="final-copy"><p>RÉSULTAT FINAL</p><h2>{finalRank === 1 ? "Vous remportez la partie." : `Vous terminez à la ${finalRank}e place.`}</h2></div>
              </div>
              <div className="final-stats">
                <div><span>SCORE</span><strong>{score.toLocaleString("fr-FR")}</strong></div>
                <div><span>BONNES RÉPONSES</span><strong>{correctCount}<small>/{questions.length}</small></strong></div>
                <div><span>POINTS GAGNÉS</span><strong>+{score.toLocaleString("fr-FR")}</strong></div>
              </div>
              <div className="final-standings" aria-label="Podium final">
                {finalStandings.slice(0, 3).map((player, index) => (
                  <div className={player.isYou ? "you" : ""} key={player.name}>
                    <span className="final-place">{String(index + 1).padStart(2, "0")}</span>
                    <span className="final-avatar"><img src={player.avatar} alt="" /></span>
                    <strong>{player.name}</strong>
                    <span className="final-score">{player.score.toLocaleString("fr-FR")}</span>
                  </div>
                ))}
              </div>
              <div className="final-actions">
                <Link href="/">Retour aux salons</Link>
                <button type="button" onClick={restartGame}><RotateCcw size={14} /> Rejouer</button>
              </div>
            </div>
          ) : showInterlude ? (
            <div className="speed-interlude" key={`interlude-${questionIndex}`}>
              <div className="speed-interlude-topline"><span><Zap size={13} fill="currentColor" /> Question {String(questionIndex + 1).padStart(2, "0")} terminée</span></div>
              <div className="speed-interlude-heading"><h2>Quelques secondes<br />font la différence.</h2></div>
              <div className="speed-list">
                {speedLeaders.slice(0, 3).map((player, index) => (
                  <div className={`speed-row ${player.isYou ? "you" : ""}`} key={player.name}>
                    <span className="speed-rank">{String(index + 1).padStart(2, "0")}</span>
                    <span className="speed-avatar"><img src={player.avatar} alt="" /></span>
                    <span className="speed-player"><strong>{player.name}</strong></span>
                    <span className="speed-time"><strong>{player.time.toFixed(2)} s</strong><small>+{player.points} pts</small></span>
                  </div>
                ))}
                {!speedLeaders.slice(0, 3).some((player) => player.isYou) && currentPlayer && (
                  <div className="speed-self-row">
                    <span className="speed-self-rank">{String(currentSpeedRank).padStart(2, "0")}</span>
                    <span className="speed-avatar"><img src={currentPlayer.avatar} alt="" /></span>
                    <strong>{currentPlayer.name}</strong>
                    {currentPlayer.state === "correct" && currentPlayer.responseTime !== null ? (
                      <span className="speed-self-score">
                        <strong>{currentPlayer.responseTime.toFixed(2)} s</strong>
                        <small>+{currentPlayer.lastPoints} pts</small>
                      </span>
                    ) : (
                      <span className="speed-self-score"><strong>—</strong><small>Pas de bonne réponse</small></span>
                    )}
                  </div>
                )}
              </div>
              <div className="speed-interlude-footer">
                <div><span>{questionIndex === questions.length - 1 ? "RÉSULTATS DE LA PARTIE" : "QUESTION SUIVANTE"}</span><div className="speed-countdown"><i /></div></div>
                <button type="button" onClick={nextQuestion}>{questionIndex === questions.length - 1 ? "Voir les résultats" : "Continuer"} <ArrowRight size={14} /></button>
              </div>
            </div>
          ) : (
          <>
          <div className="round-overview">
            <div className="question-count"><span>QUESTION</span><strong>{String(questionIndex + 1).padStart(2, "0")}<small>/ {String(questions.length).padStart(2, "0")}</small></strong></div>
            <div className="time-copy"><span>TEMPS RESTANT</span><strong>{time} s</strong></div>
          </div>
          <div className="question-progress"><span style={{ width: `${(time / 15) * 100}%` }} /></div>

          <article className="question-card" key={questionIndex}>
            <div className="question-top"><p>{question.category}</p></div>
            <div className="question-copy"><h1>{question.text}</h1></div>
            <span className="card-number" aria-hidden="true">{String(questionIndex + 1).padStart(2, "0")}</span>
          </article>

          <div className="answer-area">
            <div className="attempt-line">
              <div className="lives" aria-label={`${lives} vies restantes`}>
                {[0, 1, 2].map((index) => <Heart key={index} size={14} fill={index < lives ? "currentColor" : "none"} className={index < lives ? "active" : "lost"} />)}
              </div>
              <div className="answer-status-slot">
                {result === "correct" && currentPlayer?.responseTime !== null && currentPlayer?.responseTime !== undefined ? (
                  <div className="answer-performance" aria-label="Performance de la réponse">
                    <span><Clock3 size={13} /><small>Temps</small><strong>{currentPlayer.responseTime.toLocaleString("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} s</strong></span>
                    <i aria-hidden="true" />
                    <span><Zap size={13} /><small>Score</small><strong>+{currentPlayer.lastPoints} pts</strong></span>
                  </div>
                ) : isMultipleChoice ? <button className="qcm-toggle active" type="button" onClick={() => setIsMultipleChoice(false)} disabled={result !== "idle"}><ListChecks size={14} /> Saisie libre</button> : null}
              </div>
            </div>
            {isMultipleChoice ? (
              <div className="qcm-grid" role="group" aria-label="Choix de réponse">
                {question.choices.map((choice, index) => (
                  <button type="button" key={choice} onClick={() => validateAnswer(choice)} disabled={result !== "idle"}>
                    <span>{String.fromCharCode(65 + index)}</span>{choice}
                  </button>
                ))}
              </div>
            ) : (
              <form onSubmit={submit}>
                <input ref={inputRef} value={answer} onChange={(event) => setAnswer(event.target.value)} placeholder="Écrivez votre réponse…" aria-label="Votre réponse" autoComplete="off" disabled={result !== "idle"} />
                <button className="qcm-inline" type="button" onClick={() => setIsMultipleChoice(true)} disabled={result !== "idle"}><ListChecks size={14} /><span>QCM</span></button>
                <button className="submit-button" type="submit" aria-label="Valider la réponse" disabled={result !== "idle"}><Send size={17} /></button>
              </form>
            )}

            {result !== "idle" ? (
              <button className={`feedback ${result}`} onClick={openInterlude}>
                <span className="feedback-icon">{result === "correct" ? <Check size={15} /> : <X size={15} />}</span>
                <span className="feedback-content">
                  <strong>{question.displayAnswer}</strong>
                </span>
              </button>
            ) : wrongAnswers.length > 0 ? (
              <div className="attempt-log"><span>Déjà essayé</span>{wrongAnswers.map((item, index) => <s key={`${item}-${index}`}>{item}</s>)}</div>
            ) : (
              <p className="keyboard-hint"><span><kbd>ENTRÉE</kbd> pour valider</span><span><kbd>TAB</kbd> pour le QCM</span></p>
            )}
          </div>
          </>
          )}
        </section>

        <aside className="game-progress" aria-label="Progression de la partie">
          <ol>
            {questions.map((item, index) => {
              const state = index === questionIndex && result !== "idle"
                ? result === "correct" ? "correct" : "wrong"
                : questionResults[index];
              const isCurrent = index === questionIndex && result === "idle";
              const statusLabel = state === "correct" ? "Bonne réponse" : state === "wrong" ? "Erreur" : isCurrent ? "Question en cours" : "À venir";
              return (
                <li className={`${state ?? "pending"} ${isCurrent ? "current" : ""}`} key={item.text} aria-label={`Question ${index + 1} : ${statusLabel}`}>
                  <span className="game-progress-marker">
                    {String(index + 1).padStart(2, "0")}
                  </span>
                </li>
              );
            })}
          </ol>
        </aside>

      </div>
    </main>
  );
}
