import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { aiConfigProblems, aiEnv } from "@attesta/llm-client";
import { z } from "zod";

export const SERVICE = "jobs-matching";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4004).extend({
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  /** demo : analyse et rerank sans IA (contenu recopié) ; claude, groq, gemini, ollama : modèle réel (ADR 0047). */
  ...aiEnv,
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
  /** Arbeitnow (DE), API publique sans clé : pages lues une fois par exécution (ADR 0031). */
  ARBEITNOW_ENABLED: envBool(true),
  ARBEITNOW_DAILY_REQUESTS: z.coerce.number().int().min(0).default(20),
  /** Synchronisation du catalogue d'offres, toutes régions, en heures ; 0 la désactive (ADR 0034). */
  CATALOGUE_SYNC_HOURS: z.coerce.number().min(0).max(168).default(6),
  /** Sites carrière des employeurs (DE), API Greenhouse, Lever, SmartRecruiters sans clé (ADR 0031). */
  EMPLOYERS_ENABLED: envBool(true),
  EMPLOYERS_DAILY_REQUESTS: z.coerce.number().int().min(0).default(600),
  /** Flux RSS publics de sites d'emploi tunisiens (Tanitjobs, Tunisie Travail ; ADR 0035). */
  RSS_ENABLED: envBool(true),
  RSS_DAILY_REQUESTS: z.coerce.number().int().min(0).default(20),
  /** Jooble (DE, FR), clé gratuite : https://jooble.org/api/about (ADR 0031). */
  JOOBLE_API_KEY: z.string().optional(),
  JOOBLE_DAILY_REQUESTS: z.coerce.number().int().min(0).default(200),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadEnv(Env, env);
  const problems = aiConfigProblems(config, config.NODE_ENV);
  if (config.NODE_ENV === "production" && config.EMBEDDINGS_PROVIDER === "hash")
    problems.push("EMBEDDINGS_PROVIDER : les vecteurs par hachage sont interdits en production");
  if (problems.length) throw new Error(`Configuration invalide :\n- ${problems.join("\n- ")}`);
  return config;
}
