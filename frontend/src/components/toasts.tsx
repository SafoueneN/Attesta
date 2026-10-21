import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

type Kind = "succes" | "erreur" | "info";
interface Toast {
  id: number;
  kind: Kind;
  text: string;
}

const Context = createContext<((kind: Kind, text: string) => void) | null>(null);

const STYLES: Record<Kind, string> = {
  succes: "border-emerald-600 bg-emerald-50 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-100",
  erreur: "border-red-600 bg-red-50 text-red-900 dark:bg-red-950 dark:text-red-100",
  info: "border-brand-600 bg-brand-50 text-brand-900 dark:bg-slate-900 dark:text-brand-100",
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
        className="pointer-events-none fixed inset-x-0 bottom-4 z-50 flex flex-col items-center gap-2 px-4"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`pointer-events-auto flex max-w-lg items-start gap-3 rounded-lg border-l-4 px-4 py-3 shadow-lg ${STYLES[t.kind]}`}
          >
            <p className="text-sm font-medium">{t.text}</p>
            <button
              type="button"
              onClick={() => dismiss(t.id)}
              className="ml-auto text-sm underline"
              aria-label="Fermer la notification"
            >
              Fermer
            </button>
          </div>
        ))}
      </div>
    </Context.Provider>
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
