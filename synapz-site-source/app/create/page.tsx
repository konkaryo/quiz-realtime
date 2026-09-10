"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Copy, Crown, RotateCcw, UsersRound } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";
import { PreviewSlider } from "@/components/react-bits/preview-slider";
import { PreviewMultiSelect, PreviewSelect } from "@/components/react-bits/preview-select";
import { PreviewSwitch } from "@/components/react-bits/preview-switch";

const themes = ["Histoire", "Sciences", "Géographie", "Arts", "Littérature", "Cinéma", "Musique", "Sport"];
const themeOptions = themes.map((theme) => ({ value: theme, label: theme }));
const modeOptions = [
  { value: "classique", label: "Classique" },
  { value: "survie", label: "Survie" },
  { value: "equipes", label: "Équipes" },
];
const difficultyOptions = [
  { value: "decouverte", label: "Découverte" },
  { value: "intermediaire", label: "Intermédiaire" },
  { value: "expert", label: "Expert" },
  { value: "mixte", label: "Mixte" },
];

const defaults = {
  mode: "classique",
  questionCount: 10,
  difficulty: "mixte",
  answerTime: 15,
  selectedThemes: [...themes],
  dynamicReading: true,
  speedBonus: true,
  manualStart: false,
};

type CreateStep = 1 | 2 | 3;

const createSteps: Array<{ id: CreateStep; label: string }> = [
  { id: 1, label: "Configuration" },
  { id: 2, label: "Lobby" },
  { id: 3, label: "Lancement" },
];

const initialLobbyPlayers = [
  { id: "you", name: "Vous", detail: "Hôte", initials: "YL", avatar: "", ready: true },
  { id: "milo", name: "Milo", detail: "Prêt", initials: "MI", avatar: "https://randomuser.me/api/portraits/men/32.jpg", ready: true },
  { id: "anouk", name: "Anouk", detail: "Prête", initials: "AN", avatar: "https://randomuser.me/api/portraits/women/44.jpg", ready: true },
];

const incomingPlayer = { id: "sasha", name: "Sasha", detail: "Prête", initials: "SA", avatar: "https://randomuser.me/api/portraits/women/68.jpg", ready: true };

export default function CreateGamePage() {
  const [mode, setMode] = useState(defaults.mode);
  const [questionCount, setQuestionCount] = useState(defaults.questionCount);
  const [difficulty, setDifficulty] = useState(defaults.difficulty);
  const [answerTime, setAnswerTime] = useState(defaults.answerTime);
  const [selectedThemes, setSelectedThemes] = useState(defaults.selectedThemes);
  const [dynamicReading, setDynamicReading] = useState(defaults.dynamicReading);
  const [speedBonus, setSpeedBonus] = useState(defaults.speedBonus);
  const [manualStart, setManualStart] = useState(defaults.manualStart);
  const [activeStep, setActiveStep] = useState<CreateStep>(1);
  const [furthestStep, setFurthestStep] = useState<CreateStep>(1);
  const [lobbyPlayers, setLobbyPlayers] = useState(initialLobbyPlayers);
  const [codeCopied, setCodeCopied] = useState(false);
  const roomCode = "N7K4";

  useEffect(() => {
    if (furthestStep < 2 || lobbyPlayers.some((player) => player.id === incomingPlayer.id)) return;
    const joinTimer = window.setTimeout(() => setLobbyPlayers((players) => [...players, incomingPlayer]), 1400);
    return () => window.clearTimeout(joinTimer);
  }, [furthestStep, lobbyPlayers]);

  const resetSettings = () => {
    setMode(defaults.mode);
    setQuestionCount(defaults.questionCount);
    setDifficulty(defaults.difficulty);
    setAnswerTime(defaults.answerTime);
    setSelectedThemes([...defaults.selectedThemes]);
    setDynamicReading(defaults.dynamicReading);
    setSpeedBonus(defaults.speedBonus);
    setManualStart(defaults.manualStart);
  };

  const saveConfiguration = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setFurthestStep((current) => Math.max(current, 2) as CreateStep);
    setActiveStep(2);
  };

  const openLaunchStep = () => {
    setFurthestStep(3);
    setActiveStep(3);
  };

  const launchGame = () => {
    const params = new URLSearchParams({
      private: "create",
      code: roomCode,
      mode,
      questions: String(questionCount),
      difficulty,
      time: String(answerTime),
      themes: selectedThemes.join(","),
      dynamic: String(dynamicReading),
      speedBonus: String(speedBonus),
      manualStart: String(manualStart),
    });
    window.location.assign(`/game?${params.toString()}`);
  };

  const copyRoomCode = async () => {
    await navigator.clipboard.writeText(roomCode);
    setCodeCopied(true);
    window.setTimeout(() => setCodeCopied(false), 1600);
  };

  const goToStep = (step: CreateStep) => {
    if (step <= furthestStep) setActiveStep(step);
  };

  const heading = activeStep === 1
    ? { eyebrow: "Nouvelle partie", title: "Créez votre partie." }
    : activeStep === 2
      ? { eyebrow: "Partie privée", title: "Invitez les joueurs." }
      : { eyebrow: "Dernière étape", title: "Lancez la partie." };

  return (
    <main className="custom-game-shell">
      <header className="create-header">
        <div className="create-header-left">
          <Link href="/" className="create-brand" aria-label="Retour à l’accueil">
            <span className="brand-mark" aria-hidden="true">
              <img className="brand-logo logo-light" src="/logo-light.png" alt="" />
              <img className="brand-logo logo-dark" src="/logo-dark.png" alt="" />
            </span>
            <span>SYNAPZ</span>
          </Link>
          <span className="create-nav-divider" aria-hidden="true">/</span>
          <nav className="create-nav" aria-label="Navigation de création">
            <Link href="/">Accueil</Link>
            <Link href="/#salons">Salons</Link>
            <span className="create-nav-current" aria-current="page">Créer une partie</span>
          </nav>
        </div>
        <div className="create-header-actions">
          <ThemeToggle />
          <span className="create-profile" aria-label="Profil de Yoann">YL</span>
          <Link href="/#salons" className="create-close">Retour aux salons <ArrowRight size={15} /></Link>
        </div>
      </header>

      <div className="custom-game-content">
        <ol className="create-steps" aria-label="Progression de la création">
          {createSteps.map((step) => {
            const accessible = step.id <= furthestStep;
            const active = step.id === activeStep;
            const complete = step.id < activeStep;
            return (
              <li key={step.id}>
                <button type="button" className={`create-step${active ? " active" : ""}${complete ? " complete" : ""}`} disabled={!accessible} aria-current={active ? "step" : undefined} onClick={() => goToStep(step.id)}>
                  <span className="create-step-index">{complete ? <Check size={14} /> : step.id}</span>
                  <span>{step.label}</span>
                </button>
              </li>
            );
          })}
        </ol>

        <div className="custom-game-heading">
          <div>
            <p>{heading.eyebrow}</p>
            <h1>{heading.title}</h1>
          </div>
        </div>

        {activeStep === 1 && (
          <form onSubmit={saveConfiguration}>
            <section className="customize-frame" aria-labelledby="settings-title">
              <div className="customize-heading">
                <h2 id="settings-title">Personnaliser</h2>
                <div className="customize-heading-actions">
                  <button type="button" className="customize-heading-action" onClick={resetSettings}><RotateCcw size={14} /> Réinitialiser</button>
                </div>
              </div>

              <div className="preview-options">
                <PreviewSelect title="Mode de jeu" options={modeOptions} value={mode} onChange={setMode} />
                <PreviewSlider title="Nombre de questions" min={5} max={30} step={5} value={questionCount} onChange={setQuestionCount} />
                <PreviewSelect title="Difficulté" options={difficultyOptions} value={difficulty} onChange={setDifficulty} />
                <PreviewSlider title="Temps de réponse" min={5} max={60} step={5} value={answerTime} valueUnit="s" onChange={setAnswerTime} />
                <PreviewMultiSelect className="scrubber--wide" title="Thèmes sélectionnés" options={themeOptions} value={selectedThemes} onChange={setSelectedThemes} />
                <PreviewSwitch title="Lecture dynamique" isChecked={dynamicReading} onChange={setDynamicReading} />
                <PreviewSwitch title="Bonus de rapidité" isChecked={speedBonus} onChange={setSpeedBonus} />
                <PreviewSwitch title="Démarrage manuel" isChecked={manualStart} onChange={setManualStart} />
              </div>
            </section>

            <div className="custom-game-footer">
              <button type="submit" className="create-game-button">Créer la partie <ArrowRight size={18} /></button>
            </div>
          </form>
        )}

        {activeStep === 2 && (
          <section className="create-stage-panel" aria-labelledby="lobby-title">
            <div className="create-stage-heading">
              <div>
                <h2 id="lobby-title">Lobby</h2>
                <p>Partagez le code pour inviter d’autres joueurs.</p>
              </div>
              <span className="lobby-online"><i /> {lobbyPlayers.length} joueurs connectés</span>
            </div>
            <div className="lobby-grid">
              <div className="lobby-code-card">
                <span>Code d’accès</span>
                <div className="lobby-code" aria-label={`Code de la partie ${roomCode.split("").join(" ")}`}>
                  {roomCode.split("").map((character, index) => <strong key={`${character}-${index}`}>{character}</strong>)}
                </div>
                <button type="button" className="copy-code-button" onClick={copyRoomCode}>{codeCopied ? <Check size={16} /> : <Copy size={16} />}{codeCopied ? "Code copié" : "Copier le code"}</button>
              </div>
              <div className="lobby-players-card">
                <div className="lobby-players-title"><UsersRound size={17} /><span>Joueurs</span><small>{lobbyPlayers.length}/10</small></div>
                <div className="lobby-player-list" aria-live="polite">
                  {lobbyPlayers.map((player) => (
                    <div className="lobby-player" key={player.id}>
                      <span className="lobby-avatar">{player.avatar ? <img src={player.avatar} alt="" /> : player.initials}</span>
                      <span className="lobby-player-name"><strong>{player.name}</strong><small>{player.detail}</small></span>
                      {player.id === "you" ? <Crown className="lobby-host" size={16} aria-label="Hôte" /> : <span className="lobby-ready"><Check size={13} /></span>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="create-stage-actions">
              <button type="button" className="stage-back-button" onClick={() => setActiveStep(1)}><ArrowLeft size={16} /> Configuration</button>
              <button type="button" className="create-game-button" onClick={openLaunchStep}>Continuer <ArrowRight size={18} /></button>
            </div>
          </section>
        )}

        {activeStep === 3 && (
          <section className="create-stage-panel launch-stage" aria-labelledby="launch-title">
            <div className="launch-ready-icon"><Check size={28} /></div>
            <p className="launch-kicker">Lobby prêt</p>
            <h2 id="launch-title">Tout le monde est prêt.</h2>
            <p className="launch-copy">La partie démarrera pour les {lobbyPlayers.length} joueurs connectés.</p>
            <div className="create-stage-actions launch-actions">
              <button type="button" className="stage-back-button" onClick={() => setActiveStep(2)}><ArrowLeft size={16} /> Retour au lobby</button>
              <button type="button" className="create-game-button" onClick={launchGame}>Lancer maintenant <ArrowRight size={18} /></button>
            </div>
          </section>
        )}
      </div>
    </main>
  );
}
