import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { emptyDraft, type Draft } from "./profileForm";

const KEY = "attesta-brouillon";

interface DraftState {
  draft: Draft;
  /** Offre choisie à l'étape 3 (identifiant chez jobs-matching). */
  offerId: string | null;
  /** Vrai si le brouillon a été repris (session du navigateur ou profil enregistré). */
  restored: boolean;
}

interface DraftContext extends DraftState {
  update(change: (draft: Draft) => Draft): void;
  replace(draft: Draft): void;
  setOfferId(id: string | null): void;
  clear(): void;
}

const Context = createContext<DraftContext | null>(null);

function load(): DraftState {
  try {
    const saved = sessionStorage.getItem(KEY);
    if (saved) {
      const parsed = JSON.parse(saved) as { draft: Draft; offerId: string | null };
      return { draft: { ...emptyDraft(), ...parsed.draft }, offerId: parsed.offerId, restored: true };
    }
  } catch {
    // stockage indisponible ou contenu illisible : brouillon vide
  }
  return { draft: emptyDraft(), offerId: null, restored: false };
}

/**
 * Brouillon du parcours, conservé dans la session de l'onglet (`sessionStorage`) : il survit à un
 * rechargement, jamais à la fermeture de l'onglet. Le serveur ne reçoit que le profil validé.
 */
export function DraftProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<DraftState>(load);

  useEffect(() => {
    try {
      sessionStorage.setItem(KEY, JSON.stringify({ draft: state.draft, offerId: state.offerId }));
    } catch {
      // stockage plein ou interdit : le brouillon reste en mémoire
    }
  }, [state.draft, state.offerId]);

  const update = useCallback(
    (change: (d: Draft) => Draft) => setState((s) => ({ ...s, draft: change(s.draft) })),
    [],
  );
  const replace = useCallback((draft: Draft) => setState((s) => ({ ...s, draft, restored: true })), []);
  const setOfferId = useCallback((offerId: string | null) => setState((s) => ({ ...s, offerId })), []);
  const clear = useCallback(() => {
    try {
      sessionStorage.removeItem(KEY);
    } catch {
      // rien à effacer
    }
    setState({ draft: emptyDraft(), offerId: null, restored: false });
  }, []);

  const value = useMemo(
    () => ({ ...state, update, replace, setOfferId, clear }),
    [state, update, replace, setOfferId, clear],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useDraft(): DraftContext {
  const value = useContext(Context);
  if (!value) throw new Error("useDraft hors de DraftProvider");
  return value;
}
