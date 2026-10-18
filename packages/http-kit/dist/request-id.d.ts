import type { NextFunction, Request, Response } from "express";
export declare const REQUEST_ID_HEADER = "x-request-id";
/**
 * Reprend le `X-Request-Id` reçu s'il est bien formé (UUID), sinon en crée un ; le renvoie dans la
 * réponse et l'attache à tous les journaux de la requête (ADR 0020).
 */
export declare function requestId(req: Request, res: Response, next: NextFunction): void;
