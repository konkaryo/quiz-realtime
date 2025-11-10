import clsx from "clsx";
import { forwardRef } from "react";
import type { CSSProperties } from "react";

export type TimerBarProps = {
  urgent?: boolean;
  className?: string;
  barClassName?: string;
  barStyle?: CSSProperties;
  ariaLabel?: string;
};

export const TimerBar = forwardRef<HTMLDivElement, TimerBarProps>(
  function TimerBar(
    { urgent = false, className, barClassName, barStyle, ariaLabel = "Temps restant" },
    ref,
  ) {
    return (
      <div
        className={clsx(
          "h-[6px] w-full overflow-hidden rounded-full bg-white/15 shadow-[inset_0_1px_1px_rgba(0,0,0,.35)]",
          className,
        )}
      >
        <div
          ref={ref}
          aria-label={ariaLabel}
          className={clsx(
            "h-full",
            urgent
              ? "bg-rose-400"
              : "bg-[linear-gradient(90deg,#fff_0%,#ffe8fb_60%,#ffd6f9_100%)]",
            barClassName,
          )}
          style={{ transform: "scaleX(1)", transformOrigin: "left", willChange: "transform", ...barStyle }}
        />
      </div>
    );
  },
);

TimerBar.displayName = "TimerBar";