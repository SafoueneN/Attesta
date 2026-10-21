import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "job-watch";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4005).extend({
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  AUTH_URL: z.url().default("http://localhost:4001"),
  PROFILES_URL: z.url().default("http://localhost:4002"),
  JOBS_MATCHING_URL: z.url().default("http://localhost:4004"),
  LETTERS_EXPORT_URL: z.url().default("http://localhost:4006"),
  /** Secret du service auprès d'auth, pour obtenir ses jetons de service (ADR 0014, point 8). */
  SERVICE_SECRET: z.string().min(32, "32 caractères au moins"),
  /** Adresse publique (frontend et API, même origine), pour les liens des e-mails. */
  APP_BASE_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:8080"),
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\//, "smtp:// attendu")
    .default("smtp://localhost:1025"),
  MAIL_FROM: z.string().min(3).default("Attesta <ne-pas-repondre@attesta.localhost>"),
  IP_HASH_SECRET: z.string().min(16).default("dev-ip-hash-secret-a-remplacer"),
  BREVO_WEBHOOK_TOKEN: z.string().min(16).optional(),
  /** Exécution planifiée, heure de Paris ; désactivée : seulement à la demande (administration). */
  DAILY_RUN_ENABLED: envBool(false),
  DAILY_RUN_HOUR: z.coerce.number().int().min(0).max(23).default(7),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(Env, env);
}
