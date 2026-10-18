import { z } from "zod";
export declare class ConfigError extends Error {
    readonly problems: string[];
    constructor(problems: string[]);
}
/**
 * Lit et valide l'environnement au démarrage. Les messages citent les variables, jamais leurs valeurs
 * (un secret mal formé ne doit pas finir dans les journaux).
 */
export declare function loadEnv<T extends z.ZodType>(schema: T, env?: NodeJS.ProcessEnv): z.infer<T>;
/** Booléen lu dans une variable d'environnement (« true » ou « false » seulement). */
export declare const envBool: (fallback: boolean) => z.ZodPipe<z.ZodDefault<z.ZodEnum<{
    true: "true";
    false: "false";
}>>, z.ZodTransform<boolean, "true" | "false">>;
/** Variables présentes dans tous les services ; `port` est le port par défaut du service (ADR 0021). */
export declare function serviceEnv(port: number): z.ZodObject<{
    NODE_ENV: z.ZodDefault<z.ZodEnum<{
        development: "development";
        test: "test";
        production: "production";
    }>>;
    PORT: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
    LOG_LEVEL: z.ZodDefault<z.ZodEnum<{
        error: "error";
        fatal: "fatal";
        warn: "warn";
        info: "info";
        debug: "debug";
        trace: "trace";
        silent: "silent";
    }>>;
    TRUST_PROXY: z.ZodDefault<z.ZodCoercedNumber<unknown>>;
}, z.core.$strip>;
/** URL PostgreSQL du service, avec le rôle cloisonné du service (ADR 0013). */
export declare const databaseUrl: z.ZodString;
/** URL d'un autre service, ou « mock » pour démarrer seul avec des réponses simulées (ADR 0023). */
export declare const serviceUrl: z.ZodUnion<readonly [z.ZodLiteral<"mock">, z.ZodURL]>;
