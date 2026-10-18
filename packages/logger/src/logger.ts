import { pino, type DestinationStream, type Logger } from "pino";
import { currentRequestId } from "./context.js";

/**
 * Champs jamais journalisés. Règle de base : on ne passe pas de contenu de CV, de profil ou
 * d'offre au logger ; cette liste est un filet de sécurité, pas une autorisation.
 */
export const REDACTED_PATHS = [
  "req.headers.cookie",
  "req.headers.authorization",
  'res.headers["set-cookie"]',
  "headers.cookie",
  "headers.authorization",
  "body",
  "profile",
  "offer",
  "letter",
  "token",
  "*.email",
  "*.phone",
  "*.name",
  "*.rawText",
  "*.token",
];

/** Niveaux pino traduits en sévérités Cloud Logging (filtres et alertes par gravité). */
const SEVERITY: Record<string, string> = {
  trace: "DEBUG",
  debug: "DEBUG",
  info: "INFO",
  warn: "WARNING",
  error: "ERROR",
  fatal: "CRITICAL",
};

export interface LoggerOptions {
  /** Nom du service, présent sur chaque ligne (`profiles`, `gateway`…). */
  service: string;
  level?: string;
  destination?: DestinationStream;
}

export function createLogger({ service, level = "info", destination }: LoggerOptions): Logger {
  return pino(
    {
      level,
      redact: { paths: REDACTED_PATHS, censor: "[supprimé]" },
      base: { service },
      timestamp: pino.stdTimeFunctions.isoTime,
      messageKey: "message",
      formatters: { level: (label, number) => ({ severity: SEVERITY[label] ?? "DEFAULT", level: number }) },
      mixin: () => {
        const requestId = currentRequestId();
        return requestId ? { requestId } : {};
      },
    },
    destination,
  );
}

export type { Logger };
