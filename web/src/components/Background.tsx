type BackgroundProps = {
  particleCount?: number;
};

export default function Background({
  particleCount = 18,
}: BackgroundProps) {
  return (
    <>
      <div
        aria-hidden
        className="fixed inset-0 z-0 bg-gradient-to-br from-[#050816] via-[#050014] to-[#1b0308]"
      />
      <div
        aria-hidden
        className="pointer-events-none fixed inset-0 z-0 bg-[linear-gradient(to_top,rgba(248,113,113,0.15),transparent_60%),radial-gradient(circle_at_top,rgba(12,18,34,0.95),#020617)]"
      />
      <div aria-hidden className="pointer-events-none fixed inset-0 z-0">
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