import { useRef, useState, type CSSProperties, type PointerEvent, type ReactNode } from "react";
import { Link } from "react-router";
import { useSession } from "../auth/session";
import { ArrowBadge, buttonClass, useDocumentTitle, WITH_ARROW } from "../components/ui";
import { CustomCursor, InView, Magnetic } from "../lib/motion";
import { AiShowcase } from "./home/AiShowcase";
import { Reviews } from "./home/Reviews";

/** Questions fréquentes : chaque réponse décrit le fonctionnement réel du produit. */
const FAQ = [
  {
    q: "Attesta peut-il ajouter une compétence que je n'ai pas ?",
    a: "Non. Une compétence demandée par l'offre mais absente de votre profil vous est signalée, jamais ajoutée. Chaque ligne du CV renvoie à un fait de votre profil ; une ligne sans source est retirée avant affichage.",
  },
  {
    q: "Mes données sont-elles conservées ?",
    a: "Sans compte, elles sont effacées 24 heures après votre arrivée. Avec un compte, vous pouvez télécharger toutes vos données ou supprimer votre compte à tout moment depuis « Mon compte ».",
  },
  {
    q: "Le CV passe-t-il les logiciels de recrutement (ATS) ?",
    a: "La mise en page sobre est conçue pour être lue par les ATS : texte réel, une colonne, titres standards. Une variante soignée en deux colonnes est aussi proposée.",
  },
  {
    q: "Faut-il donner son adresse e-mail ?",
    a: "Non. Un identifiant et un mot de passe suffisent pour créer votre compte. Vous n'indiquez une adresse e-mail que si vous voulez recevoir la veille emploi.",
  },
  {
    q: "Comment fonctionne la veille emploi ?",
    a: "Chaque jour, les nouvelles offres proches de votre profil arrivent à l'adresse de votre choix. Vous vous désabonnez en un clic depuis chaque e-mail.",
  },
];

/**
 * Comparaison avant / après : un CV générique (gonflé) sous un CV Attesta (sourcé), séparés par un
 * curseur. Le curseur est un vrai champ `range`, utilisable au clavier ; les deux CV sont décoratifs.
 */
function BeforeAfter() {
  const [split, setSplit] = useState(50);
  const lines = [
    ["Expert Kubernetes et cloud natif", "Migration de 12 services Express vers Node.js 20"],
    ["Réduction de 60 % du temps de réponse", "Réduction de 40 % du temps de réponse de l'API"],
    ["Leader technique d'une équipe de 15", "Revue de code et accompagnement de 2 alternants"],
  ];
  const Sheet = ({ after }: { after: boolean }) => (
    <div
      className={`h-full rounded-[2rem] border border-line p-6 sm:p-10 ${after ? "bg-surface" : "bg-surface-sunken"}`}
    >
      <p
        className={`text-sm font-bold tracking-[0.14em] uppercase ${after ? "text-accent-text" : "text-removed"}`}
      >
        {after ? "CV Attesta" : "CV générique"}
      </p>
      <p className="mt-2 text-2xl font-semibold">Léa Martin</p>
      <ul className="mt-6 space-y-4">
        {lines.map(([before, proved]) => (
          <li key={proved} className="flex items-start gap-3">
            <span
              className={`mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-xs font-bold ${after ? "bg-proved-soft text-proved" : "bg-removed-soft text-removed"}`}
            >
              {after ? "✓" : "?"}
            </span>
            <span className={after ? "" : "text-ink-muted"}>{after ? proved : before}</span>
          </li>
        ))}
      </ul>
      <p className={`mt-6 text-sm font-semibold ${after ? "text-proved" : "text-removed"}`}>
        {after ? "Chaque ligne renvoie à votre profil." : "Invérifiable : à retirer avant l'entretien."}
      </p>
    </div>
  );
  return (
    <section aria-labelledby="comparaison" className="py-20 lg:py-28">
      <div className="text-center">
        <p className="eyebrow reveal">Avant / après</p>
        <h2 id="comparaison" className="mt-4 text-title font-semibold">
          Faites glisser pour voir la différence
        </h2>
        <p className="mx-auto mt-4 max-w-2xl text-lead text-ink-muted">
          À gauche, un CV gonflé que personne ne peut vérifier. À droite, le même parcours, ciblé et sourcé.
        </p>
      </div>
      <div
        className="reveal relative mx-auto mt-12 max-w-4xl"
        style={{ "--split": `${split}%` } as CSSProperties}
      >
        <div aria-hidden="true">
          <Sheet after={false} />
          <div className="compare-after absolute inset-0">
            <Sheet after />
          </div>
          {/* Poignée : trait vertical et pastille citron, sous le champ réel. */}
          <div className="compare-handle pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-accent">
            <span className="absolute top-1/2 left-1/2 grid size-11 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-full bg-accent font-bold text-on-accent shadow-float">
              ⇆
            </span>
          </div>
        </div>
        <label htmlFor="comparer" className="sr-only">
          Position du séparateur entre le CV générique et le CV Attesta
        </label>
        <input
          id="comparer"
          type="range"
          min={5}
          max={95}
          value={split}
          onChange={(e) => setSplit(Number(e.target.value))}
          className="absolute inset-0 size-full cursor-ew-resize opacity-0"
        />
      </div>
    </section>
  );
}

function Faq() {
  return (
    <section aria-labelledby="faq" className="mx-auto max-w-3xl pb-20 lg:pb-28">
      <div className="text-center">
        <p className="eyebrow reveal">Questions fréquentes</p>
        <h2 id="faq" className="mt-4 text-title font-semibold">
          Vos questions, nos réponses
        </h2>
      </div>
      <div className="mt-10 space-y-3">
        {FAQ.map((item) => (
          <details key={item.q} className="faq card reveal p-0">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-semibold">
              {item.q}
              <span
                aria-hidden="true"
                className="faq-icon grid size-8 shrink-0 place-items-center rounded-full bg-accent text-lg text-on-accent"
              >
                +
              </span>
            </summary>
            <p className="px-6 pb-5 text-ink-muted">{item.a}</p>
          </details>
        ))}
      </div>
    </section>
  );
}

/** Titre lu par les lecteurs d'écran ; à l'écran, sa fin tourne entre plusieurs cibles (décoratif). */
const TITLE = "Des CV qui disent vrai, ciblés pour chaque offre.";
const TITLE_START = "Des CV qui disent vrai, ciblés pour";
/** Le dernier mot répète le premier : la boucle repart sans saut visible. */
const TITLE_ENDS = ["chaque offre.", "chaque recruteur.", "chaque ATS.", "chaque offre."];

const STEPS = [
  {
    title: "Votre profil, une fois",
    text: "Saisissez votre parcours ou importez votre CV PDF. Il devient la seule source de vérité.",
  },
  {
    title: "L'offre visée",
    text: "Collez l'annonce, ou choisissez une offre collectée. Ses exigences et mots-clés sont analysés.",
  },
  {
    title: "Un CV ciblé et sourcé",
    text: "Chaque ligne cite le fait de votre profil dont elle provient. Ce qui n'a pas de source est retiré.",
  },
  {
    title: "Relecture et export",
    text: "Corrigez ligne par ligne, exportez en PDF lisible par les ATS, rédigez la lettre.",
  },
];

/** Engagements vérifiables du produit (ADR 0003, 0019) : aucune promesse chiffrée invérifiable. */
const FEATURES = [
  { icon: "✓", title: "Fidélité", text: "Chaque ligne renvoie à votre profil ; rien n'est inventé." },
  { icon: "◎", title: "Confidentialité", text: "Sans compte, vos données sont effacées sous 24 heures." },
  {
    icon: "▤",
    title: "Lisible par les ATS",
    text: "Un PDF sobre que les logiciels de recrutement savent lire.",
  },
];

const MARQUEE = [
  "Aucune compétence inventée",
  "Chaque ligne sourcée",
  "PDF lisible par les ATS",
  "Lettre de motivation contrôlée",
  "Justificatifs en annexe",
  "Veille emploi quotidienne",
  "Export et suppression de vos données",
];
const MARQUEE_BACK = ["Profil", "Offre", "CV ciblé", "Relecture", "Export PDF", "Lettre", "Veille"];

/** Titre de section dont chaque mot monte en entrant à l'écran (texte intact pour les lecteurs d'écran). */
function Words({ text }: { text: string }) {
  return text.split(" ").map((w, i) => (
    <span key={i} className="word-view" style={{ "--i": i } as CSSProperties}>
      {w}
      {" "}
    </span>
  ));
}

/* ------------------------------------------------------------------------------------------------------ */
/* Tuiles de la mosaïque : de vrais morceaux du produit, sur des données fictives. Toutes décoratives.     */
/* ------------------------------------------------------------------------------------------------------ */

function Tile({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 text-left shadow-raised ${className}`}>
      {children}
    </div>
  );
}

const Bar = ({ w }: { w: string }) => <span className={`block h-2 rounded-full bg-line ${w}`} />;

/**
 * Recruteurs des quatre pays de la veille (ADR 0033) : photos `public/recruteurs/<ville>.jpg`, sans nom ni
 * entreprise (sources et licences dans `public/recruteurs/CREDITS.md`).
 */
const RECRUITERS = {
  tn: {
    file: "tunis",
    role: "Recrutement tech",
    city: "Tunis",
    country: "Tunisie",
    note: "A ouvert votre CV",
  },
  ca: {
    file: "montreal",
    role: "Talent acquisition",
    city: "Montréal",
    country: "Canada",
    note: "CV en anglais reçu",
  },
  de: {
    file: "berlin",
    role: "Personalabteilung",
    city: "Berlin",
    country: "Allemagne",
    note: "Lebenslauf geprüft ✓",
  },
  fr: {
    file: "paris",
    role: "Recruteuse",
    city: "Paris",
    country: "France",
    note: "Entretien proposé",
  },
} as const;

function RecruiterTile({ who }: { who: keyof typeof RECRUITERS }) {
  const r = RECRUITERS[who];
  return (
    <Tile>
      <div className="flex items-center gap-3">
        <img
          src={`/recruteurs/${r.file}.jpg`}
          alt=""
          loading="lazy"
          className="size-12 shrink-0 rounded-full object-cover ring-2 ring-accent"
        />
        <div className="min-w-0">
          <p className="truncate text-sm font-bold">{r.role}</p>
          <p className="text-xs text-ink-muted">
            {r.city} · {r.country}
          </p>
        </div>
      </div>
      <p className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-proved-soft px-2.5 py-1 text-xs font-bold text-proved">
        {r.note}
      </p>
    </Tile>
  );
}

const TILES: Record<string, ReactNode> = {
  cv: (
    <Tile>
      <div className="flex items-center gap-3">
        <span className="grid size-10 place-items-center rounded-full bg-accent text-sm font-bold text-on-accent">
          LM
        </span>
        <div>
          <p className="text-sm font-bold">Léa Martin</p>
          <p className="text-xs text-ink-muted">Développeuse back-end</p>
        </div>
      </div>
      <div className="mt-4 space-y-2">
        <Bar w="w-full" />
        <Bar w="w-10/12" />
        <Bar w="w-7/12" />
      </div>
    </Tile>
  ),
  proved: (
    <Tile>
      <p className="text-sm">Réduction de 40 % du temps de réponse de l'API</p>
      <p className="mt-3 inline-flex animate-pop items-center gap-1.5 rounded-full bg-proved-soft px-2.5 py-1 text-xs font-bold text-proved [animation-delay:1600ms]">
        ✓ Sourcé · Expérience 1
      </p>
    </Tile>
  ),
  offer: (
    <Tile>
      <p className="text-xs font-semibold text-ink-muted">Offre analysée</p>
      <p className="mt-1 text-sm font-bold">Backend-Entwickler (m/w/d)</p>
      <p className="text-xs text-ink-muted">Berlin · Temps plein</p>
      <div className="mt-3 flex flex-wrap gap-1.5">
        {["Node.js", "PostgreSQL", "REST"].map((k) => (
          <span key={k} className="rounded-full bg-accent-soft px-2 py-0.5 text-[0.7rem] font-semibold">
            {k}
          </span>
        ))}
      </div>
    </Tile>
  ),
  score: (
    <Tile className="flex items-center gap-4">
      {/* Anneau et nombre comptent de 0 à 100 % (propriété CSS animée, voir .count-up). */}
      <span className="count-up grid size-16 shrink-0 place-items-center rounded-full">
        <span className="count-value grid size-12 place-items-center rounded-full bg-surface text-sm font-bold" />
      </span>
      <div>
        <p className="text-sm font-bold">Fidélité</p>
        <p className="text-xs text-ink-muted">lignes rattachées à une source</p>
      </div>
    </Tile>
  ),
  flagged: (
    <Tile>
      <p className="text-sm">
        <span className="font-bold text-flagged">Kubernetes</span> demandé par l'offre
      </p>
      <p className="mt-2 rounded-xl border border-dashed border-flagged/60 bg-flagged-soft px-2.5 py-1.5 text-xs font-semibold">
        Signalé, jamais ajouté
      </p>
    </Tile>
  ),
  pdf: (
    <Tile className="flex items-center gap-3">
      <span className="grid h-12 w-10 shrink-0 place-items-center rounded-lg bg-removed-soft text-[0.65rem] font-black text-removed">
        PDF
      </span>
      <div>
        <p className="text-sm font-bold">cv-lea-martin.pdf</p>
        <p className="text-xs text-ink-muted">Lisible par les ATS</p>
      </div>
    </Tile>
  ),
  mail: (
    <Tile>
      <p className="flex items-center gap-2 text-sm font-bold">
        <span className="grid size-7 animate-pulse place-items-center rounded-full bg-accent text-xs text-on-accent">
          ✉
        </span>
        2 nouvelles offres
      </p>
      <p className="mt-2 text-xs text-ink-muted">Rapport du jour et points à améliorer, en PDF.</p>
    </Tile>
  ),
  letter: (
    <Tile>
      <p className="text-xs font-semibold text-ink-muted">Lettre de motivation</p>
      <div className="mt-3 space-y-2">
        <Bar w="w-full" />
        <Bar w="w-11/12" />
        <Bar w="w-9/12" />
      </div>
      <p className="mt-3 text-xs font-bold text-proved">3 paragraphes sourcés</p>
    </Tile>
  ),
  removed: (
    <Tile>
      <p className="text-sm text-ink-subtle line-through decoration-removed decoration-2">
        60 % plus rapide grâce à Kubernetes
      </p>
      <p className="mt-2 text-xs font-bold text-removed">× Retirée : absente de votre profil</p>
    </Tile>
  ),
  keywords: (
    <Tile>
      <p className="text-xs font-semibold text-ink-muted">Mots-clés repérés</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {["API", "Node.js", "SQL", "Docker", "Tests"].map((k) => (
          <span key={k} className="rounded-full border border-line px-2 py-0.5 text-[0.7rem] font-semibold">
            {k}
          </span>
        ))}
      </div>
    </Tile>
  ),
  "rec-tn": <RecruiterTile who="tn" />,
  "rec-ca": <RecruiterTile who="ca" />,
  "rec-de": <RecruiterTile who="de" />,
  "rec-fr": <RecruiterTile who="fr" />,
};

/** Colonnes décalées comme une mosaïque de photos ; chacune flotte et glisse à sa vitesse (parallaxe). */
const COLUMNS: { tiles: string[]; offset: string; speed: number; hideOnMobile?: boolean }[] = [
  { tiles: ["cv", "rec-tn", "removed"], offset: "mt-0", speed: 30, hideOnMobile: true },
  { tiles: ["offer", "score", "pdf"], offset: "mt-20", speed: 70 },
  { tiles: ["proved", "mail"], offset: "mt-32", speed: 110 },
  { tiles: ["keywords", "flagged", "rec-fr"], offset: "mt-16", speed: 70 },
  { tiles: ["rec-ca", "letter", "rec-de"], offset: "mt-0", speed: 30, hideOnMobile: true },
];

function Mosaic() {
  let rank = 0;
  return (
    <div
      aria-hidden="true"
      className="fade-bottom relative mx-auto mt-10 h-[30rem] max-w-7xl overflow-hidden pt-4 sm:h-[34rem]"
    >
      <div className="grid grid-cols-3 gap-3 px-3 max-sm:[zoom:0.68] sm:gap-4 md:grid-cols-5">
        {COLUMNS.map((col, i) => (
          <div
            key={i}
            className={`parallax ${col.offset} ${col.hideOnMobile ? "hidden md:block" : ""}`}
            style={{ "--speed": col.speed } as CSSProperties}
          >
            {/* Pastilles d'action au-dessus de la colonne centrale, comme sur une fiche. */}
            {i === 2 && (
              <div className="mb-4 flex justify-center gap-2">
                {["▤", "✓"].map((c, j) => (
                  <span
                    key={c}
                    className="tile-in grid size-9 place-items-center rounded-full border border-line bg-surface text-sm"
                    style={{ "--i": j } as CSSProperties}
                  >
                    {c}
                  </span>
                ))}
              </div>
            )}
            <div className="animate-float space-y-3 sm:space-y-4" style={{ animationDelay: `${i * -1.3}s` }}>
              {col.tiles.map((t, j) => (
                <div key={`${t}-${j}`} className="tile-in" style={{ "--i": rank++ } as CSSProperties}>
                  {TILES[t]}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */

/**
 * Démonstration de la vérification, sur un extrait de CV fictif. Décorative (`aria-hidden`) : le même
 * message est donné en texte par les cartes voisines. Se joue quand elle arrive à l'écran (`InView`).
 */
function CertificationDemo() {
  return (
    <InView>
      <div aria-hidden="true" className="relative">
        <div className="absolute -inset-3 rotate-2 rounded-[2rem] bg-accent/20" />
        <div className="relative rounded-[1.75rem] border border-line bg-surface p-6 shadow-float sm:p-8">
          <div className="flex items-center justify-between gap-3 border-b border-line pb-4">
            <div className="flex items-center gap-3">
              <span className="grid size-11 place-items-center rounded-full bg-accent font-bold text-on-accent">
                LM
              </span>
              <div>
                <p className="text-lg font-bold">Léa Martin</p>
                <p className="text-sm text-ink-muted">Développeuse back-end · Lyon</p>
              </div>
            </div>
            <span className="rounded-full bg-accent-soft px-3 py-1 text-xs font-bold">Ciblé : Node.js</span>
          </div>
          <p className="mt-5 text-xs font-bold tracking-[0.14em] text-ink-muted uppercase">Expérience</p>
          <ul className="mt-3 space-y-4 text-[0.95rem]">
            <li>
              <p className="demo-sweep -mx-1 rounded px-1 py-0.5">
                Réduction de 40 % du temps de réponse de l'API de réservation
              </p>
              <p className="demo-stamp mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-proved-soft px-2.5 py-0.5 text-xs font-bold text-proved">
                ✓ Sourcé · Expérience 1, réalisation 2
              </p>
            </li>
            <li className="demo-flag">
              <p className="rounded-xl border border-dashed border-flagged/60 bg-flagged-soft px-3 py-2 text-sm">
                <span className="font-bold text-flagged">Kubernetes</span> est demandé par l'offre, absent de
                votre profil : <span className="font-semibold">signalé, jamais ajouté.</span>
              </p>
            </li>
            <li>
              <p className="demo-strike text-ink-subtle decoration-removed">
                Réduction de 60 % du temps de réponse grâce à Kubernetes
              </p>
              <p className="demo-removed-note mt-1.5 text-xs font-semibold text-removed">
                × Retirée : « 60 % » et « Kubernetes » ne figurent pas dans votre profil
              </p>
            </li>
          </ul>
        </div>
      </div>
    </InView>
  );
}

function Marquee({ items, reverse = false }: { items: string[]; reverse?: boolean }) {
  return (
    <div className={`flex w-max animate-marquee gap-10 ${reverse ? "marquee-reverse" : ""}`}>
      {[...items, ...items].map((m, i) => (
        <span key={i} className="flex items-center gap-10 whitespace-nowrap">
          {m}
          <span className="text-accent-text">✦</span>
        </span>
      ))}
    </div>
  );
}

export function Home() {
  useDocumentTitle("Accueil");
  const { isAccount } = useSession();
  const hero = useRef<HTMLElement>(null);
  // Halo qui suit le pointeur : variables CSS posées directement, sans rendu React.
  const follow = (e: PointerEvent<HTMLElement>) => {
    const box = e.currentTarget.getBoundingClientRect();
    hero.current?.style.setProperty("--x", `${e.clientX - box.left}px`);
    hero.current?.style.setProperty("--y", `${e.clientY - box.top}px`);
  };

  return (
    <div className="-mt-8 lg:-mt-12">
      <CustomCursor />
      {/* Hero pleine largeur : surtitre, titre mot à mot, actions magnétiques, puis mosaïque du produit. */}
      <section
        ref={hero}
        onPointerMove={follow}
        className="full-bleed spotlight grain relative overflow-hidden"
      >
        <span aria-hidden="true" className="aurora aurora-a top-[-10rem] left-[8%] size-[28rem]" />
        <span aria-hidden="true" className="aurora aurora-b top-[12rem] right-[6%] size-[24rem]" />
        <div className="shell relative pt-14 text-center lg:pt-20">
          <p className="inline-flex animate-enter items-center gap-3 rounded-full border border-line bg-surface/60 py-1 pr-4 pl-1 text-sm font-medium backdrop-blur">
            <span aria-hidden="true" className="flex -space-x-2">
              {["bg-accent text-on-accent", "bg-proved-soft text-proved", "bg-flagged-soft text-flagged"].map(
                (c, i) => (
                  <span
                    key={c}
                    className={`grid size-7 animate-pop place-items-center rounded-full border-2 border-paper text-[0.65rem] font-bold ${c}`}
                    style={{ animationDelay: `${200 + i * 120}ms` }}
                  >
                    {["✓", "◎", "!"][i]}
                  </span>
                ),
              )}
            </span>
            Chaque ligne sourcée dans votre profil
          </p>
          <h1 className="mx-auto mt-6 max-w-4xl text-display font-semibold">
            <span className="sr-only">{TITLE}</span>
            <span aria-hidden="true">
              {TITLE_START.split(" ").map((w, i) => (
                <span key={i} className="word" style={{ "--i": i } as CSSProperties}>
                  {w}
                  {" "}
                </span>
              ))}
              <span className="word rotator text-accent-text" style={{ "--i": 6 } as CSSProperties}>
                <span>
                  {TITLE_ENDS.map((t, i) => (
                    <span key={i}>{t}</span>
                  ))}
                </span>
              </span>
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl animate-enter text-lead text-ink-muted [animation-delay:500ms]">
            Attesta adapte votre CV à chaque offre sans jamais inventer : aucune compétence ajoutée, aucun
            chiffre gonflé. Les mots-clés que vous n'avez pas sont signalés, jamais ajoutés.
          </p>
          <div className="mt-8 flex animate-enter flex-wrap justify-center gap-3 [animation-delay:650ms]">
            <Magnetic>
              <Link to="/cv" className={buttonClass("primary", "lg", WITH_ARROW)}>
                Créer mon CV ciblé
                <ArrowBadge />
              </Link>
            </Magnetic>
            {!isAccount && (
              <Magnetic>
                <Link
                  to="/connexion"
                  className={buttonClass("ghost", "lg", `${WITH_ARROW} text-ink hover:bg-surface`)}
                >
                  Créer un compte
                  <ArrowBadge tone="light" />
                </Link>
              </Magnetic>
            )}
          </div>
        </div>
        <Mosaic />
      </section>

      {/* À propos : visuel à gauche, promesse et cartes de garanties à droite. */}
      <section aria-labelledby="apropos" className="full-bleed bg-surface-sunken">
        <div className="shell grid items-center gap-12 py-20 lg:grid-cols-2 lg:gap-16 lg:py-28">
          <div className="reveal mx-auto w-full max-w-xl lg:mx-0">
            <CertificationDemo />
          </div>
          <div>
            <p className="eyebrow reveal">À propos d'Attesta</p>
            <h2 id="apropos" className="mt-4 text-title font-semibold">
              <Words text="Des parcours solides, des candidatures honnêtes." />
            </h2>
            <p className="reveal mt-5 max-w-xl text-lead text-ink-muted">
              Avant tout affichage ou export, un contrôle compare chaque ligne générée à votre profil. Vous
              relisez ensuite le résultat : rien n'est exporté sans votre accord.
            </p>
            <div className="reveal mt-8">
              <Magnetic>
                <a href="#comment" className={buttonClass("primary", "lg", WITH_ARROW)}>
                  Comment ça marche
                  <ArrowBadge />
                </a>
              </Magnetic>
            </div>
            <ul className="mt-10 grid gap-4 sm:grid-cols-3">
              {FEATURES.map((f) => (
                <li key={f.title} className="reveal spot tilt rounded-3xl border border-line bg-surface p-5">
                  <span
                    aria-hidden="true"
                    className="icon-bounce grid size-10 place-items-center rounded-full bg-accent text-lg font-bold text-on-accent"
                  >
                    {f.icon}
                  </span>
                  <h3 className="mt-6 font-semibold">{f.title}</h3>
                  <p className="mt-1.5 text-sm text-ink-muted">{f.text}</p>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </section>

      {/* Deux bandeaux défilant en sens opposés (décoratifs : les mêmes promesses sont écrites plus haut). */}
      <div
        aria-hidden="true"
        className="full-bleed space-y-3 overflow-hidden border-y border-line py-5 hover:[&_.animate-marquee]:[animation-play-state:paused]"
      >
        <div className="text-xl font-semibold text-ink-muted">
          <Marquee items={MARQUEE} />
        </div>
        <div className="text-lg font-medium text-ink-subtle">
          <Marquee items={MARQUEE_BACK} reverse />
        </div>
      </div>

      <section id="comment" aria-labelledby="comment-titre" className="py-20 lg:py-28">
        <div className="text-center">
          <p className="eyebrow reveal">En quatre étapes</p>
          <h2 id="comment-titre" className="mt-4 text-title font-semibold">
            <Words text="Comment ça marche" />
          </h2>
        </div>
        <div className="relative mt-12">
          {/* Ligne qui relie les étapes et se remplit au défilement (grand écran). */}
          <span
            aria-hidden="true"
            className="absolute top-14 right-[12%] left-[12%] hidden h-0.5 bg-line xl:block"
          >
            <span className="fill-on-scroll block h-full rounded-full bg-accent" />
          </span>
          <ol className="relative grid gap-5 md:grid-cols-2 xl:grid-cols-4">
            {STEPS.map((s, i) => (
              <li
                key={s.title}
                className="reveal spot tilt relative rounded-3xl border border-line bg-surface p-7"
                style={{ animationDelay: `${i * 80}ms` }}
              >
                <span
                  aria-hidden="true"
                  className="icon-bounce inline-block text-5xl font-bold tracking-tight text-accent-text"
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <p className="sr-only">Étape {i + 1}</p>
                <h3 className="mt-6 text-lg font-semibold">{s.title}</h3>
                <p className="mt-2 text-ink-muted">{s.text}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <BeforeAfter />
      <AiShowcase />
      <Reviews />
      <Faq />

      {/* Appel final sur fond citron : contraste fort, même action que le hero sous un autre libellé. */}
      <section aria-labelledby="commencer" className="pb-8">
        <div className="reveal grain relative overflow-hidden rounded-[2.5rem] bg-accent px-6 py-16 text-center text-on-accent sm:px-12 lg:py-20">
          <span
            aria-hidden="true"
            className="aurora top-[-8rem] right-[-6rem] size-[22rem] animate-float bg-on-accent opacity-10"
          />
          <h2 id="commencer" className="relative mx-auto max-w-3xl text-title font-semibold">
            Votre prochain CV ne dira que la vérité.
          </h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lead">
            Quelques minutes pour le profil, quelques secondes par offre ensuite.
          </p>
          <div className="relative mt-8">
            <Magnetic>
              <Link
                to="/cv"
                className={`${buttonClass("primary", "lg", WITH_ARROW)} bg-on-accent! text-accent! hover:opacity-90`}
              >
                Commencer maintenant
                <span
                  aria-hidden="true"
                  className="arrow-badge grid size-9 place-items-center rounded-full bg-accent text-on-accent"
                >
                  ↗
                </span>
              </Link>
            </Magnetic>
          </div>
        </div>
      </section>
    </div>
  );
}
