import type { InterviewFeedback, InterviewPrep, InterviewQuestion } from "@attesta/shared-schemas";
import type { z } from "zod";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cv } from "../../api/endpoints";
import { Alert, Button, errorMessage } from "../../components/ui";
import { describePointer, factText } from "../../lib/describe";
import {
  MarkedAnswer,
  STAR,
  starScore,
  Stopwatch,
  type HistoryEntry,
} from "../assistants/GenerationAssistants";
import {
  AiBadge,
  DictationError,
  Thinking,
  useAssistantResults,
  useDictation,
  VoteButtons,
} from "../assistants/shared";
import { SceneHeader, useStudio } from "./Studio";

/*
 * Le coach d'entretien, mis en scène comme un plateau : on choisit son entretien, le recruteur « parle »
 * (sa question s'écrit), le candidat répond au micro ou au clavier, et un tableau STAR s'allume.
 */

type Question = z.infer<typeof InterviewQuestion>;
type Level = "rh" | "manager" | "technique";

const LEVELS: { id: Level; title: string; text: string; icon: string }[] = [
  {
    id: "rh",
    title: "Entretien RH",
    text: "Motivation, parcours, projet. Le premier filtre.",
    icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9c1-4 4-6 7-6s6 2 7 6",
  },
  {
    id: "manager",
    title: "Avec le manager",
    text: "Situations vécues, résultats, travail d'équipe.",
    icon: "M8 11a3 3 0 1 0 0-6 3 3 0 0 0 0 6Zm8 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 20c.8-3 3-5 6-5s5.2 2 6 5m0-5c.9-.6 1.9-1 3-1 3 0 5.2 2 6 5",
  },
  {
    id: "technique",
    title: "Entretien technique",
    text: "Les exigences du métier, en cas pratiques.",
    icon: "M8 9l-4 3 4 3m8-6 4 3-4 3M14 5l-4 14",
  },
];

/** La question s'écrit, comme dite par le recruteur (texte complet d'emblée si le mouvement est réduit). */
function Typewriter({ text }: { text: string }) {
  const reduced =
    typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const [n, setN] = useState(reduced ? text.length : 0);
  useEffect(() => {
    if (reduced) return setN(text.length);
    setN(0);
    const t = setInterval(() => setN((i) => (i >= text.length ? (clearInterval(t), i) : i + 2)), 22);
    return () => clearInterval(t);
  }, [text, reduced]);
  const speaking = n < text.length;
  return (
    <>
      <span className="sr-only">{text}</span>
      <span aria-hidden="true" className={speaking ? "type-caret" : ""}>
        {text.slice(0, n)}
      </span>
      <span aria-hidden="true" className={`speak-bars ${speaking ? "is-on" : ""}`}>
        <span />
        <span />
        <span />
        <span />
      </span>
    </>
  );
}

function Stage({
  q,
  index,
  total,
  onFeedback,
  onFollowUp,
}: {
  q: Question;
  index: number;
  total: number;
  onFeedback: (answer: string, f: InterviewFeedback) => void;
  onFollowUp: (question: string) => void;
}) {
  const { generation } = useStudio();
  const [answer, setAnswer] = useState("");
  const [hint, setHint] = useState(false);
  const [signal, setSignal] = useState(0);
  const dictation = useDictation((t) => {
    setSignal((s) => s || 1);
    setAnswer((a) => (a ? `${a} ${t}` : t));
  });
  const feedback = useMutation({
    mutationFn: () => cv.interviewFeedback(generation.id, { question: q.question, answer }),
    onSuccess: (f) => onFeedback(answer, f),
  });
  const words = answer.trim() ? answer.trim().split(/\s+/).length : 0;
  const pace = dictation.seconds > 5 ? Math.round((words / dictation.seconds) * 60) : null;
  const f = feedback.data;
  return (
    <div className="space-y-5">
      <div className="interview-stage relative overflow-hidden rounded-[2rem] p-6 lg:p-10">
        <div className="relative flex flex-wrap items-start gap-5">
          <div className="recruiter grid size-20 shrink-0 place-items-center rounded-full bg-[#f1f3e9] text-[#1b3125]">
            <svg
              aria-hidden="true"
              viewBox="0 0 24 24"
              className="size-10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="12" cy="8" r="4" />
              <path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" />
            </svg>
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-xs font-extrabold tracking-[0.1em] text-[#a9b7a6] uppercase">
              {q.intent === "Relance"
                ? "Le recruteur relance"
                : `Le recruteur · question ${index + 1} sur ${total}`}
            </p>
            <p className="mt-2 text-2xl leading-snug font-bold text-[#f1f3e9] lg:text-3xl">
              <Typewriter text={q.question} />
            </p>
          </div>
        </div>
        <div className="relative mt-6 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setHint(!hint)}
            aria-expanded={hint}
            className="rounded-full border border-[#375441] px-4 py-2 text-sm font-semibold text-[#e3f56b]"
          >
            {hint ? "Masquer l'indice" : "Indice du coach"}
          </button>
          {hint && (
            <p className="animate-enter basis-full rounded-2xl bg-[#213929] p-4 text-sm text-[#c6d0c1]">
              <b className="text-[#f1f3e9]">Ce qu'il vérifie :</b> {q.intent}. {q.tip}
              {q.sources.length > 0 && (
                <span className="mt-2 block text-[#93e2ab]">
                  Vos atouts :{" "}
                  {q.sources
                    .map((s) => factText(generation.profile, s) ?? describePointer(generation.profile, s))
                    .join(" · ")}
                </span>
              )}
            </p>
          )}
        </div>
      </div>

      <div className="grid gap-5 rounded-[2rem] border border-line bg-surface p-5 @2xl:grid-cols-[auto_minmax(0,1fr)] lg:p-6">
        <div className="flex flex-row items-center gap-5 @2xl:flex-col">
          {dictation.supported && (
            <button
              type="button"
              onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
              aria-pressed={dictation.listening}
              aria-label={dictation.listening ? "Arrêter la dictée" : "Répondre à voix haute"}
              className={`mic-button grid size-24 place-items-center rounded-full ${dictation.listening ? "is-live bg-removed text-paper" : "bg-accent text-on-accent"}`}
            >
              <svg
                aria-hidden="true"
                viewBox="0 0 24 24"
                className="size-9"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
              >
                <path d="M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3ZM5 11a7 7 0 0 0 14 0M12 18v3" />
              </svg>
            </button>
          )}
          <Stopwatch startSignal={signal} />
        </div>
        <div className="space-y-3">
          <label htmlFor={`reponse-${index}`} className="label">
            Votre réponse {dictation.supported ? "(au micro ou au clavier)" : ""}
          </label>
          <DictationError dictation={dictation} />
          <textarea
            id={`reponse-${index}`}
            className="input min-h-36 text-base"
            maxLength={4000}
            value={answer}
            onChange={(e) => {
              if (!answer && e.target.value) setSignal((s) => s + 1);
              setAnswer(e.target.value);
            }}
            placeholder="Situation… Tâche… Action… Résultat…"
          />
          <div className="flex flex-wrap items-center gap-4 text-xs text-ink-subtle">
            <span>{words} mots</span>
            {pace !== null && (
              <span className={pace < 100 || pace > 180 ? "font-bold text-flagged" : "font-bold text-proved"}>
                {pace} mots/min (idéal 120 à 160)
              </span>
            )}
            <Button
              className="ml-auto"
              busy={feedback.isPending}
              disabled={answer.trim().length < 10}
              onClick={() => feedback.mutate()}
            >
              Soumettre au coach
            </Button>
          </div>
        </div>
      </div>

      {feedback.isPending && <Thinking label="Le coach écoute votre réponse…" />}
      {feedback.isError && <Alert tone="error">{errorMessage(feedback.error)}</Alert>}
      {f && (
        <div className="scoreboard space-y-5 rounded-[2rem] border border-line bg-surface p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xl font-extrabold">STAR : {starScore(f)} sur 4</p>
            <span className="flex flex-wrap items-center gap-3">
              <AiBadge kind={f.providerKind} />
              <VoteButtons role="coach-retour" kind={f.providerKind} />
            </span>
          </div>
          <ol className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {STAR.map(([key, letter, label], i) => (
              <li
                key={key}
                className={`flip-tile ${f.star[key] ? "is-on" : ""}`}
                style={{ animationDelay: `${i * 140}ms` }}
              >
                <span className="text-4xl font-black">{letter}</span>
                <span className="text-xs font-bold">{f.star[key] ? label : `${label} manquant`}</span>
              </li>
            ))}
          </ol>
          {f.highlights.length > 0 && <MarkedAnswer answer={answer} highlights={f.highlights} />}
          <div className="grid gap-4 md:grid-cols-2">
            <ul className="space-y-1 text-sm">
              {f.strengths.map((s) => (
                <li key={s} className="text-proved">
                  ＋ {s}
                </li>
              ))}
            </ul>
            <ul className="space-y-1 text-sm">
              {f.improvements.map((s) => (
                <li key={s} className="text-flagged">
                  → {s}
                </li>
              ))}
            </ul>
          </div>
          {f.followUp && (
            <div className="flex flex-wrap items-center gap-3 rounded-2xl bg-surface-sunken p-4">
              <span className="min-w-0 flex-1 text-sm">
                <b>Relance probable :</b> « {f.followUp} »
              </span>
              <Button variant="secondary" onClick={() => onFollowUp(f.followUp!)}>
                M'entraîner sur la relance
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function CoachScene() {
  const { generation } = useStudio();
  const [level, setLevel] = useState<Level | null>(null);
  const results = useAssistantResults(generation.id);
  // Questions conservées par niveau ; le niveau est passé à l’appel (pas lu dans un rendu précédent).
  const start = useMutation({
    mutationFn: (l: Level) => cv.interview(generation.id, l),
    onSuccess: (data, l) => results.remember(`coach-questions:${l}`, data),
  });
  const prep = {
    data: level ? results.stored<InterviewPrep>(`coach-questions:${level}`) : undefined,
    isPending: start.isPending,
    isError: start.isError,
    error: start.error,
  };
  const history = results.stored<HistoryEntry[]>("coach-historique") ?? [];
  const [extra, setExtra] = useState<Question[]>([]);
  const [current, setCurrent] = useState(0);
  const [session, setSession] = useState<Record<number, InterviewFeedback>>({});
  const [bilan, setBilan] = useState(false);
  const questions = [...(prep.data?.questions ?? []), ...extra];
  useEffect(() => {
    setExtra([]);
    setCurrent(0);
    setSession({});
    setBilan(false);
  }, [level, prep.data]);

  if (!level || !prep.data)
    return (
      <div className="space-y-6">
        <SceneHeader eyebrow="Coach d'entretien" title="Choisissez votre entretien blanc">
          Le recruteur pose ses questions pour « {generation.offerTitle} ». Répondez à voix haute ou au
          clavier : le coach commente selon la méthode STAR, et ne vous fait jamais raconter un fait que votre
          profil ne prouve pas.
        </SceneHeader>
        <div className="grid gap-4 @2xl:grid-cols-3">
          {LEVELS.map((l, i) => (
            <button
              key={l.id}
              type="button"
              onClick={() => {
                setLevel(l.id);
                if (!results.stored(`coach-questions:${l.id}`)) start.mutate(l.id);
              }}
              className="level-card group animate-enter rounded-[1.75rem] border border-line bg-surface p-6 text-left"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <span className="grid size-14 place-items-center rounded-2xl bg-accent text-on-accent transition-transform group-hover:-rotate-6">
                <svg
                  aria-hidden="true"
                  viewBox="0 0 24 24"
                  className="size-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d={l.icon} />
                </svg>
              </span>
              <span className="mt-4 block text-xl font-extrabold">{l.title}</span>
              <span className="mt-1 block text-sm text-ink-muted">{l.text}</span>
              <span className="mt-4 block text-sm font-bold text-accent-text">Entrer en salle →</span>
            </button>
          ))}
        </div>
        {prep.isPending && <Thinking label="Le recruteur prépare ses questions…" />}
        {prep.isError && <Alert tone="error">{errorMessage(prep.error)}</Alert>}
        {history.length > 0 && <History history={history} />}
      </div>
    );

  const answered = Object.keys(session).length;
  return (
    <div className="space-y-6">
      <SceneHeader
        eyebrow={`Coach d'entretien · ${LEVELS.find((l) => l.id === level)!.title}`}
        title={bilan ? "Le bilan de votre entretien" : "En salle d'entretien"}
        actions={
          <>
            <Button variant="ghost" onClick={() => setLevel(null)}>
              Changer d'entretien
            </Button>
            <Button variant="ghost" busy={start.isPending} onClick={() => start.mutate(level)}>
              Nouvelles questions
            </Button>
            <Button variant="secondary" onClick={() => setBilan(!bilan)}>
              {bilan ? "Retour aux questions" : "Voir le bilan"}
            </Button>
          </>
        }
      >
        <span className="flex flex-wrap items-center gap-3">
          <AiBadge kind={prep.data.providerKind} />
          <VoteButtons role="coach-questions" kind={prep.data.providerKind} />
        </span>
      </SceneHeader>

      <ol className="filmstrip flex gap-2 overflow-x-auto pb-2" aria-label="Questions de l'entretien">
        {questions.map((q, i) => (
          <li key={q.question}>
            <button
              type="button"
              onClick={() => {
                setBilan(false);
                setCurrent(i);
              }}
              aria-current={!bilan && i === current ? "step" : undefined}
              className={`w-44 shrink-0 rounded-2xl border p-3 text-left text-xs transition-all ${!bilan && i === current ? "border-accent bg-accent-soft" : "border-line bg-surface hover:border-line-strong"}`}
            >
              <span className="flex items-center justify-between font-extrabold">
                Q{i + 1}
                {session[i] && <span className="text-proved">STAR {starScore(session[i])}/4</span>}
              </span>
              <span className="mt-1 line-clamp-2 block text-ink-muted">{q.question}</span>
            </button>
          </li>
        ))}
      </ol>

      {bilan ? (
        <div className="space-y-4 rounded-[2rem] border border-line bg-surface p-6">
          <p className="text-2xl font-extrabold">
            {answered}/{questions.length} réponses travaillées
            {answered > 0 &&
              ` · STAR moyen ${(Object.values(session).reduce((n, f) => n + starScore(f), 0) / answered).toFixed(1)}/4`}
          </p>
          <ul className="grid gap-3 md:grid-cols-2">
            {questions.map((q, i) => (
              <li
                key={q.question}
                className="flex items-center gap-3 rounded-2xl bg-surface-sunken p-3 text-sm"
              >
                <span className="min-w-0 flex-1">{q.question}</span>
                <span className="flex gap-1">
                  {STAR.map(([k, letter]) => (
                    <span
                      key={k}
                      className={`grid size-6 place-items-center rounded-md text-[0.7rem] font-black ${session[i]?.star[k] ? "bg-proved text-on-accent" : "bg-surface text-ink-subtle"}`}
                    >
                      {letter}
                    </span>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        questions[current] && (
          <Stage
            key={questions[current].question}
            q={questions[current]}
            index={current}
            total={questions.length}
            onFeedback={(answer, feedback) => {
              setSession((s) => ({ ...s, [current]: feedback }));
              results.remember("coach-historique", [
                ...history.slice(-29),
                { question: questions[current]!.question, answer, feedback, at: new Date().toISOString() },
              ]);
            }}
            onFollowUp={(question) => {
              setExtra((l) =>
                l.some((x) => x.question === question)
                  ? l
                  : [
                      ...l,
                      {
                        question,
                        intent: "Relance",
                        sources: [],
                        tip: "Un fait, un chiffre, votre rôle exact.",
                      },
                    ],
              );
              setCurrent(questions.length);
            }}
          />
        )
      )}
      {history.length > 0 && <History history={history} />}
    </div>
  );
}

/** Progression : une barre par réponse travaillée, hauteur = score STAR. */
function History({ history }: { history: HistoryEntry[] }) {
  const recent = history.slice(-16);
  return (
    <section className="rounded-[1.75rem] border border-line bg-surface p-5">
      <h3 className="text-sm font-bold">
        Votre progression · {history.length} réponse{history.length > 1 ? "s" : ""}
      </h3>
      <div className="mt-3 flex h-20 items-end gap-1.5" aria-hidden="true">
        {recent.map((h) => (
          <span
            key={h.at}
            className="grow-bar w-full max-w-8 rounded-t-md bg-accent"
            style={{ height: `${(starScore(h.feedback) / 4) * 100}%`, minHeight: 6 }}
            title={`${starScore(h.feedback)}/4`}
          />
        ))}
      </div>
    </section>
  );
}
