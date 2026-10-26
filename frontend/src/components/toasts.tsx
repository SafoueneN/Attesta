import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Kind = "succes" | "erreur" | "info";
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const Context = createContext<((kind: Kind, text: string) => void) | null>(null);

/** Pastille de couleur et symbole : l'état ne repose jamais sur la seule couleur (WCAG 1.4.1). */
const STYLES: Record<Kind, { dot: string; mark: string }> = {
  succes: { dot: "bg-proved text-surface", mark: "✓" },
  erreur: { dot: "bg-removed text-surface", mark: "!" },
  info: { dot: "bg-accent text-on-accent", mark: "i" },
};

/**
 * Notifications brèves. Région annoncée par les lecteurs d'écran (`role="status"`, polie) ; les erreurs
 * de formulaire, elles, sont affichées dans la page avec le résumé focalisé.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const push = useCallback((kind: Kind, text: string) => {
    const id = Date.now() + Math.random();
    setToasts((list) => [...list.slice(-3), { id, kind, text }]);
    setTimeout(() => setToasts((list) => list.filter((t) => t.id !== id)), kind === "erreur" ? 8000 : 5000);
  }, []);
  const dismiss = (id: number) => setToasts((list) => list.filter((t) => t.id !== id));

  return (
    <Context.Provider value={push}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4 sm:inset-x-auto sm:right-6 sm:bottom-6 sm:items-end"
      >
        {toasts.map((t) => (
          <ToastCard key={t.id} toast={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </Context.Provider>
  );
}

/**
 * Une notification : barre de temps restant (même durée que la fermeture automatique), et fermeture par
 * glissement horizontal au doigt ou à la souris, en plus du bouton « Fermer ».
 */
function ToastCard({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const start = useRef<number | null>(null);
  const [dx, setDx] = useState(0);
  return (
    <div
      className="toast pointer-events-auto relative flex w-full max-w-md animate-enter touch-pan-y items-start gap-3 overflow-hidden rounded-2xl border border-line bg-surface px-4 py-3 text-ink shadow-float select-none"
      style={{
        transform: dx ? `translateX(${dx}px)` : undefined,
        opacity: dx ? Math.max(0.2, 1 - Math.abs(dx) / 220) : undefined,
        transition: start.current === null ? "transform 250ms, opacity 250ms" : "none",
      }}
      onPointerDown={(e) => {
        if ((e.target as Element).closest("button")) return;
        start.current = e.clientX;
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (start.current !== null) setDx(e.clientX - start.current);
      }}
      onPointerUp={() => {
        start.current = null;
        if (Math.abs(dx) > 110) onDismiss();
        else setDx(0);
      }}
    >
      <span
        aria-hidden="true"
        className={`mt-0.5 grid size-5 shrink-0 animate-pop place-items-center rounded-full text-xs font-bold ${STYLES[toast.kind].dot}`}
      >
        {STYLES[toast.kind].mark}
      </span>
      <p className="text-sm font-medium">{toast.text}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="ml-auto shrink-0 rounded-md px-1.5 text-sm text-ink-muted underline underline-offset-2 hover:text-ink"
        aria-label="Fermer la notification"
      >
        Fermer
      </button>
      <span
        aria-hidden="true"
        className={`toast-timer absolute inset-x-0 bottom-0 h-0.5 ${STYLES[toast.kind].dot}`}
        style={{ animationDuration: `${toast.kind === "erreur" ? 8000 : 5000}ms` }}
      />
    </div>
  );
}

export function useToast() {
  const push = useContext(Context);
  if (!push) throw new Error("useToast hors de ToastProvider");
  return useMemo(
    () => ({
      success: (text: string) => push("succes", text),
      error: (text: string) => push("erreur", text),
      info: (text: string) => push("info", text),
    }),
    [push],
  );
}
