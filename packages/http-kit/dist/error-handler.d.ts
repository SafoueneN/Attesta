import type { Logger } from "@attesta/logger";
import type { NextFunction, Request, Response } from "express";
export declare function notFoundHandler(_req: Request, _res: Response, next: NextFunction): void;
/**
 * Gestionnaire central : message public au format commun pour le client, détail technique au journal
 * seulement. Une erreur inattendue ne divulgue jamais son message (il peut contenir des données).
 */
export declare function errorHandler(logger: Logger): (err: unknown, _req: Request, res: Response, _next: NextFunction) => void;
