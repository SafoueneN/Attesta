import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { aiConfigProblems, aiEnv } from "@attesta/llm-client";
import { z } from "zod";

export const SERVICE = "letters-export";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4006).extend({
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  CV_GENERATION_URL: z.url().default("http://localhost:4003"),
  PROFILES_URL: z.url().default("http://localhost:4002"),
  /** Adresse publique du frontend, pour les liens de CV en ligne (ADR 0042). */
  APP_BASE_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:8080"),
  /** demo : lettre composée des lignes vérifiées, sans reformulation ; claude, groq, gemini, ollama : modèle réel (ADR 0047). */
  ...aiEnv,
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
  const problems = aiConfigProblems(config, config.NODE_ENV);
  if (problems.length) throw new Error(`Configuration invalide :\n- ${problems.join("\n- ")}`);
  return config;
}
