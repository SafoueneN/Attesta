import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "jobs-matching";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4004).extend({
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  /** demo : analyse et rerank sans IA (contenu recopié) ; anthropic ou vertex : Claude. */
  LLM_PROVIDER: z.enum(["demo", "anthropic", "vertex", "none"]).default("demo"),
  LLM_MODEL: z.string().default("claude-opus-5-5"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(1000).default(90_000),
  VERTEX_PROJECT_ID: z.string().optional(),
  VERTEX_REGION: z.string().default("eu"),
  /** Part du budget mensuel de 20 € (ADR 0016, point 6). */
  LLM_MONTHLY_BUDGET_EUR: z.coerce.number().min(0).default(4),
  /** hash : vecteurs de développement sans sémantique ; tei : BGE-M3 (Text Embeddings Inference). */
  EMBEDDINGS_PROVIDER: z.enum(["hash", "tei"]).default("hash"),
  TEI_URL: z.url().default("http://localhost:8081"),
  /** Rapprochement des intitulés par l'API publique ESCO (réseau requis). */
  ESCO_ENABLED: envBool(true),
  /** Bundesagentur für Arbeit (DE), API publique. */
  BA_ENABLED: envBool(true),
  BA_DAILY_REQUESTS: z.coerce.number().int().min(0).default(500),
  ADZUNA_APP_ID: z.string().optional(),
  ADZUNA_APP_KEY: z.string().optional(),
  ADZUNA_DAILY_REQUESTS: z.coerce.number().int().min(0).max(250).default(250),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadEnv(Env, env);
  const problems: string[] = [];
  if (config.NODE_ENV === "production" && config.LLM_PROVIDER === "demo")
    problems.push("LLM_PROVIDER : le mode démonstration est interdit en production");
  if (config.NODE_ENV === "production" && config.EMBEDDINGS_PROVIDER === "hash")
    problems.push("EMBEDDINGS_PROVIDER : les vecteurs par hachage sont interdits en production");
  if (problems.length) throw new Error(`Configuration invalide :\n- ${problems.join("\n- ")}`);
  return config;
}
