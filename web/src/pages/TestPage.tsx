import { useCallback, useEffect, useState } from "react";
import paperUrl from "@/assets/paper.png";
import "./TestPage.css";

const QUESTIONS = [
  "Quelle est la capitale de l’Australie ?",
  "Combien de côtés possède un hexagone ?",
  "Quel peintre a réalisé La Nuit étoilée ?",
  "Dans quelle ville française peut-on admirer la basilique Notre-Dame de Fourvière ?",
  "Quel est le plus grand océan de la planète ?",
  "Quel scientifique a formulé la théorie de la relativité restreinte au début du XXe siècle ?",
  "En quelle année l’être humain a-t-il marché sur la Lune pour la première fois ?",
  "Comment appelle-t-on le phénomène naturel par lequel les plantes utilisent la lumière pour produire leur énergie ?",
  "Quel roman de Victor Hugo raconte le destin de Jean Valjean, ancien forçat poursuivi pendant des années par l’inspecteur Javert ?",
  "Quelle civilisation antique a construit la cité de Machu Picchu, perchée dans la cordillère des Andes au Pérou ?",
] as const;

function randomQuestionIndex(currentIndex: number) {
  const nextIndex = Math.floor(Math.random() * (QUESTIONS.length - 1));
  return nextIndex >= currentIndex ? nextIndex + 1 : nextIndex;
}

export default function TestPage() {
  const [questionIndex, setQuestionIndex] = useState(0);

  const showAnotherQuestion = useCallback(() => {
    setQuestionIndex((currentIndex) => randomQuestionIndex(currentIndex));
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Enter" || event.repeat) return;
      event.preventDefault();
      showAnotherQuestion();
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [showAnotherQuestion]);

  return (
    <section className="test-page" aria-labelledby="test-page-title">
      <div className="test-page__content">
        <p className="test-page__eyebrow">Laboratoire d’affichage</p>
        <h1 id="test-page-title" className="test-page__title">Test</h1>

        <div
          className="test-question"
          style={{ "--paper-image": `url(${paperUrl})` } as React.CSSProperties}
          aria-live="polite"
          aria-atomic="true"
        >
          <div className="test-question__paper">
            <p>{QUESTIONS[questionIndex]}</p>
          </div>
        </div>

        <button className="test-page__next" type="button" onClick={showAnotherQuestion}>
          <span>Question suivante</span>
          <kbd>Entrée</kbd>
        </button>
      </div>
    </section>
  );
}