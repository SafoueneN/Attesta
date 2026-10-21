import type { NextFunction, Request, Response } from "express";
import { createRemoteJWKSet, jwtVerify, type JWTPayload, type JWTVerifyGetKey } from "jose";
import { forbidden, unauthorized } from "./errors.js";

/** Émetteur des jetons (ADR 0014) ; audience des jetons d'utilisateur et d'invité. */
export const TOKEN_ISSUER = "attesta-auth";
export const USER_AUDIENCE = "attesta";

/** Rôles portés par la revendication `role` (ADR 0024) ; `service` pour les jetons de service. */
export type Role = "candidate" | "admin" | "guest" | "service";

/** Identité vérifiée d'une requête, sans aucune donnée personnelle (pas d'e-mail dans le jeton). */
export interface Principal {
  /** UUID de l'utilisateur, `guest_<uuid>` pour un invité, `service:<nom>` pour un service. */
  sub: string;
  role: Role;
  scope: string[];
  /** Jeton reçu, à relayer tel quel vers un autre service pour le compte de l'utilisateur (ADR 0012). */
  token: string;
}

export interface TokenVerifier {
  verify(token: string): Promise<Principal>;
}

const ROLES: readonly Role[] = ["candidate", "admin", "guest", "service"];

function toPrincipal(payload: JWTPayload, token: string): Principal {
  const role = payload.role;
  if (typeof payload.sub !== "string" || !ROLES.includes(role as Role)) {
    throw new Error("revendications incomplètes");
  }
  const scope = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
  return { sub: payload.sub, role: role as Role, scope, token };
}

export interface VerifierOptions {
  /** Audiences admises : `attesta` pour les utilisateurs, le nom du service pour les jetons de service. */
  audience: string | string[];
  issuer?: string;
}

/** Vérificateur à partir d'une clé ou d'un jeu de clés (tests, et `auth` lui-même). */
export function createVerifier(key: JWTVerifyGetKey, options: VerifierOptions): TokenVerifier {
  return {
    async verify(token) {
      const { payload } = await jwtVerify(token, key, {
        issuer: options.issuer ?? TOKEN_ISSUER,
        audience: options.audience,
        algorithms: ["RS256"],
      });
      return toPrincipal(payload, token);
    },
  };
}

/**
 * Vérificateur par JWKS (ADR 0014, point 5) : clés publiques d'`auth` mises en cache, rechargées
 * quand un `kid` inconnu apparaît (rotation), au plus une fois toutes les 30 s.
 */
export function createJwksVerifier(jwksUrl: string, options: VerifierOptions): TokenVerifier {
  const keys = createRemoteJWKSet(new URL(jwksUrl), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
  return createVerifier(keys, options);
}

/** Identité de la requête, posée par `authenticate`. */
export function principalOf(res: Response): Principal {
  const principal = res.locals.principal as Principal | undefined;
  if (!principal) throw unauthorized();
  return principal;
}

export function bearerToken(req: Request): string | undefined {
  const header = req.get("authorization") ?? "";
  const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
  return match?.[1];
}

/**
 * Exige un jeton valide (signature, `exp`, `iss`, `aud`). Défense en profondeur : chaque service le
 * vérifie, même derrière la gateway (ADR 0014). Le motif d'un refus n'est jamais détaillé au client.
 */
export function authenticate(verifier: TokenVerifier) {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = bearerToken(req);
    if (!token) return next(unauthorized());
    try {
      res.locals.principal = await verifier.verify(token);
      next();
    } catch {
      next(unauthorized("Votre session a expiré. Reconnectez-vous."));
    }
  };
}

/** Réserve la route à certains rôles (ADR 0024). */
export function requireRole(...roles: Role[]) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const { role } = principalOf(res);
    next(roles.includes(role) ? undefined : forbidden());
  };
}

/** Compte réel exigé (candidat ou administrateur) : l'invité doit d'abord se connecter. */
export const requireAccount = () => (_req: Request, res: Response, next: NextFunction) => {
  const { role } = principalOf(res);
  next(
    role === "candidate" || role === "admin"
      ? undefined
      : forbidden("Connectez-vous pour accéder à cette fonctionnalité."),
  );
};

/** Jeton de service portant la portée demandée (`users:delete`, `matching:run`…). */
export function requireScope(scope: string) {
  return (_req: Request, res: Response, next: NextFunction) => {
    const principal = principalOf(res);
    next(principal.role === "service" && principal.scope.includes(scope) ? undefined : forbidden());
  };
}
