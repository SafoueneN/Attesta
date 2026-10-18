import { databaseUrl, loadEnv, serviceEnv } from "@attesta/config";
import type { z } from "zod";

export const SERVICE = "profiles";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4002).extend({
  /** Base du service, avec son rôle cloisonné (ADR 0013). */
  DATABASE_URL: databaseUrl,
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(Env, env);
}
