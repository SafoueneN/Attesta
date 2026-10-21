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

type Variant = "primary" | "secondary" | "danger" | "ghost";
const VARIANTS: Record<Variant, string> = {
  primary: "bg-brand-700 text-white hover:bg-brand-800 disabled:bg-slate-400",
  secondary:
    "border border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:hover:bg-slate-800",
  danger: "bg-red-700 text-white hover:bg-red-800 disabled:bg-slate-400",
  ghost: "text-brand-700 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-slate-800",
};

export function Button({
  variant = "primary",
  busy = false,
  className = "",
  children,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; busy?: boolean }) {
  return (
    <button
      type="button"
      {...props}
      disabled={props.disabled || busy}
      aria-busy={busy || undefined}
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition-colors disabled:cursor-not-allowed ${VARIANTS[variant]} ${className}`}
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
        {label}{" "}
        {optional && <span className="font-normal text-slate-500 dark:text-slate-400">(facultatif)</span>}
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
        <p id={errorId} className="mt-1 text-sm font-medium text-red-700 dark:text-red-400">
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
      {(aria) => <input className="input" {...input} {...aria} />}
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
      className="mb-6 rounded-lg border-2 border-red-700 bg-red-50 p-4 dark:bg-red-950"
    >
      <h2 id="resume-erreurs" className="font-bold text-red-900 dark:text-red-100">
        {title}
      </h2>
      <ul className="mt-2 list-disc space-y-1 pl-5">
        {errors.map((e, i) => (
          <li key={`${e.field}-${i}`}>
            <a
              href={`#${e.field}`}
              className="text-red-900 underline dark:text-red-100"
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
const TONES: Record<Tone, string> = {
  info: "border-brand-600 bg-brand-50 text-brand-900 dark:bg-slate-900 dark:text-brand-100",
  success: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  warning: "border-amber-600 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100",
  error: "border-red-700 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
};

export function Alert({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  return (
    <div role={tone === "error" ? "alert" : undefined} className={`rounded-lg border-l-4 p-4 ${TONES[tone]}`}>
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
        <h1 className="text-3xl font-bold tracking-tight">{title}</h1>
        {lead && <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-400">{lead}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children?: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className="card text-center">
      <p className="text-lg font-semibold">{title}</p>
      {children && <p className="mx-auto mt-2 max-w-md text-slate-600 dark:text-slate-400">{children}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Badge({ tone = "info", children }: { tone?: Tone | "neutral"; children: ReactNode }) {
  const colors: Record<string, string> = {
    info: "bg-brand-100 text-brand-900",
    success: "bg-emerald-100 text-emerald-900",
    warning: "bg-amber-100 text-amber-900",
    error: "bg-red-100 text-red-900",
    neutral: "bg-slate-200 text-slate-800 dark:bg-slate-800 dark:text-slate-200",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${colors[tone]}`}
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

export function Loading({ label = "Chargement…" }: { label?: string }) {
  return (
    <div className="flex justify-center py-16 text-slate-600 dark:text-slate-400">
      <Spinner label={label} />
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
      className="m-auto max-w-md rounded-xl p-0 shadow-xl backdrop:bg-slate-950/60 dark:bg-slate-900 dark:text-slate-100"
    >
      {open && (
        <div className="p-6">
          <h2 id={titleId} className="text-lg font-bold">
            {title}
          </h2>
          <div className="mt-2 text-slate-700 dark:text-slate-300">{children}</div>
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
