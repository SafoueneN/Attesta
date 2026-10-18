/**
 * Erreur attendue : `publicMessage` peut être montré à l'utilisateur (en français), `code` est stable pour
 * les machines. `message` est réservé aux journaux et ne contient aucune donnée personnelle.
 */
export declare class AppError extends Error {
    readonly code: string;
    readonly status: number;
    readonly publicMessage: string;
    readonly fieldErrors?: FieldError[] | undefined;
    constructor(code: string, status: number, publicMessage: string, fieldErrors?: FieldError[] | undefined, options?: {
        cause?: unknown;
    });
}
/** Erreur sur un champ d'entrée : chemin (`experiences.0.poste`) et message en français. */
export interface FieldError {
    champ: string;
    message: string;
}
export declare const notFound: (message?: string) => AppError;
export declare const forbidden: (message?: string) => AppError;
export declare const unauthorized: (message?: string) => AppError;
