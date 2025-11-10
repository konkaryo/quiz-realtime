import { useEffect, useRef, useState } from "react";
import { TimerBadge } from "../components/game/TimerBadge";
import { TimerBar } from "../components/game/TimerBar";
import { QuestionCard } from "../components/game/QuestionCard";

const TOTAL_TIME_MS = 3 * 60 * 1000;
const SAMPLE_QUESTION = {
  theme: "MUSIQUE",
  index: 3,
  total: 10,
  text: "Qui interprète le titre \"Livin' on a Prayer\" (1986) ?",
};

export default function DailyChallengePlayPage() {
  const [remainingMs, setRemainingMs] = useState(TOTAL_TIME_MS);
  const barRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const el = barRef.current;
    if (!el) return;
    el.style.transition = "none";
    el.style.transformOrigin = "left";
    el.style.transform = "scaleX(1)";
    const animationFrame = requestAnimationFrame(() => {
      if (!barRef.current) return;
      barRef.current.style.transition = `transform ${TOTAL_TIME_MS}ms linear`;
      barRef.current.style.transform = "scaleX(0)";
    });
    return () => {
      cancelAnimationFrame(animationFrame);
    };
  }, []);

  useEffect(() => {
    const startedAt = Date.now();
    setRemainingMs(TOTAL_TIME_MS);
    const intervalId = window.setInterval(() => {
      const elapsed = Date.now() - startedAt;
      const remaining = Math.max(0, TOTAL_TIME_MS - elapsed);
      setRemainingMs(remaining);
      if (remaining <= 0) {
        window.clearInterval(intervalId);
      }
    }, 250);
    return () => {
      window.clearInterval(intervalId);
    };
  }, []);
  const remainingSeconds = Math.ceil(remainingMs / 1000);
  const urgent = remainingSeconds <= 5;

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.12),_transparent_55%)] bg-[#090311] text-white">
      <div className="flex min-h-screen flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-[560px] space-y-8">
          <TimerBar ref={barRef} urgent={urgent} />
          <div className="flex justify-center">
            <TimerBadge seconds={remainingSeconds} />
          </div>
          <QuestionCard
            theme={SAMPLE_QUESTION.theme}
            index={SAMPLE_QUESTION.index}
            total={SAMPLE_QUESTION.total}
            text={SAMPLE_QUESTION.text}
          />
        </div>
      </div>
    </div>
  );
}