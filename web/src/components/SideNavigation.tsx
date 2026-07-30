import { CalendarDays, House, Trophy, UserRound } from "lucide-react";
import { NavLink } from "react-router-dom";

const items = [
  { to: "/", label: "Accueil", icon: House, end: true },
  { to: "/solo/daily", label: "Défi du jour", icon: CalendarDays },
  { to: "/multi/ranking", label: "Classement", icon: Trophy },
  { to: "/me/profile", label: "Profil", icon: UserRound },
];

/** Navigation contextuelle affichée sur les écrans larges de l'accueil. */
export default function SideNavigation() {
  return (
    <aside className="side-navigation" aria-label="Navigation principale">
      <nav className="side-navigation__links">
        {items.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `side-navigation__link${isActive ? " side-navigation__link--active" : ""}`
            }
          >
            <Icon className="side-navigation__icon" aria-hidden="true" strokeWidth={2} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}