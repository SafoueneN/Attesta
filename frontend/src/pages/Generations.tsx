import type { CvLine, CvVariant, Evidence, Generation, Letter, TailoredCv } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { JudgeGate, useJudge } from "./assistants/GenerationAssistants";
import { useAssistantResults } from "./assistants/shared";
import { ApiError } from "../api/client";
import { cv, letters, profiles, type CvNorms } from "../api/endpoints";
import { useSession } from "../auth/session";
import { useToast } from "../components/toasts";
import {
  Alert,
  ArrowBadge,
  Badge,
  Button,
  buttonClass,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  ScoreBadge,
  Spinner,
  useDocumentTitle,
  WITH_ARROW,
} from "../components/ui";
import { describeIssue, describePointer, factText, formatDateTime, isJustified } from "../lib/describe";
import { Confetti, CountUp } from "../lib/motion";

/* ------------------------------------------------------------------------------------------------------ */
/* Mes CV : galerie de cartes                                                                             */
/* ------------------------------------------------------------------------------------------------------ */

/** Miniature stylisée d'un CV (décorative) : en-tête, puis lignes, dont une marquée « sourcée ». */
function MiniCv({ seed }: { seed: number }) {
  const widths = ["w-11/12", "w-9/12", "w-10/12", "w-7/12", "w-8/12"];
  return (
    <div
      aria-hidden="true"
      className="relative h-36 overflow-hidden rounded-2xl border border-line bg-paper p-4 transition-transform duration-500 group-hover:scale-[1.03]"
    >
      <div className="flex items-center gap-2">
        <span className="size-7 rounded-full bg-accent" />
        <div className="space-y-1.5">
          <span className="block h-2 w-20 rounded-full bg-line-strong/60" />
          <span className="block h-1.5 w-14 rounded-full bg-line" />
        </div>
      </div>
      <div className="mt-4 space-y-2">
        {widths.map((w, i) => (
          <span
            key={i}
            className={`block h-1.5 rounded-full ${w} ${(i + seed) % 4 === 0 ? "bg-proved/60" : "bg-line"}`}
          />
        ))}
      </div>
      <span className="absolute right-3 bottom-3 rotate-[-8deg] rounded-md border-2 border-proved px-1.5 text-[0.6rem] font-black tracking-wider text-proved uppercase opacity-80">
        Sourcé
      </span>
    </div>
  );
}

export function GenerationList() {
  useDocumentTitle("Mes CV");
  const list = useQuery({ queryKey: ["generations"], queryFn: cv.generations });
  return (
    <div>
      <PageHeader
        title="Mes CV ciblés"
        lead="Chaque génération garde l'instantané du profil et de l'offre utilisés."
        actions={
          <Link to="/cv" className={buttonClass("primary", "lg", WITH_ARROW)}>
            Nouveau CV ciblé
            <ArrowBadge />
          </Link>
        }
      />
      {list.isPending && <Loading variant="cards" />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState
          title="Aucun CV ciblé pour le moment"
          action={
            <Link to="/cv" className="link">
              Créer mon premier CV ciblé
            </Link>
          }
        >
          Renseignez votre profil, collez une offre : Attesta adapte votre CV sans rien inventer.
        </EmptyState>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
          {list.data.map((g, i) => (
            <li
              key={g.id}
              className="group card tilt relative flex animate-enter flex-col gap-4"
              style={{ animationDelay: `${i * 70}ms` }}
            >
              <MiniCv seed={i} />
              <div className="flex flex-wrap gap-2">
                {g.status === "ok" ? (
                  <ScoreBadge score={g.score} />
                ) : (
                  <Badge tone="warning">Sans reformulation</Badge>
                )}
                {g.providerKind === "demo" && <Badge tone="neutral">Démonstration</Badge>}
              </div>
              {/* Lien étiré : toute la carte est cliquable, le nom du lien reste le titre de l'offre. */}
              <Link
                to={`/mes-cv/${g.id}`}
                className="text-lg leading-snug font-semibold after:absolute after:inset-0 after:rounded-[inherit] hover:underline"
              >
                {g.offerTitle}
              </Link>
              <p className="-mt-2 text-sm text-ink-muted">{formatDateTime(g.createdAt)}</p>
              <span
                aria-hidden="true"
                className="flex translate-y-2 items-center gap-2 text-sm font-semibold text-accent-text opacity-0 transition duration-300 group-hover:translate-y-0 group-hover:opacity-100"
              >
                Ouvrir, relire et exporter <ArrowBadge />
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------------------------------------------ */
/* Détail d'une génération                                                                                */
/* ------------------------------------------------------------------------------------------------------ */

/**
 * Jauge circulaire du score de fidélité : l'arc se remplit, le nombre compte, et des confettis saluent un
 * score parfait. Décorative à côté du badge textuel « Fidélité N % », qui reste la source pour tous.
 */
function FidelityGauge({ score }: { score: number }) {
  const value = Math.round(score * 100);
  const [drawn, setDrawn] = useState(0);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setDrawn(value));
    return () => cancelAnimationFrame(frame);
  }, [value]);
  const circumference = 2 * Math.PI * 42;
  const color = value === 100 ? "var(--proved)" : value >= 80 ? "var(--flagged)" : "var(--removed)";
  return (
    <div aria-hidden="true" className="relative grid size-32 shrink-0 place-items-center">
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r="42" fill="none" stroke="var(--line)" strokeWidth="9" />
        <circle
          cx="50"
          cy="50"
          r="42"
          fill="none"
          stroke={color}
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - drawn / 100)}
          style={{ transition: "stroke-dashoffset 1.2s cubic-bezier(0.2, 0.8, 0.2, 1)" }}
        />
      </svg>
      <div className="text-center">
        <p className="text-2xl font-bold">
          <CountUp value={value} format={(n) => `${n} %`} />
        </p>
        <p className="text-xs text-ink-muted">fidélité</p>
      </div>
      {value === 100 && <Confetti />}
    </div>
  );
}

interface ReviewLine {
  path: string;
  line: CvLine;
  section: string;
}

/** Lignes rédigées du CV, dans l'ordre du document (même parcours que le contrôle du serveur). */
function reviewLines(c: TailoredCv, g: Generation): ReviewLine[] {
  const entryTitle = (section: "work" | "projects", ref: string) => {
    const i = Number(ref.split("/")[2]);
    return section === "work" ? g.profile.work[i]?.position : g.profile.projects[i]?.name;
  };
  return [
    ...(c.headline ? [{ path: "/headline", line: c.headline, section: "Titre" }] : []),
    ...c.summary.map((line, i) => ({ path: `/summary/${i}`, line, section: "Accroche" })),
    ...c.work.flatMap((e, i) =>
      e.highlights.map((line, j) => ({
        path: `/work/${i}/highlights/${j}`,
        line,
        section: entryTitle("work", e.ref) ?? "Expérience",
      })),
    ),
    ...c.projects.flatMap((e, i) =>
      e.highlights.map((line, j) => ({
        path: `/projects/${i}/highlights/${j}`,
        line,
        section: entryTitle("projects", e.ref) ?? "Projet",
      })),
    ),
  ];
}

/** Modèles du CV (ADR 0041) : même contenu, mises en page différentes, toutes lisibles par les ATS. */
const TEMPLATES: { id: CvVariant; label: string; detail: string }[] = [
  { id: "ats", label: "Sobre", detail: "Noir sur blanc, lu par tous les ATS." },
  { id: "design", label: "Soignée", detail: "Accents de couleur, filet en marge." },
  { id: "classique", label: "Classique", detail: "Empattements, en-tête centré." },
  { id: "moderne", label: "Moderne", detail: "Bandeau de couleur en tête." },
  { id: "compact", label: "Compacte", detail: "Dense, pour tenir sur une page." },
];

/** Usages proposés à l'export (ADR 0036) : ce qui change dans le document selon le pays visé. */
const NORMS: { code: CvNorms; label: string; detail: string }[] = [
  { code: "FR", label: "France", detail: "Photo facultative, ni âge ni nationalité." },
  {
    code: "DE",
    label: "Allemagne",
    detail: "Lebenslauf : photo, date de naissance, nationalité, signature datée.",
  },
  { code: "CA", label: "Canada", detail: "Ni photo, ni âge, ni nationalité (usage et loi)." },
  { code: "TN", label: "Tunisie", detail: "Photo, date de naissance, nationalité, permis." },
];

/** Pays suggéré d'après l'offre : « (m/w/d) » signe une annonce allemande. */
const suggestedNorms = (g: Generation): CvNorms =>
  /\b[mwfd]\/[mwfd]\/[mwfd]\b/i.test(g.offerTitle) ? "DE" : "FR";

/**
 * CV en ligne (ADR 0042) : un lien secret vers un instantané du CV (modèle et usages choisis), à coller dans
 * LinkedIn ou un e-mail ; nombre de consultations, révocation en un clic. Relecture exigée comme à l'export.
 */
function SharePanel({
  generation,
  variant,
  norms,
  reviewed,
}: {
  generation: Generation;
  variant: CvVariant;
  norms: CvNorms;
  reviewed: boolean;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [consent, setConsent] = useState(false);
  const [created, setCreated] = useState<string>();
  const shares = useQuery({ queryKey: ["partages"], queryFn: letters.shares });
  const mine = (shares.data ?? []).filter((s) => s.generationId === generation.id);
  const create = useMutation({
    mutationFn: () => letters.createShare({ generationId: generation.id, variant, norms, consent: true }),
    onSuccess: (share) => {
      setCreated(share.url);
      void queryClient.invalidateQueries({ queryKey: ["partages"] });
    },
  });
  const revoke = useMutation({
    mutationFn: letters.deleteShare,
    onSuccess: () => {
      toast.success("Lien révoqué : le CV n'est plus visible.");
      void queryClient.invalidateQueries({ queryKey: ["partages"] });
    },
  });
  return (
    <section className="card space-y-4" aria-labelledby="partage">
      <h2 id="partage" className="text-lg font-bold">
        Partager en ligne
      </h2>
      <p className="text-sm text-ink-muted">
        Un lien secret vers ce CV, tel qu'il est aujourd'hui (modèle et usages du pays choisis ci-dessus), à
        coller dans LinkedIn ou un e-mail. Valable 90 jours, jamais indexé par les moteurs de recherche,
        révocable à tout moment.
      </p>
      {created && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl bg-accent-soft p-3">
          <code className="min-w-0 flex-1 truncate text-sm">{created}</code>
          <Button
            variant="secondary"
            onClick={() =>
              void navigator.clipboard?.writeText(created).then(() => toast.success("Lien copié."))
            }
          >
            Copier
          </Button>
          <a href={created} target="_blank" rel="noreferrer" className="link text-sm">
            Ouvrir<span className="sr-only"> (nouvel onglet)</span>
          </a>
        </div>
      )}
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-accent-text"
          checked={consent}
          onChange={(e) => setConsent(e.target.checked)}
        />
        <span>Je comprends que mes coordonnées seront visibles par toute personne qui reçoit ce lien.</span>
      </label>
      <Button busy={create.isPending} disabled={!consent || !reviewed} onClick={() => create.mutate()}>
        Créer un lien de partage
      </Button>
      {!reviewed && <p className="text-xs text-ink-muted">Cochez d'abord la relecture du CV ci-dessus.</p>}
      {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
      {mine.length > 0 && (
        <ul className="space-y-2 text-sm">
          {mine.map((s) => (
            <li
              key={s.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-line p-3"
            >
              <span>
                Créé le {formatDateTime(s.createdAt)} · <b>{s.views}</b> consultation{s.views > 1 ? "s" : ""}
                {s.lastViewedAt ? ` · dernière le ${formatDateTime(s.lastViewedAt)}` : ""}
              </span>
              <Button variant="ghost" busy={revoke.isPending} onClick={() => revoke.mutate(s.id)}>
                Révoquer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Preview({
  generation,
  variant,
  norms = "FR",
  className = "h-[70vh]",
}: {
  generation: Generation;
  variant: CvVariant;
  norms?: CvNorms;
  className?: string;
}) {
  const preview = useQuery({
    queryKey: ["apercu", generation.id, generation.revision, variant, norms],
    queryFn: () => letters.previewCv({ generationId: generation.id, variant, norms }),
  });
  if (preview.isPending) return <Loading label="Préparation de l'aperçu…" />;
  if (preview.isError) return <QueryError error={preview.error} />;
  return (
    <iframe
      title="Aperçu du CV, identique au PDF"
      srcDoc={preview.data}
      sandbox=""
      className={`w-full animate-enter rounded-2xl border border-line bg-white shadow-float ${className}`}
    />
  );
}

function Review({
  generation,
  variant,
  evidence,
}: {
  generation: Generation;
  variant: CvVariant;
  evidence: Evidence[];
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const lines = useMemo(() => reviewLines(generation.cv!, generation), [generation]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    setTexts({});
    setRemoved(new Set());
  }, [generation.revision]);
  const issuesByPath = new Map(generation.report?.lines.map((l) => [l.path, l.issues]) ?? []);
  // Verdict du juge pour la révision courante (ADR 0029) : affiché sur chaque ligne concernée.
  const judge = useJudge(generation);
  const verdictByPath = new Map(judge.flagged.map((v) => [v.path, v]));
  const changed = Object.entries(texts).filter(
    ([path, t]) => lines.find((l) => l.path === path)?.line.text !== t,
  );
  const save = useMutation({
    mutationFn: () =>
      cv.correct(generation.id, {
        revision: generation.revision,
        lines: [
          ...changed.map(([path, text]) => ({ path, text })),
          ...[...removed].map((path) => ({ path, remove: true })),
        ],
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["generation", generation.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success("Vos corrections sont enregistrées.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_perimee")
        void queryClient.invalidateQueries({ queryKey: ["generation", generation.id] });
    },
  });

  return (
    // Grand écran : le document à gauche (fixe au défilement), les lignes à relire à droite.
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="hidden xl:block">
        <div className="sticky top-24">
          <Preview generation={generation} variant={variant} className="h-[calc(100vh-8rem)]" />
        </div>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
        className="space-y-4"
      >
        <p className="text-ink-muted">
          Chaque ligne cite le fait de votre profil dont elle provient. Vous pouvez la reformuler ou la
          retirer ; une ligne modifiée reste à votre décision, et tout écart avec la source est signalé.
        </p>
        <ol className="space-y-4">
          {lines.map(({ path, line, section }, index) => {
            const issues = issuesByPath.get(path) ?? [];
            const edited = generation.edited.includes(path);
            const isRemoved = removed.has(path);
            return (
              <li
                key={path}
                className={`card animate-enter p-4 transition-[opacity,border-color] duration-300 hover:border-accent ${issues.length ? "border-flagged" : ""} ${isRemoved ? "opacity-55" : ""}`}
                style={{ animationDelay: `${Math.min(index, 10) * 50}ms` }}
              >
                <div className="mb-2 flex flex-wrap items-center gap-2">
                  <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-xs font-bold">
                    {index + 1}
                  </span>
                  <span className="text-sm font-semibold">{section}</span>
                  {edited && <Badge tone="info">Modifiée par vous</Badge>}
                  {issues.length > 0 && <Badge tone="warning">Écart avec la source</Badge>}
                  {verdictByPath.get(path) && (
                    <span title={verdictByPath.get(path)!.explanation}>
                      <Badge tone={verdictByPath.get(path)!.verdict === "infidele" ? "error" : "warning"}>
                        ⚖{" "}
                        {verdictByPath.get(path)!.verdict === "infidele"
                          ? "Infidèle selon le juge"
                          : "Nuance selon le juge"}
                      </Badge>
                    </span>
                  )}
                  {!issues.length &&
                    !edited &&
                    (isJustified(generation.profile, line.sources, evidence) ? (
                      <span className="ml-auto inline-flex animate-pop items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-xs font-bold text-on-accent">
                        📎 Justifiée
                      </span>
                    ) : (
                      <span className="ml-auto inline-flex animate-pop items-center gap-1 rounded-full bg-proved-soft px-2 py-0.5 text-xs font-bold text-proved">
                        ✓ Sourcée
                      </span>
                    ))}
                </div>
                <label htmlFor={`ligne-${index}`} className="sr-only">
                  Ligne {index + 1}
                </label>
                <textarea
                  id={`ligne-${index}`}
                  className={`input min-h-16 ${isRemoved ? "line-through" : ""}`}
                  maxLength={500}
                  disabled={isRemoved}
                  value={texts[path] ?? line.text}
                  onChange={(e) => setTexts((t) => ({ ...t, [path]: e.target.value }))}
                />
                <details className="faq mt-2 text-sm">
                  <summary className="inline-flex cursor-pointer items-center gap-1.5 font-semibold text-accent-text">
                    <span aria-hidden="true" className="faq-icon inline-block">
                      +
                    </span>
                    Source{line.sources.length > 1 ? "s" : ""} de la ligne
                  </summary>
                  <ul className="mt-2 space-y-1 rounded-xl bg-surface-sunken p-3">
                    {line.sources.map((s) => (
                      <li key={s}>
                        <span className="font-medium">{describePointer(generation.profile, s)}</span> : «{" "}
                        {factText(generation.profile, s) ?? "?"} »
                      </li>
                    ))}
                  </ul>
                </details>
                {issues.length > 0 && (
                  <ul className="mt-2 list-disc pl-5 text-sm text-flagged">
                    {issues.map((i, k) => (
                      <li key={k}>{describeIssue(i)}</li>
                    ))}
                  </ul>
                )}
                <label className="mt-2 flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    className="size-4 accent-removed"
                    checked={isRemoved}
                    onChange={(e) =>
                      setRemoved((r) => {
                        const next = new Set(r);
                        if (e.target.checked) next.add(path);
                        else next.delete(path);
                        return next;
                      })
                    }
                  />
                  Retirer cette ligne du CV
                </label>
              </li>
            );
          })}
        </ol>
        {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <div className="sticky bottom-4 z-10 w-fit rounded-full bg-paper/85 p-1.5 shadow-float backdrop-blur-md">
          <Button
            type="submit"
            size="lg"
            className="shadow-float"
            busy={save.isPending}
            disabled={!changed.length && !removed.size}
          >
            Enregistrer mes corrections
          </Button>
        </div>
      </form>
    </div>
  );
}

function LetterLauncher({ generationId }: { generationId: string }) {
  const navigate = useNavigate();
  const [tone, setTone] = useState<Letter["tone"]>("sobre");
  const create = useMutation({
    mutationFn: () => letters.create(generationId, tone),
    onSuccess: (letter) => navigate(`/lettres/${letter.id}`),
  });
  return (
    <div className="space-y-3">
      <label htmlFor="ton" className="label">
        Ton de la lettre
      </label>
      <select
        id="ton"
        className="input max-w-xs"
        value={tone}
        onChange={(e) => setTone(e.target.value as Letter["tone"])}
      >
        <option value="sobre">Sobre</option>
        <option value="chaleureux">Chaleureux</option>
        <option value="dynamique">Dynamique</option>
      </select>
      <Button busy={create.isPending} onClick={() => create.mutate()}>
        Rédiger la lettre de motivation
      </Button>
      {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
    </div>
  );
}

const TABS = ["apercu", "relecture", "ecarts"] as const;

/** Anciens onglets des assistants : ils vivent désormais dans le Studio IA. */
const STUDIO_TABS: Record<string, string> = {
  juge: "juge",
  entretien: "coach",
  progression: "plan",
  traduction: "traduction",
  ats: "ats",
};
type Tab = (typeof TABS)[number];

/** Onglets à pastille glissante : l'indicateur suit l'onglet actif (mesuré après rendu). */
function Tabs({
  tabs,
  active,
  onChange,
}: {
  tabs: [Tab, string][];
  active: Tab;
  onChange: (t: Tab) => void;
}) {
  const refs = useRef<Partial<Record<Tab, HTMLButtonElement | null>>>({});
  const [box, setBox] = useState({ left: 0, width: 0 });
  useLayoutEffect(() => {
    const el = refs.current[active];
    if (el) setBox({ left: el.offsetLeft, width: el.offsetWidth });
  }, [active, tabs]);
  return (
    <div
      role="tablist"
      aria-label="Vues du CV"
      className="relative inline-flex max-w-full gap-1 overflow-x-auto rounded-full border border-line bg-surface p-1"
    >
      <span
        aria-hidden="true"
        className="tab-indicator absolute top-1 bottom-1 left-0 rounded-full bg-accent"
        style={{ transform: `translateX(${box.left}px)`, width: box.width } as CSSProperties}
      />
      {tabs.map(([key, label]) => (
        <button
          key={key}
          ref={(el) => {
            refs.current[key] = el;
          }}
          role="tab"
          id={`onglet-${key}`}
          aria-selected={active === key}
          aria-controls={`panneau-${key}`}
          onClick={() => onChange(key)}
          className={`relative z-10 rounded-full px-4 py-2 text-sm font-semibold whitespace-nowrap transition-colors duration-300 ${active === key ? "text-on-accent" : "text-ink-muted hover:text-ink"}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

/** Indicateurs du CV, chacun ouvre son assistant dans le Studio IA (ADR 0029). */
function StudioTiles({
  generation,
  stored,
}: {
  generation: Generation;
  stored: <T>(name: string) => T | undefined;
}) {
  const judge = stored<{ revision: number; verdicts: { verdict: string }[] }>("juge-fidelite");
  const ats = stored<{ keywords: { status: string }[] }>("conseils-ats");
  const history = stored<{ feedback: { star: Record<string, boolean> } }[]>("coach-historique") ?? [];
  const flagged =
    judge && judge.revision === generation.revision
      ? judge.verdicts.filter((v) => v.verdict !== "fidele").length
      : null;
  const atsPct = ats?.keywords.length
    ? Math.round((ats.keywords.filter((k) => k.status === "place").length / ats.keywords.length) * 100)
    : null;
  const recent = history.slice(-5);
  const star = recent.length
    ? recent.reduce((n, h) => n + Object.values(h.feedback.star).filter(Boolean).length, 0) / recent.length
    : null;
  const fidelity = generation.report ? Math.round(generation.report.score * 100) : 0;
  const tiles: { label: string; value: string; ratio: number; note: string; to: string; tone: string }[] = [
    {
      label: "Fidélité",
      value: `${fidelity} %`,
      ratio: fidelity / 100,
      note: "Lignes reliées à votre profil",
      to: "juge",
      tone: "bg-proved",
    },
    {
      label: "Juge de fidélité",
      value: flagged === null ? "À lancer" : flagged ? `${flagged} à revoir` : "Tout est fidèle",
      ratio: flagged === null ? 0 : flagged ? 0.6 : 1,
      note: "Le sens de chaque ligne",
      to: "juge",
      tone: flagged ? "bg-flagged" : "bg-proved",
    },
    {
      label: "Lisibilité ATS",
      value: atsPct === null ? "À scanner" : `${atsPct} %`,
      ratio: (atsPct ?? 0) / 100,
      note: "Ce qu'un logiciel voit",
      to: "ats",
      tone: "bg-accent",
    },
    {
      label: "Entretien",
      value: star === null ? "À préparer" : `STAR ${star.toFixed(1)}/4`,
      ratio: (star ?? 0) / 4,
      note: "Entretien blanc",
      to: "coach",
      tone: "bg-accent",
    },
  ];
  return (
    <nav aria-label="Assistants de ce CV" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {tiles.map((t, i) => (
        <Link
          key={t.label}
          to={`/studio/${generation.id}/${t.to}`}
          className="group card animate-enter flex flex-col gap-2 p-4 transition-transform hover:-translate-y-1"
          style={{ animationDelay: `${i * 70}ms` }}
        >
          <span className="text-xs font-bold text-ink-subtle">{t.label}</span>
          <span className="text-2xl font-extrabold">{t.value}</span>
          <span className="h-1.5 rounded-full bg-surface-sunken">
            <span
              className={`grow-bar block h-1.5 rounded-full ${t.tone}`}
              style={{ width: `${Math.max(3, t.ratio * 100)}%` }}
            />
          </span>
          <span className="flex items-center justify-between text-xs text-ink-muted">
            {t.note}
            <span aria-hidden="true" className="transition-transform group-hover:translate-x-1">
              →
            </span>
          </span>
        </Link>
      ))}
    </nav>
  );
}

export function GenerationDetail() {
  const { id = "" } = useParams();
  const { isAccount } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["generation", id], queryFn: () => cv.generation(id) });
  const [variant, setVariant] = useState<CvVariant>("ats");
  const [normsChoice, setNorms] = useState<CvNorms | null>(null);
  // Onglet dans l'adresse (?onglet=entretien) : la page « Assistants IA » y mène directement.
  const [params, setParams] = useSearchParams();
  const asked = params.get("onglet");
  const tab: Tab = (TABS as readonly string[]).includes(asked ?? "") ? (asked as Tab) : "apercu";
  const studio = useAssistantResults(id);
  const setTab = (next: Tab) => setParams(next === "apercu" ? {} : { onglet: next }, { replace: true });
  const [confirmDelete, setConfirmDelete] = useState(false);
  // Relecture humaine obligatoire avant l'export d'un CV reformulé (ADR 0003).
  const [reviewed, setReviewed] = useState(false);
  const [reviewError, setReviewError] = useState(false);
  // Juge de fidélité lancé à l'ouverture, verdict exigé avant l'export (ADR 0029).
  const [judged, setJudged] = useState(false);
  // Pièces justificatives (comptes) : badges « Justifiée » et annexe facultative du PDF (ADR 0027).
  const evidence = useQuery({ queryKey: ["justificatifs"], queryFn: profiles.evidence, enabled: isAccount });
  const [annex, setAnnex] = useState<string[]>([]);
  const exportDocx = useMutation({
    mutationFn: (generationId?: string) => letters.exportCvDocx({ generationId, variant, norms }),
  });
  const exportPdf = useMutation({
    mutationFn: (generationId?: string) =>
      letters.exportCv({ generationId, variant, evidenceIds: annex, norms }),
  });
  const remove = useMutation({
    mutationFn: () => cv.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success("Génération supprimée.");
      navigate("/mes-cv");
    },
  });
  useDocumentTitle(query.data ? `CV pour ${query.data.offerTitle}` : "CV ciblé");

  if (asked && STUDIO_TABS[asked]) return <Navigate to={`/studio/${id}/${STUDIO_TABS[asked]}`} replace />;
  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  const g = query.data;
  const norms = normsChoice ?? suggestedNorms(g);
  const ok = g.status === "ok" && g.cv;
  const score = g.report?.score ?? null;
  const pieces = evidence.data ?? [];
  const lines = ok ? reviewLines(g.cv!, g) : [];
  const justified = lines.filter((l) => isJustified(g.profile, l.line.sources, pieces)).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title={g.offerTitle}
        lead={`Généré le ${formatDateTime(g.createdAt)} à partir de la version ${g.profileVersion ?? "?"} de votre profil.`}
        actions={
          <>
            {ok && (
              <Link to={`/studio/${g.id}`} className={`${buttonClass("primary", "lg")} ${WITH_ARROW}`}>
                Ouvrir le Studio IA
                <ArrowBadge />
              </Link>
            )}
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          </>
        }
      />
      {ok && <StudioTiles generation={g} stored={studio.stored} />}
      <div className="card flex flex-wrap items-center gap-6">
        {ok && score !== null && <FidelityGauge score={score} />}
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex flex-wrap gap-2">
            {ok ? <ScoreBadge score={score} /> : <Badge tone="warning">Sans reformulation</Badge>}
            {g.removed.length > 0 && <Badge tone="neutral">{g.removed.length} ligne(s) écartée(s)</Badge>}
            {g.providerKind === "demo" && (
              <Badge tone="neutral">Démonstration : faits recopiés, sans IA</Badge>
            )}
          </div>
          <p className="text-sm text-ink-muted">
            {ok
              ? "Chaque ligne affichée renvoie à votre profil ; ce qui n'avait pas de source a été écarté avant affichage."
              : "La reformulation n'a pas abouti : votre CV reste exportable tel que saisi."}
          </p>
          {ok && (
            <p className="flex flex-wrap items-center gap-2 text-sm">
              <Badge tone={justified ? "success" : "neutral"}>
                📎 {justified} ligne{justified > 1 ? "s" : ""} justifiée{justified > 1 ? "s" : ""} sur{" "}
                {lines.length}
              </Badge>
              {isAccount ? (
                <Link to="/justificatifs" className="link">
                  Joindre des justificatifs
                </Link>
              ) : (
                <span className="text-ink-muted">
                  <Link to="/connexion" className="link">
                    Créez un compte
                  </Link>{" "}
                  pour joindre diplômes et attestations.
                </span>
              )}
            </p>
          )}
        </div>
      </div>
      {!ok && (
        <Alert tone="warning" title="Reformulation indisponible">
          {g.message} Vous pouvez exporter votre CV tel que saisi, ou relancer une génération plus tard.
        </Alert>
      )}
      {ok && g.cv!.missingKeywords.length > 0 && (
        <Alert tone="info" title="Mots-clés de l'offre absents de votre profil">
          <p>Signalés, jamais ajoutés : {g.cv!.missingKeywords.join(", ")}.</p>
          <p className="mt-1">
            Si vous les maîtrisez vraiment, ajoutez-les à votre profil avec une réalisation qui l'illustre.
          </p>
        </Alert>
      )}

      <section className="card space-y-4" aria-labelledby="export">
        <h2 id="export" className="text-lg font-bold">
          Exporter
        </h2>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Modèle</legend>
          <div className="grid gap-2 sm:grid-cols-3 lg:grid-cols-5">
            {TEMPLATES.map((t) => (
              <label
                key={t.id}
                className="flex cursor-pointer flex-col gap-1 rounded-2xl border-2 border-line p-3 text-sm transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft"
              >
                <span className="flex items-center gap-2 font-bold">
                  <input
                    type="radio"
                    name="variante"
                    className="size-4 accent-accent-text"
                    checked={variant === t.id}
                    onChange={() => setVariant(t.id)}
                  />
                  {t.label}
                </span>
                <span className="text-xs text-ink-muted">{t.detail}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            Tous les modèles restent en une colonne, lisible par les logiciels de recrutement.
          </p>
        </fieldset>
        <fieldset className="space-y-2">
          <legend className="text-sm font-bold">Usages du pays visé</legend>
          <div className="grid gap-2 sm:grid-cols-4">
            {NORMS.map((n) => (
              <label
                key={n.code}
                className="flex cursor-pointer flex-col gap-1 rounded-2xl border-2 border-line p-3 text-sm transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft"
              >
                <span className="flex items-center gap-2 font-bold">
                  <input
                    type="radio"
                    name="usages"
                    className="size-4 accent-accent-text"
                    checked={norms === n.code}
                    onChange={() => setNorms(n.code)}
                  />
                  {n.label}
                </span>
                <span className="text-xs text-ink-muted">{n.detail}</span>
              </label>
            ))}
          </div>
          <p className="text-xs text-ink-muted">
            Photo et informations personnelles se renseignent dans votre profil ; elles ne sont affichées que
            si le pays l'admet.
          </p>
        </fieldset>
        {ok && (
          <div>
            <label className="flex items-start gap-3">
              <input
                type="checkbox"
                className="mt-1 size-5 accent-accent-text"
                checked={reviewed}
                onChange={(e) => {
                  setReviewed(e.target.checked);
                  setReviewError(false);
                }}
                aria-describedby={reviewError ? "relu-erreur" : undefined}
                aria-invalid={reviewError || undefined}
              />
              <span>J'ai relu mon CV : chaque ligne correspond à ce que j'ai réellement fait.</span>
            </label>
            {reviewError && (
              <p
                id="relu-erreur"
                role="alert"
                className="mt-1 animate-enter text-sm font-medium text-removed"
              >
                Confirmez que vous avez relu votre CV avant de l'exporter : le contrôle automatique ne voit
                pas une paraphrase infidèle.
              </p>
            )}
          </div>
        )}
        {ok && <JudgeGate generation={g} onReady={setJudged} />}
        {isAccount && pieces.length > 0 && (
          <fieldset className="rounded-2xl border border-line p-4">
            <legend className="px-1 font-semibold">Joindre des justificatifs en annexe (facultatif)</legend>
            <p className="text-sm text-ink-muted">
              Les pièces cochées sont ajoutées après le CV, précédées d'une page qui les décrit. Rien n'est
              joint sans votre choix.
            </p>
            <ul className="mt-3 grid gap-2 sm:grid-cols-2">
              {pieces.map((p) => (
                <li key={p.id}>
                  <label className="flex cursor-pointer items-start gap-3 rounded-xl border-2 border-line p-3 text-sm transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-accent-text"
                      checked={annex.includes(p.id)}
                      onChange={(e) =>
                        setAnnex((list) =>
                          e.target.checked ? [...list, p.id] : list.filter((id) => id !== p.id),
                        )
                      }
                    />
                    <span>
                      <span className="block font-semibold">{p.label}</span>
                      <span className="block text-ink-muted">{p.anchor}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </fieldset>
        )}
        <div className="flex flex-wrap gap-3">
          {ok && (
            <Button
              busy={exportPdf.isPending}
              disabled={!judged}
              onClick={() => (reviewed ? exportPdf.mutate(g.id) : setReviewError(true))}
            >
              Télécharger le CV ciblé (PDF)
            </Button>
          )}
          {ok && (
            <Button
              variant="secondary"
              busy={exportDocx.isPending}
              disabled={!judged}
              onClick={() => (reviewed ? exportDocx.mutate(g.id) : setReviewError(true))}
            >
              Version Word (.docx)
            </Button>
          )}
          <Button variant="secondary" busy={exportPdf.isPending} onClick={() => exportPdf.mutate(undefined)}>
            CV non adapté (PDF)
          </Button>
        </div>
        {exportPdf.isError && <Alert tone="error">{errorMessage(exportPdf.error)}</Alert>}
        {exportDocx.isError && <Alert tone="error">{errorMessage(exportDocx.error)}</Alert>}
        <p className="text-xs text-ink-muted">
          La version Word reprend exactement le même contenu : utile pour les cabinets de recrutement qui
          retouchent ou anonymisent les CV.
        </p>
      </section>
      {ok && isAccount && <SharePanel generation={g} variant={variant} norms={norms} reviewed={reviewed} />}

      {ok && (
        <>
          <Tabs
            active={tab}
            onChange={setTab}
            tabs={[
              ["apercu", "Aperçu"],
              ["relecture", "Relecture ligne par ligne"],
              ["ecarts", `Lignes écartées (${g.removed.length})`],
            ]}
          />
          <div
            key={tab}
            role="tabpanel"
            id={`panneau-${tab}`}
            aria-labelledby={`onglet-${tab}`}
            className="animate-enter"
          >
            {tab === "apercu" && <Preview generation={g} variant={variant} norms={norms} />}
            {tab === "relecture" && <Review generation={g} variant={variant} evidence={pieces} />}
            {tab === "ecarts" &&
              (g.removed.length === 0 ? (
                <EmptyState title="Aucune ligne écartée">
                  Tout ce qui a été rédigé renvoie à votre profil.
                </EmptyState>
              ) : (
                <ul className="grid gap-3 md:grid-cols-2">
                  {g.removed.map((r, i) => (
                    <li
                      key={r.path}
                      className="card animate-enter border-removed/40 p-4"
                      style={{ animationDelay: `${i * 70}ms` }}
                    >
                      <p
                        className="demo-strike decoration-removed"
                        style={{ animationDelay: `${300 + i * 120}ms` }}
                      >
                        {r.text}
                      </p>
                      <ul className="mt-2 list-disc pl-5 text-sm text-removed">
                        {r.issues.map((issue, k) => (
                          <li key={k}>{describeIssue(issue)}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
          <section className="card space-y-3" aria-labelledby="lettre">
            <h2 id="lettre" className="text-lg font-bold">
              Lettre de motivation
            </h2>
            {isAccount ? (
              <>
                <p className="text-ink-muted">
                  Rédigée à partir des seules lignes vérifiées de ce CV ; chaque paragraphe est contrôlé à son
                  tour.
                </p>
                <LetterLauncher generationId={g.id} />
              </>
            ) : (
              <p>
                <Link to="/connexion" className="link">
                  Connectez-vous
                </Link>{" "}
                pour rédiger une lettre de motivation à partir de ce CV.
              </p>
            )}
          </section>
        </>
      )}
      {exportPdf.isPending && <Spinner label="Création du PDF…" />}
      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette génération ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      >
        Le CV ciblé et sa relecture seront effacés. Votre profil et l'offre sont conservés.
      </ConfirmDialog>
    </div>
  );
}
