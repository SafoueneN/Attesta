import { pino, type Logger } from "pino";

/**
 * Champs jamais journalisés. Règle de base : on ne passe pas de contenu de CV ou
 * d'offre au logger ; cette liste est un filet de sécurité, pas une autorisation.
 */
export const REDACTED_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "body",
  "profile",
  "offer",
  "*.email",
  "*.phone",
  "*.name",
  "*.rawText",
];

export function createLogger(level: string, destination?: pino.DestinationStream): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACTED_PATHS, censor: "[supprimé]" },
      base: { service: "attesta" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    destination,
  );
}

export type { Logger };
