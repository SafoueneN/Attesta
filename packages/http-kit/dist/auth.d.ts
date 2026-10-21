import type { NextFunction, Request, Response } from "express";
import { type JWTVerifyGetKey } from "jose";
/** Émetteur des jetons (ADR 0014) ; audience des jetons d'utilisateur et d'invité. */
export declare const TOKEN_ISSUER = "attesta-auth";
export declare const USER_AUDIENCE = "attesta";
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
export interface VerifierOptions {
    /** Audiences admises : `attesta` pour les utilisateurs, le nom du service pour les jetons de service. */
    audience: string | string[];
    issuer?: string;
}
/** Vérificateur à partir d'une clé ou d'un jeu de clés (tests, et `auth` lui-même). */
export declare function createVerifier(key: JWTVerifyGetKey, options: VerifierOptions): TokenVerifier;
/**
 * Vérificateur par JWKS (ADR 0014, point 5) : clés publiques d'`auth` mises en cache, rechargées
 * quand un `kid` inconnu apparaît (rotation), au plus une fois toutes les 30 s.
 */
export declare function createJwksVerifier(jwksUrl: string, options: VerifierOptions): TokenVerifier;
/** Identité de la requête, posée par `authenticate`. */
export declare function principalOf(res: Response): Principal;
export declare function bearerToken(req: Request): string | undefined;
/**
 * Exige un jeton valide (signature, `exp`, `iss`, `aud`). Défense en profondeur : chaque service le
 * vérifie, même derrière la gateway (ADR 0014). Le motif d'un refus n'est jamais détaillé au client.
 */
export declare function authenticate(verifier: TokenVerifier): (req: Request, res: Response, next: NextFunction) => Promise<void>;
/** Réserve la route à certains rôles (ADR 0024). */
export declare function requireRole(...roles: Role[]): (_req: Request, res: Response, next: NextFunction) => void;
/** Compte réel exigé (candidat ou administrateur) : l'invité doit d'abord se connecter. */
export declare const requireAccount: () => (_req: Request, res: Response, next: NextFunction) => void;
/** Jeton de service portant la portée demandée (`users:delete`, `matching:run`…). */
export declare function requireScope(scope: string): (_req: Request, res: Response, next: NextFunction) => void;
