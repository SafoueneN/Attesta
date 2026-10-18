import type { Logger } from "@attesta/logger";
import type { NextFunction, Request, Response } from "express";

/**
 * Journal d'accès sans donnée personnelle : méthode, route déclarée (et non l'URL réelle, qui peut
 * contenir un identifiant ou un jeton), statut et durée. Ni corps, ni chaîne de requête, ni en-têtes.
 */
export function accessLog(logger: Logger, quiet: string[] = ["/health", "/ready"]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (quiet.includes(req.path)) return next();
    const start = process.hrtime.bigint();
    res.on("finish", () => {
      const route = req.route?.path ? `${req.baseUrl}${String(req.route.path)}` : "(non routée)";
      const ms = Number((process.hrtime.bigint() - start) / 1_000_000n);
      logger.info({ event: "http", method: req.method, route, status: res.statusCode, ms }, "http");
    });
    next();
  };
}
