import { z } from "zod";

const Env = z
  .object({
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    PORT: z.coerce.number().int().min(1).max(65535).default(3000),
    LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
    SESSION_SECRET: z.string().min(32, "doit contenir au moins 32 caractères"),
    SESSION_STORE: z.enum(["memory", "postgres"]).default("postgres"),
    DATABASE_URL: z.string().min(1).optional(),
    /** Nombre de proxys de confiance devant l'application (IP réelle pour le rate limiting). */
    TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    PDF_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
    PDF_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),
    PUPPETEER_EXECUTABLE_PATH: z.string().min(1).optional(),
    /** Chromium sans sandbox : uniquement en conteneur, voir docs/adr/0005. */
    PDF_CHROMIUM_NO_SANDBOX: z
      .enum(["true", "false"])
      .default("false")
      .transform((v) => v === "true"),
  })
  .superRefine((env, ctx) => {
    if (env.SESSION_STORE === "postgres" && !env.DATABASE_URL) {
      ctx.addIssue({
        code: "custom",
        path: ["DATABASE_URL"],
        message: "requis quand SESSION_STORE=postgres",
      });
    }
    if (env.NODE_ENV === "production" && env.SESSION_STORE === "memory") {
      ctx.addIssue({
        code: "custom",
        path: ["SESSION_STORE"],
        message: "le stockage mémoire est interdit en production",
      });
    }
  });

export type Config = z.infer<typeof Env>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuration invalide :\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

/** Lit et valide l'environnement. Les messages citent les variables, jamais leurs valeurs. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const result = Env.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`));
  }
  return result.data;
}
