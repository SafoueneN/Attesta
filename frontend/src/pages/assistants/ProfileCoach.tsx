import type { FactProposals, Profile, ProfileQuestion } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useSearchParams } from "react-router";
import { ApiError } from "../../api/client";
import { profiles } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useToast } from "../../components/toasts";
import { Alert, Button, EmptyState, errorMessage, PageHeader, useDocumentTitle } from "../../components/ui";
import { evidenceAnchor } from "../../lib/describe";
import { AiBadge, AssistantPanel, DictateButton, Ring, Thinking, useDictation, VoteButtons } from "./shared";

/*
 * Intervieweuse de profil (ADR 0028, rôle 1 ; ADR 0029), sous forme de conversation : l'IA pose une
 * question, le candidat répond (à l'écrit ou à la voix), l'IA propose des réalisations tirées de sa réponse
 * et relance si elle est vague ; le candidat corrige et coche celles qui entrent dans son profil.
 */

/** Ajoute des réalisations à un élément du profil (expérience ou projet), sans toucher au reste. */
function withHighlights(profile: Profile, target: string, texts: string[]): Profile {
  const [, section, index] = target.split("/");
  const i = Number(index);
  if (section === "work")
    return {
      ...profile,
      work: profile.work.map((w, j) => (j === i ? { ...w, highlights: [...w.highlights, ...texts] } : w)),
    };
  if (section === "projects")
    return {
      ...profile,
      projects: profile.projects.map((p, j) =>
        j === i ? { ...p, highlights: [...p.highlights, ...texts] } : p,
      ),
    };
  return profile;
}

/** Élément du profil visé par une question, en clair. */
function targetLabel(profile: Profile, target: string) {
  const [, section, index] = target.split("/");
  if (section === "projects") return profile.projects[Number(index)]?.name ?? "Projet";
  return evidenceAnchor(profile, target) ?? "Expérience";
}

/** Richesse d'un élément : part de réalisations chiffrées, pondérée par leur nombre (3 attendues). */
const richness = (highlights: string[]) =>
  (highlights.filter((h) => /\d/.test(h)).length / 3 + Math.min(highlights.length, 3) / 3) / 2;

type Turn = { question: ProfileQuestion; answer?: string; added?: string[] };
type Saved = { questions: ProfileQuestion[]; turns: Turn[]; providerKind: "ia" | "demo"; at: string };

function AiBubble({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <li className="flex animate-enter items-start gap-3">
      <span
        aria-hidden="true"
        className="assistant-avatar grid size-10 shrink-0 place-items-center rounded-full bg-accent text-lg text-on-accent"
      >
        ✎
      </span>
      <div className="chat-bubble chat-bubble-in max-w-2xl">
        <p className="text-xs font-bold text-ink-subtle uppercase">{label ?? "L'intervieweuse"}</p>
        {children}
      </div>
    </li>
  );
}

function UserBubble({ children }: { children: ReactNode }) {
  return (
    <li className="flex animate-enter justify-end">
      <div className="chat-bubble chat-bubble-out max-w-2xl whitespace-pre-line">{children}</div>
    </li>
  );
}

/** Propositions tirées de la réponse : le candidat corrige, coche ce qui est exact, et décide seul. */
function Proposals({
  data,
  profile,
  target,
  onSaved,
  onSkip,
  onFollowUp,
}: {
  data: FactProposals;
  profile: Profile;
  target: string;
  onSaved: (texts: string[]) => void;
  onSkip: () => void;
  onFollowUp: (question: string) => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [items, setItems] = useState(() => data.proposals.map((p) => ({ text: p.text, on: true })));
  const chosen = items.filter((i) => i.on && i.text.trim()).map((i) => i.text.trim());
  const save = useMutation({
    mutationFn: () => profiles.save(withHighlights(profile, target, chosen)),
    onSuccess: (stored) => {
      queryClient.setQueryData(["profil"], stored);
      toast.success(`${chosen.length} réalisation(s) ajoutée(s) à votre profil (version ${stored.version}).`);
      onSaved(chosen);
    },
  });
  return (
    <AiBubble>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <p className="font-semibold">
          {data.proposals.length
            ? "Voici ce que je retiens de votre réponse. Corrigez si besoin."
            : "Je n'ai trouvé aucun fait exploitable dans cette réponse."}
        </p>
        <AiBadge kind={data.providerKind} />
        <VoteButtons role="faits-reponse" kind={data.providerKind} />
      </div>
      {data.dropped > 0 && (
        <p className="mt-2 text-sm text-flagged">
          J'ai écarté {data.dropped} proposition(s) : elles contenaient un chiffre absent de votre réponse.
        </p>
      )}
      {items.length > 0 && (
        <fieldset className="mt-3 space-y-2">
          <legend className="text-sm text-ink-muted">
            Cochez ce qui est exact : seules ces lignes entreront dans votre profil.
          </legend>
          {items.map((item, i) => (
            <div
              key={i}
              className="flex items-start gap-3 rounded-xl border-2 border-line bg-surface p-3 transition-colors has-checked:border-accent has-checked:bg-accent-soft"
            >
              <input
                type="checkbox"
                aria-label={`Garder la proposition ${i + 1}`}
                className="mt-2 size-4 accent-accent-text"
                checked={item.on}
                onChange={(e) =>
                  setItems((list) => list.map((x, j) => (j === i ? { ...x, on: e.target.checked } : x)))
                }
              />
              <textarea
                aria-label={`Proposition ${i + 1}`}
                className="input min-h-12 flex-1 bg-surface"
                maxLength={500}
                rows={2}
                value={item.text}
                onChange={(e) =>
                  setItems((list) => list.map((x, j) => (j === i ? { ...x, text: e.target.value } : x)))
                }
              />
            </div>
          ))}
        </fieldset>
      )}
      {data.followUp && (
        <div className="mt-3 rounded-xl border-2 border-dashed border-line p-3 text-sm">
          <p>
            <span className="font-semibold">Pour aller plus loin : </span>
            {data.followUp}
          </p>
          <Button className="mt-2" variant="secondary" onClick={() => onFollowUp(data.followUp!)}>
            Répondre à cette relance
          </Button>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        {items.length > 0 && (
          <Button busy={save.isPending} disabled={!chosen.length} onClick={() => save.mutate()}>
            Ajouter {chosen.length || ""} à mon profil
          </Button>
        )}
        <Button variant="ghost" onClick={onSkip}>
          {items.length ? "Ne rien ajouter" : "Question suivante"}
        </Button>
      </div>
      {save.isError && (
        <div className="mt-2">
          <Alert tone="error">{errorMessage(save.error)}</Alert>
        </div>
      )}
    </AiBubble>
  );
}

/** Le profil à côté de la conversation : richesse de chaque élément, réalisations ajoutées en surbrillance. */
function ProfileAside({ profile, added, active }: { profile: Profile; added: Set<string>; active?: string }) {
  const entries = [
    ...profile.work.map((w, i) => ({
      target: `/work/${i}`,
      title: w.position,
      sub: w.name,
      highlights: w.highlights,
    })),
    ...profile.projects.map((p, i) => ({
      target: `/projects/${i}`,
      title: p.name,
      sub: "Projet",
      highlights: p.highlights,
    })),
  ];
  return (
    <div className="space-y-3">
      <p className="eyebrow">Votre profil</p>
      <ul className="space-y-3">
        {entries.map((e) => {
          const r = richness(e.highlights);
          return (
            <li
              key={e.target}
              className={`rounded-2xl border p-3 text-sm transition-colors ${active === e.target ? "border-accent bg-accent-soft" : "border-line"}`}
            >
              <p className="font-semibold">{e.title}</p>
              <p className="text-xs text-ink-subtle">{e.sub}</p>
              <div className="mt-2 flex items-center gap-2" title="Richesse : réalisations chiffrées">
                <span className="h-1.5 flex-1 rounded-full bg-surface-sunken">
                  <span
                    className={`block h-1.5 rounded-full transition-[width] duration-700 ${r >= 0.7 ? "bg-proved" : r >= 0.4 ? "bg-flagged" : "bg-removed"}`}
                    style={{ width: `${Math.round(r * 100)}%` }}
                  />
                </span>
                <span className="text-xs text-ink-muted">{Math.round(r * 100)} %</span>
              </div>
              {e.highlights.length > 0 && (
                <ul className="mt-2 space-y-1 text-xs text-ink-muted">
                  {e.highlights.map((h) => (
                    <li
                      key={h}
                      className={
                        added.has(h) ? "animate-pop rounded bg-accent-soft px-1 font-semibold text-ink" : ""
                      }
                    >
                      {added.has(h) ? "＋ " : "• "}
                      {h}
                    </li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Conversation({
  initial,
  profile,
  storageKey,
}: {
  initial: Saved;
  profile: Profile;
  storageKey: string;
}) {
  const [questions, setQuestions] = useState(initial.questions);
  const [turns, setTurns] = useState<Turn[]>(initial.turns);
  const [answer, setAnswer] = useState("");
  const dictation = useDictation((t) => setAnswer((a) => (a ? `${a} ${t}` : t)));
  const end = useRef<HTMLLIElement>(null);
  const current = turns[turns.length - 1]!;
  const propose = useMutation({
    mutationFn: (text: string) =>
      profiles.interviewAnswer({
        target: current.question.target,
        question: current.question.question,
        answer: text,
      }),
  });
  const addedTexts = new Set(turns.flatMap((t) => t.added ?? []));
  const added = addedTexts.size;
  const finished = turns.length === questions.length && current.added !== undefined;
  const done = turns.filter((t) => t.added !== undefined).length;

  // Conversation gardée dans ce navigateur : reprise possible après une interruption.
  useEffect(() => {
    try {
      localStorage.setItem(
        storageKey,
        JSON.stringify({ ...initial, questions, turns, at: new Date().toISOString() } satisfies Saved),
      );
    } catch {
      // non mémorisée : sans conséquence
    }
  }, [questions, turns, storageKey, initial]);

  useEffect(() => {
    end.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [turns.length, propose.status]);

  const next = (texts: string[]) => {
    setTurns((list) => {
      const copy = [...list];
      copy[copy.length - 1] = { ...current, added: texts };
      if (copy.length < questions.length) copy.push({ question: questions[copy.length]! });
      return copy;
    });
    propose.reset();
  };

  const followUp = (question: string) => {
    const relance: ProfileQuestion = {
      id: `${current.question.id}-relance-${turns.length}`,
      target: current.question.target,
      question,
      why: "Relance de l'intervieweuse : une précision rend la réalisation vérifiable.",
    };
    const at = turns.length;
    setQuestions((q) => [...q.slice(0, at), relance, ...q.slice(at)]);
    setTurns((list) => {
      const copy = [...list];
      copy[copy.length - 1] = { ...current, added: [] };
      return [...copy, { question: relance }];
    });
    propose.reset();
  };

  const send = () => {
    const text = answer.trim();
    if (dictation.listening) dictation.stop();
    setTurns((list) => [...list.slice(0, -1), { ...current, answer: text }]);
    setAnswer("");
    propose.mutate(text);
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_18rem]">
      <div className="card space-y-5">
        <ol className="space-y-4" aria-live="polite">
          {turns.map((t, i) => (
            <li key={t.question.id} className="list-none space-y-4">
              <ol className="space-y-4">
                <AiBubble>
                  <p className="mt-1 text-xs font-semibold text-accent-text">
                    À propos de : {targetLabel(profile, t.question.target)}
                  </p>
                  <p className="mt-1 text-lg font-semibold">{t.question.question}</p>
                  <p className="mt-1 text-sm text-ink-muted">{t.question.why}</p>
                </AiBubble>
                {t.answer && <UserBubble>{t.answer}</UserBubble>}
                {t.added !== undefined && t.added.length > 0 && (
                  <AiBubble>
                    <p className="mt-1 text-sm">
                      ✓ {t.added.length} réalisation(s) ajoutée(s) à votre profil.
                    </p>
                  </AiBubble>
                )}
                {i === turns.length - 1 && propose.isPending && (
                  <li className="pl-13">
                    <Thinking label="L'intervieweuse lit votre réponse…" />
                  </li>
                )}
                {i === turns.length - 1 && propose.data && t.added === undefined && (
                  <Proposals
                    data={propose.data}
                    profile={profile}
                    target={t.question.target}
                    onSaved={next}
                    onSkip={() => next([])}
                    onFollowUp={followUp}
                  />
                )}
              </ol>
            </li>
          ))}
          {finished && (
            <AiBubble>
              <p className="mt-1 font-semibold">
                Merci, l'entretien est terminé.{" "}
                {added ? `Votre profil compte ${added} réalisation(s) de plus.` : ""}
              </p>
              <Link to="/cv" className="link mt-2 inline-block text-sm font-semibold">
                Générer un CV avec ce profil enrichi →
              </Link>
            </AiBubble>
          )}
          <li ref={end} aria-hidden="true" className="list-none" />
        </ol>
        {propose.isError && <Alert tone="error">{errorMessage(propose.error)}</Alert>}
        {!current.answer && !finished && (
          <form
            className="space-y-2 border-t border-line pt-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (answer.trim().length >= 3) send();
            }}
          >
            <div className="flex items-end gap-3">
              <div className="flex-1">
                <label htmlFor="reponse-intervieweuse" className="sr-only">
                  Votre réponse
                </label>
                <textarea
                  id="reponse-intervieweuse"
                  className="input min-h-20"
                  maxLength={2000}
                  value={answer}
                  onChange={(e) => setAnswer(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && (e.ctrlKey || e.metaKey) && answer.trim().length >= 3) send();
                  }}
                  placeholder="Répondez avec vos propres mots et vos vrais chiffres. Ctrl + Entrée pour envoyer."
                />
              </div>
              <Button type="submit" disabled={answer.trim().length < 3}>
                Envoyer
              </Button>
            </div>
            <DictateButton dictation={dictation} />
          </form>
        )}
        {current.answer && propose.isError && (
          <Button variant="secondary" onClick={() => propose.mutate(current.answer!)}>
            Réessayer
          </Button>
        )}
      </div>
      <aside className="card h-fit space-y-4 lg:sticky lg:top-24">
        <div className="flex items-center gap-4">
          <Ring
            value={done}
            max={questions.length}
            size={84}
            tone="accent"
            label={
              <>
                <span className="block text-lg font-bold">
                  {done}/{questions.length}
                </span>
                <span className="text-[0.65rem] text-ink-muted">questions</span>
              </>
            }
          />
          <p className="text-sm">
            <span className="text-2xl font-bold text-proved">+{added}</span> réalisation{added > 1 ? "s" : ""}{" "}
            ajoutée{added > 1 ? "s" : ""}
          </p>
        </div>
        <ProfileAside profile={profile} added={addedTexts} active={current.question.target} />
        <p className="text-xs text-ink-muted">
          Rien n'entre dans votre profil sans votre coche. Chaque chiffre proposé vient de votre réponse.
        </p>
      </aside>
    </div>
  );
}

export function ProfileCoach() {
  useDocumentTitle("Intervieweuse de profil");
  const { user } = useSession();
  const [params] = useSearchParams();
  const topic = params.get("sujet") ?? undefined;
  const storageKey = `attesta-intervieweuse-${user?.id ?? "invite"}`;
  const profile = useQuery({ queryKey: ["profil"], queryFn: profiles.current, retry: false });
  const [saved, setSaved] = useState<Saved | null>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as Saved) : null;
    } catch {
      return null;
    }
  });
  const [resumed, setResumed] = useState<Saved | null>(null);
  const questions = useMutation({ mutationFn: () => profiles.interview(topic) });
  const noProfile = profile.error instanceof ApiError && profile.error.status === 404;
  const started = useRef(false);
  useEffect(() => {
    // Venu du plan de progression avec un sujet : l'entretien commence directement sur ce sujet.
    if (topic && profile.data && !started.current) {
      started.current = true;
      setSaved(null);
      questions.mutate();
    }
  }, [topic, profile.data, questions]);
  const data = questions.data;
  const fresh = useMemo<Saved | null>(
    () =>
      data?.questions.length
        ? {
            questions: data.questions,
            turns: [{ question: data.questions[0]! }],
            providerKind: data.providerKind,
            at: new Date().toISOString(),
          }
        : null,
    [data],
  );
  const conversation = resumed ?? fresh;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <PageHeader
        title="Intervieweuse de profil"
        lead="Un CV n'est jamais meilleur que le profil dont il vient. Une courte conversation, à l'écrit ou à la voix : l'assistante vous interroge, en commençant par les expériences les moins détaillées, en tire des réalisations, et vous choisissez celles qui entrent dans votre profil."
      />
      {noProfile ? (
        <EmptyState
          title="Enregistrez d'abord votre profil"
          action={
            <Link to="/cv" className="link">
              Renseigner mon profil
            </Link>
          }
        >
          L'intervieweuse pose ses questions à partir de vos expériences et projets.
        </EmptyState>
      ) : (
        <AssistantPanel
          icon="✎"
          role={topic ? `Conversation sur « ${topic} »` : "Conversation guidée"}
          title="Entretien sur votre parcours"
          description="Chiffrer une réalisation, révéler un résultat, faire apparaître un outil oublié. L'assistante ne suppose rien : elle vous demande, et relance si la réponse reste vague."
          does={["Commence par les expériences pauvres", "Relance, propose, vous corrigez"]}
          never="N'ajoute rien sans votre coche"
          action={conversation ? "Nouvelle conversation" : "Commencer la conversation"}
          onRun={() => {
            setResumed(null);
            setSaved(null);
            questions.mutate();
          }}
          busy={questions.isPending}
          busyLabel="L'intervieweuse relit votre parcours…"
          error={questions.error}
          kind={conversation?.providerKind}
          voteRole="entretien-profil"
        >
          {!conversation && saved && saved.turns.length > 0 && (
            <div className="card flex flex-wrap items-center gap-4">
              <p className="min-w-0 flex-1 text-sm">
                Une conversation a été interrompue le {new Date(saved.at).toLocaleDateString("fr-FR")} (
                {saved.turns.filter((t) => t.added !== undefined).length}/{saved.questions.length} questions).
              </p>
              <Button onClick={() => setResumed(saved)}>Reprendre la conversation</Button>
            </div>
          )}
          {conversation && profile.data && (
            <Conversation
              key={conversation.at}
              initial={conversation}
              profile={profile.data.profile}
              storageKey={storageKey}
            />
          )}
        </AssistantPanel>
      )}
    </div>
  );
}
