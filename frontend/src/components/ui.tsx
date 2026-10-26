import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type TextareaHTMLAttributes,
} from "react";
import { ApiError } from "../api/client";
import type { FieldError } from "../lib/profileForm";

/** Titre de l'onglet : « Erreur : » en tête quand la page affiche des erreurs (WCAG 3.3.1). */
export function useDocumentTitle(title: string, hasErrors = false) {
  useEffect(() => {
    document.title = `${hasErrors ? "Erreur : " : ""}${title} – Attesta`;
  }, [title, hasErrors]);
}

export type Variant = "primary" | "secondary" | "danger" | "ghost";
export type Size = "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary:
    "bg-accent text-on-accent shadow-card hover:bg-accent-hover hover:shadow-[0_10px_30px_-10px_var(--accent)]",
  secondary: "border border-line-strong bg-surface text-ink hover:border-ink-subtle hover:bg-surface-sunken",
  danger: "bg-removed text-surface shadow-card hover:opacity-90",
  ghost: "text-accent-text hover:bg-accent-soft",
};
/** Pilules : forme de la marque, cohérente du bandeau aux formulaires. */
const SIZES: Record<Size, string> = {
  md: "rounded-full px-4 py-2 text-sm",
  lg: "rounded-full px-6 py-3 text-base",
};
/** À ajouter à un bouton `lg` qui se termine par une `ArrowBadge` : la pastille touche presque le bord. */
export const WITH_ARROW = "group gap-3 py-1.5! pr-1.5! pl-6!";

/**
 * Pastille ronde à flèche des appels à l'action (taille `lg`) ; pivote au survol du bouton (classe `group`).
 * Décorative : le libellé du bouton porte le sens.
 */
export function ArrowBadge({ tone = "dark" }: { tone?: "dark" | "light" }) {
  return (
    <span
      aria-hidden="true"
      className={`arrow-badge grid size-9 shrink-0 place-items-center rounded-full text-base ${
        tone === "dark" ? "bg-on-accent text-accent" : "bg-ink text-paper"
      }`}
    >
      ↗
    </span>
  );
}

/**
 * Classes d'un bouton, partagées avec les liens qui en ont l'apparence (`<Link className={buttonClass()}>`) :
 * un lien qui navigue reste un lien pour les lecteurs d'écran. Léger enfoncement au clic, sans animation
 * des dimensions (pas de reflow).
 */
export function buttonClass(variant: Variant = "primary", size: Size = "md", extra = "") {
  return `btn inline-flex items-center justify-center gap-2 font-semibold transition-[background-color,border-color,box-shadow,transform,opacity] duration-150 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-55 disabled:active:scale-100 ${SIZES[size]} ${VARIANTS[variant]} ${extra}`;
}

export function Button({
  variant = "primary",
  size = "md",
  busy = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={buttonClass(variant, size, className)}
    >
      {busy && <Spinner small />}
      {children}
    </button>
  );
}

export function Spinner({ small = false, label }: { small?: boolean; label?: string }) {
  return (
    <span role={label ? "status" : undefined} className="inline-flex items-center gap-2">
      <span
        aria-hidden="true"
        className={`${small ? "size-4" : "size-6"} animate-spin rounded-full border-2 border-current border-t-transparent`}
      />
      {label && <span>{label}</span>}
    </span>
  );
}

interface FieldProps {
  id: string;
  label: string;
  hint?: ReactNode;
  optional?: boolean;
  errors?: FieldError[];
}

function errorFor(id: string, errors?: FieldError[]) {
  return errors?.filter((e) => e.field === id).map((e) => e.message) ?? [];
}

function FieldShell({
  id,
  label,
  hint,
  optional,
  errors,
  children,
}: FieldProps & { children: (aria: object) => ReactNode }) {
  const messages = errorFor(id, errors);
  const hintId = hint ? `${id}-aide` : undefined;
  const errorId = messages.length ? `${id}-erreur` : undefined;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label} {optional && <span className="font-normal text-ink-subtle">(facultatif)</span>}
      </label>
      {children({
        id,
        "aria-invalid": messages.length ? true : undefined,
        "aria-describedby": [hintId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {hint && (
        <p id={hintId} className="hint">
          {hint}
        </p>
      )}
      {errorId && (
        <p
          id={errorId}
          className="mt-1.5 flex animate-enter items-start gap-1.5 text-sm font-semibold text-removed"
        >
          <span aria-hidden="true">!</span>
          {messages.join(" ")}
        </p>
      )}
    </div>
  );
}

export function TextField({
  id,
  label,
  hint,
  optional,
  errors,
  ...input
}: FieldProps & InputHTMLAttributes<HTMLInputElement>) {
  return (
    <FieldShell {...{ id, label, hint, optional, errors }}>
      {(aria) => {
        const filled = typeof input.value === "string" && input.value.trim() !== "";
        const invalid = (aria as { "aria-invalid"?: boolean })["aria-invalid"];
        return (
          <div className="relative">
            <input className={`input ${filled && !invalid ? "pr-10" : ""}`} {...input} {...aria} />
            {/* Coche décorative : le champ est rempli et sans erreur connue. */}
            {filled && !invalid && (
              <span
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 right-3 grid size-5 -translate-y-1/2 animate-pop place-items-center rounded-full bg-proved-soft text-xs font-bold text-proved"
              >
                ✓
              </span>
            )}
          </div>
        );
      }}
    </FieldShell>
  );
}

export function TextArea({
  id,
  label,
  hint,
  optional,
  errors,
  ...input
}: FieldProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <FieldShell {...{ id, label, hint, optional, errors }}>
      {(aria) => <textarea className="input min-h-28" {...input} {...aria} />}
    </FieldShell>
  );
}

/**
 * Résumé d'erreurs (GOV.UK, WCAG 3.3.1) : focalisé à l'affichage, chaque erreur mène à son champ.
 */
export function ErrorSummary({
  errors,
  title = "Corrigez les points suivants pour continuer",
}: {
  errors: FieldError[];
  title?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (errors.length) ref.current?.focus();
  }, [errors]);
  if (!errors.length) return null;
  return (
    <div
      ref={ref}
      tabIndex={-1}
      role="alert"
      aria-labelledby="resume-erreurs"
      className="mb-6 animate-enter rounded-xl border-2 border-removed bg-removed-soft p-5 text-ink"
    >
      <h2 id="resume-erreurs" className="font-bold text-removed">
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((e, i) => (
          <li key={`${e.field}-${i}`}>
            <a
              href={`#${e.field}`}
              className="font-medium text-ink underline decoration-removed underline-offset-3"
              onClick={(event) => {
                event.preventDefault();
                document.getElementById(e.field)?.focus();
              }}
            >
              {e.message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Erreurs d'API rattachées aux champs du formulaire (`champ` → identifiant HTML). */
export function apiFieldErrors(error: unknown, map: (champ: string) => string = (c) => c): FieldError[] {
  if (!(error instanceof ApiError)) return [];
  return error.fieldErrors.map((e) => ({ field: map(e.champ), message: e.message }));
}

export const errorMessage = (error: unknown) =>
  error instanceof ApiError
    ? error.message
    : "Une erreur inattendue est survenue. Réessayez dans un instant.";

type Tone = "info" | "success" | "warning" | "error";
/** Fond pâle de l'état, bordure de sa couleur, texte à l'encre : contraste AA quel que soit le thème. */
const TONES: Record<Tone, string> = {
  info: "border-accent bg-accent-soft",
  success: "border-proved bg-proved-soft",
  warning: "border-flagged bg-flagged-soft",
  error: "border-removed bg-removed-soft",
};

export function Alert({
  tone = "info",
  title,
  children,
  announce = false,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
  /** Annonce aux lecteurs d'écran un message qui n'est pas une erreur (résultat d'une action). */
  announce?: boolean;
}) {
  return (
    <div
      role={tone === "error" ? "alert" : announce ? "status" : undefined}
      className={`animate-enter rounded-xl border-l-4 p-4 text-ink ${TONES[tone]}`}
    >
      {title && <p className="font-semibold">{title}</p>}
      {children && <div className={title ? "mt-1 text-sm" : "text-sm"}>{children}</div>}
    </div>
  );
}

export function PageHeader({
  title,
  lead,
  actions,
}: {
  title: string;
  lead?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-display text-title font-semibold tracking-tight">{title}</h1>
        {lead && <p className="mt-3 max-w-2xl text-lead text-ink-muted">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

/** Petites illustrations vectorielles des états vides, aux couleurs des jetons (décoratives). */
const ILLUSTRATIONS = {
  documents: (
    <>
      <rect
        x="34"
        y="18"
        width="62"
        height="78"
        rx="10"
        fill="var(--surface-sunken)"
        stroke="var(--line-strong)"
        strokeWidth="2"
      />
      <rect
        x="22"
        y="28"
        width="62"
        height="78"
        rx="10"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2"
      />
      <rect x="34" y="44" width="38" height="6" rx="3" fill="var(--line)" />
      <rect x="34" y="58" width="30" height="6" rx="3" fill="var(--line)" />
      <rect x="34" y="72" width="34" height="6" rx="3" fill="var(--line)" />
      <circle cx="84" cy="96" r="14" fill="var(--accent)" />
      <path
        d="M78 96l4.5 4.5L91 92"
        fill="none"
        stroke="var(--on-accent)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </>
  ),
  search: (
    <>
      <rect
        x="18"
        y="26"
        width="70"
        height="56"
        rx="12"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2"
      />
      <rect x="30" y="40" width="34" height="6" rx="3" fill="var(--line)" />
      <rect x="30" y="54" width="46" height="6" rx="3" fill="var(--line)" />
      <circle cx="82" cy="78" r="16" fill="var(--paper)" stroke="var(--accent)" strokeWidth="5" />
      <path d="M93 90l12 12" stroke="var(--accent)" strokeWidth="6" strokeLinecap="round" />
    </>
  ),
  letter: (
    <>
      <rect
        x="18"
        y="34"
        width="84"
        height="58"
        rx="10"
        fill="var(--surface)"
        stroke="var(--line-strong)"
        strokeWidth="2"
      />
      <path d="M20 38l40 30 40-30" fill="none" stroke="var(--line-strong)" strokeWidth="2" />
      <circle cx="96" cy="34" r="12" fill="var(--accent)" />
      <path d="M96 28v12M90 34h12" stroke="var(--on-accent)" strokeWidth="3" strokeLinecap="round" />
    </>
  ),
};

export function EmptyState({
  title,
  children,
  action,
  illustration = "documents",
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
  illustration?: keyof typeof ILLUSTRATIONS;
}) {
  return (
    <div className="card border-dashed py-12 text-center">
      <svg aria-hidden="true" viewBox="0 0 120 120" className="illustration mx-auto mb-4 size-28">
        {ILLUSTRATIONS[illustration]}
      </svg>
      <p className="font-display text-xl font-semibold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-ink-muted">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Badge({ tone = "info", children }: { tone?: Tone | "neutral"; children: ReactNode }) {
  const colors: Record<string, string> = {
    info: "bg-accent-soft text-accent-text",
    success: "bg-proved-soft text-proved",
    warning: "bg-flagged-soft text-flagged",
    error: "bg-removed-soft text-removed",
    neutral: "bg-surface-sunken text-ink-muted",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-bold ${colors[tone]}`}
    >
      {children}
    </span>
  );
}

/** Score de fidélité : part des lignes rattachées à une source du profil. */
export function ScoreBadge({ score }: { score: number | null }) {
  if (score === null) return <Badge tone="neutral">Sans IA</Badge>;
  const value = Math.round(score * 100);
  return (
    <Badge tone={value === 100 ? "success" : value >= 80 ? "warning" : "error"}>Fidélité {value} %</Badge>
  );
}

/** Bloc de chargement à la forme du contenu ; purement visuel (le libellé est annoncé par `Loading`). */
export function Skeleton({ className = "h-4 w-full" }: { className?: string }) {
  return <span aria-hidden="true" className={`skeleton block ${className}`} />;
}

/** Chargement d'une page ou d'un bloc : squelette visible, libellé annoncé aux lecteurs d'écran. */
export function Loading({
  label = "Chargement…",
  variant = "lines",
}: {
  label?: string;
  /** `cards` : grille de cartes, pour les listes (Mes CV, offres). */
  variant?: "lines" | "cards";
}) {
  if (variant === "cards")
    return (
      <div role="status" className="grid gap-4 py-2 md:grid-cols-2 xl:grid-cols-3">
        <span className="sr-only">{label}</span>
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-3xl border border-line bg-surface p-5">
            <Skeleton className="h-28 w-full rounded-2xl" />
            <Skeleton className="mt-4 h-5 w-3/5" />
            <Skeleton className="mt-2 h-4 w-2/5" />
          </div>
        ))}
      </div>
    );
  return (
    <div role="status" className="space-y-3 py-6">
      <span className="sr-only">{label}</span>
      <Skeleton className="h-7 w-2/5" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  );
}

export function QueryError({ error, retry }: { error: unknown; retry?: () => void }) {
  return (
    <Alert tone="error" title="Impossible d'afficher cette page">
      <p>{errorMessage(error)}</p>
      {retry && (
        <Button variant="secondary" className="mt-3" onClick={retry}>
          Réessayer
        </Button>
      )}
    </Alert>
  );
}

/**
 * Dialogue de confirmation natif (`<dialog>` modal : focus piégé, Échap pour fermer), pour les actions
 * irréversibles.
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  confirmLabel: string;
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal?.();
    if (!open && dialog.open) dialog.close?.();
  }, [open]);
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      className="m-auto w-[calc(100%-2rem)] max-w-md rounded-2xl border border-line bg-surface p-0 text-ink shadow-float"
    >
      {open && (
        <div className="p-6">
          <h2 id={titleId} className="font-display text-xl font-semibold">
            {title}
          </h2>
          <div className="mt-2 text-ink-muted">{children}</div>
          <div className="mt-6 flex justify-end gap-2">
            <Button variant="secondary" onClick={onClose}>
              Annuler
            </Button>
            <Button variant={danger ? "danger" : "primary"} busy={busy} onClick={onConfirm}>
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </dialog>
  );
}
