import clsx from "clsx";
import type { ReactNode } from "react";
import { themeMeta } from "../../lib/themeMeta";

export type QuestionCardProps = {
  theme?: string | null;
  index?: number | null;
  total?: number | null;
  text?: ReactNode;
  className?: string;
  headerClassName?: string;
  bodyClassName?: string;
};

export function QuestionCard({
  theme,
  index,
  total,
  text,
  className,
  headerClassName,
  bodyClassName,
}: QuestionCardProps) {
  const meta = themeMeta(theme);
  const hasProgress = typeof index === "number" && typeof total === "number" && total > 0;

  return (
    <div
      className={clsx(
        "rounded-2xl border border-white/15 bg-black/70 px-5 py-3 backdrop-blur-md",
        "shadow-[0_12px_24px_rgba(0,0,0,.35)]",
        className,
      )}
    >
      <div className={clsx("flex items-center justify-between", headerClassName)}>
        <div className="flex items-center gap-2">
          <span
            aria-hidden
            className="inline-block h-2.5 w-2.5 rounded-full"
            style={{ backgroundColor: meta.color }}
          />
          <span className="text-[12px] uppercase tracking-wider opacity-80">{meta.label}</span>
        </div>
        {hasProgress ? (
          <span className="tabular-nums text-[12px] opacity-80">
            {Math.max(1, index! + 1)}/{Math.max(total!, index! + 1)}
          </span>
        ) : null}
      </div>

      <div
        className={clsx(
          "mt-2 max-h-[calc(100%-22px)] overflow-auto pr-1",
          "text-[18px] font-medium leading-snug tracking-[0.2px]",
          bodyClassName,
        )}
      >
        {text}
      </div>
    </div>
  );
}