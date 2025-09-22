// web/src/components/NavBar.tsx
import { Link, NavLink } from "react-router-dom";
import { Trophy, Swords, Users2, MapPinned, Globe2, Timer, Target } from "lucide-react";

type Item = { to: string; title: string; desc: string; icon: React.ReactNode };

function MenuCard({ to, title, desc, icon }: Item) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition-colors"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500/70 to-sky-500/70 text-white shadow-inner">
          {icon}
        </div>
        <div>
          <div className="font-semibold text-white">{title}</div>
          <div className="text-xs text-white/70">{desc}</div>
        </div>
      </div>
    </Link>
  );
}

function DropDown({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <li className="relative group">
      <button
        className="px-3 py-2 font-semibold text-white/90 hover:text-white transition-colors"
      >
        {label}
      </button>

      {/* Layer */}
      <div className="pointer-events-none absolute left-0 top-full z-50 w-[720px] pt-2 opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="pointer-events-auto rounded-3xl border border-white/10 bg-gradient-to-b from-slate-900/90 to-slate-800/90 backdrop-blur-md shadow-2xl p-5">
          {children}
        </div>
      </div>
    </li>
  );
}

export default function NavBar() {
  return (
    <nav className="w-full">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4">
        {/* Left: brand + primary nav */}
        <div className="flex items-center gap-6">
          <NavLink
            to="/"
            className="flex items-center gap-2 rounded-xl bg-gradient-to-br from-indigo-500 to-sky-500 px-2 py-1 text-sm font-extrabold text-white shadow-sm"
          >
            Synapz
          </NavLink>

          <ul className="flex items-center gap-2">
            <DropDown label="Solo">
              <div className="grid grid-cols-2 gap-3">
                <MenuCard
                  to="/solo/classique"
                  title="Classique"
                  desc="Jouez à votre rythme, enchaînez les questions."
                  icon={<MapPinned size={18} />}
                />
                <MenuCard
                  to="/solo/entrainement"
                  title="Entraînement"
                  desc="Travaillez un thème précis sans pression."
                  icon={<Target size={18} />}
                />
                <MenuCard
                  to="/solo/chronometre"
                  title="Contre-la-montre"
                  desc="Répondez vite avant la fin du temps."
                  icon={<Timer size={18} />}
                />
                <MenuCard
                  to="/solo/defis"
                  title="Défis du jour"
                  desc="Un set quotidien à compléter."
                  icon={<Trophy size={18} />}
                />
              </div>
            </DropDown>

            <DropDown label="Multijoueur">
              <div className="grid grid-cols-2 gap-3">
                <MenuCard
                  to="/multi/duels"
                  title="Duels"
                  desc="Affrontez un joueur en 1v1."
                  icon={<Swords size={18} />}
                />
                <MenuCard
                  to="/multi/team-duels"
                  title="Team Duels"
                  desc="Formez une équipe et partez à la conquête."
                  icon={<Users2 size={18} />}
                />
                <MenuCard
                  to="/multi/br-country"
                  title="Battle Royale — Pays"
                  desc="Restez en lice en devinant le pays."
                  icon={<Globe2 size={18} />}
                />
                <MenuCard
                  to="/multi/br-distance"
                  title="Battle Royale — Distance"
                  desc="Le plus proche l’emporte, restez debout !"
                  icon={<MapPinned size={18} />}
                />
              </div>
            </DropDown>
          </ul>
        </div>

        {/* Right: place pour actions (profil, etc.) */}
        <div className="flex items-center gap-2">
          {/* exemples : <Link to="/shop" className="text-white/80 hover:text-white">Boutique</Link> */}
        </div>
      </div>
    </nav>
  );
}
