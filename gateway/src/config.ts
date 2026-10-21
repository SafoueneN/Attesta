import { loadEnv, serviceEnv } from "@attesta/config";
import { z } from "zod";

export const SERVICE = "gateway";

const perHour = (fallback: number) => z.coerce.number().int().min(1).default(fallback);

/**
 * Variables de la gateway. Les plafonds de débit sont configurables (écart du monolithe, qui plafonnait
 * la génération à 10 par heure en dur, ce qui gênait les passages de parité).
 */
export const Env = serviceEnv(4000).extend({
  AUTH_URL: z.url().default("http://localhost:4001"),
  PROFILES_URL: z.url().default("http://localhost:4002"),
  CV_GENERATION_URL: z.url().default("http://localhost:4003"),
  JOBS_MATCHING_URL: z.url().default("http://localhost:4004"),
  JOB_WATCH_URL: z.url().default("http://localhost:4005"),
  LETTERS_EXPORT_URL: z.url().default("http://localhost:4006"),
  /** Requêtes par minute et par IP, toutes routes confondues. */
  RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(1).default(300),
  RATE_LIMIT_LOGIN_PER_HOUR: perHour(20),
  RATE_LIMIT_GENERATION_PER_HOUR: perHour(30),
  RATE_LIMIT_EXPORT_PER_HOUR: perHour(60),
  RATE_LIMIT_IMPORT_PER_HOUR: perHour(10),
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(Env, env);
}
