import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "auth";

/** Services qui détiennent des données d'un utilisateur : destinataires de l'export et de la suppression. */
export const DATA_HOLDERS = [
  "profiles",
  "cv-generation",
  "jobs-matching",
  "job-watch",
  "letters-export",
] as const;
export type DataHolder = (typeof DATA_HOLDERS)[number];

const urlVar = (holder: DataHolder) => `${holder.toUpperCase().replace(/-/g, "_")}_URL`;

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4001).extend({
  /** Base du service, avec son rôle cloisonné (ADR 0013). */
  DATABASE_URL: databaseUrl,
  /** Joue les migrations avant d'écouter (compose) ; `false` si elles sont jouées à part. */
  MIGRATE_ON_START: envBool(true),
  /** Adresse publique du frontend, pour les liens des e-mails. */
  APP_BASE_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:8080"),
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\//, "smtp:// attendu")
    .default("smtp://localhost:1025"),
  MAIL_FROM: z.string().min(3).default("Attesta <ne-pas-repondre@attesta.localhost>"),
  /** Clé privée RS256 (PKCS#8, PEM). Absente hors production : clé éphémère (ADR 0014, point 6). */
  AUTH_PRIVATE_KEY: z.string().optional(),
  AUTH_KEY_ID: z
    .string()
    .regex(/^[\w-]{1,40}$/)
    .default("cle-1"),
  /** Adresses qui reçoivent le rôle administrateur à la connexion (ADR 0024). */
  ADMIN_EMAILS: z
    .string()
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  /** Secret des empreintes d'IP (HMAC) du journal de consentement. */
  IP_HASH_SECRET: z.string().min(16).default("dev-ip-hash-secret-a-remplacer"),
  /** Chemin public du cookie de refresh, vu par le navigateur à travers la gateway. */
  COOKIE_PATH: z.string().startsWith("/").default("/api/auth/v1/session"),
  /** Cookies `Secure` : vrai hors du poste local (http://localhost). */
  COOKIE_SECURE: envBool(false),
  PROFILES_URL: z.url().optional(),
  CV_GENERATION_URL: z.url().optional(),
  JOBS_MATCHING_URL: z.url().optional(),
  JOB_WATCH_URL: z.url().optional(),
  LETTERS_EXPORT_URL: z.url().optional(),
});

export type Config = z.infer<typeof Env> & {
  /** Secret de chaque service autorisé à demander un jeton (`SERVICE_SECRET_<NOM>`). */
  serviceSecrets: Map<string, string>;
  /** URL interne de chaque service détenteur de données configuré. */
  holders: Map<DataHolder, string>;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadEnv(Env, env);
  if (config.NODE_ENV === "production" && !config.AUTH_PRIVATE_KEY) {
    throw new Error("Configuration invalide :\n- AUTH_PRIVATE_KEY : obligatoire en production");
  }
  const serviceSecrets = new Map<string, string>();
  for (const [name, value] of Object.entries(env)) {
    const match = /^SERVICE_SECRET_([A-Z_]+)$/.exec(name);
    if (match && value && value.length >= 32) {
      serviceSecrets.set(match[1]!.toLowerCase().replace(/_/g, "-"), value);
    }
  }
  const holders = new Map<DataHolder, string>();
  for (const holder of DATA_HOLDERS) {
    const url = (config as Record<string, unknown>)[urlVar(holder)];
    if (typeof url === "string") holders.set(holder, url);
  }
  return { ...config, serviceSecrets, holders };
}
