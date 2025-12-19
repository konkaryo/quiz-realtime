type BackgroundProps = {
  particleCount?: number;
  position?: "fixed" | "absolute";
  className?: string;
};

export default function Background({
  particleCount = 18,
  position = "fixed",
  className,
}: BackgroundProps) {
  const positionClass = position === "absolute" ? "absolute" : "fixed";
  const sharedClassName = [positionClass, "inset-0", "z-0", className].filter(Boolean).join(" ");
  return (
    <>
      <div
        aria-hidden
        className={`${sharedClassName} bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308]`}
      />
      <div
        aria-hidden
        className={`${sharedClassName} pointer-events-none bg-[linear-gradient(to_top,rgba(248,113,113,0.15),transparent_60%),radial-gradient(circle_at_top,rgba(12,18,34,0.95),#020617)]`}
      />
      <div aria-hidden className={`${sharedClassName} pointer-events-none`}>
        {Array.from({ length: particleCount }).map((_, index) => (
          <div
            key={index}
            className="absolute h-[3px] w-[3px] rounded-full bg-rose-200/40"
            style={{
              top: `${Math.random() * 100}%`,
              left: `${Math.random() * 100}%`,
              opacity: 0.55,
            }}
          />
        ))}
      </div>
    </>
  );
}