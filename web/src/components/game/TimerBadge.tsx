// web/src/components/game/TimerBadge.tsx
import clsx from "clsx";

export type TimerBadgeProps = {
  seconds: number | null;
  className?: string;
};

export function TimerBadge({ seconds, className }: TimerBadgeProps) {
  const raw = seconds ?? 0;
  const clamped = Math.max(0, raw);
  const display = String(clamped).padStart(2, "0");
  const urgent = clamped <= 5;

  return (
    <div
      aria-live="polite"
      className={clsx("flex flex-col items-center", className)}
    >
      <span
        className={clsx(
          "font-semibold tabular-nums tracking-[0.05em] text-2xl",
          "leading-none",
          urgent ? "text-rose-400" : "text-white",
        )}
      >
      {display}
      </span>

    </div>
  );
}