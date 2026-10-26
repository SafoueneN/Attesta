import type { Generation } from "@attesta/shared-schemas";
import { useQuery } from "@tanstack/react-query";
import {
  createContext,
  lazy,
  Suspense,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { Link, useNavigate, useParams } from "react-router";
import { cv } from "../../api/endpoints";
import { Loading, QueryError, useDocumentTitle } from "../../components/ui";
import type { HistoryEntry, Judgement } from "../assistants/GenerationAssistants";
import { cvLines, useAssistantResults } from "../assistants/shared";

/*
 * Studio IA (ADR 0029) : l'espace de travail des assistants d'un CV. Trois zones : le rail des six
 * assistants (état et score de chacun), la scène de l'assistant actif, le CV en direct qui montre la ligne
 * dont parle l'assistant et s'anime quand une correction s'y pose. Clavier : 1 à 6, [ et ], Ctrl + K.
 */

const JudgeScene = lazy(() => import("./JudgeScene").then((m) => ({ default: m.JudgeScene })));
const AtsScene = lazy(() => import("./AtsScene").then((m) => ({ default: m.AtsScene })));
const CoachScene = lazy(() => import("./CoachScene").then((m) => ({ default: m.CoachScene })));
const PlanScene = lazy(() => import("./PlanScene").then((m) => ({ default: m.PlanScene })));
const TranslateScene = lazy(() => import("./TranslateScene").then((m) => ({ default: m.TranslateScene })));
const ProfileScene = lazy(() => import("./ProfileScene").then((m) => ({ default: m.ProfileScene })));

export type AssistantId = "profil" | "juge" | "ats" | "traduction" | "coach" | "plan";

/** Les six assistants, rangés selon le moment de la candidature où ils servent. */
export const ASSISTANTS: {
  id: AssistantId;
  key: string;
  label: string;
  group: string;
  icon: string;
  hint: string;
}[] = [
  {
    id: "profil",
    key: "1",
    label: "Intervieweuse",
    group: "Avant",
    icon: "M4 20h4L19 9l-4-4L4 16v4ZM13 7l4 4",
    hint: "Enrichir le profil par la conversation",
  },
  {
    id: "juge",
    key: "2",
    label: "Juge de fidélité",
    group: "Le CV",
    icon: "M12 3v18M5 7h14M5 7l-3 7a3 3 0 0 0 6 0L5 7Zm14 0-3 7a3 3 0 0 0 6 0l-3-7ZM8 21h8",
    hint: "Relire le sens de chaque ligne",
  },
  {
    id: "ats",
    key: "3",
    label: "Conseillère ATS",
    group: "Le CV",
    icon: "M3 7V4h3M21 7V4h-3M3 17v3h3M21 17v3h-3M7 12h10",
    hint: "Voir le CV comme un robot recruteur",
  },
  {
    id: "traduction",
    key: "4",
    label: "Traduction",
    group: "Le CV",
    icon: "M3 5h8M7 3v2m2 0c-1 5-4 8-6 9m3-5c1 2 3 4 5 5M13 21l4-10 4 10m-7-3h6",
    hint: "Le CV en anglais ou en allemand",
  },
  {
    id: "coach",
    key: "5",
    label: "Coach d'entretien",
    group: "Après",
    icon: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3",
    hint: "Entretien blanc, retour STAR",
  },
  {
    id: "plan",
    key: "6",
    label: "Plan de progression",
    group: "Après",
    icon: "M4 19h16M7 15V9m5 6V5m5 10v-3",
    hint: "Acquérir ce qui manque, pour de vrai",
  },
];

interface StudioContextValue {
  generation: Generation;
  variant: "ats" | "design";
  focus: string | null;
  setFocus: (path: string | null) => void;
  open: (id: AssistantId) => void;
}
const StudioContext = createContext<StudioContextValue | null>(null);
export const useStudio = () => useContext(StudioContext)!;

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

/** État de chaque assistant, lu dans ses résultats conservés : ce qui est fait, ce qui attend. */
function useStatuses(generation: Generation) {
  const { stored } = useAssistantResults(generation.id);
  const judge = stored<Judgement>("juge-fidelite");
  const ats = stored<{ keywords: { status: string }[] }>("conseils-ats");
  const history = stored<HistoryEntry[]>("coach-historique") ?? [];
  const plan = stored<{ items: unknown[] }>("plan-progression");
  const translated = ["en", "de"].filter((l) => stored(`traduction:${l}`));
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
  type Tone = "ok" | "warn" | "idle";
  const s = (label: string, tone: Tone) => ({ label, tone });
  return {
    flagged,
    atsPct,
    star,
    byId: {
      profil: s("Profil", "idle"),
      juge: flagged === null ? s("À lancer", "idle") : flagged ? s(String(flagged), "warn") : s("OK", "ok"),
      ats: atsPct === null ? s("À lancer", "idle") : s(`${atsPct} %`, atsPct >= 80 ? "ok" : "warn"),
      traduction: translated.length ? s(translated.join(" ").toUpperCase(), "ok") : s("—", "idle"),
      coach: star === null ? s("—", "idle") : s(`${star.toFixed(1)}/4`, star >= 3 ? "ok" : "warn"),
      plan: plan ? s(String(plan.items.length), "ok") : s("—", "idle"),
    } satisfies Record<AssistantId, { label: string; tone: Tone }>,
  };
}

const TONE = {
  ok: "bg-proved-soft text-proved",
  warn: "bg-flagged-soft text-flagged",
  idle: "bg-surface-sunken text-ink-subtle",
} as const;

/** Le CV tel qu'il sortira : la ligne dont parle l'assistant est surlignée, une correction s'y pose en flash. */
function LiveCv() {
  const { generation, focus } = useStudio();
  const lines = cvLines(generation);
  const previous = useRef(new Map<string, string>());
  const [flash, setFlash] = useState<Set<string>>(new Set());
  useEffect(() => {
    const changed = lines
      .filter((l) => previous.current.has(l.path) && previous.current.get(l.path) !== l.text)
      .map((l) => l.path);
    const added = previous.current.size
      ? lines.filter((l) => !previous.current.has(l.path)).map((l) => l.path)
      : [];
    previous.current = new Map(lines.map((l) => [l.path, l.text]));
    if (changed.length || added.length) {
      setFlash(new Set([...changed, ...added]));
      const t = setTimeout(() => setFlash(new Set()), 2200);
      return () => clearTimeout(t);
    }
  }, [generation.revision]);
  useEffect(() => {
    if (focus)
      document.getElementById(`cv-ligne-${focus}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [focus]);
  const groups = lines.reduce<{ section: string; lines: typeof lines }[]>((acc, l) => {
    const last = acc[acc.length - 1];
    if (last && last.section === l.section) last.lines.push(l);
    else acc.push({ section: l.section, lines: [l] });
    return acc;
  }, []);
  const b = generation.profile.basics;
  return (
    <article className="studio-paper" aria-label="CV en direct">
      <p className="text-lg font-extrabold">{b.name}</p>
      <p className="mb-4 text-xs text-[#536657]">{[b.label, b.location?.city].filter(Boolean).join(" · ")}</p>
      {groups.map((g) => (
        <section key={g.section + g.lines[0]!.path} className="mb-3">
          <h3 className="border-b border-[#d7dcd8] pb-0.5 text-[0.65rem] font-extrabold tracking-[0.08em] text-[#536657] uppercase">
            {g.section}
          </h3>
          <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[0.8rem] leading-relaxed">
            {g.lines.map((l) => (
              <li
                key={l.path}
                id={`cv-ligne-${l.path}`}
                className={`rounded px-1 transition-colors ${focus === l.path ? "cv-focus" : ""} ${flash.has(l.path) ? "cv-flash" : ""}`}
              >
                {l.text}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </article>
  );
}

const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

/** Palette de commandes (Ctrl + K) : un assistant ou une action en quelques lettres. */
function Palette({ onClose }: { onClose: () => void }) {
  const { open } = useStudio();
  const [q, setQ] = useState("");
  const [index, setIndex] = useState(0);
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    ref.current?.showModal?.();
  }, []);
  const actions: { label: string; id: AssistantId; sub: string }[] = [
    ...ASSISTANTS.map((a) => ({ label: a.label, id: a.id, sub: a.hint })),
    { label: "Appliquer les reformulations du juge", id: "juge", sub: "Juge de fidélité" },
    { label: "Placer un mot-clé dans mon CV", id: "ats", sub: "Conseillère ATS" },
    { label: "Préparer mon entretien technique", id: "coach", sub: "Coach d'entretien" },
    { label: "Exporter le CV en anglais", id: "traduction", sub: "Traduction" },
    { label: "Programmer un rappel d'apprentissage", id: "plan", sub: "Plan de progression" },
  ];
  const shown = actions.filter((a) => norm(`${a.label} ${a.sub}`).includes(norm(q.trim()))).slice(0, 8);
  const go = (id: AssistantId) => {
    open(id);
    onClose();
  };
  return (
    <dialog ref={ref} onClose={onClose} aria-label="Demander à un assistant" className="palette">
      <div className="flex items-center gap-3 border-b border-line p-4">
        <Icon path="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-3.5-3.5" className="size-5 text-accent-text" />
        <label htmlFor="palette" className="sr-only">
          Que voulez-vous faire ?
        </label>
        <input
          id="palette"
          autoFocus
          className="flex-1 bg-transparent text-lg outline-none"
          placeholder="Que voulez-vous faire ? (« entretien », « anglais », « LinkedIn »…)"
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setIndex(0);
          }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") setIndex((i) => Math.min(i + 1, shown.length - 1));
            if (e.key === "ArrowUp") setIndex((i) => Math.max(i - 1, 0));
            if (e.key === "Enter" && shown[index]) go(shown[index].id);
          }}
        />
        <kbd className="rounded-md border border-line px-2 py-0.5 text-xs text-ink-subtle">Échap</kbd>
      </div>
      <ul className="max-h-[60vh] overflow-y-auto p-2" role="listbox" aria-label="Suggestions">
        {shown.map((a, i) => {
          const assistant = ASSISTANTS.find((x) => x.id === a.id)!;
          return (
            <li key={a.label} role="option" aria-selected={i === index}>
              <button
                type="button"
                onMouseEnter={() => setIndex(i)}
                onClick={() => go(a.id)}
                className={`flex w-full items-center gap-3 rounded-2xl p-3 text-left transition-colors ${i === index ? "bg-accent-soft ring-1 ring-accent" : ""}`}
              >
                <span className="grid size-9 place-items-center rounded-xl bg-surface-sunken text-accent-text">
                  <Icon path={assistant.icon} />
                </span>
                <span className="flex-1">
                  <span className="block font-semibold">{a.label}</span>
                  <span className="text-xs text-ink-muted">{a.sub}</span>
                </span>
                <kbd className="text-xs text-ink-subtle">{assistant.key}</kbd>
              </button>
            </li>
          );
        })}
        {shown.length === 0 && <li className="p-4 text-sm text-ink-muted">Aucune suggestion.</li>}
      </ul>
      <p className="flex gap-4 border-t border-line px-4 py-2 text-xs text-ink-subtle">
        <span>↑ ↓ naviguer</span>
        <span>Entrée ouvrir</span>
        <span>1 – 8 assistant direct</span>
      </p>
    </dialog>
  );
}

function Scene({ id }: { id: AssistantId }) {
  switch (id) {
    case "profil":
      return <ProfileScene />;
    case "juge":
      return <JudgeScene />;
    case "ats":
      return <AtsScene />;
    case "traduction":
      return <TranslateScene />;
    case "coach":
      return <CoachScene />;
    case "plan":
      return <PlanScene />;
  }
}

function StudioShell({ generation }: { generation: Generation }) {
  const navigate = useNavigate();
  const { assistant } = useParams();
  const active: AssistantId = ASSISTANTS.some((a) => a.id === assistant)
    ? (assistant as AssistantId)
    : "juge";
  const [focus, setFocus] = useState<string | null>(null);
  const [rail, setRail] = useState(true);
  const [paper, setPaper] = useState(true);
  const [palette, setPalette] = useState(false);
  const statuses = useStatuses(generation);
  const open = (id: AssistantId) => {
    setFocus(null);
    const go = () => navigate(`/studio/${generation.id}/${id}`);
    const doc = document as Document & { startViewTransition?: (cb: () => void) => void };
    if (doc.startViewTransition && !window.matchMedia("(prefers-reduced-motion: reduce)").matches)
      doc.startViewTransition(go);
    else go();
  };
  useDocumentTitle(`Studio IA · ${ASSISTANTS.find((a) => a.id === active)!.label}`);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setPalette(true);
        return;
      }
      const t = e.target as HTMLElement;
      if (
        t.closest("input, textarea, select, [contenteditable='true'], dialog") ||
        e.ctrlKey ||
        e.metaKey ||
        e.altKey
      )
        return;
      const a = ASSISTANTS.find((x) => x.key === e.key);
      if (a) open(a.id);
      if (e.key === "[") setRail((v) => !v);
      if (e.key === "]") setPaper((v) => !v);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });
  const ctx = useMemo<StudioContextValue>(
    () => ({ generation, variant: "ats", focus, setFocus, open }),
    [generation, focus],
  );
  const groups = [...new Set(ASSISTANTS.map((a) => a.group))];
  const chip = (label: string, tone: keyof typeof TONE, to: AssistantId) => (
    <button
      type="button"
      onClick={() => open(to)}
      className={`rounded-full px-3 py-1.5 text-xs font-extrabold transition-transform hover:-translate-y-0.5 ${TONE[tone]}`}
    >
      {label}
    </button>
  );
  const score = generation.report ? Math.round(generation.report.score * 100) : null;
  return (
    <StudioContext.Provider value={ctx}>
      <div className="studio flex h-dvh flex-col bg-paper text-ink">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3">
          <Link
            to={`/mes-cv/${generation.id}`}
            className="grid size-9 place-items-center rounded-xl bg-accent text-on-accent"
            aria-label="Retour au CV"
          >
            <Icon path="M15 18l-6-6 6-6" />
          </Link>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-ink-subtle">Studio IA</p>
            <h1 className="truncate text-base font-extrabold">{generation.offerTitle}</h1>
          </div>
          <div className="ml-2 hidden flex-wrap gap-2 2xl:flex">
            {score !== null && chip(`Fidélité ${score} %`, score >= 90 ? "ok" : "warn", "juge")}
            {chip(
              statuses.flagged === null
                ? "Juge à lancer"
                : statuses.flagged
                  ? `Juge · ${statuses.flagged} à revoir`
                  : "Juge · OK",
              statuses.flagged ? "warn" : statuses.flagged === 0 ? "ok" : "idle",
              "juge",
            )}
            {chip(
              statuses.atsPct === null ? "ATS à lancer" : `ATS ${statuses.atsPct} %`,
              statuses.atsPct !== null && statuses.atsPct >= 80 ? "ok" : "idle",
              "ats",
            )}
            {statuses.star !== null &&
              chip(`Entretien ${statuses.star.toFixed(1)}/4`, statuses.star >= 3 ? "ok" : "warn", "coach")}
          </div>
          <button
            type="button"
            onClick={() => setPalette(true)}
            className="ml-auto flex h-10 items-center gap-2 rounded-xl border border-line bg-surface-sunken px-3 text-sm text-ink-muted transition-colors hover:border-accent"
          >
            <Icon path="M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm9 2-3.5-3.5" className="size-4" />
            <span className="hidden sm:inline">Demander à un assistant…</span>
            <kbd className="rounded-md border border-line px-1.5 text-[0.7rem]">Ctrl K</kbd>
          </button>
          <button
            type="button"
            aria-pressed={rail}
            onClick={() => setRail(!rail)}
            className="hidden h-10 rounded-xl border border-line px-3 text-sm font-semibold md:block"
            title="Replier le rail ( [ )"
          >
            Rail
          </button>
          <button
            type="button"
            aria-pressed={paper}
            onClick={() => setPaper(!paper)}
            className="hidden h-10 rounded-xl border border-line px-3 text-sm font-semibold xl:block"
            title="Replier le CV ( ] )"
          >
            CV
          </button>
          <Link
            to={`/mes-cv/${generation.id}#export`}
            className="flex h-10 items-center rounded-full bg-accent px-4 text-sm font-extrabold text-on-accent"
          >
            Exporter
          </Link>
        </header>
        <div className={`studio-grid min-h-0 flex-1 ${rail ? "" : "no-rail"} ${paper ? "" : "no-paper"}`}>
          {rail && (
            <nav
              aria-label="Assistants"
              className="studio-rail overflow-y-auto border-r border-line bg-surface p-3"
            >
              {groups.map((g) => (
                <div key={g} className="mb-2">
                  <p className="px-2 pt-2 pb-1 text-[0.68rem] font-extrabold tracking-[0.08em] text-ink-subtle uppercase">
                    {g}
                  </p>
                  <ul className="space-y-1">
                    {ASSISTANTS.filter((a) => a.group === g).map((a) => {
                      const st = statuses.byId[a.id];
                      const on = a.id === active;
                      return (
                        <li key={a.id}>
                          <button
                            type="button"
                            onClick={() => open(a.id)}
                            aria-current={on ? "page" : undefined}
                            className={`group flex w-full items-center gap-2.5 rounded-2xl p-2 text-left transition-all ${on ? "bg-accent-soft ring-1 ring-accent" : "hover:bg-surface-sunken"}`}
                          >
                            <span
                              className={`grid size-9 shrink-0 place-items-center rounded-xl transition-transform group-hover:scale-110 ${on ? "bg-accent text-on-accent" : "bg-surface-sunken text-accent-text"}`}
                            >
                              <Icon path={a.icon} className="size-[1.1rem]" />
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-bold">{a.label}</span>
                              <span className="block truncate text-[0.7rem] text-ink-subtle">{a.hint}</span>
                            </span>
                            <span
                              className={`rounded-full px-2 py-0.5 text-[0.68rem] font-extrabold ${TONE[st.tone]}`}
                            >
                              {st.label}
                            </span>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ))}
              <p className="mt-3 rounded-2xl bg-surface-sunken p-3 text-[0.7rem] leading-relaxed text-ink-subtle">
                Touches <kbd>1</kbd> à <kbd>{ASSISTANTS.length}</kbd> : changer d'assistant · <kbd>[</kbd>{" "}
                <kbd>]</kbd> : replier les panneaux · <kbd>Ctrl K</kbd> : demander
              </p>
            </nav>
          )}
          <main
            id="contenu"
            className="studio-main min-w-0 overflow-y-auto"
            style={{ viewTransitionName: "studio-scene" }}
          >
            <Suspense fallback={<Loading />}>
              <div key={active} className="scene-enter @container mx-auto max-w-5xl p-5 lg:p-8">
                <Scene id={active} />
              </div>
            </Suspense>
          </main>
          {paper && (
            <aside
              className="studio-cv overflow-y-auto border-l border-line bg-surface p-4"
              aria-label="CV en direct"
            >
              <p className="mb-3 flex items-center justify-between text-sm font-bold">
                CV en direct
                <span className="text-xs font-semibold text-ink-subtle">révision {generation.revision}</span>
              </p>
              <LiveCv />
            </aside>
          )}
        </div>
        {palette && <Palette onClose={() => setPalette(false)} />}
      </div>
    </StudioContext.Provider>
  );
}

/** Studio d'un CV : seul un CV reformulé et vérifié a des assistants. */
export function Studio() {
  const { id = "" } = useParams();
  const query = useQuery({ queryKey: ["generation", id], queryFn: () => cv.generation(id) });
  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  if (query.data.status !== "ok" || !query.data.cv)
    return (
      <div className="shell py-16">
        <QueryError
          error={
            new Error("Ce CV n'a pas de version reformulée : les assistants ne peuvent pas y travailler.")
          }
        />
      </div>
    );
  return <StudioShell generation={query.data} />;
}

/** Bandeau de titre d'une scène : chaque assistant le complète de sa propre mise en scène. */
export function SceneHeader({
  eyebrow,
  title,
  children,
  actions,
}: {
  eyebrow: string;
  title: ReactNode;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end gap-4">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-extrabold tracking-[0.1em] text-accent-text uppercase">{eyebrow}</p>
        <h2 className="mt-1 text-3xl font-extrabold tracking-tight text-balance">{title}</h2>
        {children && <div className="mt-2 max-w-2xl text-sm text-ink-muted">{children}</div>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}
