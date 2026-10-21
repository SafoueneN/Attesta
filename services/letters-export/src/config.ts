import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "letters-export";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4006).extend({
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  CV_GENERATION_URL: z.url().default("http://localhost:4003"),
  PROFILES_URL: z.url().default("http://localhost:4002"),
  /** demo : lettre composée des lignes vérifiées, sans reformulation ; anthropic ou vertex : Claude. */
  LLM_PROVIDER: z.enum(["demo", "anthropic", "vertex", "none"]).default("demo"),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().default("eu"),
  /** Part du budget mensuel de 20 € (ADR 0016, point 6). */
  LLM_MONTHLY_BUDGET_EUR: z.coerce.number().min(0).default(5),
  /** Chromium du système (image Docker) ; absent : celui téléchargé par Puppeteer (poste local). */
  PUPPETEER_EXECUTABLE_PATH: z.string().optional(),
  /** Bornes du rendu (ADR 0018, point 5). */
  PDF_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  PDF_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),
  /** Sandbox Chromium désactivée : seulement si le conteneur n'a pas le profil seccomp dédié. */
  PDF_NO_SANDBOX: envBool(false),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadEnv(Env, env);
  if (config.NODE_ENV === "production" && config.LLM_PROVIDER === "demo") {
    throw new Error(
      "Configuration invalide :\n- LLM_PROVIDER : le mode démonstration est interdit en production",
    );
  }
  return config;
}
