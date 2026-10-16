import { randomBytes, timingSafeEqual } from "node:crypto";
import type { NextFunction, Request, Response } from "express";
import { AppError } from "@attesta/shared";

/** Durée de vie absolue d'une session anonyme, quelle que soit l'activité (décision Q2). */
export const SESSION_ABSOLUTE_MS = 24 * 60 * 60 * 1000;

/** Nonce CSP par requête, pour la feuille de style embarquée de l'aperçu. */
export function cspNonce(_req: Request, res: Response, next: NextFunction) {
  res.locals.cspNonce = randomBytes(16).toString("base64");
  next();
}

/** Jeton CSRF « synchronizer » stocké en session et exposé aux vues. */
export function csrfToken(req: Request, res: Response, next: NextFunction) {
  if (req.session) {
    req.session.csrfToken ??= randomBytes(32).toString("base64url");
    res.locals.csrfToken = req.session.csrfToken;
  }
  next();
}

export function verifyCsrf(req: Request, _res: Response, next: NextFunction) {
  const expected = req.session?.csrfToken;
  const received = typeof req.body?._csrf === "string" ? req.body._csrf : "";
  const ok =
    expected !== undefined &&
    received.length === expected.length &&
    timingSafeEqual(Buffer.from(received), Buffer.from(expected));
  if (!ok) {
    next(
      new AppError(
        "csrf_invalid",
        403,
        "Votre session a expiré ou le formulaire n'est plus valide. Rechargez la page pour continuer.",
      ),
    );
    return;
  }
  next();
}

/** Régénère la session au-delà de 24 h : le brouillon est alors effacé. */
export function absoluteSessionLimit(now: () => number = Date.now) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const created = req.session.createdAt;
    if (created !== undefined && now() - created > SESSION_ABSOLUTE_MS) {
      req.session.regenerate((err) => {
        if (!err) req.session.createdAt = now();
        next(err);
      });
      return;
    }
    req.session.createdAt ??= now();
    next();
  };
}
