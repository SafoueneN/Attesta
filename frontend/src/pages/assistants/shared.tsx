import type { AssistantResults, Generation } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { cv, vote, watch } from "../../api/endpoints";
import { useSession } from "../../auth/session";
import { useToast } from "../../components/toasts";
import { Alert, Badge, Button, errorMessage } from "../../components/ui";
import { describePointer } from "../../lib/describe";

/** Origine d'une réponse : modèle réel, ou démonstration sans IA (toujours dite au candidat). */
export function AiBadge({ kind }: { kind: "ia" | "demo" }) {
  return kind === "ia" ? (
    <Badge tone="info">✦ Rédigé par l'IA</Badge>
  ) : (
    <Badge tone="neutral">Démonstration : réponse construite sans IA</Badge>
  );
}

/** Attente d'un assistant : trois points qui « réfléchissent », et le libellé annoncé. */
export function Thinking({ label = "L'assistant réfléchit…" }: { label?: string }) {
  return (
    <p role="status" className="flex items-center gap-3 text-sm font-semibold text-ink-muted">
      <span aria-hidden="true" className="typing-dots">
        <span />
        <span />
        <span />
      </span>
      {label}
    </p>
  );
}

/**
 * Panneau d'un assistant : sa « carte d'identité » (ce qu'il fait, ce qu'il ne fait jamais), le bouton qui
 * le lance, l'attente, l'erreur, puis le résultat. L'IA ne décide jamais à la place du candidat.
 */
export function AssistantPanel({
  icon,
  title,
  role,
  description,
  does = [],
  never,
  action,
  onRun,
  busy,
  busyLabel,
  error,
  kind,
  voteRole,
  children,
}: {
  icon: string;
  title: string;
  /** Rôle en quelques mots, sous le titre : « Relit le sens de chaque ligne ». */
  role?: string;
  description: ReactNode;
  /** Ce que l'assistant fait, en puces courtes. */
  does?: string[];
  /** Ce qu'il ne fait jamais : la limite, dite avant le résultat. */
  never?: string;
  action: string;
  onRun?: () => void;
  busy?: boolean;
  busyLabel?: string;
  error?: unknown;
  kind?: "ia" | "demo";
  /** Rôle noté par les boutons 👍 / 👎 (ADR 0029) ; sans rôle, pas d’avis demandé. */
  voteRole?: string;
  children?: ReactNode;
}) {
  return (
    <section className="space-y-5">
      <div className="assistant-hero card relative overflow-hidden">
        <div className="relative flex flex-wrap items-start gap-4">
          <span
            aria-hidden="true"
            className="assistant-avatar grid size-14 shrink-0 place-items-center rounded-2xl bg-accent text-2xl text-on-accent"
          >
            {icon}
          </span>
          <div className="min-w-0 flex-1">
            {role && <p className="eyebrow">{role}</p>}
            <h2 className="text-xl font-semibold">{title}</h2>
            <p className="mt-1 max-w-3xl text-sm text-ink-muted">{description}</p>
            {(does.length > 0 || never) && (
              <ul className="mt-3 flex flex-wrap gap-2 text-xs font-semibold">
                {does.map((d) => (
                  <li key={d} className="rounded-full bg-proved-soft px-2.5 py-1 text-proved">
                    ✓ {d}
                  </li>
                ))}
                {never && (
                  <li className="rounded-full bg-surface-sunken px-2.5 py-1 text-ink-muted">✕ {never}</li>
                )}
              </ul>
            )}
            {kind && (
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <AiBadge kind={kind} />
                {voteRole && <VoteButtons key={kind + voteRole} role={voteRole} kind={kind} />}
              </div>
            )}
          </div>
          {onRun && (
            <Button busy={busy} onClick={onRun}>
              {action}
            </Button>
          )}
        </div>
      </div>
      {busy && <Thinking label={busyLabel} />}
      {error !== undefined && error !== null && <Alert tone="error">{errorMessage(error)}</Alert>}
      {children}
    </section>
  );
}

/** Noms de classes écrits en entier : Tailwind ne génère que ce qu'il lit dans le code. */
const RING_STROKE = {
  proved: "stroke-proved",
  flagged: "stroke-flagged",
  removed: "stroke-removed",
  accent: "stroke-accent",
} as const;

/** Jauge circulaire (SVG) : valeur sur un maximum, couleur selon le seuil. Décorative ; le texte porte la valeur. */
export function Ring({
  value,
  max = 100,
  size = 120,
  label,
  tone,
}: {
  value: number;
  max?: number;
  size?: number;
  label: ReactNode;
  tone?: "proved" | "flagged" | "removed" | "accent";
}) {
  const ratio = max ? Math.min(1, value / max) : 0;
  const color = tone ?? (ratio >= 0.6 ? "proved" : ratio >= 0.3 ? "flagged" : "removed");
  const r = 52;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative grid shrink-0 place-items-center" style={{ width: size, height: size }}>
      <svg aria-hidden="true" viewBox="0 0 120 120" className="absolute inset-0 -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" strokeWidth="10" className="stroke-surface-sunken" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          strokeWidth="10"
          strokeLinecap="round"
          className={`ring-draw ${RING_STROKE[color]}`}
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - ratio), ["--ring-c" as string]: c }}
        />
      </svg>
      <div className="relative text-center leading-tight">{label}</div>
    </div>
  );
}

/** Choix exclusif en pastilles (radio natif, donc clavier et lecteurs d'écran sans effort). */
export function Segmented<T extends string>({
  name,
  legend,
  value,
  options,
  onChange,
}: {
  name: string;
  legend: string;
  value: T;
  options: readonly (readonly [T, ReactNode])[];
  onChange: (v: T) => void;
}) {
  return (
    <fieldset>
      <legend className="label">{legend}</legend>
      <div className="inline-flex flex-wrap gap-1 rounded-full border border-line bg-surface-sunken p-1">
        {options.map(([v, label]) => (
          <label
            key={v}
            className="cursor-pointer rounded-full px-4 py-1.5 text-sm font-semibold text-ink-muted transition-colors has-checked:bg-accent has-checked:text-on-accent has-focus-visible:outline-2 has-focus-visible:outline-focus"
          >
            <input
              type="radio"
              name={name}
              value={v}
              checked={value === v}
              onChange={() => onChange(v)}
              className="sr-only"
            />
            {label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function CopyButton({ text, label = "Copier" }: { text: string; label?: string }) {
  const toast = useToast();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Texte copié.");
    } catch {
      toast.error("Copie impossible : sélectionnez le texte à la main.");
    }
  };
  return (
    <Button variant="secondary" onClick={() => void copy()}>
      {label}
    </Button>
  );
}

export type CvLineView = { path: string; section: string; text: string; sources: string[] };

/** Lignes du CV généré, dans l'ordre de lecture, avec la rubrique où elles figurent. */
export function cvLines(generation: Generation): CvLineView[] {
  const cv = generation.cv;
  if (!cv) return [];
  const p = generation.profile;
  const out: CvLineView[] = [];
  if (cv.headline) out.push({ path: "/headline", section: "Titre", ...cv.headline });
  cv.summary.forEach((l, i) => out.push({ path: `/summary/${i}`, section: "Résumé", ...l }));
  cv.work.forEach((e, i) => {
    const w = p.work[Number(e.ref.split("/")[2])];
    const section = w ? [w.position, w.name].filter(Boolean).join(" · ") : `Expérience ${i + 1}`;
    e.highlights.forEach((l, j) => out.push({ path: `/work/${i}/highlights/${j}`, section, ...l }));
  });
  cv.projects.forEach((e, i) => {
    const pr = p.projects[Number(e.ref.split("/")[2])];
    const section = pr?.name ?? `Projet ${i + 1}`;
    e.highlights.forEach((l, j) => out.push({ path: `/projects/${i}/highlights/${j}`, section, ...l }));
  });
  return out;
}

/** Libellés lisibles des sources d'une ligne. */
export const sourceLabels = (generation: Generation, sources: string[]) =>
  sources.map((s) => describePointer(generation.profile, s));

/* --- Évolutions communes (ADR 0029) ----------------------------------------------------------------- */

/**
 * Résultats conservés des assistants d'un CV : lus une fois depuis le serveur, puis tenus à jour dans le
 * cache. Changer d'onglet, recharger la page ou changer d'appareil ne fait plus perdre une réponse.
 */
export function useAssistantResults(generationId: string) {
  const queryClient = useQueryClient();
  const key = ["assistants", generationId];
  const query = useQuery({
    queryKey: key,
    queryFn: () => cv.assistants(generationId),
    staleTime: Infinity,
    enabled: Boolean(generationId),
  });
  const stored = <T,>(name: string) => query.data?.[name]?.payload as T | undefined;
  const remember = (name: string, payload: unknown) =>
    queryClient.setQueryData<AssistantResults>(key, (old) => ({
      ...old,
      [name]: { payload, updatedAt: new Date().toISOString() },
    }));
  return { ready: !query.isPending, stored, remember };
}

/**
 * Assistant d'un CV : la réponse conservée s'affiche d'emblée ; une nouvelle exécution la remplace et est
 * conservée à son tour (le serveur l'enregistre, le cache suit).
 */
export function useAssistantRun<T>(generationId: string, name: string, run: () => Promise<T>) {
  const { stored, remember, ready } = useAssistantResults(generationId);
  const mutation = useMutation({ mutationFn: run, onSuccess: (data) => remember(name, data) });
  // La réponse affichée est celle conservée sous ce nom : changer de variante (langue, niveau) affiche la
  // sienne, sans mélanger avec la dernière exécution.
  return { ...mutation, data: stored<T>(name), ready };
}

/** Avis 👍 / 👎 sur une réponse : anonyme, une fois par réponse affichée. */
export function VoteButtons({ role, kind }: { role: string; kind: "ia" | "demo" }) {
  const [given, setGiven] = useState<1 | -1 | null>(null);
  const send = useMutation({
    mutationFn: (v: 1 | -1) => vote(role, v, kind),
    onSuccess: (_d, v) => setGiven(v),
  });
  if (given)
    return (
      <p role="status" className="text-xs font-semibold text-ink-subtle">
        Merci pour votre avis {given === 1 ? "👍" : "👎"}
      </p>
    );
  return (
    <div className="flex items-center gap-1 text-xs text-ink-subtle">
      <span>Cette réponse vous aide ?</span>
      {([1, -1] as const).map((v) => (
        <button
          key={v}
          type="button"
          disabled={send.isPending}
          onClick={() => send.mutate(v)}
          aria-label={v === 1 ? "Oui, utile" : "Non, peu utile"}
          className="rounded-full px-2 py-1 text-base transition-transform hover:scale-125 hover:bg-surface-sunken"
        >
          {v === 1 ? "👍" : "👎"}
        </button>
      ))}
    </div>
  );
}

type Recognition = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult:
    | ((e: {
        resultIndex: number;
        results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }>;
      }) => void)
    | null;
  onend: (() => void) | null;
};

/**
 * Dictée vocale du navigateur (Web Speech API), sans envoi à Attesta : le texte reconnu est ajouté à la
 * réponse. Indisponible dans certains navigateurs : le bouton n'apparaît alors pas.
 */
export function useDictation(onText: (text: string) => void) {
  const Ctor =
    typeof window !== "undefined"
      ? ((window as unknown as Record<string, unknown>).SpeechRecognition ??
        (window as unknown as Record<string, unknown>).webkitSpeechRecognition)
      : undefined;
  const [listening, setListening] = useState(false);
  const startedAt = useRef<number | null>(null);
  const [seconds, setSeconds] = useState(0);
  const ref = useRef<Recognition | null>(null);
  const callback = useRef(onText);
  callback.current = onText;
  useEffect(() => () => ref.current?.stop(), []);
  const start = () => {
    if (!Ctor) return;
    const r = new (Ctor as new () => Recognition)();
    r.lang = "fr-FR";
    r.continuous = true;
    r.interimResults = false;
    r.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++)
        if (e.results[i]!.isFinal) callback.current(e.results[i]![0].transcript.trim());
    };
    r.onend = () => {
      setListening(false);
      const t = startedAt.current;
      if (t) setSeconds((s) => s + (Date.now() - t) / 1000);
      startedAt.current = null;
    };
    ref.current = r;
    r.start();
    setListening(true);
    startedAt.current = Date.now();
  };
  const stop = () => ref.current?.stop();
  return { supported: Boolean(Ctor), listening, start, stop, seconds, reset: () => setSeconds(0) };
}

export function DictateButton({ dictation }: { dictation: ReturnType<typeof useDictation> }) {
  if (!dictation.supported) return null;
  return (
    <Button
      variant="ghost"
      aria-pressed={dictation.listening}
      onClick={() => (dictation.listening ? dictation.stop() : dictation.start())}
    >
      <span aria-hidden="true" className={dictation.listening ? "live-dot" : ""}>
        🎙
      </span>
      {dictation.listening ? "Arrêter la dictée" : "Dicter ma réponse"}
    </Button>
  );
}

/** Date locale au format AAAA-MM-JJ, décalée de `days` jours. */
export const isoDay = (days = 0) => {
  const d = new Date(Date.now() + days * 86_400_000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
};

/** « Me le rappeler » : rappel par courriel à une date choisie (comptes seulement, ADR 0029). */
export function ReminderButton({
  kind,
  title,
  detail = "",
  link = null,
  defaultDays = 7,
  label = "Me le rappeler",
}: {
  kind: "progression" | "relance";
  title: string;
  detail?: string;
  link?: string | null;
  defaultDays?: number;
  label?: string;
}) {
  const { isAccount } = useSession();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [day, setDay] = useState(() => isoDay(defaultDays));
  const id = useId();
  const add = useMutation({
    mutationFn: () => watch.addReminder({ kind, sendOn: day, title, detail, link }),
    onSuccess: () => {
      toast.success(`Rappel programmé le ${new Date(`${day}T12:00:00`).toLocaleDateString("fr-FR")}.`);
      setOpen(false);
    },
  });
  if (!isAccount) return null;
  if (!open)
    return (
      <Button variant="ghost" onClick={() => setOpen(true)}>
        ⏰ {label}
      </Button>
    );
  return (
    <div className="flex animate-enter flex-wrap items-end gap-2 rounded-2xl bg-surface-sunken p-3">
      <div>
        <label htmlFor={id} className="label">
          Rappel par courriel le
        </label>
        <input
          id={id}
          type="date"
          className="input"
          min={isoDay(0)}
          max={isoDay(365)}
          value={day}
          onChange={(e) => setDay(e.target.value)}
        />
      </div>
      <Button busy={add.isPending} onClick={() => add.mutate()}>
        Programmer
      </Button>
      <Button variant="ghost" onClick={() => setOpen(false)}>
        Annuler
      </Button>
      {add.isError && <Alert tone="error">{errorMessage(add.error)}</Alert>}
    </div>
  );
}
