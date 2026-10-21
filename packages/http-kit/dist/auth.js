import { createRemoteJWKSet, jwtVerify } from "jose";
import { forbidden, unauthorized } from "./errors.js";
/** Émetteur des jetons (ADR 0014) ; audience des jetons d'utilisateur et d'invité. */
export const TOKEN_ISSUER = "attesta-auth";
export const USER_AUDIENCE = "attesta";
const ROLES = ["candidate", "admin", "guest", "service"];
function toPrincipal(payload, token) {
    const role = payload.role;
    if (typeof payload.sub !== "string" || !ROLES.includes(role)) {
        throw new Error("revendications incomplètes");
    }
    const scope = typeof payload.scope === "string" ? payload.scope.split(" ").filter(Boolean) : [];
    return { sub: payload.sub, role: role, scope, token };
}
/** Vérificateur à partir d'une clé ou d'un jeu de clés (tests, et `auth` lui-même). */
export function createVerifier(key, options) {
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
export function createJwksVerifier(jwksUrl, options) {
    const keys = createRemoteJWKSet(new URL(jwksUrl), { cooldownDuration: 30_000, timeoutDuration: 5_000 });
    return createVerifier(keys, options);
}
/** Identité de la requête, posée par `authenticate`. */
export function principalOf(res) {
    const principal = res.locals.principal;
    if (!principal)
        throw unauthorized();
    return principal;
}
export function bearerToken(req) {
    const header = req.get("authorization") ?? "";
    const match = /^Bearer ([A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+)$/.exec(header);
    return match?.[1];
}
/**
 * Exige un jeton valide (signature, `exp`, `iss`, `aud`). Défense en profondeur : chaque service le
 * vérifie, même derrière la gateway (ADR 0014). Le motif d'un refus n'est jamais détaillé au client.
 */
export function authenticate(verifier) {
    return async (req, res, next) => {
        const token = bearerToken(req);
        if (!token)
            return next(unauthorized());
        try {
            res.locals.principal = await verifier.verify(token);
            next();
        }
        catch {
            next(unauthorized("Votre session a expiré. Reconnectez-vous."));
        }
    };
}
/** Réserve la route à certains rôles (ADR 0024). */
export function requireRole(...roles) {
    return (_req, res, next) => {
        const { role } = principalOf(res);
        next(roles.includes(role) ? undefined : forbidden());
    };
}
/** Compte réel exigé (candidat ou administrateur) : l'invité doit d'abord se connecter. */
export const requireAccount = () => (_req, res, next) => {
    const { role } = principalOf(res);
    next(role === "candidate" || role === "admin"
        ? undefined
        : forbidden("Connectez-vous pour accéder à cette fonctionnalité."));
};
/** Jeton de service portant la portée demandée (`users:delete`, `matching:run`…). */
export function requireScope(scope) {
    return (_req, res, next) => {
        const principal = principalOf(res);
        next(principal.role === "service" && principal.scope.includes(scope) ? undefined : forbidden());
    };
}
