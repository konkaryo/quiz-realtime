"use client";

import { FormEvent, useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowDown, ArrowRight, ArrowUpRight, Check, LockKeyhole, Menu, Plus, Send, X } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

const rooms = [
  { name: "Facile", difficulty: "discovery", description: "La culture générale dans sa version la plus accessible.", players: 18, avatars: ["https://randomuser.me/api/portraits/women/44.jpg", "https://randomuser.me/api/portraits/men/32.jpg", "https://randomuser.me/api/portraits/women/68.jpg"] },
  { name: "Intermédiaire", difficulty: "intermediate", description: "Un niveau équilibré pour les joueurs avertis.", players: 31, avatars: ["https://randomuser.me/api/portraits/men/46.jpg", "https://randomuser.me/api/portraits/women/33.jpg", "https://randomuser.me/api/portraits/men/52.jpg"] },
  { name: "Difficile", difficulty: "expert", description: "Des questions exigeantes pour départager les meilleurs.", players: 9, avatars: ["https://randomuser.me/api/portraits/women/12.jpg", "https://randomuser.me/api/portraits/men/75.jpg", "https://randomuser.me/api/portraits/women/57.jpg"] },
];

const demoQuestions = [
  { category: "Sciences", prompt: "Quel élément chimique porte le symbole W ?", answers: ["tungstène", "tungsten"], label: "le tungstène" },
  { category: "Géographie", prompt: "Quelle est la capitale de l’Australie ?", answers: ["Canberra"], label: "Canberra" },
  { category: "Littérature", prompt: "Quel écrivain a créé le personnage de Meursault ?", answers: ["Albert Camus", "Camus"], label: "Albert Camus" },
  { category: "Histoire", prompt: "Quelle ville est tombée aux mains des Ottomans en 1453 ?", answers: ["Constantinople", "Istanbul"], label: "Constantinople" },
  { category: "Arts", prompt: "Qui a peint La Nuit étoilée ?", answers: ["Vincent van Gogh", "Van Gogh"], label: "Vincent van Gogh" },
  { category: "Astronomie", prompt: "Quelle planète du Système solaire est surnommée la planète rouge ?", answers: ["Mars"], label: "Mars" },
  { category: "Musique", prompt: "Quel compositeur est l’auteur des Quatre Saisons ?", answers: ["Antonio Vivaldi", "Vivaldi"], label: "Antonio Vivaldi" },
  { category: "Cinéma", prompt: "Quel réalisateur sud-coréen a signé le film Parasite ?", answers: ["Bong Joon-ho", "Bong Joon Ho"], label: "Bong Joon-ho" },
  { category: "Architecture", prompt: "Quel monument d’Agra fut construit par l’empereur Shah Jahan ?", answers: ["Taj Mahal", "Le Taj Mahal"], label: "le Taj Mahal" },
  { category: "Mythologie", prompt: "Quel dieu grec règne sur les mers et les océans ?", answers: ["Poséidon", "Poseidon"], label: "Poséidon" },
];

const normalizeAnswer = (value: string) => value
  .trim()
  .toLocaleLowerCase("fr")
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .replace(/[’']/g, "")
  .replace(/-/g, " ")
  .replace(/\s+/g, " ");

export default function Home() {
  const roomsRef = useRef<HTMLElement>(null);
  const [landingLoaded, setLandingLoaded] = useState(false);
  const [landingLoaderHiding, setLandingLoaderHiding] = useState(false);
  const [demoAnswer, setDemoAnswer] = useState("");
  const [demoResult, setDemoResult] = useState<"idle" | "correct" | "wrong">("idle");
  const [demoQuestionIndex, setDemoQuestionIndex] = useState(0);
  const [demoTransitioning, setDemoTransitioning] = useState(false);
  const [demoInputFocused, setDemoInputFocused] = useState(false);
  const [navScrolled, setNavScrolled] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [privateCode, setPrivateCode] = useState(["", "", "", ""]);
  const privateCodeInputsRef = useRef<Array<HTMLInputElement | null>>([]);
  const demoQuestion = demoQuestions[demoQuestionIndex];

  useLayoutEffect(() => {
    if (landingLoaded) return;

    const previousRootOverflow = document.documentElement.style.overflow;
    const previousBodyOverflow = document.body.style.overflow;
    document.documentElement.style.overflow = "hidden";
    document.body.style.overflow = "hidden";

    return () => {
      document.documentElement.style.overflow = previousRootOverflow;
      document.body.style.overflow = previousBodyOverflow;
    };
  }, [landingLoaded]);

  useEffect(() => {
    const startedAt = Date.now();
    let revealTimer: number | undefined;
    let completeTimer: number | undefined;
    let cancelled = false;

    void document.fonts.ready.then(() => {
      if (cancelled) return;
      revealTimer = window.setTimeout(() => {
        setLandingLoaderHiding(true);
        completeTimer = window.setTimeout(() => setLandingLoaded(true), 600);
      }, Math.max(0, 800 - (Date.now() - startedAt)));
    });

    return () => {
      cancelled = true;
      if (revealTimer) window.clearTimeout(revealTimer);
      if (completeTimer) window.clearTimeout(completeTimer);
    };
  }, []);

  const submitDemoAnswer = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalized = normalizeAnswer(demoAnswer);

    if (!normalized) return;
    setDemoResult(demoQuestion.answers.some((answer) => normalizeAnswer(answer) === normalized) ? "correct" : "wrong");
    event.currentTarget.querySelector("input")?.blur();
  };

  const joinPrivateRoom = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const code = privateCode.join("");
    if (code.length === 4) window.location.assign(`/game?code=${encodeURIComponent(code)}`);
  };

  const focusFirstAvailablePrivateCodeInput = () => {
    const firstEmptyIndex = privateCode.findIndex((character) => !character);
    privateCodeInputsRef.current[firstEmptyIndex === -1 ? 3 : firstEmptyIndex]?.focus();
  };

  const updatePrivateCode = (startIndex: number, rawValue: string) => {
    const characters = rawValue.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4 - startIndex).split("");

    if (characters.length === 0) {
      setPrivateCode((current) => current.map((character, index) => index === startIndex ? "" : character));
      return;
    }

    setPrivateCode((current) => {
      const next = [...current];
      characters.forEach((character, offset) => { next[startIndex + offset] = character; });
      return next;
    });

    window.requestAnimationFrame(() => {
      privateCodeInputsRef.current[Math.min(startIndex + characters.length, 3)]?.focus();
    });
  };

  useEffect(() => {
    if (demoInputFocused) {
      setDemoTransitioning(false);
      return;
    }

    let transitionTimer: number | undefined;
    const rotationTimer = window.setTimeout(() => {
      setDemoTransitioning(true);
      transitionTimer = window.setTimeout(() => {
        setDemoQuestionIndex((current) => (current + 1) % demoQuestions.length);
        setDemoAnswer("");
        setDemoResult("idle");
        setDemoTransitioning(false);
      }, 280);
    }, demoResult === "idle" ? 6500 : 1800);

    return () => {
      window.clearTimeout(rotationTimer);
      if (transitionTimer) window.clearTimeout(transitionTimer);
    };
  }, [demoInputFocused, demoQuestionIndex, demoResult]);

  useEffect(() => {
    let locked = false;
    const handleWheel = (event: WheelEvent) => {
      if (window.scrollY < window.innerHeight * 0.55 && event.deltaY > 2) {
        event.preventDefault();
        if (locked) return;
        locked = true;
        roomsRef.current?.scrollIntoView({ behavior: "smooth" });
        window.setTimeout(() => (locked = false), 900);
      }
    };
    window.addEventListener("wheel", handleWheel, { passive: false });
    return () => window.removeEventListener("wheel", handleWheel);
  }, []);

  useEffect(() => {
    const updateNavbar = () => setNavScrolled(window.scrollY > 50);
    updateNavbar();
    window.addEventListener("scroll", updateNavbar, { passive: true });
    return () => window.removeEventListener("scroll", updateNavbar);
  }, []);

  return (
    <>
      {!landingLoaded && (
        <div className={`landing-loader${landingLoaderHiding ? " hiding" : ""}`} role="status" aria-label="Chargement du site">
          <span className="landing-loader-logo" aria-hidden="true">
            <img className="landing-loader-mark loader-mark-black" src="/loader-mark-black.png" alt="" />
            <img className="landing-loader-mark loader-mark-white" src="/loader-mark-white.png" alt="" />
          </span>
        </div>
      )}
      <main className={`landing ${landingLoaded ? "landing-loaded" : "landing-loading"}`}>
      <section className="hero" aria-labelledby="hero-title">
        <header className={`site-header${navScrolled ? " site-header-scrolled" : ""}${mobileMenuOpen ? " menu-open" : ""}`}>
          <div className="site-header-inner">
            <div className="site-header-left">
              <a className="brand" href="#top" aria-label="Accueil" onClick={() => setMobileMenuOpen(false)}><span className="brand-mark" aria-hidden="true"><img className="brand-logo logo-light" src="/logo-light.png" alt="" /><img className="brand-logo logo-dark" src="/logo-dark.png" alt="" /></span><span>SYNAPZ</span></a>
              <span className="nav-divider" aria-hidden="true">/</span>
              <nav className="site-nav" aria-label="Navigation principale">
                <a href="#salons">Salons ouverts</a>
                <a href="#classement">Classement</a>
              </nav>
            </div>
            <div className="header-actions">
              <ThemeToggle />
              <button className="profile-button" aria-label="Ouvrir le profil">YL</button>
              <button className="mobile-menu-button" aria-label={mobileMenuOpen ? "Fermer le menu" : "Ouvrir le menu"} aria-expanded={mobileMenuOpen} onClick={() => setMobileMenuOpen((open) => !open)}>
                {mobileMenuOpen ? <X size={17} /> : <Menu size={17} />}
              </button>
            </div>
            {mobileMenuOpen && <nav className="mobile-nav" aria-label="Navigation mobile">
              <a href="#salons" onClick={() => setMobileMenuOpen(false)}>Salons ouverts <ArrowUpRight size={15} /></a>
              <a href="#classement" onClick={() => setMobileMenuOpen(false)}>Classement <ArrowUpRight size={15} /></a>
            </nav>}
          </div>
        </header>

        <div className="hero-content" id="top">
          <h1 id="hero-title">Cultivez votre<br /><em>curiosité.</em></h1>
          <p className="hero-copy">Accédez à des milliers de questions de culture générale.<br />Rejoignez la communauté Synapz et jouez en direct.</p>
          <button className="primary-cta" onClick={() => roomsRef.current?.scrollIntoView({ behavior: "smooth" })}>Trouver une partie <ArrowDown size={17} strokeWidth={2} /></button>
        </div>

        <div className="hero-question" aria-label="Exemple de question jouable">
          <div className="demo-question-body" aria-live="polite">
            <div className={`demo-question-slide${demoTransitioning ? " leaving" : ""}`} key={demoQuestionIndex}>
              <p>{demoQuestion.category}</p>
              <h2>{demoQuestion.prompt}</h2>
            </div>
          </div>
          <form className={`demo-answer ${demoResult}`} onSubmit={submitDemoAnswer}>
            <input
              value={demoAnswer}
              onFocus={() => setDemoInputFocused(true)}
              onBlur={() => setDemoInputFocused(false)}
              onChange={(event) => {
                setDemoAnswer(event.target.value);
                if (demoResult !== "idle") setDemoResult("idle");
              }}
              placeholder="Écrivez votre réponse…"
              aria-label="Réponse à la question d'exemple"
            />
            <button type="submit" aria-label="Valider la réponse"><Send size={18} strokeWidth={1.8} /></button>
          </form>
          <div className={`demo-feedback ${demoResult}`} aria-live="polite">
            {demoResult === "correct" ? <><Check size={15} /> Bonne réponse — {demoQuestion.label}.</> : demoResult === "wrong" ? <><X size={15} /> Pas tout à fait. Réessayez.</> : <><kbd>ENTRÉE</kbd> pour valider</>}
          </div>
        </div>

        <button className="scroll-hint" onClick={() => roomsRef.current?.scrollIntoView({ behavior: "smooth" })}><span>Explorer</span><ArrowDown size={15} /></button>
        <p className="hero-index">01 <span>/</span> 02</p>
      </section>

      <section className="rooms-section" id="salons" ref={roomsRef} aria-labelledby="rooms-title">
        <div className="rooms-heading">
          <div><p className="section-kicker">Salons ouverts</p><h2 id="rooms-title">Défiez d’autres joueurs.</h2></div>
        </div>

        <div className="room-grid">
          {rooms.map((room) => (
            <Link className={`room-card ${room.difficulty}`} href={`/game?room=${room.difficulty}`} key={room.name}>
              <div className="room-visual" aria-hidden="true">
                <img className="room-visual-image" src="/room-fibers.png" alt="" />
                <img className="room-visual-mark" src="/loader-mark-white.png" alt="" />
              </div>
              <div className="room-body"><h3>{room.name}</h3><span className="room-description">{room.description}</span></div>
              <div className="room-meta">
                <div className="room-players" aria-label={`${room.players} joueurs dans ce salon`}>
                  <span className="room-avatars" aria-hidden="true">{room.avatars.map((avatar) => <img src={avatar} alt="" key={avatar} />)}</span>
                  <strong>+{room.players - room.avatars.length}</strong>
                </div>
                <span className="room-arrow"><ArrowRight size={20} /></span>
              </div>
            </Link>
          ))}
        </div>

        <div className="private-actions-grid">
          <div
            className="private-action private-join"
            onClick={(event) => {
              if ((event.target as HTMLElement).closest("input, button")) return;
              focusFirstAvailablePrivateCodeInput();
            }}
          >
            <div className="private-access-copy">
              <span className="private-icon"><LockKeyhole size={18} /></span>
              <div><h3>Rejoindre une partie</h3><p>Entrez le code du salon</p></div>
            </div>
            <form className="private-code-form" onSubmit={joinPrivateRoom}>
              <div className="private-code-entry">
                <div className="private-code-slots" role="group" aria-label="Code de la partie privée">
                  {privateCode.map((character, index) => (
                    <input
                      className="private-code-slot"
                      key={index}
                      ref={(element) => { privateCodeInputsRef.current[index] = element; }}
                      value={character}
                      onChange={(event) => updatePrivateCode(index, event.target.value)}
                      onPaste={(event) => {
                        event.preventDefault();
                        updatePrivateCode(index, event.clipboardData.getData("text"));
                      }}
                      onKeyDown={(event) => {
                        if (event.key === "Backspace" && !character && index > 0) {
                          event.preventDefault();
                          setPrivateCode((current) => current.map((item, itemIndex) => itemIndex === index - 1 ? "" : item));
                          privateCodeInputsRef.current[index - 1]?.focus();
                        } else if (event.key === "ArrowLeft" && index > 0) {
                          event.preventDefault();
                          privateCodeInputsRef.current[index - 1]?.focus();
                        } else if (event.key === "ArrowRight" && index < 3) {
                          event.preventDefault();
                          privateCodeInputsRef.current[index + 1]?.focus();
                        }
                      }}
                      aria-label={`Caractère ${index + 1} du code`}
                      inputMode="text"
                      maxLength={1}
                      autoCapitalize="characters"
                      autoComplete={index === 0 ? "one-time-code" : "off"}
                    />
                  ))}
                </div>
                <button type="submit" disabled={privateCode.some((character) => !character)} aria-label="Rejoindre la partie privée"><ArrowRight size={19} /></button>
              </div>
            </form>
          </div>
          <Link className="private-action private-create" href="/create">
            <div className="private-access-copy">
              <span className="private-icon"><Plus size={19} /></span>
              <div><h3>Créer une partie</h3><p>Configurez votre salon privé</p></div>
            </div>
            <span className="private-action-arrow"><ArrowRight size={19} /></span>
          </Link>
        </div>

        <div className="rooms-footer" id="classement"><p><span className="pulse-dot" /> 58 joueurs en ligne</p></div>
      </section>
      </main>
    </>
  );
}
