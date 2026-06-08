import "./JoinLoadingScreen.css";

type JoinLoadingScreenProps = {
  offsetTop?: number;
};

export default function JoinLoadingScreen({
  offsetTop = 0,
}: JoinLoadingScreenProps) {
  return (
    <div
      className="join-loading-screen"
      style={{
        top: offsetTop,
        ["--join-loading-bg-offset" as string]: `${-offsetTop}px`,
        ["--join-loading-center" as string]: "40%",
      }}
      role="status"
      aria-live="polite"
    >
      <div aria-hidden className="join-loading-screen__base" />
      <div aria-hidden className="join-loading-screen__radials" />
      <svg
        aria-hidden="true"
        className="join-loading-screen__waves"
        preserveAspectRatio="none"
        viewBox="0 0 1440 900"
      >
        <defs>
          <linearGradient id="joinLoadingWaveA" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#0A132E" stopOpacity="0.06" />
            <stop offset="45%" stopColor="#1C2A52" stopOpacity="0.42" />
            <stop offset="100%" stopColor="#0A132E" stopOpacity="0.06" />
          </linearGradient>
          <linearGradient id="joinLoadingWaveB" x1="0" x2="1" y1="0" y2="0">
            <stop offset="0%" stopColor="#071028" stopOpacity="0.02" />
            <stop offset="52%" stopColor="#22315A" stopOpacity="0.36" />
            <stop offset="100%" stopColor="#071028" stopOpacity="0.02" />
          </linearGradient>
        </defs>
        <path
          d="M-120 220 C 180 105 390 270 650 175 C 900 85 1110 175 1560 70 L1560 0 L-120 0 Z"
          fill="url(#joinLoadingWaveA)"
        />
        <path
          d="M-120 500 C 180 390 410 545 700 440 C 980 340 1160 420 1560 330 L1560 170 C 1130 265 970 185 690 290 C 410 395 170 250 -120 350 Z"
          fill="url(#joinLoadingWaveB)"
        />
        <path
          d="M-120 760 C 210 650 430 785 720 690 C 1010 595 1190 675 1560 575 L1560 430 C 1160 535 990 455 715 550 C 425 650 210 520 -120 620 Z"
          fill="url(#joinLoadingWaveA)"
          opacity="0.66"
        />
        <path
          d="M-120 350 C 170 250 410 395 690 290 C 970 185 1130 265 1560 170"
          fill="none"
          stroke="#314474"
          strokeOpacity="0.14"
          strokeWidth="2"
        />
        <path
          d="M-120 620 C 210 520 425 650 715 550 C 990 455 1160 535 1560 430"
          fill="none"
          stroke="#2A3B68"
          strokeOpacity="0.12"
          strokeWidth="2"
        />
      </svg>
      <div aria-hidden className="join-loading-screen__overlay" />
      <div className="join-loading-screen__content">
        <svg
          className="microchip"
          viewBox="0 0 128 128"
          width="128"
          height="128"
          role="img"
          aria-label="Une puce carrée apparaît et émet des vagues, des lignes et des étincelles"
        >
          <symbol id="dot-1">
            <circle r="3" cx="3" cy="38" />
          </symbol>
          <symbol id="dot-2">
            <circle r="3" cx="3" cy="54" />
          </symbol>
          <symbol id="dot-3">
            <circle r="3" cx="3" cy="70" />
          </symbol>
          <symbol id="dot-4">
            <circle r="3" cx="3" cy="3" />
          </symbol>
          <symbol id="dot-5">
            <circle r="3" cx="20" cy="3" />
          </symbol>
          <symbol id="dot-6">
            <circle r="3" cx="3" cy="30" />
          </symbol>
          <symbol id="dot-7">
            <circle r="3" cx="37" cy="3" />
          </symbol>
          <symbol id="dot-8">
            <circle r="3" cx="54" cy="3" />
          </symbol>
          <symbol id="dot-9">
            <circle r="3" cx="71" cy="3" />
          </symbol>

          <symbol id="line-1">
            <polyline points="12 54,12 46,3 46,3 38" strokeDasharray="42 42" />
          </symbol>
          <symbol id="line-2">
            <polyline points="29 54,3 54" strokeDasharray="42 42" />
          </symbol>
          <symbol id="line-3">
            <polyline points="12 54,12 62,3 62,3 70" strokeDasharray="42 42" />
          </symbol>
          <symbol id="line-4">
            <polyline points="28 20,28 12,20 12,20 3" strokeDasharray="60 60" />
          </symbol>
          <symbol id="line-5">
            <polyline points="37 29,37 20,3 20,3 3" strokeDasharray="60 60" />
          </symbol>
          <symbol id="line-6">
            <polyline points="15 20,15 30,3 30" strokeDasharray="60 60" />
          </symbol>
          <symbol id="line-7">
            <polyline points="54 12,37 12,37 3" strokeDasharray="43 43" />
          </symbol>
          <symbol id="line-8">
            <polyline points="54 29,54 3" strokeDasharray="43 43" />
          </symbol>
          <symbol id="line-9">
            <polyline points="54 12,71 12,71 3" strokeDasharray="43 43" />
          </symbol>

          <symbol id="spark-1">
            <polyline points="12 54,12 46,3 46,3 38" strokeDasharray="15 69" />
          </symbol>
          <symbol id="spark-2">
            <polyline points="29 54,3 54" strokeDasharray="15 69" />
          </symbol>
          <symbol id="spark-3">
            <polyline points="12 54,12 62,3 62,3 70" strokeDasharray="15 69" />
          </symbol>
          <symbol id="spark-4">
            <polyline points="28 20,28 12,20 12,20 3" strokeDasharray="15 105" />
          </symbol>
          <symbol id="spark-5">
            <polyline points="37 29,37 20,3 20,3 3" strokeDasharray="15 105" />
          </symbol>
          <symbol id="spark-6">
            <polyline points="15 20,15 30,3 30" strokeDasharray="15 105" />
          </symbol>
          <symbol id="spark-7">
            <polyline points="54 12,37 12,37 3" strokeDasharray="15 71" />
          </symbol>
          <symbol id="spark-8">
            <polyline points="54 29,54 3" strokeDasharray="15 71" />
          </symbol>
          <symbol id="spark-9">
            <polyline points="54 12,71 12,71 3" strokeDasharray="15 71" />
          </symbol>

          <symbol id="wave">
            <rect x="3" y="3" rx="2.5" ry="2.5" width="44" height="44" />
          </symbol>

          <g transform="translate(10,10)">
            <g className="microchip__lines" strokeLinecap="round" strokeLinejoin="round">
              <g>
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--1" href="#line-1" />
                  <use className="microchip__spark microchip__spark--1" href="#spark-1" />
                  <use className="microchip__line microchip__line--2" href="#line-2" />
                  <use className="microchip__spark microchip__spark--2" href="#spark-2" />
                  <use className="microchip__line microchip__line--3" href="#line-3" />
                  <use className="microchip__spark microchip__spark--3" href="#spark-3" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--1" href="#dot-1" />
                  <use className="microchip__dot microchip__dot--2" href="#dot-2" />
                  <use className="microchip__dot microchip__dot--3" href="#dot-3" />
                </g>
              </g>
              <g>
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--4" href="#line-4" />
                  <use className="microchip__spark microchip__spark--4" href="#spark-4" />
                  <use className="microchip__line microchip__line--5" href="#line-5" />
                  <use className="microchip__spark microchip__spark--5" href="#spark-5" />
                  <use className="microchip__line microchip__line--6" href="#line-6" />
                  <use className="microchip__spark microchip__spark--6" href="#spark-6" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--4" href="#dot-4" />
                  <use className="microchip__dot microchip__dot--5" href="#dot-5" />
                  <use className="microchip__dot microchip__dot--6" href="#dot-6" />
                </g>
              </g>
              <g>
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--7" href="#line-7" />
                  <use className="microchip__spark microchip__spark--7" href="#spark-7" />
                  <use className="microchip__line microchip__line--8" href="#line-8" />
                  <use className="microchip__spark microchip__spark--8" href="#spark-8" />
                  <use className="microchip__line microchip__line--9" href="#line-9" />
                  <use className="microchip__spark microchip__spark--9" href="#spark-9" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--7" href="#dot-7" />
                  <use className="microchip__dot microchip__dot--8" href="#dot-8" />
                  <use className="microchip__dot microchip__dot--9" href="#dot-9" />
                </g>
              </g>
              <g transform="translate(108,0) scale(-1,1)">
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--4" href="#line-4" />
                  <use className="microchip__spark microchip__spark--4" href="#spark-4" />
                  <use className="microchip__line microchip__line--5" href="#line-5" />
                  <use className="microchip__spark microchip__spark--5" href="#spark-5" />
                  <use className="microchip__line microchip__line--6" href="#line-6" />
                  <use className="microchip__spark microchip__spark--6" href="#spark-6" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--4" href="#dot-4" />
                  <use className="microchip__dot microchip__dot--5" href="#dot-5" />
                  <use className="microchip__dot microchip__dot--6" href="#dot-6" />
                </g>
              </g>
              <g transform="translate(108,0) scale(-1,1)">
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--1" href="#line-1" />
                  <use className="microchip__spark microchip__spark--1" href="#spark-1" />
                  <use className="microchip__line microchip__line--2" href="#line-2" />
                  <use className="microchip__spark microchip__spark--2" href="#spark-2" />
                  <use className="microchip__line microchip__line--3" href="#line-3" />
                  <use className="microchip__spark microchip__spark--3" href="#spark-3" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--1" href="#dot-1" />
                  <use className="microchip__dot microchip__dot--2" href="#dot-2" />
                  <use className="microchip__dot microchip__dot--3" href="#dot-3" />
                </g>
              </g>
              <g transform="translate(108,108) scale(-1,-1)">
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--4" href="#line-4" />
                  <use className="microchip__spark microchip__spark--4" href="#spark-4" />
                  <use className="microchip__line microchip__line--5" href="#line-5" />
                  <use className="microchip__spark microchip__spark--5" href="#spark-5" />
                  <use className="microchip__line microchip__line--6" href="#line-6" />
                  <use className="microchip__spark microchip__spark--6" href="#spark-6" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--4" href="#dot-4" />
                  <use className="microchip__dot microchip__dot--5" href="#dot-5" />
                  <use className="microchip__dot microchip__dot--6" href="#dot-6" />
                </g>
              </g>
              <g transform="translate(0,108) scale(1,-1)">
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--7" href="#line-7" />
                  <use className="microchip__spark microchip__spark--7" href="#spark-7" />
                  <use className="microchip__line microchip__line--8" href="#line-8" />
                  <use className="microchip__spark microchip__spark--8" href="#spark-8" />
                  <use className="microchip__line microchip__line--9" href="#line-9" />
                  <use className="microchip__spark microchip__spark--9" href="#spark-9" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--7" href="#dot-7" />
                  <use className="microchip__dot microchip__dot--8" href="#dot-8" />
                  <use className="microchip__dot microchip__dot--9" href="#dot-9" />
                </g>
              </g>
              <g transform="translate(0,108) scale(1,-1)">
                <g fill="none" stroke="currentcolor">
                  <use className="microchip__line microchip__line--4" href="#line-4" />
                  <use className="microchip__spark microchip__spark--4" href="#spark-4" />
                  <use className="microchip__line microchip__line--5" href="#line-5" />
                  <use className="microchip__spark microchip__spark--5" href="#spark-5" />
                  <use className="microchip__line microchip__line--6" href="#line-6" />
                  <use className="microchip__spark microchip__spark--6" href="#spark-6" />
                </g>
                <g fill="currentcolor">
                  <use className="microchip__dot microchip__dot--4" href="#dot-4" />
                  <use className="microchip__dot microchip__dot--5" href="#dot-5" />
                  <use className="microchip__dot microchip__dot--6" href="#dot-6" />
                </g>
              </g>
            </g>

            <g transform="translate(29,29)">
              <g className="microchip__center">
                <g fill="none" stroke="currentcolor" strokeWidth="6">
                  <use className="microchip__wave microchip__wave--1" href="#wave" />
                  <use className="microchip__wave microchip__wave--2" href="#wave" />
                </g>
                <rect
                  className="microchip__core"
                  fill="currentcolor"
                  rx="5"
                  ry="5"
                  width="50"
                  height="50"
                />
              </g>
            </g>
          </g>
        </svg>
      </div>
    </div>
  );
}