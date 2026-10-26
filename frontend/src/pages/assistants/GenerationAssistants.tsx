import type {
  AtsAdvice,
  AtsProposal,
  CvTranslation,
  FidelityJudgement,
  Generation,
  InterviewFeedback,
  InterviewPrep,
  InterviewQuestion,
  LearningOverview,
  LearningPlan,
} from "@attesta/shared-schemas";
import type { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { cv, letters } from "../../api/endpoints";
import { useToast } from "../../components/toasts";
import { Alert, Badge, Button, errorMessage } from "../../components/ui";
import { describePointer, factText } from "../../lib/describe";
import { Confetti } from "../../lib/motion";
import {
  AiBadge,
  AssistantPanel,
  CopyButton,
  cvLines,
  DictateButton,
  isoDay,
  ReminderButton,
  Ring,
  Segmented,
  Thinking,
  useAssistantResults,
  useAssistantRun,
  useDictation,
  VoteButtons,
} from "./shared";

/*
 * Assistants d'un CV généré (ADR 0028 ; évolutions ADR 0029) : juge de fidélité, coach d'entretien, plan de
 * progression, traduction et conseillère ATS (la rédactrice est retirée, ADR 0032). Chacun a l'interface de son métier,
 * dit ce qu'il fait et la limite de ce qu'il fait ; aucun ne modifie le CV ou le profil sans validation.
 * Les réponses sont conservées par CV (serveur) : changer d'onglet ne les perd plus.
 */

/** Préférence locale (cases cochées du plan, date de début) : perdue sans conséquence si refusée. */
export function useLocal<T>(key: string, initial: T) {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // non mémorisé : sans conséquence
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** Correction d'une ligne du CV (texte, ou ajout d'un fait recopié) : même chemin que la relecture. */
export function useCorrect(generation: Generation) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (body: {
      lines?: { path: string; text: string }[];
      additions?: { entry: string; text: string; sources: string[] }[];
    }) =>
      cv.correct(generation.id, {
        revision: generation.revision,
        lines: body.lines ?? [],
        additions: body.additions ?? [],
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["generation", generation.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
    },
  });
}

/** Mots normalisés d'un texte (minuscules, sans accents), pour comparer une ligne à ses sources. */
const norm = (w: string) =>
  w
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#]/g, "");

/** Surligne les mots longs d'un texte absents de l'autre : ce qui a été ajouté ou perdu. */
export function Diff({ text, against, tone }: { text: string; against: string; tone: "added" | "lost" }) {
  const other = new Set(against.split(/\s+/).map(norm));
  return (
    <>
      {text.split(/(\s+)/).map((part, i) => {
        const w = norm(part);
        const differs = w.length > 3 && !other.has(w);
        return differs ? (
          <mark
            key={i}
            className={`rounded px-0.5 ${tone === "added" ? "bg-flagged-soft text-flagged" : "bg-proved-soft text-proved"}`}
          >
            {part}
          </mark>
        ) : (
          <Fragment key={i}>{part}</Fragment>
        );
      })}
    </>
  );
}

/* --- 2. Juge de fidélité -------------------------------------------------------------------------------- */

export const VERDICT = {
  fidele: { label: "Fidèle", tone: "success", stamp: "border-proved text-proved" },
  nuance: { label: "Nuance à vérifier", tone: "warning", stamp: "border-flagged text-flagged" },
  infidele: { label: "Infidèle", tone: "error", stamp: "border-removed text-removed" },
} as const;

export type Judgement = FidelityJudgement & { revision: number };

/**
 * Juge d'un CV : verdict conservé, et s'il date d'une révision antérieure du CV, il est « périmé ». La page
 * du CV le lance d'elle-même à l'ouverture si aucun verdict ne correspond à la révision courante.
 */
export function useJudge(generation: Generation) {
  const run = useAssistantRun<Judgement>(generation.id, "juge-fidelite", () => cv.judge(generation.id));
  const stale = Boolean(run.data && run.data.revision !== generation.revision);
  const flagged = run.data && !stale ? run.data.verdicts.filter((v) => v.verdict !== "fidele") : [];
  return { ...run, stale, flagged };
}

/**
 * Verdict exigé avant l'export (ADR 0029) : le juge est lancé à l'ouverture du CV s'il n'a pas jugé la
 * révision courante ; s'il signale des lignes, le candidat confirme les avoir vérifiées.
 */
export function JudgeGate({
  generation,
  onReady,
}: {
  generation: Generation;
  onReady: (ok: boolean) => void;
}) {
  const judge = useJudge(generation);
  const [checked, setChecked] = useState(false);
  const missing = judge.ready && (!judge.data || judge.stale);
  const launched = useRef<number | null>(null);
  useEffect(() => {
    if (missing && !judge.isPending && launched.current !== generation.revision) {
      launched.current = generation.revision;
      judge.mutate();
    }
  }, [missing, judge, generation.revision]);
  const ok = Boolean(judge.data && !judge.stale && (judge.flagged.length === 0 || checked));
  useEffect(() => onReady(ok), [ok, onReady]);
  if (judge.isPending || (missing && !judge.isError))
    return <Thinking label="Le juge de fidélité relit votre CV avant l'export…" />;
  if (judge.isError)
    return (
      <Alert tone="warning" title="Le juge n'a pas pu relire votre CV">
        <p>{errorMessage(judge.error)}</p>
        <Button className="mt-2" variant="secondary" onClick={() => judge.mutate()}>
          Relancer le juge
        </Button>
      </Alert>
    );
  if (!judge.flagged.length)
    return (
      <p className="flex items-center gap-2 text-sm font-semibold text-proved">
        ⚖ Le juge de fidélité n'a relevé aucune nuance.
      </p>
    );
  return (
    <div className="rounded-2xl border-2 border-flagged p-3 text-sm">
      <p className="font-semibold text-flagged">
        ⚖ Le juge signale {judge.flagged.length} ligne(s) à vérifier.{" "}
        <Link to="?onglet=juge" className="link">
          Voir ses avis
        </Link>
      </p>
      <label className="mt-2 flex items-start gap-2">
        <input
          type="checkbox"
          className="mt-0.5 size-4 accent-accent-text"
          checked={checked}
          onChange={(e) => setChecked(e.target.checked)}
        />
        J'ai vérifié les lignes signalées par le juge.
      </label>
    </div>
  );
}

function VerdictCard({
  generation,
  v,
  index,
  line,
}: {
  generation: Generation;
  v: FidelityJudgement["verdicts"][number];
  index: number;
  line: ReturnType<typeof cvLines>[number] | undefined;
}) {
  const toast = useToast();
  const correct = useCorrect(generation);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(line?.text ?? "");
  const current = cvLines(generation).find((l) => l.path === v.path);
  const fixed = Boolean(line && current && current.text !== line.text);
  const sourceText = (line?.sources ?? [])
    .map((s) => factText(generation.profile, s) ?? describePointer(generation.profile, s))
    .join(" ");
  const save = (value: string) =>
    correct.mutate(
      { lines: [{ path: v.path, text: value }] },
      {
        onSuccess: () => {
          toast.success("Ligne corrigée. Relancez le juge pour confirmer.");
          setEditing(false);
        },
      },
    );
  return (
    <li
      className={`card relative animate-enter overflow-hidden ${fixed ? "opacity-70" : ""}`}
      style={{ animationDelay: `${Math.min(index, 12) * 40}ms` }}
    >
      <span
        className={`verdict-stamp absolute top-4 right-4 rounded-lg border-2 px-2 py-0.5 text-xs font-black tracking-wider uppercase ${fixed ? "border-accent text-accent-text" : VERDICT[v.verdict].stamp}`}
      >
        {fixed ? "Corrigée" : VERDICT[v.verdict].label}
      </span>
      <p className="eyebrow pr-36">{line?.section ?? v.path}</p>
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl border border-line p-3">
          <p className="text-xs font-bold text-ink-subtle uppercase">Votre CV dit</p>
          <p className="mt-1 font-medium">
            {line && v.verdict !== "fidele" ? (
              <Diff text={line.text} against={sourceText} tone="added" />
            ) : (
              line?.text
            )}
          </p>
        </div>
        <div className="rounded-2xl bg-surface-sunken p-3">
          <p className="text-xs font-bold text-ink-subtle uppercase">Vos sources disent</p>
          <ul className="mt-1 space-y-1 text-sm text-ink-muted">
            {(line?.sources ?? []).map((s) => {
              const t = factText(generation.profile, s) ?? describePointer(generation.profile, s);
              return (
                <li key={s}>
                  « {line && v.verdict !== "fidele" ? <Diff text={t} against={line.text} tone="lost" /> : t} »
                </li>
              );
            })}
          </ul>
        </div>
      </div>
      {v.verdict !== "fidele" && (
        <p className="mt-2 text-xs text-ink-subtle">
          <mark className="rounded bg-flagged-soft px-1 text-flagged">orange</mark> : mots du CV absents des
          sources · <mark className="rounded bg-proved-soft px-1 text-proved">vert</mark> : mots des sources
          que le CV n'a pas repris.
        </p>
      )}
      <p className="mt-3 flex gap-2 text-sm">
        <span aria-hidden="true">⚖</span>
        <span>
          <span className="font-semibold">Avis du juge : </span>
          {v.explanation}
        </span>
      </p>
      {v.verdict !== "fidele" && !fixed && (
        <div className="mt-3 space-y-3">
          {v.suggestion && (
            <div className="rounded-2xl border-2 border-dashed border-proved bg-proved-soft p-3 text-sm">
              <p className="font-semibold">Reformulation fidèle proposée (déjà contrôlée)</p>
              <p className="mt-1">{v.suggestion}</p>
              <Button className="mt-2" busy={correct.isPending} onClick={() => save(v.suggestion!)}>
                Appliquer cette reformulation
              </Button>
            </div>
          )}
          {editing ? (
            <div className="space-y-2">
              <label htmlFor={`juge-${index}`} className="label">
                Votre correction
              </label>
              <textarea
                id={`juge-${index}`}
                className="input min-h-16"
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <div className="flex gap-2">
                <Button busy={correct.isPending} disabled={!text.trim()} onClick={() => save(text)}>
                  Enregistrer
                </Button>
                <Button variant="ghost" onClick={() => setEditing(false)}>
                  Annuler
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="secondary" onClick={() => setEditing(true)}>
              ✎ Corriger ici
            </Button>
          )}
          {correct.isError && <Alert tone="error">{errorMessage(correct.error)}</Alert>}
        </div>
      )}
    </li>
  );
}

export function JudgePanel({ generation }: { generation: Generation }) {
  const judge = useJudge(generation);
  const [filter, setFilter] = useState<"tout" | "verifier" | "fidele">("verifier");
  const lines = new Map(cvLines(generation).map((l) => [l.path, l]));
  const verdicts = judge.data?.verdicts ?? [];
  const count = (v: keyof typeof VERDICT) => verdicts.filter((x) => x.verdict === v).length;
  const faithful = count("fidele");
  // Rien à vérifier : on montre tout plutôt qu'une liste vide.
  const view = filter === "verifier" && faithful === verdicts.length ? "tout" : filter;
  const shown = verdicts.filter((v) =>
    view === "tout" ? true : view === "fidele" ? v.verdict === "fidele" : v.verdict !== "fidele",
  );
  // Lignes du jugement figées : une correction ne fait pas disparaître la carte, elle la marque « corrigée ».
  const judgedLines = useMemo(() => new Map(lines), [judge.data?.revision]);
  return (
    <AssistantPanel
      icon="⚖"
      role="Relit le sens, ligne par ligne"
      title="Juge de fidélité"
      description="Le contrôle automatique vérifie chiffres et technologies ; le juge relit le sens : « a participé » n'est pas « a dirigé ». Il est lancé à l'ouverture du CV, et son verdict est demandé avant l'export."
      does={["Confronte chaque ligne à ses sources", "Propose une reformulation contrôlée"]}
      never="Ne corrige rien sans votre clic"
      action={judge.data ? "Relancer le juge" : "Faire juger mon CV"}
      onRun={() => judge.mutate()}
      busy={judge.isPending}
      busyLabel="Le juge confronte chaque ligne à vos sources…"
      error={judge.error}
      kind={judge.data?.providerKind}
      voteRole="juge-fidelite"
    >
      {judge.stale && (
        <Alert tone="info" title="Votre CV a changé depuis ce verdict">
          Relancez le juge pour vérifier les lignes corrigées.
        </Alert>
      )}
      {judge.data && (
        <>
          <div className="card flex flex-wrap items-center gap-6">
            <Ring
              value={faithful}
              max={verdicts.length}
              label={
                <>
                  <span className="block text-2xl font-bold">
                    {faithful}/{verdicts.length}
                  </span>
                  <span className="text-xs text-ink-muted">fidèles</span>
                </>
              }
            />
            <div className="min-w-56 flex-1 space-y-3">
              <p className="text-lg font-semibold">
                {verdicts.length - faithful
                  ? `${verdicts.length - faithful} ligne(s) à revoir avant d'envoyer`
                  : "Verdict : le sens de chaque ligne correspond à vos sources"}
              </p>
              <div aria-hidden="true" className="flex h-3 overflow-hidden rounded-full bg-surface-sunken">
                {(["fidele", "nuance", "infidele"] as const).map((v) => (
                  <span
                    key={v}
                    className={`grow-bar ${v === "fidele" ? "bg-proved" : v === "nuance" ? "bg-flagged" : "bg-removed"}`}
                    style={{ width: `${verdicts.length ? (count(v) / verdicts.length) * 100 : 0}%` }}
                  />
                ))}
              </div>
              <p className="flex flex-wrap gap-2">
                {(["fidele", "nuance", "infidele"] as const).map((v) => (
                  <Badge key={v} tone={VERDICT[v].tone}>
                    {count(v)} {VERDICT[v].label.toLowerCase()}
                  </Badge>
                ))}
              </p>
            </div>
          </div>
          <Segmented
            name="filtre-juge"
            legend="Afficher"
            value={view}
            onChange={setFilter}
            options={[
              ["verifier", `À vérifier (${verdicts.length - faithful})`],
              ["fidele", `Fidèles (${faithful})`],
              ["tout", "Tout"],
            ]}
          />
          {shown.length === 0 ? (
            <p className="card text-ink-muted">Aucune ligne dans cette catégorie.</p>
          ) : (
            <ul className="space-y-4">
              {shown.map((v, i) => (
                <VerdictCard
                  key={v.path}
                  generation={generation}
                  v={v}
                  index={i}
                  line={judgedLines.get(v.path)}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </AssistantPanel>
  );
}

/* --- 3. Coach d'entretien ------------------------------------------------------------------------------- */

type Question = z.infer<typeof InterviewQuestion>;
export type Part = "situation" | "task" | "action" | "result";

export const STAR: readonly [Part, string, string, string][] = [
  ["situation", "S", "Situation", "bg-accent-soft"],
  ["task", "T", "Tâche", "bg-flagged-soft"],
  ["action", "A", "Action", "bg-proved-soft"],
  ["result", "R", "Résultat", "bg-removed-soft"],
];

const LEVELS = [
  ["rh", "RH"],
  ["manager", "Manager"],
  ["technique", "Technique"],
] as const;

const ANSWER_SECONDS = 120;

/** Chronomètre d'entraînement : deux minutes ; démarre seul quand le candidat commence à répondre. */
export function Stopwatch({ startSignal }: { startSignal: number }) {
  const [left, setLeft] = useState(ANSWER_SECONDS);
  const [running, setRunning] = useState(false);
  useEffect(() => {
    if (startSignal > 0) setRunning(true);
  }, [startSignal]);
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [running]);
  useEffect(() => {
    if (left === 0) setRunning(false);
  }, [left]);
  const mm = String(Math.floor(left / 60));
  const ss = String(left % 60).padStart(2, "0");
  return (
    <div className="flex items-center gap-3">
      <Ring
        value={left}
        max={ANSWER_SECONDS}
        size={64}
        tone={left > 30 ? "accent" : "flagged"}
        label={<span className="text-sm font-bold tabular-nums">{`${mm}:${ss}`}</span>}
      />
      <Button
        variant="ghost"
        onClick={() => {
          if (left === 0) setLeft(ANSWER_SECONDS);
          setRunning(!running);
        }}
      >
        {running
          ? "Pause"
          : left === ANSWER_SECONDS
            ? "Lancer le chrono"
            : left === 0
              ? "Recommencer"
              : "Reprendre"}
      </Button>
      <span className="sr-only" aria-live="polite">
        {left === 0 ? "Temps écoulé" : ""}
      </span>
    </div>
  );
}

/** Réponse du candidat, extraits STAR surlignés de la couleur de leur partie. */
export function MarkedAnswer({
  answer,
  highlights,
}: {
  answer: string;
  highlights: InterviewFeedback["highlights"];
}) {
  const text = answer.replace(/\s+/g, " ");
  const spans = highlights
    .map((h) => ({ ...h, start: text.indexOf(h.excerpt) }))
    .filter((h) => h.start >= 0)
    .sort((a, b) => a.start - b.start);
  const parts: ReactNode[] = [];
  let at = 0;
  for (const h of spans) {
    if (h.start < at) continue;
    parts.push(text.slice(at, h.start));
    const color = STAR.find(([p]) => p === h.part)![3];
    const label = STAR.find(([p]) => p === h.part)![2];
    parts.push(
      <mark key={h.start} className={`rounded px-0.5 text-ink ${color}`} title={label}>
        {h.excerpt}
        <sup className="ml-0.5 text-[0.6rem] font-black">{STAR.find(([p]) => p === h.part)![1]}</sup>
      </mark>,
    );
    at = h.start + h.excerpt.length;
  }
  parts.push(text.slice(at));
  return <p className="rounded-2xl bg-surface p-3 text-sm leading-relaxed">{parts}</p>;
}

export function CoachQuestion({
  q,
  generation,
  index,
  onFeedback,
  onFollowUp,
}: {
  q: Question;
  generation: Generation;
  index: number;
  onFeedback: (answer: string, feedback: InterviewFeedback) => void;
  onFollowUp: (question: string) => void;
}) {
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(false);
  const [startSignal, setStartSignal] = useState(0);
  const dictation = useDictation((t) => setAnswer((a) => (a ? `${a} ${t}` : t)));
  const feedback = useMutation({
    mutationFn: () => cv.interviewFeedback(generation.id, { question: q.question, answer }),
    onSuccess: (data) => onFeedback(answer, data),
  });
  const id = `entretien-${index}`;
  const score = feedback.data ? STAR.filter(([k]) => feedback.data.star[k]).length : 0;
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const pace = dictation.seconds > 5 ? Math.round((words / dictation.seconds) * 60) : null;
  return (
    <div className="space-y-5">
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-full bg-ink text-lg text-paper"
        >
          👤
        </span>
        <div className="chat-bubble chat-bubble-in max-w-2xl">
          <p className="text-xs font-bold text-ink-subtle uppercase">
            {q.intent === "Relance" ? "Le recruteur relance" : "Le recruteur"}
          </p>
          <p className="mt-1 text-lg font-semibold">{q.question}</p>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button variant="ghost" aria-expanded={hint} onClick={() => setHint(!hint)}>
          {hint ? "Masquer l'indice" : "💡 Voir l'indice du coach"}
        </Button>
        <Stopwatch startSignal={startSignal} />
        <DictateButton dictation={dictation} />
      </div>
      {hint && (
        <div className="animate-enter grid gap-3 md:grid-cols-2">
          <div className="rounded-2xl bg-accent-soft p-4 text-sm">
            <p className="font-semibold">Ce que le recruteur vérifie</p>
            <p className="mt-1">{q.intent}</p>
            <p className="mt-2">💡 {q.tip}</p>
          </div>
          {q.sources.length > 0 && (
            <div className="rounded-2xl bg-proved-soft p-4 text-sm">
              <p className="font-semibold">Vos atouts pour répondre</p>
              <ul className="mt-1 space-y-1">
                {q.sources.map((s) => (
                  <li key={s}>
                    ✓ {factText(generation.profile, s) ?? describePointer(generation.profile, s)}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      <div className="space-y-2">
        <label htmlFor={id} className="label">
          Votre réponse (Situation, Tâche, Action, Résultat)
        </label>
        <textarea
          id={id}
          className="input min-h-32"
          maxLength={4000}
          value={answer}
          onChange={(e) => {
            if (!answer && e.target.value) setStartSignal((n) => n + 1);
            setAnswer(e.target.value);
          }}
          placeholder="Chez …, la situation était … Ma mission : … J'ai … Résultat : …"
        />
        <p className="flex flex-wrap gap-3 text-xs text-ink-subtle">
          <span>{words} mots</span>
          {pace !== null && (
            <span
              className={
                pace < 100 || pace > 180 ? "font-semibold text-flagged" : "font-semibold text-proved"
              }
            >
              Débit à l'oral : {pace} mots/min (idéal : 120 à 160)
            </span>
          )}
        </p>
        <Button
          busy={feedback.isPending}
          disabled={answer.trim().length < 10}
          onClick={() => feedback.mutate()}
        >
          Soumettre au coach
        </Button>
      </div>
      {feedback.isPending && <Thinking label="Le coach écoute votre réponse…" />}
      {feedback.isError && <Alert tone="error">{errorMessage(feedback.error)}</Alert>}
      {feedback.data && (
        <div className="animate-enter space-y-4 rounded-3xl border border-line bg-surface-sunken p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold">Méthode STAR : {score} sur 4</p>
            <div className="flex flex-wrap items-center gap-3">
              <AiBadge kind={feedback.data.providerKind} />
              <VoteButtons role="coach-retour" kind={feedback.data.providerKind} />
            </div>
          </div>
          <ol className="grid grid-cols-4 gap-2">
            {STAR.map(([key, letter, label], i) => {
              const ok = feedback.data.star[key];
              return (
                <li
                  key={key}
                  className={`star-tile rounded-2xl border-2 p-3 text-center ${ok ? "border-proved bg-proved-soft" : "border-dashed border-line"}`}
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span className={`block text-2xl font-black ${ok ? "text-proved" : "text-ink-subtle"}`}>
                    {letter}
                  </span>
                  <span className="text-xs font-semibold">
                    {label} {ok ? "✓" : "manque"}
                  </span>
                </li>
              );
            })}
          </ol>
          {feedback.data.highlights.length > 0 && (
            <div className="space-y-1">
              <p className="text-sm font-semibold">Où le coach a repéré chaque partie</p>
              <MarkedAnswer answer={answer} highlights={feedback.data.highlights} />
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            {feedback.data.strengths.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-proved">Points forts</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {feedback.data.strengths.map((s) => (
                    <li key={s}>＋ {s}</li>
                  ))}
                </ul>
              </div>
            )}
            {feedback.data.improvements.length > 0 && (
              <div>
                <p className="text-sm font-semibold text-flagged">À travailler</p>
                <ul className="mt-1 space-y-1 text-sm">
                  {feedback.data.improvements.map((s) => (
                    <li key={s}>→ {s}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
          {feedback.data.facts.length > 0 && (
            <p className="text-sm">
              <span className="font-semibold">Faits de votre profil à citer : </span>
              {feedback.data.facts.map((f) => `« ${f.text} »`).join(" · ")}
            </p>
          )}
          {feedback.data.followUp && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-line p-3">
              <p className="min-w-0 flex-1 text-sm">
                <span className="font-semibold">Le recruteur pourrait relancer : </span>«{" "}
                {feedback.data.followUp} »
              </p>
              <Button variant="secondary" onClick={() => onFollowUp(feedback.data.followUp!)}>
                M'entraîner sur la relance
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export type HistoryEntry = { question: string; answer: string; feedback: InterviewFeedback; at: string };

export const starScore = (f: InterviewFeedback) => Object.values(f.star).filter(Boolean).length;

export function InterviewPanel({ generation }: { generation: Generation }) {
  const [level, setLevel] = useState<"rh" | "manager" | "technique">("manager");
  const prep = useAssistantRun<InterviewPrep>(generation.id, `coach-questions:${level}`, () =>
    cv.interview(generation.id, level),
  );
  const results = useAssistantResults(generation.id);
  const history = results.stored<HistoryEntry[]>("coach-historique") ?? [];
  const [extra, setExtra] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [session, setSession] = useState<Record<number, InterviewFeedback>>({});
  const [bilan, setBilan] = useState(false);
  const box = useRef<HTMLDivElement>(null);
  const [full, setFull] = useState(false);
  useEffect(() => {
    const onChange = () => setFull(document.fullscreenElement === box.current);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  useEffect(() => {
    setExtra([]);
    setCurrent(0);
    setSession({});
    setBilan(false);
  }, [level, prep.data]);
  const questions = [...(prep.data?.questions ?? []), ...extra];
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void box.current?.requestFullscreen?.();
  };
  const answered = Object.keys(session).length;
  const recent = history.slice(-10);
  return (
    <AssistantPanel
      icon="🎤"
      role="Simulation d'entretien"
      title="Coach d'entretien"
      description={`Un entretien blanc pour « ${generation.offerTitle} » : choisissez le niveau, répondez à l'écrit ou à la voix (chrono en option), le coach commente selon la méthode STAR et le recruteur relance.`}
      does={["Questions selon le niveau", "Relances et retour STAR"]}
      never="N'invente aucun fait à raconter"
      action={prep.data ? "Nouvelles questions" : "Démarrer l'entretien blanc"}
      onRun={() => prep.mutate()}
      busy={prep.isPending}
      busyLabel="Le recruteur prépare ses questions…"
      error={prep.error}
      kind={prep.data?.providerKind}
      voteRole="coach-questions"
    >
      <div className="card">
        <Segmented
          name="niveau"
          legend="Niveau de l'entretien"
          value={level}
          onChange={setLevel}
          options={LEVELS}
        />
      </div>
      {questions.length > 0 && (
        <div ref={box} className={`card space-y-6 ${full ? "overflow-y-auto bg-paper p-8" : ""}`}>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="font-semibold" aria-live="polite">
              {bilan ? "Bilan de l'entretien" : `Question ${current + 1} sur ${questions.length}`}
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <ol className="flex gap-2" aria-label="Progression de l'entretien">
                {questions.map((q, i) => (
                  <li key={q.question}>
                    <button
                      type="button"
                      aria-label={`Question ${i + 1}${session[i] ? ", répondue" : ""}`}
                      aria-current={!bilan && i === current ? "step" : undefined}
                      onClick={() => {
                        setBilan(false);
                        setCurrent(i);
                      }}
                      className={`block h-2.5 rounded-full transition-all ${!bilan && i === current ? "w-8 bg-accent" : session[i] ? "w-2.5 bg-proved" : "w-2.5 bg-line-strong"}`}
                    />
                  </li>
                ))}
              </ol>
              <Button variant="ghost" onClick={toggleFull} aria-pressed={full}>
                {full ? "⤡ Quitter le plein écran" : "⤢ Plein écran"}
              </Button>
            </div>
          </div>
          {bilan ? (
            <div className="space-y-4">
              <p className="text-lg font-semibold">
                {answered} réponse{answered > 1 ? "s" : ""} travaillée{answered > 1 ? "s" : ""} sur{" "}
                {questions.length}
                {answered > 0 &&
                  ` · moyenne STAR ${(Object.values(session).reduce((n, f) => n + starScore(f), 0) / answered).toFixed(1)} sur 4`}
              </p>
              <ul className="space-y-2">
                {questions.map((q, i) => (
                  <li
                    key={q.question}
                    className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3"
                  >
                    <span className="min-w-0 flex-1 text-sm">{q.question}</span>
                    {session[i] ? (
                      <span className="flex gap-1" aria-label={`STAR ${starScore(session[i])} sur 4`}>
                        {STAR.map(([k, letter]) => (
                          <span
                            key={k}
                            className={`grid size-6 place-items-center rounded-md text-xs font-black ${session[i]!.star[k] ? "bg-proved text-on-accent" : "bg-surface-sunken text-ink-subtle"}`}
                          >
                            {letter}
                          </span>
                        ))}
                      </span>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setBilan(false);
                          setCurrent(i);
                        }}
                      >
                        Répondre
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            questions.map((q, i) => (
              <div key={q.question} hidden={i !== current} className={i === current ? "step-forward" : ""}>
                <CoachQuestion
                  q={q}
                  generation={generation}
                  index={i}
                  onFeedback={(answer, feedback) => {
                    setSession((s) => ({ ...s, [i]: feedback }));
                    results.remember("coach-historique", [
                      ...history.slice(-29),
                      { question: q.question, answer, feedback, at: new Date().toISOString() },
                    ]);
                  }}
                  onFollowUp={(question) => {
                    setExtra((list) =>
                      list.some((x) => x.question === question)
                        ? list
                        : [
                            ...list,
                            {
                              question,
                              intent: "Relance",
                              sources: [],
                              tip: "Restez précis : un fait, un chiffre, votre rôle exact.",
                            },
                          ],
                    );
                    setCurrent(questions.length);
                  }}
                />
              </div>
            ))
          )}
          <div className="flex flex-wrap justify-between gap-3 border-t border-line pt-4">
            <Button
              variant="secondary"
              disabled={bilan || current === 0}
              onClick={() => setCurrent(current - 1)}
            >
              ← Question précédente
            </Button>
            {!bilan && current < questions.length - 1 ? (
              <Button onClick={() => setCurrent(current + 1)}>Question suivante →</Button>
            ) : (
              <Button onClick={() => setBilan(!bilan)}>
                {bilan ? "Revenir aux questions" : "Voir le bilan"}
              </Button>
            )}
          </div>
        </div>
      )}
      {recent.length > 0 && (
        <section className="card space-y-3" aria-labelledby="historique-coach">
          <h3 id="historique-coach" className="font-semibold">
            Votre progression ({history.length} entraînement{history.length > 1 ? "s" : ""})
          </h3>
          <div className="flex h-24 items-end gap-2" aria-hidden="true">
            {recent.map((h) => (
              <span
                key={h.at}
                title={`${new Date(h.at).toLocaleDateString("fr-FR")} : ${starScore(h.feedback)} sur 4`}
                className="grow-bar w-full max-w-10 rounded-t-lg bg-accent"
                style={{ height: `${(starScore(h.feedback) / 4) * 100}%`, minHeight: 6 }}
              />
            ))}
          </div>
          <ul className="space-y-1 text-sm text-ink-muted">
            {recent
              .slice()
              .reverse()
              .slice(0, 5)
              .map((h) => (
                <li key={h.at}>
                  {new Date(h.at).toLocaleDateString("fr-FR")} · STAR {starScore(h.feedback)}/4 · {h.question}
                </li>
              ))}
          </ul>
        </section>
      )}
    </AssistantPanel>
  );
}

/* --- 4. Plan de progression ----------------------------------------------------------------------------- */

export const LANES = ["bg-accent", "bg-proved", "bg-flagged", "bg-ink-muted"];
export const dayFmt = new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "short" });
export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T12:00:00`);
  d.setDate(d.getDate() + days);
  return d;
};

export function PlanView({
  generationId,
  items,
  scope,
}: {
  generationId: string;
  items: LearningPlan["items"];
  scope: string;
}) {
  const [checked, setChecked] = useLocal<string[]>(`attesta-plan-${scope}`, []);
  const [start, setStart] = useLocal<string>(`attesta-plan-debut-${scope}`, isoDay(0));
  const [party, setParty] = useState(false);
  const totalWeeks = items.reduce((n, i) => n + i.weeks, 0);
  const allSteps = items.flatMap((i) =>
    i.steps.map((s) => ({ key: `${i.skill}::${s}`, step: s, skill: i.skill })),
  );
  const doneSteps = allSteps.filter((s) => checked.includes(s.key)).length;
  const next = allSteps.find((s) => !checked.includes(s.key));
  const elapsed = Math.max(0, (Date.now() - addDays(start, 0).getTime()) / (7 * 86_400_000));
  const toggle = (key: string, on: boolean, skill: string) => {
    setChecked((l) => {
      const list = on ? [...l, key] : l.filter((k) => k !== key);
      const item = items.find((i) => i.skill === skill)!;
      const complete = item.steps.every((s) => list.includes(`${skill}::${s}`));
      if (on && complete) {
        setParty(true);
        setTimeout(() => setParty(false), 2600);
      }
      return list;
    });
  };
  let offset = 0;
  return (
    <>
      {party && <Confetti />}
      <div className="card space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-lg font-semibold">
            ≈ {totalWeeks} semaine{totalWeeks > 1 ? "s" : ""} pour {items.length} compétence
            {items.length > 1 ? "s" : ""}
          </p>
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label htmlFor={`debut-${scope}`} className="label">
                Début du plan
              </label>
              <input
                id={`debut-${scope}`}
                type="date"
                className="input"
                value={start}
                onChange={(e) => e.target.value && setStart(e.target.value)}
              />
            </div>
            <Badge tone={doneSteps === allSteps.length ? "success" : "info"}>
              {doneSteps}/{allSteps.length} étapes faites
            </Badge>
          </div>
        </div>
        {/* Frise datée : chaque compétence occupe sa durée ; le trait vertical marque aujourd'hui. */}
        <div className="relative">
          <div className="flex h-9 overflow-hidden rounded-full bg-surface-sunken">
            {items.map((item, i) => {
              const from = offset;
              offset += item.weeks;
              return (
                <span
                  key={item.skill}
                  title={`${item.skill} : du ${dayFmt.format(addDays(start, from * 7))} au ${dayFmt.format(addDays(start, offset * 7))}`}
                  className={`grow-bar flex items-center truncate border-r-2 border-surface px-3 text-xs font-bold text-on-accent ${LANES[i % LANES.length]}`}
                  style={{ width: `${(item.weeks / totalWeeks) * 100}%`, animationDelay: `${i * 150}ms` }}
                >
                  {item.skill}
                </span>
              );
            })}
          </div>
          {elapsed > 0 && elapsed < totalWeeks && (
            <span
              aria-hidden="true"
              className="absolute -top-1 h-11 w-0.5 rounded bg-ink"
              style={{ left: `${(elapsed / totalWeeks) * 100}%` }}
            />
          )}
          <div className="mt-1 flex justify-between text-xs text-ink-subtle">
            <span>{dayFmt.format(addDays(start, 0))}</span>
            <span>{dayFmt.format(addDays(start, totalWeeks * 7))}</span>
          </div>
        </div>
      </div>
      {next && (
        <div className="card flex flex-wrap items-center gap-4 border-accent">
          <span aria-hidden="true" className="text-3xl">
            👉
          </span>
          <div className="min-w-0 flex-1">
            <p className="eyebrow">Prochaine étape · {next.skill}</p>
            <p className="mt-1 text-lg font-semibold">{next.step}</p>
          </div>
          <Button onClick={() => toggle(next.key, true, next.skill)}>✓ C'est fait</Button>
          <ReminderButton
            kind="progression"
            title={next.step}
            detail={`Compétence : ${next.skill}.`}
            link={`/mes-cv/${generationId}?onglet=progression`}
          />
        </div>
      )}
      <ol className="relative space-y-5 border-l-2 border-dashed border-line pl-6">
        {items.map((item, i) => {
          const steps = item.steps.map((s) => `${item.skill}::${s}`);
          const done = steps.filter((s) => checked.includes(s)).length;
          const from = items.slice(0, i).reduce((n, x) => n + x.weeks, 0);
          return (
            <li
              key={item.skill}
              className="card relative animate-enter space-y-3"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span
                aria-hidden="true"
                className={`absolute top-6 -left-[2.15rem] size-4 rounded-full ring-4 ring-paper ${done === steps.length ? "bg-proved" : LANES[i % LANES.length]}`}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-lg font-semibold">
                  {done === steps.length && "✅ "}
                  {item.skill}
                </h3>
                <Badge tone="info">
                  {dayFmt.format(addDays(start, from * 7))} →{" "}
                  {dayFmt.format(addDays(start, (from + item.weeks) * 7))}
                </Badge>
              </div>
              <p className="text-sm text-ink-muted">{item.why}</p>
              <fieldset className="space-y-2">
                <legend className="sr-only">Étapes pour {item.skill}</legend>
                {item.steps.map((step, j) => (
                  <label
                    key={step}
                    className="flex cursor-pointer items-start gap-3 rounded-xl p-2 text-sm transition-colors hover:bg-surface-sunken has-checked:text-ink-muted has-checked:line-through"
                  >
                    <input
                      type="checkbox"
                      className="mt-0.5 size-4 accent-accent-text"
                      checked={checked.includes(steps[j]!)}
                      onChange={(e) => toggle(steps[j]!, e.target.checked, item.skill)}
                    />
                    {step}
                  </label>
                ))}
              </fieldset>
              {item.resources.length > 0 && (
                <ul className="flex flex-wrap gap-2 text-sm">
                  {item.resources.map((r) => (
                    <li key={r.url}>
                      <a href={r.url} target="_blank" rel="noreferrer" className="link">
                        📚 {r.title}
                      </a>
                    </li>
                  ))}
                </ul>
              )}
              <div className="rounded-2xl border-2 border-dashed border-proved bg-proved-soft p-3 text-sm">
                <p className="font-semibold">🏆 Projet qui le prouvera</p>
                <p className="mt-1">{item.project}</p>
                <Link
                  to={`/assistants/profil?sujet=${encodeURIComponent(item.skill)}`}
                  className={`mt-2 inline-block font-semibold ${done === steps.length ? "link" : "text-ink-muted underline"}`}
                >
                  Projet mené ? Racontez-le à l'intervieweuse pour l'ajouter à votre profil →
                </Link>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

export function LearningPanel({ generation }: { generation: Generation }) {
  const [scope, setScope] = useState<"cv" | "tous">("cv");
  const plan = useAssistantRun<LearningPlan>(generation.id, "plan-progression", () =>
    cv.learningPlan(generation.id),
  );
  const overview = useQuery<LearningOverview>({
    queryKey: ["plan-global"],
    queryFn: cv.learningOverview,
    enabled: scope === "tous",
    staleTime: Infinity,
  });
  const missing = generation.cv!.missingKeywords;
  const data = scope === "cv" ? plan.data : overview.data;
  return (
    <AssistantPanel
      icon="📈"
      role="Feuille de route"
      title="Plan de progression"
      description={
        scope === "tous"
          ? "Les compétences absentes de votre profil, sur tous vos CV : celles que plusieurs offres demandent passent en premier."
          : missing.length
            ? `Compétences demandées par l'offre et absentes de votre profil : ${missing.slice(0, 6).join(", ")}. Le plan vous aide à les acquérir pour de vrai.`
            : "Aucune compétence de cette offre ne manque à votre profil. Regardez le plan sur tous vos CV."
      }
      does={["Plan daté, ressources officielles", "Rappels par courriel"]}
      never="N'ajoute pas la compétence à votre CV"
      action={scope === "cv" ? (plan.data ? "Recalculer le plan" : "Construire ma feuille de route") : ""}
      onRun={scope === "cv" && missing.length ? () => plan.mutate() : undefined}
      busy={plan.isPending || overview.isFetching}
      busyLabel="L'assistant trace votre feuille de route…"
      error={scope === "cv" ? plan.error : overview.error}
      kind={data?.providerKind}
      voteRole="plan-progression"
    >
      <div className="card">
        <Segmented
          name="portee-plan"
          legend="Portée du plan"
          value={scope}
          onChange={setScope}
          options={[
            ["cv", "Cette offre"],
            ["tous", "Tous mes CV"],
          ]}
        />
      </div>
      {scope === "tous" && overview.data && overview.data.skills.length > 0 && (
        <div className="card space-y-2">
          <h3 className="font-semibold">Les compétences les plus demandées par vos offres</h3>
          <ul className="space-y-2">
            {overview.data.skills.map((s) => (
              <li key={s.skill} className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate font-semibold">{s.skill}</span>
                <span className="h-2 flex-1 rounded-full bg-surface-sunken">
                  <span
                    className="grow-bar block h-2 rounded-full bg-accent"
                    style={{ width: `${(s.offers / overview.data.skills[0]!.offers) * 100}%` }}
                  />
                </span>
                <span className="w-20 text-right text-ink-muted" title={s.offerTitles.join(" · ")}>
                  {s.offers} offre{s.offers > 1 ? "s" : ""}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
      {data && data.items.length > 0 && (
        <PlanView
          key={scope}
          generationId={generation.id}
          items={data.items}
          scope={scope === "cv" ? generation.id : "global"}
        />
      )}
      {scope === "tous" && overview.data && overview.data.items.length === 0 && (
        <p className="card text-ink-muted">Aucune compétence ne manque à votre profil sur vos CV. Bravo !</p>
      )}
    </AssistantPanel>
  );
}

/* --- 6. Traduction fidèle ------------------------------------------------------------------------------- */

const LANGS = [
  ["en", "Anglais"],
  ["de", "Allemand"],
] as const;

export function TranslationPanel({
  generation,
  variant,
}: {
  generation: Generation;
  variant: "ats" | "design";
}) {
  const toast = useToast();
  const [lang, setLang] = useState<"en" | "de">("en");
  const [view, setView] = useState<"cote" | "document">("cote");
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState(false);
  const results = useAssistantResults(generation.id);
  const translate = useAssistantRun<CvTranslation>(generation.id, `traduction:${lang}`, () =>
    cv.translate(generation.id, lang),
  );
  const data = translate.data;
  useEffect(() => {
    setEdits({});
    setEditing(null);
  }, [lang, data]);
  const save = useMutation({
    mutationFn: () =>
      cv.editTranslation(
        generation.id,
        lang,
        Object.entries(edits).map(([path, text]) => ({ path, text })),
      ),
    onSuccess: (saved) => {
      results.remember(`traduction:${lang}`, saved);
      toast.success("Traduction enregistrée.");
    },
  });
  const exportPdf = useMutation({
    mutationFn: () => letters.exportCv({ generationId: generation.id, variant, lang }),
  });
  const all = cvLines(generation);
  const byPath = new Map((data?.lines ?? []).map((l) => [l.path, l]));
  const rejected = new Set(data?.rejectedPaths ?? []);
  const textOf = (path: string) => edits[path] ?? byPath.get(path)?.text;
  const grouped = all.reduce<[string, typeof all][]>((acc, l) => {
    const last = acc[acc.length - 1];
    if (last && last[0] === l.section) last[1].push(l);
    else acc.push([l.section, [l]]);
    return acc;
  }, []);
  const LineEditor = ({ path, original }: { path: string; original: string }) =>
    editing === path ? (
      <span className="block space-y-2">
        <textarea
          aria-label="Traduction de la ligne"
          className="input min-h-16 text-ink"
          lang={lang}
          value={textOf(path) ?? original}
          onChange={(e) => setEdits((m) => ({ ...m, [path]: e.target.value }))}
          autoFocus
        />
        <Button variant="ghost" onClick={() => setEditing(null)}>
          OK
        </Button>
      </span>
    ) : (
      <button
        type="button"
        onClick={() => setEditing(path)}
        className={`w-full rounded-lg p-1 text-left transition-colors hover:bg-accent-soft ${edits[path] ? "outline-2 outline-accent outline-dashed" : ""}`}
        title="Cliquer pour modifier"
      >
        {rejected.has(path) && !edits[path] ? (
          <>
            {original} <Badge tone="warning">original gardé</Badge>
          </>
        ) : (
          (textOf(path) ?? original)
        )}
      </button>
    );
  return (
    <AssistantPanel
      icon="🌍"
      role="Traduit sans rien ajouter"
      title="Traduction fidèle"
      description="Chaque ligne est traduite séparément ; chiffres et noms propres (employeurs, outils, projets) sont vérifiés. Modifiez une ligne d'un clic, puis exportez le CV traduit en PDF."
      does={["Glossaire métier imposé", "Export PDF traduit"]}
      never="N'embellit pas le texte d'origine"
      action=""
      kind={data?.providerKind}
      busy={translate.isPending}
      busyLabel="Traduction ligne par ligne…"
      error={translate.error}
      voteRole="traduction"
    >
      <div className="card flex flex-wrap items-end gap-4">
        <Segmented name="langue" legend="Langue" value={lang} onChange={setLang} options={LANGS} />
        <Button busy={translate.isPending} onClick={() => translate.mutate()}>
          {data ? "Retraduire" : "Traduire mon CV"}
        </Button>
        {data && (
          <>
            <Segmented
              name="vue-traduction"
              legend="Affichage"
              value={view}
              onChange={setView}
              options={[
                ["cote", "Côte à côte"],
                ["document", "CV traduit"],
              ]}
            />
            <CopyButton
              text={all.map((l) => textOf(l.path) ?? l.text).join("\n")}
              label="Copier la traduction"
            />
          </>
        )}
      </div>
      {data && (
        <>
          {data.providerKind === "demo" && (
            <Alert tone="info">
              Démonstration : traduction approximative, mot à mot, sans modèle. Avec l'IA, la traduction est
              complète et naturelle.
            </Alert>
          )}
          {data.rejected > 0 && (
            <Alert tone="warning">
              {data.rejected} ligne(s) écartée(s) (chiffres ou noms propres modifiés) : l'original est gardé à
              leur place. Vous pouvez les traduire vous-même d'un clic.
            </Alert>
          )}
          {view === "cote" ? (
            <div className="card p-0">
              <div className="grid grid-cols-2 border-b border-line text-xs font-bold text-ink-subtle uppercase">
                <p className="p-3">Original (français)</p>
                <p className="border-l border-line p-3">
                  {LANGS.find(([l]) => l === lang)![1]} · cliquez pour modifier
                </p>
              </div>
              <ul>
                {all.map((l, i) => (
                  <li
                    key={l.path}
                    className="grid animate-enter grid-cols-2 border-b border-line last:border-0"
                    style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                  >
                    <p className="p-3 text-sm text-ink-muted">{l.text}</p>
                    <div className="border-l border-line p-2 font-medium" lang={lang}>
                      <LineEditor path={l.path} original={l.text} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <article lang={lang} className="paper-sheet mx-auto max-w-3xl space-y-5">
              {grouped.map(([section, lines]) => (
                <section key={section + lines[0]!.path}>
                  <h3 className="border-b border-line pb-1 text-sm font-bold tracking-wide uppercase">
                    {section}
                  </h3>
                  <ul className="mt-2 list-disc space-y-1 pl-5">
                    {lines.map((l) => (
                      <li key={l.path}>
                        <LineEditor path={l.path} original={l.text} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          )}
          {Object.keys(edits).length > 0 && (
            <div className="flex flex-wrap items-center gap-3">
              <Button busy={save.isPending} onClick={() => save.mutate()}>
                Enregistrer mes modifications ({Object.keys(edits).length})
              </Button>
              <Button variant="ghost" onClick={() => setEdits({})}>
                Annuler
              </Button>
              {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
            </div>
          )}
          <div className="card space-y-3">
            <h3 className="font-semibold">Exporter le CV traduit</h3>
            <label className="flex items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-4 accent-accent-text"
                checked={reviewed}
                onChange={(e) => setReviewed(e.target.checked)}
              />
              J'ai relu la traduction : chaque ligne dit ce que dit l'original.
            </label>
            <Button
              busy={exportPdf.isPending}
              disabled={!reviewed || Object.keys(edits).length > 0}
              onClick={() => exportPdf.mutate()}
            >
              Télécharger le CV en {lang === "en" ? "anglais" : "allemand"} (PDF)
            </Button>
            {Object.keys(edits).length > 0 && (
              <p className="text-xs text-ink-subtle">Enregistrez d'abord vos modifications.</p>
            )}
            {exportPdf.isError && <Alert tone="error">{errorMessage(exportPdf.error)}</Alert>}
          </div>
        </>
      )}
    </AssistantPanel>
  );
}

/* --- 8. Conseillère ATS --------------------------------------------------------------------------------- */

const ATS_COLUMNS = [
  ["place", "Déjà dans votre CV", "Le logiciel les trouvera.", "border-proved", "bg-proved-soft text-proved"],
  [
    "a_placer",
    "À faire apparaître",
    "Glissez-les sur votre CV, ou « Placer ».",
    "border-flagged",
    "bg-flagged-soft text-flagged",
  ],
  [
    "absent",
    "Absents de votre profil",
    "Ne les ajoutez pas.",
    "border-line",
    "bg-surface-sunken text-ink-muted",
  ],
] as const;

/** Entrée du CV (`/work/0`, `/summary`) à laquelle appartient une ligne ; le titre n'en a pas. */
export const entryOf = (path: string) =>
  path.startsWith("/summary") ? "/summary" : /^\/(work|projects)\/\d+/.exec(path)?.[0];

/** Surligne dans un texte les mots-clés trouvés. */
export function Highlighted({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const escaped = terms
    .map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .sort((a, b) => b.length - a.length);
  // Mots entiers seulement : « BI » ne doit pas s’allumer dans « Fiabilisation ».
  const parts = text.split(
    new RegExp(String.raw`(?<![\p{L}\p{N}])(${escaped.join("|")})(?![\p{L}\p{N}])`, "giu"),
  );
  return (
    <>
      {parts.map((p, i) =>
        terms.some((t) => t.toLowerCase() === p.toLowerCase()) ? (
          <mark key={i} className="rounded bg-proved-soft px-0.5 font-semibold text-proved">
            {p}
          </mark>
        ) : (
          <Fragment key={i}>{p}</Fragment>
        ),
      )}
    </>
  );
}

export function AtsPanel({ generation, variant }: { generation: Generation; variant: "ats" | "design" }) {
  const toast = useToast();
  const advice = useAssistantRun<AtsAdvice>(generation.id, "conseils-ats", () => cv.ats(generation.id));
  const correct = useCorrect(generation);
  const [proposal, setProposal] = useState<AtsProposal | null>(null);
  const [before, setBefore] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["ats-overview", generation.revision], queryFn: cv.atsOverview });
  const apply = useMutation({
    mutationFn: ({ term, entry }: { term: string; entry?: string }) =>
      cv.atsApply(generation.id, term, entry),
    onSuccess: setProposal,
  });
  const keywords = advice.data?.keywords ?? [];
  const placed = keywords.filter((k) => k.status === "place").length;
  const possible = keywords.filter((k) => k.status !== "absent").length;
  const pct = (n: number) => (keywords.length ? Math.round((n / keywords.length) * 100) : 0);
  const placedTerms = keywords.filter((k) => k.status === "place").map((k) => k.term);
  const lines = cvLines(generation);
  const groups = lines.reduce<{ entry: string | undefined; section: string; lines: typeof lines }[]>(
    (acc, l) => {
      const entry = entryOf(l.path);
      const last = acc[acc.length - 1];
      if (last && last.entry === entry && last.section === l.section) last.lines.push(l);
      else acc.push({ entry, section: l.section, lines: [l] });
      return acc;
    },
    [],
  );
  const confirm = () => {
    if (!proposal) return;
    setBefore((b) => b ?? pct(placed));
    correct.mutate(
      { additions: [{ entry: proposal.entry, text: proposal.text, sources: proposal.sources }] },
      {
        onSuccess: () => {
          toast.success(`« ${proposal.term} » apparaît maintenant dans votre CV.`);
          setProposal(null);
          advice.mutate();
        },
      },
    );
  };
  return (
    <AssistantPanel
      icon="🔎"
      role="Lit votre CV comme un robot recruteur"
      title="Conseillère ATS"
      description="Les logiciels de recrutement cherchent les mots de l'offre. La conseillère trie chaque mot-clé et place ceux que vous possédez déjà en recopiant le fait de votre profil qui les cite, avec votre accord."
      does={["Trie chaque mot-clé", "Place un fait recopié en un clic"]}
      never="Ne vous fait jamais ajouter ce que vous ne maîtrisez pas"
      action={advice.data ? "Relancer l'analyse" : "Scanner mon CV"}
      onRun={() => advice.mutate()}
      busy={advice.isPending}
      busyLabel="Lecture du CV comme un logiciel de recrutement…"
      error={advice.error}
      kind={advice.data?.providerKind}
      voteRole="conseils-ats"
    >
      {advice.isPending && <div aria-hidden="true" className="ats-scan card h-24" />}
      {advice.data && (
        <>
          <div className="card flex flex-wrap items-center gap-6">
            <Ring
              value={placed}
              max={keywords.length}
              label={
                <>
                  <span className="block text-2xl font-bold">{pct(placed)} %</span>
                  <span className="text-xs text-ink-muted">visibles</span>
                </>
              }
            />
            <div className="min-w-56 flex-1 space-y-1">
              <p className="text-lg font-semibold">
                {placed} mot{placed > 1 ? "s" : ""}-clé{placed > 1 ? "s" : ""} sur {keywords.length} visible
                {placed > 1 ? "s" : ""} par un logiciel de recrutement
              </p>
              {before !== null && before !== pct(placed) && (
                <p className="text-sm font-semibold text-proved">
                  Avant : {before} % → Après : {pct(placed)} %
                </p>
              )}
              {possible > placed && (
                <p className="text-sm text-ink-muted">
                  En faisant apparaître ce que vous possédez déjà, vous atteindriez{" "}
                  <span className="font-bold text-proved">{pct(possible)} %</span>, sans rien inventer.
                </p>
              )}
            </div>
          </div>
          {proposal && (
            <div
              className="card animate-enter space-y-3 border-accent"
              role="dialog"
              aria-label="Ajout proposé"
            >
              <p className="font-semibold">
                Ajouter « {proposal.term} » dans « {proposal.entryLabel} » :
              </p>
              <p className="rounded-2xl bg-surface-sunken p-3">« {proposal.text} »</p>
              <p className="text-xs text-ink-subtle">
                Le fait de votre profil est recopié tel quel, avec sa source : rien n'est rédigé.
              </p>
              <div className="flex gap-2">
                <Button busy={correct.isPending} onClick={confirm}>
                  Ajouter au CV
                </Button>
                <Button variant="ghost" onClick={() => setProposal(null)}>
                  Annuler
                </Button>
              </div>
              {correct.isError && <Alert tone="error">{errorMessage(correct.error)}</Alert>}
            </div>
          )}
          {apply.isError && <Alert tone="warning">{errorMessage(apply.error)}</Alert>}
          <div className="grid gap-4 lg:grid-cols-3">
            {ATS_COLUMNS.map(([status, title, hint, border, chip]) => {
              const list = keywords.filter((k) => k.status === status);
              return (
                <section key={status} className={`rounded-3xl border-2 border-t-8 bg-surface p-4 ${border}`}>
                  <h3 className="flex items-center justify-between font-semibold">
                    {title}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${chip}`}>
                      {list.length}
                    </span>
                  </h3>
                  <p className="text-xs text-ink-muted">{hint}</p>
                  <ul className="mt-3 space-y-2">
                    {list.map((k, i) => (
                      <li
                        key={k.term}
                        className="animate-enter"
                        style={{ animationDelay: `${Math.min(i, 12) * 40}ms` }}
                      >
                        <details
                          className="faq rounded-2xl border border-line bg-surface"
                          draggable={status === "a_placer"}
                          onDragStart={(e) => e.dataTransfer.setData("text/plain", k.term)}
                        >
                          <summary className="flex cursor-pointer items-center gap-2 p-2.5 font-semibold">
                            <span aria-hidden="true" className="faq-icon inline-block text-ink-subtle">
                              +
                            </span>
                            {status === "a_placer" && <span aria-hidden="true">⠿</span>}
                            {k.term}
                          </summary>
                          <div className="space-y-2 px-3 pb-3 text-sm text-ink-muted">
                            <p>{k.advice}</p>
                            {status === "a_placer" && (
                              <Button
                                variant="secondary"
                                busy={apply.isPending && apply.variables?.term === k.term}
                                onClick={() => apply.mutate({ term: k.term })}
                              >
                                Placer dans mon CV
                              </Button>
                            )}
                          </div>
                        </details>
                      </li>
                    ))}
                    {list.length === 0 && <li className="text-sm text-ink-subtle">Aucun.</li>}
                  </ul>
                </section>
              );
            })}
          </div>
          <section className="card space-y-3" aria-labelledby="ats-apercu">
            <h3 id="ats-apercu" className="font-semibold">
              Votre CV vu par le logiciel
            </h3>
            <p className="text-xs text-ink-muted">
              Mots-clés repérés surlignés. Déposez un mot-clé « à faire apparaître » sur la rubrique qui le
              prouve.
            </p>
            <article className="paper-sheet space-y-4">
              {groups.map((g) => (
                <section
                  key={g.section + g.lines[0]!.path}
                  onDragOver={(e) => {
                    if (!g.entry) return;
                    e.preventDefault();
                    setDragOver(g.entry);
                  }}
                  onDragLeave={() => setDragOver(null)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(null);
                    const term = e.dataTransfer.getData("text/plain");
                    if (term && g.entry) apply.mutate({ term, entry: g.entry });
                  }}
                  className={`rounded-xl p-2 transition-colors ${dragOver === g.entry ? "bg-[#e7f7d4] outline-2 outline-[#5a9a2c] outline-dashed" : ""}`}
                >
                  <h4 className="border-b border-[#d7dcd8] pb-1 text-sm font-bold tracking-wide uppercase">
                    {g.section}
                  </h4>
                  <ul className="mt-2 list-disc space-y-1 pl-5 text-sm">
                    {g.lines.map((l) => (
                      <li key={l.path}>
                        <Highlighted text={l.text} terms={placedTerms} />
                      </li>
                    ))}
                  </ul>
                </section>
              ))}
            </article>
          </section>
          <section className="card space-y-3" aria-labelledby="ats-format">
            <h3 id="ats-format" className="font-semibold">
              Format du PDF
            </h3>
            <ul className="space-y-1 text-sm">
              <li>
                {variant === "ats" ? "✅" : "⚠️"} Mise en page{" "}
                {variant === "ats"
                  ? "sobre, sur une colonne"
                  : "en deux colonnes : certains logiciels la lisent mal, préférez « Sobre » pour un dépôt en ligne"}
              </li>
              <li>
                ✅ Rubriques aux intitulés standards (Expérience professionnelle, Formation, Compétences)
              </li>
              <li>✅ Dates homogènes au format MM/AAAA</li>
              <li>✅ Texte sélectionnable, sans image ni tableau</li>
              <li>✅ Police standard, sans caractère décoratif</li>
            </ul>
          </section>
          {overview.data && overview.data.length > 1 && (
            <section className="card space-y-3" aria-labelledby="ats-comparaison">
              <h3 id="ats-comparaison" className="font-semibold">
                Comparer avec vos autres CV
              </h3>
              <ul className="space-y-2">
                {overview.data.map((o) => {
                  const p = o.total ? Math.round((o.placed / o.total) * 100) : 0;
                  return (
                    <li key={o.generationId} className="flex items-center gap-3 text-sm">
                      <Link
                        to={`/mes-cv/${o.generationId}?onglet=ats`}
                        className={`w-56 shrink-0 truncate ${o.generationId === generation.id ? "font-bold" : "link"}`}
                      >
                        {o.offerTitle}
                      </Link>
                      <span className="h-2 flex-1 rounded-full bg-surface-sunken">
                        <span
                          className="grow-bar block h-2 rounded-full bg-accent"
                          style={{ width: `${p}%` }}
                        />
                      </span>
                      <span className="w-12 text-right font-semibold">{p} %</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </>
      )}
    </AssistantPanel>
  );
}
