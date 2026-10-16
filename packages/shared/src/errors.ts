/**
 * Erreur métier : `publicMessage` peut être montré au candidat, `message` est
 * réservé aux journaux et ne doit contenir aucune donnée personnelle.
 */
export class AppError extends Error {
  constructor(
    readonly code: string,
    readonly status: number,
    readonly publicMessage: string,
    options?: { cause?: unknown },
  ) {
    super(`${code}: ${publicMessage}`, options);
    this.name = "AppError";
  }
}
