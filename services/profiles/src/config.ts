import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "profiles";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4002).extend({
  /** Base du service, avec son rôle cloisonné (ADR 0013). */
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  /** JWKS d'`auth`, pour vérifier les jetons (ADR 0014, point 5). */
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  /** demo : import de CV indisponible (aucun modèle) ; anthropic ou vertex : Claude. */
  LLM_PROVIDER: z.enum(["demo", "anthropic", "vertex", "none"]).default("demo"),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().default("eu"),
  /** Part du budget mensuel de 20 € (ADR 0016, point 6). */
  LLM_MONTHLY_BUDGET_EUR: z.coerce.number().min(0).default(2),
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
