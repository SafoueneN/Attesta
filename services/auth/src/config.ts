import { databaseUrl, loadEnv, serviceEnv } from "@attesta/config";
import type { z } from "zod";

export const SERVICE = "auth";

/** Variables d'environnement du service, validées au démarrage (documentées dans .env.example). */
export const Env = serviceEnv(4001).extend({
  /** Base du service, avec son rôle cloisonné (ADR 0013). */
  DATABASE_URL: databaseUrl,
});

export type Config = z.infer<typeof Env>;

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return loadEnv(Env, env);
}
