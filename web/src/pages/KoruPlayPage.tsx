import { Link } from "react-router-dom";

import arenaImageUrl from "@/assets/arena.png";
import arenaIconUrl from "@/assets/arena_icon.png";
import battleRoyaleImageUrl from "@/assets/battle_royale.png";
import battleRoyaleIconUrl from "@/assets/battle_royale_icon.png";
import dailyChallengeImageUrl from "@/assets/daily_challenge.png";
import dailyChallengeIconUrl from "@/assets/daily_challenge_icon.png";
import paperBackgroundUrl from "@/assets/paper-bg.png";
import privateGameImageUrl from "@/assets/private_game.png";
import privateGameIconUrl from "@/assets/private_game_icon.png";

import "./KoruPlayPage.css";

const dailyProgress = ["done", "done", "done", "missed", "waiting"] as const;

export default function KoruPlayPage() {
  return (
    <main className="koru-play" style={{ backgroundImage: `url(${paperBackgroundUrl})` }}>
      <section className="koru-play__content" aria-labelledby="koru-play-title">
        <header className="koru-play__header">
          <h1 id="koru-play-title">Modes de jeu</h1>
          <span aria-hidden="true" />
        </header>

        <div className="koru-play__modes">
          <article className="koru-play__battle">
            <ModeContents
              icon={battleRoyaleIconUrl}
              image={battleRoyaleImageUrl}
              title="Battle Royale"
            />
          </article>

          <div className="koru-play__mode-list">
            <Link className="koru-play__mode" to="/multi/public">
              <ModeContents icon={arenaIconUrl} image={arenaImageUrl} title="Arène" />
            </Link>

            <Link className="koru-play__mode" to="/solo/daily">
              <ModeContents icon={dailyChallengeIconUrl} image={dailyChallengeImageUrl} title="Défi du jour">
                <div className="koru-play__progress" aria-label="Progression : trois réussites, un échec, un jour à venir">
                  {dailyProgress.map((status, index) => (
                    <span key={`${status}-${index}`} className={`koru-play__progress-item koru-play__progress-item--${status}`}>
                      {status === "done" ? "✓" : status === "missed" ? "×" : "–"}
                    </span>
                  ))}
                </div>
              </ModeContents>
            </Link>

            <Link className="koru-play__mode" to="/private/join">
              <ModeContents icon={privateGameIconUrl} image={privateGameImageUrl} title="Partie privée" />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}

function ModeContents({ icon, image, title, children }: { icon: string; image: string; title: string; children?: React.ReactNode }) {
  return (
    <>
      <img className="koru-play__art" src={image} alt="" />
      <div className="koru-play__mode-copy">
        <img className="koru-play__mode-icon" src={icon} alt="" />
        <div>
          <h2>{title}</h2>
          <span className="koru-play__underline" aria-hidden="true" />
          {children}
        </div>
      </div>
    </>
  );
}