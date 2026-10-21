import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router";
import { Loading } from "../components/ui";
import { useSession } from "./session";

/**
 * Routes protégées par rôle (ADR 0024, point 3). Ce n'est qu'un confort d'affichage : la gateway et
 * chaque service revérifient le jeton et le rôle.
 */
export function RequireSession({ children }: { children: ReactNode }) {
  const { loading } = useSession();
  return loading ? <Loading label="Ouverture de la session…" /> : children;
}

export function RequireAccount({ children }: { children: ReactNode }) {
  const { loading, isAccount } = useSession();
  const location = useLocation();
  if (loading) return <Loading label="Ouverture de la session…" />;
  if (!isAccount) return <Navigate to="/connexion" replace state={{ from: location.pathname }} />;
  return children;
}

export function RequireAdmin({ children }: { children: ReactNode }) {
  const { loading, isAccount, isAdmin } = useSession();
  if (loading) return <Loading label="Ouverture de la session…" />;
  if (!isAccount) return <Navigate to="/connexion" replace />;
  if (!isAdmin) return <Navigate to="/acces-refuse" replace />;
  return children;
}
