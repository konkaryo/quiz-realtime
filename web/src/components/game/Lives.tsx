import clsx from "clsx";

export function Lives({
  lives,
  total,
  className,
}: {
  lives: number;
  total: number;
  className?: string;
}) {
  const safeLives = Math.max(0, Math.min(total, lives));
  const full = Array.from({ length: safeLives }).map((_, index) => (
    <span key={`full-${index}`} aria-hidden>
      ❤️
    </span>
  ));
  const empty = Array.from({ length: Math.max(0, total - safeLives) }).map((_, index) => (
    <span key={`empty-${index}`} aria-hidden className="opacity-30">
      ❤️
    </span>
  ));

  return (
    <div
      className={clsx("flex items-center gap-[6px] text-[22px] leading-none", className)}
      aria-label={`${safeLives} vie${safeLives > 1 ? "s" : ""}`}
    >
      {full}
      {empty}
    </div>
  );
}