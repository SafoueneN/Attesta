import type { Logger } from "@attesta/logger";
import type { NextFunction, Request, Response } from "express";
/**
 * Journal d'accès sans donnée personnelle : méthode, route déclarée (et non l'URL réelle, qui peut
 * contenir un identifiant ou un jeton), statut et durée. Ni corps, ni chaîne de requête, ni en-têtes.
 */
export declare function accessLog(logger: Logger, quiet?: string[]): (req: Request, res: Response, next: NextFunction) => void;
