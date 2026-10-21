import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "cv-generation";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4003).extend({
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  PROFILES_URL: z.url().default("http://localhost:4002"),
  JOBS_MATCHING_URL: z.url().default("http://localhost:4004"),
  /** demo : faits recopiés sans reformulation ; anthropic ou vertex : Claude. */
  LLM_PROVIDER: z.enum(["demo", "anthropic", "vertex", "none"]).default("demo"),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().default("eu"),
  /** Part du budget mensuel de 20 € (ADR 0016, point 6). */
  LLM_MONTHLY_BUDGET_EUR: z.coerce.number().min(0).default(9),
  /** Plafond par CV (USD), et générations par utilisateur et par jour. */
  MAX_COST_PER_CV_USD: z.coerce.number().min(0).default(0.5),
  DAILY_QUOTA: z.coerce.number().int().min(1).default(20),
  /** Secret des empreintes du quota (HMAC de l'identifiant). */
  QUOTA_SECRET: z.string().min(16).default("dev-quota-secret-a-remplacer"),
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
