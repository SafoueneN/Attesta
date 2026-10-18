import { z } from "zod";
export class ConfigError extends Error {
    problems;
    constructor(problems) {
        super(`Configuration invalide :\n- ${problems.join("\n- ")}`);
        this.problems = problems;
        this.name = "ConfigError";
    }
}
/**
 * Lit et valide l'environnement au démarrage. Les messages citent les variables, jamais leurs valeurs
 * (un secret mal formé ne doit pas finir dans les journaux).
 */
export function loadEnv(schema, env = process.env) {
    const result = schema.safeParse(env);
    if (!result.success) {
        throw new ConfigError(result.error.issues.map((issue) => {
            const name = issue.path.join(".") || "(racine)";
            // Message de Zod remplacé : une variable absente est le cas le plus courant.
            const missing = issue.path.length === 1 && env[String(issue.path[0])] === undefined;
            return `${name} : ${missing ? "variable obligatoire absente" : issue.message}`;
        }));
    }
    return result.data;
}
/** Booléen lu dans une variable d'environnement (« true » ou « false » seulement). */
export const envBool = (fallback) => z
    .enum(["true", "false"])
    .default(fallback ? "true" : "false")
    .transform((v) => v === "true");
/** Variables présentes dans tous les services ; `port` est le port par défaut du service (ADR 0021). */
export function serviceEnv(port) {
    return z.object({
        NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
        PORT: z.coerce.number().int().min(1).max(65535).default(port),
        LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
        /** Nombre de proxys de confiance devant le service (IP réelle pour la limitation de débit). */
        TRUST_PROXY: z.coerce.number().int().min(0).default(0),
    });
}
/** URL PostgreSQL du service, avec le rôle cloisonné du service (ADR 0013). */
export const databaseUrl = z
    .string()
    .regex(/^postgres(ql)?:\/\//, "postgres:// attendu")
    .describe("URL PostgreSQL");
/** URL d'un autre service, ou « mock » pour démarrer seul avec des réponses simulées (ADR 0023). */
export const serviceUrl = z.union([z.literal("mock"), z.url({ protocol: /^https?$/ })]);
