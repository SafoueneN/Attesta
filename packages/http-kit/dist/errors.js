/**
 * Erreur attendue : `publicMessage` peut être montré à l'utilisateur (en français), `code` est stable pour
 * les machines. `message` est réservé aux journaux et ne contient aucune donnée personnelle.
 */
export class AppError extends Error {
    code;
    status;
    publicMessage;
    fieldErrors;
    constructor(code, status, publicMessage, fieldErrors, options) {
        super(`${code}: ${publicMessage}`, options);
        this.code = code;
        this.status = status;
        this.publicMessage = publicMessage;
        this.fieldErrors = fieldErrors;
        this.name = "AppError";
    }
}
export const notFound = (message = "Ressource introuvable.") => new AppError("introuvable", 404, message);
export const forbidden = (message = "Accès refusé.") => new AppError("interdit", 403, message);
export const unauthorized = (message = "Authentification requise.") => new AppError("non_authentifie", 401, message);
