import { House, UserRound } from "lucide-react";
import keyIconUrl from "@/assets/key_icon.png";
import cardsIconUrl from "@/assets/cards.png";
import rankingIconUrl from "@/assets/ranking.png";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Accueil", icon: House, end: true },
  { to: "/rooms/new", label: "Créer une partie", image: cardsIconUrl },
  { to: "/private/join", label: "Rejoindre une partie", image: keyIconUrl },
  { to: "/multi/ranking", label: "Classement", image: rankingIconUrl },
  { to: "/me/profile", label: "Profil", icon: UserRound },
];

/** Navigation contextuelle affichée sur les écrans larges de l'accueil. */
export default function SideNavigation() {
  return (
    <aside className="side-navigation" aria-label="Navigation principale">
      <nav className="side-navigation__links">
        {items.map(({ to, label, icon: Icon, image, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `side-navigation__link${isActive ? " side-navigation__link--active" : ""}`
            }
          >
            {image ? <img className="side-navigation__icon" src={image} alt="" aria-hidden="true" /> : Icon ? <Icon className="side-navigation__icon" aria-hidden="true" strokeWidth={2} /> : null}
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}