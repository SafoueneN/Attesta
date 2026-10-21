import type { SessionResponse, SessionUser } from "@attesta/shared-schemas";
import { useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { refreshSession, session } from "../api/client";
import { auth } from "../api/endpoints";

interface SessionContext {
  user: SessionUser | null;
  /** Vrai tant que la session (compte ou invité) n'est pas établie au chargement. */
  loading: boolean;
  isAccount: boolean;
  isAdmin: boolean;
  signIn(response: SessionResponse): void;
  signOut(): Promise<void>;
}

const Context = createContext<SessionContext | null>(null);

/**
 * Session de l'application : au chargement, rotation du refresh token (compte) ou reprise de l'invité ;
 * sans session, un jeton d'invité permet le parcours sans compte (ADR 0014, point 7).
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const user = useSyncExternalStore(session.subscribe, session.user, session.user);
  const [loading, setLoading] = useState(true);
  const queryClient = useQueryClient();

  useEffect(() => {
    let alive = true;
    refreshSession().finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const signIn = useCallback(
    (response: SessionResponse) => {
      session.set(response);
      queryClient.clear();
    },
    [queryClient],
  );

  const signOut = useCallback(async () => {
    try {
      await auth.closeSession();
    } finally {
      session.set(null);
      queryClient.clear();
      await refreshSession();
    }
  }, [queryClient]);

  const value = useMemo<SessionContext>(
    () => ({
      user,
      loading,
      isAccount: user?.role === "candidate" || user?.role === "admin",
      isAdmin: user?.role === "admin",
      signIn,
      signOut,
    }),
    [user, loading, signIn, signOut],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useSession(): SessionContext {
  const value = useContext(Context);
  if (!value) throw new Error("useSession hors de SessionProvider");
  return value;
}
