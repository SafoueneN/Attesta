import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent } from "react";
import { Link } from "react-router";
import { Button, PageHeader, useDocumentTitle } from "../components/ui";
import { WhiteboardVideo } from "./guide/WhiteboardVideo";

/*
 * Guide en tableau blanc. Conventions d'atelier (une légende les rappelle à l'écran) :
 * - deux zones de flux, lues de gauche à droite : le parcours CV (sans compte), puis ce qu'ajoute un compte ;
 * - un cadre « règles du jeu » pour les garanties ;
 * - une couleur de post-it par nature d'information, des flèches pleines pour le chemin principal et
 *   pointillées pour les chemins optionnels, des pastilles numérotées pour l'ordre de lecture.
 * Tout le contenu décrit le fonctionnement réel du produit.
 */

type Kind = "action" | "attesta" | "attention" | "resultat";

const KINDS: Record<Kind, { label: string; note: string; chip: string }> = {
  action: { label: "Vous faites", note: "bg-accent text-on-accent", chip: "bg-accent" },
  attesta: { label: "Attesta fait", note: "bg-proved text-paper", chip: "bg-proved" },
  attention: { label: "Point d'attention", note: "bg-flagged text-paper", chip: "bg-flagged" },
  resultat: { label: "Vous obtenez", note: "bg-ink text-paper", chip: "bg-ink" },
};

interface Note {
  id: string;
  kind: Kind;
  /** Pastille d'ordre de lecture (absente pour les notes annexes). */
  step?: string;
  title: string;
  text: string;
  /** Détail affiché dans le panneau latéral. */
  detail: string[];
  to?: string;
  x: number;
  y: number;
  w?: number;
  h?: number;
  tilt?: number;
}

const BOARD = { w: 1600, h: 1000 };

const FRAMES = [
  { x: 40, y: 50, w: 1520, h: 430, title: "Créer un CV ciblé", sub: "sans compte, en quelques minutes" },
  { x: 40, y: 520, w: 1010, h: 440, title: "Aller plus loin avec un compte", sub: "lettre, veille, données" },
  { x: 1090, y: 520, w: 470, h: 440, title: "Les règles du jeu", sub: "ce qu'Attesta garantit" },
];

const NOTES: Note[] = [
  {
    id: "profil",
    kind: "action",
    step: "1",
    title: "Votre profil",
    text: "Saisissez-le ou importez votre CV PDF.",
    detail: [
      "Nom, titre, coordonnées et résumé ; l'import d'un CV PDF pré-remplit les champs.",
      "Ce profil devient la seule source de vérité : rien de ce qui n'y figure ne pourra apparaître dans un CV.",
    ],
    to: "/cv/etape/1",
    x: 80,
    y: 140,
    tilt: -2,
  },
  {
    id: "parcours",
    kind: "action",
    step: "2",
    title: "Votre parcours",
    text: "Expériences, réalisations chiffrées, formations, compétences.",
    detail: [
      "Une réalisation par ligne, avec vos chiffres réels : ce sont les seuls que le CV pourra citer.",
      "Le profil est enregistré (versionné) à la fin de cette étape.",
    ],
    to: "/cv/etape/2",
    x: 330,
    y: 150,
    tilt: 1.5,
  },
  {
    id: "offre",
    kind: "action",
    step: "3",
    title: "L'offre visée",
    text: "Collez l'annonce, ou reprenez une offre collectée.",
    detail: [
      "L'annonce est analysée une fois : exigences et mots-clés, recopiés tels qu'écrits.",
      "Le texte de l'offre est traité comme une donnée, jamais comme une consigne.",
    ],
    to: "/cv/etape/3",
    x: 580,
    y: 140,
    tilt: -1,
  },
  {
    id: "generation",
    kind: "attesta",
    step: "4",
    title: "La génération",
    text: "Vos faits sont choisis et reformulés pour l'offre.",
    detail: [
      "Vous suivez la progression en direct.",
      "Chaque ligne rédigée cite le fait de votre profil dont elle provient.",
    ],
    to: "/cv/etape/4",
    x: 830,
    y: 150,
    tilt: 2,
  },
  {
    id: "relecture",
    kind: "action",
    step: "5",
    title: "La relecture",
    text: "Voyez la source de chaque ligne, corrigez ou retirez.",
    detail: [
      "Onglet « Relecture ligne par ligne » : la source de chaque ligne est affichée.",
      "Une ligne que vous modifiez reste à votre décision ; tout écart avec la source est signalé.",
    ],
    to: "/mes-cv",
    x: 1080,
    y: 140,
    tilt: -1.5,
  },
  {
    id: "export",
    kind: "resultat",
    step: "6",
    title: "Votre CV en PDF",
    text: "Sobre (lu par les ATS) ou soigné, en deux colonnes.",
    detail: [
      "Cochez « J'ai relu mon CV », puis téléchargez le PDF.",
      "Vous pouvez aussi exporter votre CV tel que saisi, sans adaptation.",
    ],
    to: "/mes-cv",
    x: 1330,
    y: 150,
    tilt: 1,
  },
  {
    id: "signale",
    kind: "attention",
    title: "Mot-clé absent ?",
    text: "Il est signalé, jamais ajouté.",
    detail: [
      "Si l'offre demande une compétence absente de votre profil, Attesta vous le dit.",
      "Vous la maîtrisez vraiment ? Ajoutez-la à votre profil avec une réalisation qui l'illustre.",
    ],
    x: 560,
    y: 340,
    w: 240,
    h: 110,
    tilt: 1.5,
  },
  {
    id: "controle",
    kind: "attesta",
    title: "Contrôle de fidélité",
    text: "Une ligne sans source est retirée avant affichage.",
    detail: [
      "Chiffres, technologies, employeurs : tout est comparé à votre profil.",
      "Le score de fidélité indique la part des lignes rattachées à une source.",
    ],
    x: 820,
    y: 340,
    w: 250,
    h: 110,
    tilt: -1,
  },
  {
    id: "relu",
    kind: "attention",
    title: "Relecture obligatoire",
    text: "Une paraphrase infidèle ne se voit qu'à la lecture.",
    detail: ["Avant d'exporter un CV reformulé, vous confirmez l'avoir relu ligne par ligne."],
    x: 1080,
    y: 340,
    w: 240,
    h: 110,
    tilt: 2,
  },
  {
    id: "connexion",
    kind: "action",
    step: "7",
    title: "Se connecter",
    text: "Un identifiant et un mot de passe, sans e-mail.",
    detail: [
      "Choisissez un identifiant et un mot de passe de 10 caractères au moins.",
      "L'adresse e-mail ne se saisit que dans la veille, pour recevoir les rapports.",
    ],
    to: "/connexion",
    x: 80,
    y: 610,
    tilt: 1,
  },
  {
    id: "lettre",
    kind: "attesta",
    step: "8",
    title: "Lettre de motivation",
    text: "Rédigée depuis les seules lignes vérifiées du CV.",
    detail: [
      "Choisissez le ton, puis modifiez les paragraphes à votre guise.",
      "Chaque paragraphe est contrôlé à son tour ; export en PDF.",
    ],
    to: "/lettres",
    x: 330,
    y: 620,
    tilt: -1.5,
  },
  {
    id: "veille",
    kind: "action",
    step: "9",
    title: "Veille emploi",
    text: "Métiers, ville, et l'adresse qui reçoit les offres.",
    detail: [
      "Les rapports partent directement à l'adresse indiquée ; désabonnement en un clic depuis chaque e-mail.",
      "Désabonnement en un clic depuis chaque e-mail.",
    ],
    to: "/veille",
    x: 580,
    y: 610,
    tilt: 2,
  },
  {
    id: "rapport",
    kind: "resultat",
    step: "10",
    title: "Rapport quotidien",
    text: "Les nouvelles offres et 2 PDF, jamais d'e-mail vide.",
    detail: [
      "Les offres proches de votre profil, classées.",
      "Un PDF des offres et un PDF des points à améliorer.",
    ],
    to: "/veille",
    x: 820,
    y: 620,
    tilt: -1,
  },
  {
    id: "collectees",
    kind: "resultat",
    title: "Offres collectées",
    text: "« Cibler cette offre » relance le parcours à l'étape 3.",
    detail: ["Retrouvez les offres de la veille dans « Offres », puis générez un CV ciblé en un clic."],
    to: "/offres/collectees",
    x: 690,
    y: 820,
    w: 250,
    h: 110,
    tilt: 1,
  },
  {
    id: "compte",
    kind: "resultat",
    title: "Vos données",
    text: "Export de toutes vos données, suppression du compte.",
    detail: [
      "Depuis « Mon compte » : téléchargement en JSON, ou suppression définitive dans tous nos services.",
    ],
    to: "/compte",
    x: 80,
    y: 820,
    w: 250,
    h: 110,
    tilt: -2,
  },
  {
    id: "justificatifs",
    kind: "action",
    title: "Vos justificatifs",
    text: "Joignez diplômes et attestations : vos lignes deviennent « justifiées ».",
    detail: [
      "Une pièce (PDF, PNG ou JPEG) s'attache à une expérience, une formation, un certificat ou une langue.",
      "Vous choisissez à l'export les pièces ajoutées en annexe du CV. Attesta ne certifie pas les pièces.",
    ],
    to: "/justificatifs",
    x: 370,
    y: 820,
    w: 270,
    h: 110,
    tilt: 1.5,
  },
  {
    id: "r1",
    kind: "attesta",
    title: "Rien d'inventé",
    text: "Aucune compétence ajoutée, aucun chiffre gonflé.",
    detail: ["Le CV ne contient que des faits présents dans votre profil."],
    x: 1120,
    y: 610,
    w: 190,
    h: 130,
    tilt: -1.5,
  },
  {
    id: "r2",
    kind: "attesta",
    title: "Tout est sourcé",
    text: "Chaque ligne renvoie à votre profil.",
    detail: ["La source de chaque ligne est visible pendant la relecture."],
    x: 1340,
    y: 610,
    w: 190,
    h: 130,
    tilt: 2,
  },
  {
    id: "r3",
    kind: "attention",
    title: "Vous relisez",
    text: "Rien n'est exporté sans votre accord.",
    detail: ["La relecture humaine est exigée avant l'export d'un CV reformulé."],
    x: 1120,
    y: 780,
    w: 190,
    h: 130,
    tilt: 1,
  },
  {
    id: "r4",
    kind: "resultat",
    title: "Vos données",
    text: "Sans compte : effacées sous 24 heures.",
    detail: ["Avec un compte, vous gardez la main : export et suppression à tout moment."],
    x: 1340,
    y: 780,
    w: 190,
    h: 130,
    tilt: -1,
  },
];

const byId = new Map(NOTES.map((n) => [n.id, n]));
const size = (n: Note) => ({ w: n.w ?? 220, h: n.h ?? 150 });

type Side = "left" | "right" | "top" | "bottom";
function anchor(id: string, side: Side) {
  const n = byId.get(id)!;
  const { w, h } = size(n);
  return {
    left: { x: n.x, y: n.y + h / 2 },
    right: { x: n.x + w, y: n.y + h / 2 },
    top: { x: n.x + w / 2, y: n.y },
    bottom: { x: n.x + w / 2, y: n.y + h },
  }[side];
}

interface Arrow {
  from: [string, Side];
  to: [string, Side];
  dashed?: boolean;
  label?: string;
  /** Courbure : décalage du point de contrôle (en unités du tableau). */
  bend?: number;
}

const ARROWS: Arrow[] = [
  { from: ["profil", "right"], to: ["parcours", "left"] },
  { from: ["parcours", "right"], to: ["offre", "left"] },
  { from: ["offre", "right"], to: ["generation", "left"] },
  { from: ["generation", "right"], to: ["relecture", "left"] },
  { from: ["relecture", "right"], to: ["export", "left"] },
  { from: ["offre", "bottom"], to: ["signale", "top"], dashed: true },
  { from: ["generation", "bottom"], to: ["controle", "top"] },
  { from: ["relecture", "bottom"], to: ["relu", "top"], dashed: true },
  { from: ["connexion", "right"], to: ["lettre", "left"] },
  { from: ["lettre", "right"], to: ["veille", "left"] },
  { from: ["veille", "right"], to: ["rapport", "left"] },
  { from: ["rapport", "bottom"], to: ["collectees", "right"], bend: 60 },
  { from: ["connexion", "bottom"], to: ["compte", "top"], dashed: true },
  { from: ["export", "bottom"], to: ["lettre", "top"], dashed: true, label: "avec un compte", bend: -140 },
  {
    from: ["collectees", "left"],
    to: ["offre", "bottom"],
    dashed: true,
    label: "Cibler cette offre",
    bend: -380,
  },
];

/** Courbe de Bézier douce entre deux points, comme un trait de feutre. */
function path(a: { x: number; y: number }, b: { x: number; y: number }, bend = 0) {
  const mx = (a.x + b.x) / 2;
  const my = (a.y + b.y) / 2;
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  // Point de contrôle décalé perpendiculairement au segment : courbure naturelle, réglable.
  const cx = mx + (-dy / len) * (bend || len * 0.08);
  const cy = my + (dx / len) * (bend || len * 0.08);
  return { d: `M ${a.x} ${a.y} Q ${cx} ${cy} ${b.x} ${b.y}`, label: { x: (mx + cx) / 2, y: (my + cy) / 2 } };
}

/** Ordre du mode « Présenter » : le parcours, puis le compte, puis les règles. */
const TOUR = [
  "profil",
  "parcours",
  "offre",
  "signale",
  "generation",
  "controle",
  "relecture",
  "relu",
  "export",
  "connexion",
  "lettre",
  "veille",
  "rapport",
  "collectees",
  "compte",
  "justificatifs",
  "r1",
  "r2",
  "r3",
  "r4",
];

export function Guide() {
  useDocumentTitle("Guide");
  const scroller = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState(1);
  const [zoom, setZoom] = useState(1);
  const [selected, setSelected] = useState<string>("profil");
  const [tour, setTour] = useState<number | null>(null);
  const drag = useRef<{ x: number; y: number; left: number; top: number } | null>(null);

  // Zoom initial : le tableau entier tient dans la largeur disponible (sans descendre sous 55 %).
  useLayoutEffect(() => {
    const el = scroller.current;
    if (!el) return;
    const measure = () => setFit(Math.max(0.55, Math.min(1, (el.clientWidth - 8) / BOARD.w)));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  useEffect(() => setZoom(fit), [fit]);

  // Mode présentation : la note courante est sélectionnée et amenée au centre de la vue.
  useEffect(() => {
    if (tour === null) return;
    const id = TOUR[tour]!;
    setSelected(id);
    const el = document.getElementById(`note-${id}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center", inline: "center" });
  }, [tour]);

  // Glisser le fond pour se déplacer dans le tableau (les notes restent cliquables).
  const startPan = (e: PointerEvent<HTMLDivElement>) => {
    if ((e.target as Element).closest("button, a") || !scroller.current) return;
    drag.current = {
      x: e.clientX,
      y: e.clientY,
      left: scroller.current.scrollLeft,
      top: scroller.current.scrollTop,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const pan = (e: PointerEvent<HTMLDivElement>) => {
    const d = drag.current;
    if (!d || !scroller.current) return;
    scroller.current.scrollLeft = d.left - (e.clientX - d.x);
    scroller.current.scrollTop = d.top - (e.clientY - d.y);
  };

  const note = byId.get(selected)!;
  const presenting = tour !== null;

  return (
    <div>
      <PageHeader
        title="Guide d'Attesta"
        lead="Regardez la vidéo pour comprendre Attesta en une minute, puis explorez le tableau en détail."
      />

      <WhiteboardVideo />

      <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-title font-semibold">Explorer le tableau en détail</h2>
          <p className="mt-2 max-w-2xl text-ink-muted">
            Suivez les numéros, cliquez sur un post-it pour le détail, ou lancez la présentation.
          </p>
        </div>
        {presenting ? (
          <Button variant="secondary" onClick={() => setTour(null)}>
            Quitter la présentation
          </Button>
        ) : (
          <Button onClick={() => setTour(0)}>Présenter pas à pas</Button>
        )}
      </div>

      {/* Barre d'outils du tableau : présentation, zoom, légende. */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        {presenting && (
          <div className="flex items-center gap-2 rounded-full border border-line bg-surface p-1">
            <Button
              variant="ghost"
              disabled={tour === 0}
              onClick={() => setTour((t) => Math.max(0, (t ?? 0) - 1))}
            >
              ← Précédent
            </Button>
            <span className="px-2 text-sm font-semibold" aria-live="polite">
              {tour! + 1} / {TOUR.length}
            </span>
            <Button
              variant="ghost"
              disabled={tour === TOUR.length - 1}
              onClick={() => setTour((t) => Math.min(TOUR.length - 1, (t ?? 0) + 1))}
            >
              Suivant →
            </Button>
          </div>
        )}
        <div className="flex items-center gap-1 rounded-full border border-line bg-surface p-1">
          <Button
            variant="ghost"
            aria-label="Dézoomer"
            onClick={() => setZoom((z) => Math.max(0.4, z - 0.1))}
          >
            −
          </Button>
          <span className="w-14 text-center text-sm font-semibold">{Math.round(zoom * 100)} %</span>
          <Button variant="ghost" aria-label="Zoomer" onClick={() => setZoom((z) => Math.min(1.5, z + 0.1))}>
            +
          </Button>
          <Button variant="ghost" onClick={() => setZoom(fit)}>
            Ajuster
          </Button>
        </div>
        <ul aria-label="Légende" className="flex flex-wrap gap-3 text-sm text-ink-muted">
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <li key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-3 rounded-sm ${KINDS[k].chip}`} />
              {KINDS[k].label}
            </li>
          ))}
          <li className="flex items-center gap-1.5">
            <span aria-hidden="true" className="w-6 border-t-2 border-dashed border-ink-subtle" />
            Chemin optionnel
          </li>
        </ul>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
        {/* Tableau : fond pointillé, zones, flèches (SVG) et post-its. Déplacement au glisser. */}
        <div
          ref={scroller}
          onPointerDown={startPan}
          onPointerMove={pan}
          onPointerUp={() => (drag.current = null)}
          className="whiteboard relative h-[72vh] cursor-grab overflow-auto rounded-[2rem] border border-line active:cursor-grabbing"
        >
          <div style={{ width: BOARD.w * zoom, height: BOARD.h * zoom }}>
            <div
              role="group"
              aria-label="Tableau blanc du parcours Attesta"
              className={`relative origin-top-left transition-transform duration-300 ${presenting ? "is-presenting" : ""}`}
              style={{ width: BOARD.w, height: BOARD.h, transform: `scale(${zoom})` }}
            >
              {FRAMES.map((f) => (
                <div
                  key={f.title}
                  aria-hidden="true"
                  className="absolute rounded-[1.75rem] border-2 border-dashed border-line-strong/60"
                  style={{ left: f.x, top: f.y, width: f.w, height: f.h }}
                >
                  <p className="absolute -top-4 left-6 rounded-full bg-paper px-3 text-lg font-bold">
                    {f.title} <span className="text-sm font-medium text-ink-muted">· {f.sub}</span>
                  </p>
                </div>
              ))}

              <svg
                aria-hidden="true"
                className="pointer-events-none absolute inset-0"
                width={BOARD.w}
                height={BOARD.h}
              >
                <defs>
                  <marker
                    id="pointe"
                    viewBox="0 0 10 10"
                    refX="8"
                    refY="5"
                    markerWidth="7"
                    markerHeight="7"
                    orient="auto-start-reverse"
                  >
                    <path d="M 0 0 L 10 5 L 0 10 z" fill="var(--ink-muted)" />
                  </marker>
                </defs>
                {ARROWS.map((a, i) => {
                  const p = path(anchor(...a.from), anchor(...a.to), a.bend);
                  return (
                    <g key={i}>
                      <path
                        d={p.d}
                        fill="none"
                        stroke="var(--ink-muted)"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeDasharray={a.dashed ? "8 8" : undefined}
                        markerEnd="url(#pointe)"
                        className="draw-path"
                        style={{ animationDelay: `${i * 90}ms` } as CSSProperties}
                      />
                      {a.label && (
                        <text
                          x={p.label.x}
                          y={p.label.y}
                          textAnchor="middle"
                          className="fill-ink text-[15px] font-semibold"
                          stroke="var(--paper)"
                          strokeWidth="6"
                          paintOrder="stroke"
                        >
                          {a.label}
                        </text>
                      )}
                    </g>
                  );
                })}
              </svg>

              {NOTES.map((n, i) => {
                const { w, h } = size(n);
                const active = selected === n.id;
                return (
                  <button
                    key={n.id}
                    id={`note-${n.id}`}
                    type="button"
                    aria-pressed={active}
                    onClick={() => {
                      setSelected(n.id);
                      if (presenting) setTour(TOUR.indexOf(n.id));
                    }}
                    className={`sticky-note absolute flex flex-col items-start rounded-md p-4 text-left shadow-raised ${KINDS[n.kind].note} ${active ? "is-active" : ""}`}
                    style={
                      {
                        left: n.x,
                        top: n.y,
                        width: w,
                        height: h,
                        "--tilt": `${n.tilt ?? 0}deg`,
                        animationDelay: `${200 + i * 45}ms`,
                      } as CSSProperties
                    }
                  >
                    <span aria-hidden="true" className="tape" />
                    {n.step && (
                      <span
                        aria-hidden="true"
                        className="absolute -top-3 -left-3 grid size-8 place-items-center rounded-full bg-ink text-sm font-bold text-paper shadow-raised"
                      >
                        {n.step}
                      </span>
                    )}
                    <span className="text-[17px] leading-tight font-bold">
                      {n.step && <span className="sr-only">Étape {n.step} : </span>}
                      {n.title}
                    </span>
                    <span className="mt-2 text-sm leading-snug opacity-85">{n.text}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Panneau de détail de la note choisie (et de l'étape présentée). */}
        <aside
          aria-labelledby="detail-titre"
          aria-live="polite"
          className="xl:sticky xl:top-24 xl:self-start"
        >
          <div key={note.id} className="card animate-enter">
            <p className="flex items-center gap-2 text-sm font-semibold text-ink-muted">
              <span aria-hidden="true" className={`size-3 rounded-sm ${KINDS[note.kind].chip}`} />
              {KINDS[note.kind].label}
              {note.step && <span className="ml-auto">Étape {note.step}</span>}
            </p>
            <h2 id="detail-titre" className="mt-3 text-xl font-semibold">
              {note.title}
            </h2>
            <p className="mt-2 text-ink-muted">{note.text}</p>
            <ul className="mt-4 space-y-2 text-sm">
              {note.detail.map((d) => (
                <li key={d} className="flex gap-2">
                  <span aria-hidden="true" className="font-bold text-proved">
                    ✓
                  </span>
                  {d}
                </li>
              ))}
            </ul>
            {note.to && (
              <Link to={note.to} className="link mt-5 inline-block">
                Y aller
              </Link>
            )}
          </div>
        </aside>
      </div>

      {/* Version texte du tableau : même contenu, dans l'ordre de lecture. */}
      <details className="faq card mt-8 p-0">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-semibold">
          Lire le guide en version texte
          <span
            aria-hidden="true"
            className="faq-icon grid size-8 shrink-0 place-items-center rounded-full bg-accent text-lg text-on-accent"
          >
            +
          </span>
        </summary>
        <ol className="space-y-4 px-6 pb-6">
          {TOUR.map((id) => {
            const n = byId.get(id)!;
            return (
              <li key={id}>
                <p className="font-semibold">
                  {n.step ? `${n.step}. ` : ""}
                  {n.title}{" "}
                  <span className="text-sm font-normal text-ink-muted">({KINDS[n.kind].label})</span>
                </p>
                <p className="text-ink-muted">
                  {n.text} {n.detail.join(" ")}
                </p>
              </li>
            );
          })}
        </ol>
      </details>
    </div>
  );
}
