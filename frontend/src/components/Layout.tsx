import { Suspense, useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router";
import { useSession } from "../auth/session";
import { useCardSpotlight, useRipple } from "../lib/motion";
import { Button, buttonClass, Loading } from "./ui";

/** Icônes en trait, décoratives : le nom accessible est toujours porté par le texte du bouton. */
function Icon({ path, className = "size-5" }: { path: string; className?: string }) {
  return (
    <svg
      aria-hidden="true"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d={path} />
    </svg>
  );
}

const SUN =
  "M12 4V2m0 20v-2m8-8h2M2 12h2m13.66-5.66 1.41-1.41M4.93 19.07l1.41-1.41m0-11.32L4.93 4.93m14.14 14.14-1.41-1.41M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z";
const MOON = "M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11Z";

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
    <Button variant="ghost" onClick={toggle} aria-pressed={dark} className="text-ink-muted hover:text-ink">
      <Icon path={dark ? SUN : MOON} />
      <span className="md:sr-only xl:not-sr-only">{dark ? "Thème clair" : "Thème sombre"}</span>
    </Button>
  );
}

/** Onglet de navigation : soulignement d'accent sous la page courante, glissé à l'apparition. */
const navLink = ({ isActive }: { isActive: boolean }) =>
  `relative rounded-lg px-3 py-2 text-[0.95rem] font-semibold transition-colors after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:origin-left after:rounded-full after:bg-accent after:transition-transform after:duration-200 ${
    isActive
      ? "text-ink after:scale-x-100"
      : "text-ink-muted after:scale-x-0 hover:bg-surface-sunken hover:text-ink"
  }`;

/**
 * Groupe de liens du menu (« Mon espace ») : sur grand écran, un bouton qui déplie une liste ; sur mobile,
 * les liens sont affichés à plat. Se referme au changement de page, à Échap et au clic à l'extérieur.
 */
function NavGroup({ label, links }: { label: string; links: { to: string; label: string }[] }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  const box = useRef<HTMLDivElement>(null);
  const active = links.some((l) => location.pathname.startsWith(l.to));
  useEffect(() => setOpen(false), [location.pathname]);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !box.current?.contains(e.target as Node))
        setOpen(false);
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", close);
    };
  }, [open]);
  return (
    <>
      <div className="contents md:hidden">
        {links.map((l) => (
          <NavLink key={l.to} to={l.to} className={navLink}>
            {l.label}
          </NavLink>
        ))}
      </div>
      <div ref={box} className="relative hidden md:block">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={navLink({ isActive: active })}
        >
          {label}{" "}
          <span
            aria-hidden="true"
            className={`inline-block transition-transform ${open ? "rotate-180" : ""}`}
          >
            ▾
          </span>
        </button>
        {open && (
          <ul className="absolute top-full left-0 z-50 mt-2 min-w-52 animate-enter rounded-2xl border border-line bg-surface p-2 shadow-float">
            {links.map((l) => (
              <li key={l.to}>
                <NavLink
                  to={l.to}
                  className={({ isActive }) =>
                    `block rounded-xl px-3 py-2 text-sm font-semibold ${isActive ? "bg-accent-soft text-ink" : "text-ink-muted hover:bg-surface-sunken hover:text-ink"}`
                  }
                >
                  {l.label}
                </NavLink>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

/**
 * Gabarit commun : lien d'évitement, bandeau collant, navigation selon le rôle, pied de page. À chaque
 * changement de page, le focus va au contenu principal (ADR 0022, point 5) et la page entre en fondu.
 */
export function Layout() {
  const { user, isAccount, isAdmin, signOut } = useSession();
  const location = useLocation();
  const main = useRef<HTMLElement>(null);
  const [menu, setMenu] = useState(false);
  const first = useRef(true);
  useCardSpotlight();
  useRipple();

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
    { to: "/assistants", label: "✦ Assistants" },
    { to: "/guide", label: "Guide" },
    ...(isAdmin ? [{ to: "/admin", label: "Administration" }] : []),
  ];
  // Espace du compte, regroupé : le menu tient sur une ligne en grand écran.
  const space = isAccount
    ? [
        { to: "/candidatures", label: "Mes candidatures" },
        { to: "/lettres", label: "Lettres" },
        { to: "/veille", label: "Veille emploi" },
        { to: "/justificatifs", label: "Justificatifs" },
        { to: "/compte", label: "Mon compte et rappels" },
      ]
    : [];

  return (
    <div className="flex min-h-screen flex-col">
      <a
        href="#contenu"
        className="sr-only z-[60] rounded-lg bg-accent px-4 py-2 font-semibold text-on-accent focus:not-sr-only focus:fixed focus:top-3 focus:left-3"
      >
        Aller au contenu
      </a>
      {/* Bandeau collant, papier translucide et flou : le contenu reste lisible en dessous. */}
      {/* Progression de lecture : fine barre citron, pilotée par le défilement (décorative). */}
      <div aria-hidden="true" className="scroll-progress fixed inset-x-0 top-0 z-50 h-0.5 bg-accent" />
      <header className="header-scroll sticky top-0 z-40 border-b border-line bg-paper/85 backdrop-blur-md backdrop-saturate-150">
        <div className="shell flex flex-wrap items-center gap-x-2 gap-y-1 py-3">
          <Link to="/" className="group mr-6 flex items-center gap-2.5">
            <img
              src="/favicon.svg"
              alt=""
              className="size-8 transition-transform duration-300 group-hover:-rotate-6"
            />
            <span className="font-display text-xl font-semibold tracking-tight">Attesta</span>
            <span className="hidden border-l border-line pl-2.5 text-sm text-ink-subtle lg:inline">
              le CV qui dit vrai
            </span>
          </Link>
          <Button
            variant="ghost"
            className="ml-auto text-ink md:hidden"
            aria-expanded={menu}
            aria-controls="navigation"
            onClick={() => setMenu(!menu)}
          >
            <Icon path={menu ? "M6 6l12 12M18 6 6 18" : "M4 7h16M4 12h16M4 17h16"} />
            Menu
          </Button>
          <nav
            id="navigation"
            aria-label="Navigation principale"
            className={`${menu ? "flex animate-enter" : "hidden"} w-full flex-col gap-1 pt-2 md:flex md:w-auto md:flex-row md:pt-0`}
          >
            {links.map((l) => (
              <NavLink key={l.to} to={l.to} className={navLink}>
                {l.label}
              </NavLink>
            ))}
            {space.length > 0 && <NavGroup label="Mon espace" links={space} />}
          </nav>
          <div
            className={`${menu ? "flex animate-enter" : "hidden"} w-full flex-wrap items-center gap-2 border-t border-line pt-3 pb-1 md:ml-auto md:flex md:w-auto md:border-0 md:p-0`}
          >
            <ThemeToggle />
            {isAccount ? (
              <>
                <Button variant="secondary" onClick={() => void signOut()}>
                  Se déconnecter
                </Button>
              </>
            ) : (
              user && (
                <Link to="/connexion" className={buttonClass("primary")}>
                  Se connecter
                </Link>
              )
            )}
          </div>
        </div>
      </header>
      <main id="contenu" ref={main} tabIndex={-1} className="shell flex-1 py-8 outline-none lg:py-12">
        {/* Clé = adresse : la page est recréée, et son entrée animée, à chaque navigation. Le parcours
            garde la même clé d'une étape à l'autre : seul le contenu de l'étape s'anime (Builder). */}
        <div
          key={location.pathname.startsWith("/cv/etape/") ? "/cv" : location.pathname}
          className="page-enter"
        >
          <Suspense fallback={<Loading />}>
            <Outlet />
          </Suspense>
        </div>
      </main>
      <footer className="mt-12 border-t border-line bg-surface">
        <div className="shell grid gap-8 py-10 text-sm text-ink-muted md:grid-cols-[2fr_1fr_1fr]">
          <div>
            <p className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
              <img src="/favicon.svg" alt="" className="size-6" />
              Attesta
            </p>
            <p className="mt-3 max-w-md">
              Attesta n'invente rien : chaque ligne de votre CV renvoie à votre profil. Ce qui n'est pas
              sourcé est retiré, ce qui manque est signalé.
            </p>
          </div>
          <div>
            <p className="eyebrow">Produit</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/cv" className="hover:text-ink hover:underline">
                  Créer un CV ciblé
                </Link>
              </li>
              <li>
                <Link to="/offres/collectees" className="hover:text-ink hover:underline">
                  Offres collectées
                </Link>
              </li>
              <li>
                <Link to="/exemples-cv" className="hover:text-ink hover:underline">
                  Exemples de CV
                </Link>
              </li>
              <li>
                <Link to="/tarifs" className="hover:text-ink hover:underline">
                  Tarifs
                </Link>
              </li>
            </ul>
          </div>
          <div>
            <p className="eyebrow">Vos données</p>
            <ul className="mt-3 space-y-2">
              <li>
                <Link to="/confidentialite" className="link">
                  Confidentialité
                </Link>
              </li>
              <li>Invité : effacement sous 24 heures</li>
            </ul>
          </div>
        </div>
      </footer>
    </div>
  );
}
