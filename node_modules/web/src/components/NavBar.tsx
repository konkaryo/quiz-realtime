// web/src/components/NavBar.tsx
import { Link, NavLink } from "react-router-dom";
import { Trophy, Swords, Users2, MapPinned, Globe2, Timer, Target } from "lucide-react";

type Item = { to: string; title: string; desc: string; icon: React.ReactNode };

function MenuCard({ to, title, desc, icon }: Item) {
  return (
    <Link
      to={to}
      className="group block rounded-2xl border border-white/10 bg-slate-900/70 p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)] transition-all hover:border-white/20 hover:bg-slate-800/80 hover:shadow-[0_12px_30px_-18px_rgba(15,23,42,0.9)]"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-sky-500/70 via-blue-500/70 to-indigo-500/70 text-white shadow-[inset_0_0_12px_rgba(15,23,42,0.6)]">
          {icon}
        </div>
        <div>
          <div className="font-semibold text-white/95">{title}</div>
          <div className="text-xs text-white/60">{desc}</div>
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
        className="px-3 py-2 text-sm font-semibold uppercase tracking-wide text-white/75 transition-colors hover:text-white"
      >
        {label}
      </button>

      {/* Layer */}
      <div className="pointer-events-none absolute left-0 top-full z-50 w-[720px] pt-2 opacity-0 transition-all group-hover:opacity-100 group-focus-within:opacity-100">
        <div className="pointer-events-auto rounded-3xl border border-white/10 bg-gradient-to-b from-slate-950/95 via-slate-900/90 to-slate-800/90 p-5 shadow-[0_18px_60px_-35px_rgba(15,23,42,0.9)] backdrop-blur-md">
          {children}
        </div>
      </div>
    </li>
  );
}

export default function NavBar() {
  return (
    <nav className="w-full border-b border-white/10 bg-gradient-to-b from-[#1b1f27] via-[#151a22] to-[#0f141c] shadow-[0_8px_30px_-20px_rgba(15,23,42,0.8)]">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        {/* Left: brand + primary nav */}
        <div className="flex items-center gap-6">
          <NavLink
            to="/"
            className="flex items-center gap-2 rounded-xl border border-white/10 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-950 px-3 py-2 text-sm font-extrabold uppercase tracking-widest text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
          >
            Synapz
          </NavLink>

          <ul className="flex items-center gap-2 rounded-2xl border border-white/5 bg-white/5 px-2 py-1 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
