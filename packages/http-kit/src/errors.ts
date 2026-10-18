/**
 * Erreur attendue : `publicMessage` peut être montré à l'utilisateur (en français), `code` est stable pour
 * les machines. `message` est réservé aux journaux et ne contient aucune donnée personnelle.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly publicMessage: string,
    readonly fieldErrors?: FieldError[],
    options?: { cause?: unknown },
  ) {
    super(`${code}: ${publicMessage}`, options);
    this.name = "AppError";
  }
}

/** Erreur sur un champ d'entrée : chemin (`experiences.0.poste`) et message en français. */
export interface FieldError {
  champ: string;
  message: string;
}

export const notFound = (message = "Ressource introuvable.") => new AppError("introuvable", 404, message);
export const forbidden = (message = "Accès refusé.") => new AppError("interdit", 403, message);
export const unauthorized = (message = "Authentification requise.") =>
  new AppError("non_authentifie", 401, message);
