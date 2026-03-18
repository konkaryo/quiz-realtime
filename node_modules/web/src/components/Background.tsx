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
        // className={`${sharedClassName} pointer-events-none bg-[linear-gradient(to_bottom,rgba(194,115,247,0.15),transparent_0%),radial-gradient(circle_at_bottom,rgba(12,18,34,0.95),#020617)]`}
        className={`${sharedClassName} pointer-events-none bg-[linear-gradient(to_bottom,rgba(194,115,247,0.15),transparent_30%),radial-gradient(circle_at_bottom,rgba(12,18,34,1),#0D0E17)]`}
      />
    </>
  );
}