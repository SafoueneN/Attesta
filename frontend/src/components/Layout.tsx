import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useSession } from "../auth/session";
import { Button } from "./ui";

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.classList.contains("dark"));
  const toggle = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.classList.toggle("dark", next);
    try {
      localStorage.setItem("attesta-theme", next ? "sombre" : "clair");
    } catch {
      // préférence non mémorisée : sans conséquence
    }
  };
  return (
    <Button variant="ghost" onClick={toggle} aria-pressed={dark}>
      {dark ? "Thème clair" : "Thème sombre"}
    </Button>
  );
}

const navLink = ({ isActive }: { isActive: boolean }) =>
  `rounded-md px-3 py-2 text-sm font-medium ${
    isActive
      ? "bg-brand-50 text-brand-900 dark:bg-slate-800 dark:text-brand-100"
      : "text-slate-700 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
  }`;

/**
 * Gabarit commun : lien d'évitement, bandeau, navigation selon le rôle, pied de page. À chaque
 * changement de page, le focus va au contenu principal (ADR 0022, point 5).
 */
export function Layout() {
  const { user, isAccount, isAdmin, signOut } = useSession();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    setMenu(false);
    if (first.current) {
      first.current = false;
      return;
    }
    main.current?.focus();
    window.scrollTo({ top: 0 });
  }, [location.pathname]);

  const links = [
    { to: "/cv", label: "Créer un CV" },
    { to: "/mes-cv", label: "Mes CV" },
    { to: "/offres", label: "Offres" },
    ...(isAccount
      ? [
          { to: "/lettres", label: "Lettres" },
          { to: "/veille", label: "Veille emploi" },
        ]
      : []),
    ...(isAdmin ? [{ to: "/admin", label: "Administration" }] : []),
  ];

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenu"
        className="sr-only z-50 rounded bg-brand-700 px-4 py-2 text-white focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Aller au contenu
      </a>
      <header className="border-b border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-2 px-4 py-3">
          <Link to="/" className="mr-4 flex items-center gap-2 text-lg font-bold">
            <img src="/favicon.svg" alt="" className="size-7" />
            Attesta
            <span className="hidden text-sm font-normal text-slate-500 sm:inline dark:text-slate-400">
              le CV qui dit vrai
            </span>
          </Link>
          <Button
            variant="ghost"
            className="ml-auto md:hidden"
            aria-expanded={menu}
            aria-controls="navigation"
            onClick={() => setMenu(!menu)}
          >
            Menu
          </Button>
          <nav
            id="navigation"
            aria-label="Navigation principale"
            className={`${menu ? "flex" : "hidden"} w-full flex-col gap-1 md:flex md:w-auto md:flex-row`}
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navLink}>
                {l.label}
              </NavLink>
            ))}
          </nav>
          <div
            className={`${menu ? "flex" : "hidden"} w-full items-center gap-2 md:ml-auto md:flex md:w-auto`}
          >
            <ThemeToggle />
            {isAccount ? (
              <>
                <NavLink to="/compte" className={navLink}>
                  Mon compte
                </NavLink>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Se déconnecter
                </Button>
              </>
            ) : (
              user && (
                <Link
                  to="/connexion"
                  className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
                >
                  Se connecter
                </Link>
              )
            )}
          </div>
        </div>
      </header>
      <main
        id="contenu"
        ref={main}
        tabIndex={-1}
        className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 outline-none"
      >
        <Outlet />
      </main>
      <footer className="border-t border-slate-200 py-6 text-sm text-slate-600 dark:border-slate-800 dark:text-slate-400">
        <div className="mx-auto flex max-w-6xl flex-wrap gap-4 px-4">
          <p>Attesta n'invente rien : chaque ligne de votre CV renvoie à votre profil.</p>
          <Link to="/confidentialite" className="link ml-auto">
            Confidentialité
          </Link>
        </div>
      </footer>
    </div>
  );
}
