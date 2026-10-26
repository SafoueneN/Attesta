import { databaseUrl, envBool, loadEnv, serviceEnv } from "@attesta/config";
import { aiConfigProblems, aiEnv } from "@attesta/llm-client";
import { z } from "zod";

export const SERVICE = "profiles";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4002).extend({
  /** Base du service, avec son rôle cloisonné (ADR 0013). */
  DATABASE_URL: databaseUrl,
  MIGRATE_ON_START: envBool(true),
  /** JWKS d'`auth`, pour vérifier les jetons (ADR 0014, point 5). */
  AUTH_JWKS_URL: z.url().default("http://localhost:4001/.well-known/jwks.json"),
  /** demo : import de CV indisponible (aucun modèle) ; claude, groq, gemini, ollama : modèle réel (ADR 0047). */
  ...aiEnv,
  /** Part du budget mensuel de 20 € (ADR 0016, point 6). */
  LLM_MONTHLY_BUDGET_EUR: z.coerce.number().min(0).default(2),
  /** Clé AES-256 des pièces justificatives, 32 octets en base64 (ADR 0027) ; obligatoire en production. */
  EVIDENCE_KEY: z
    .string()
    .refine((v) => Buffer.from(v, "base64").length === 32, "32 octets encodés en base64 attendus")
    .optional(),
});

export type Config = z.infer<typeof Env>;

/** Clé de développement, connue de tous : jamais acceptée en production (voir loadConfig). */
const DEV_EVIDENCE_KEY = Buffer.from("dev-cle-justificatifs-local-0000", "utf8");

export function evidenceKey(config: Config): Buffer {
  return config.EVIDENCE_KEY ? Buffer.from(config.EVIDENCE_KEY, "base64") : DEV_EVIDENCE_KEY;
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const config = loadEnv(Env, env);
  const problems = aiConfigProblems(config, config.NODE_ENV);
  if (problems.length) throw new Error(`Configuration invalide :\n- ${problems.join("\n- ")}`);
  if (config.NODE_ENV === "production" && !config.EVIDENCE_KEY) {
    throw new Error("Configuration invalide :\n- EVIDENCE_KEY : obligatoire en production (ADR 0027)");
  }
  return config;
}
