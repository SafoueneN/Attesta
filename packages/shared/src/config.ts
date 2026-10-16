import { z } from "zod";

const bool = (fallback: "true" | "false") =>
  z
    .enum(["true", "false"])
    .default(fallback)
    .transform((v) => v === "true");

/** Variables communes à l'application web et au worker de veille. */
const Base = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"]).default("info"),
  SESSION_STORE: z.enum(["memory", "postgres"]).default("postgres"),
  DATABASE_URL: z.string().min(1).optional(),
  /** Nombre de proxys de confiance devant l'application (IP réelle pour le rate limiting). */
  TRUST_PROXY: z.coerce.number().int().min(0).default(0),
  /**
   * Connexions PostgreSQL par instance. À dimensionner : max_instances × PG_POOL_MAX
   * doit rester sous max_connections de la base (docs/runbook.md).
   */
  PG_POOL_MAX: z.coerce.number().int().min(1).max(50).default(5),
  PDF_MAX_CONCURRENCY: z.coerce.number().int().min(1).max(8).default(2),
  PDF_TIMEOUT_MS: z.coerce.number().int().min(1000).default(20_000),
  PUPPETEER_EXECUTABLE_PATH: z.string().min(1).optional(),
  /** Chromium sans sandbox : uniquement en conteneur, voir docs/adr/0005. */
  PDF_CHROMIUM_NO_SANDBOX: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),
  /**
   * Cookies `Secure` et upgrade-insecure-requests. Actif par défaut en production ;
   * à désactiver seulement pour un conteneur local servi en http://localhost.
   */
  HTTPS_ONLY: z
    .enum(["true", "false"])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === "true")),
  /**
   * Fournisseur du pipeline IA (décision Q5) :
   * - vertex : Claude sur Google Cloud Vertex AI, région « eu » (seul admis en production) ;
   * - anthropic : API Anthropic directe, sans ancrage UE : développement avec données fictives ;
   * - demo : aucun modèle, faits recopiés (développement, tests de bout en bout) ;
   * - none : génération désactivée.
   */
  LLM_PROVIDER: z.enum(["vertex", "anthropic", "demo", "none"]).default("none"),
  LLM_MODEL: z.string().min(1).default("claude-opus-5-5"),
  VERTEX_PROJECT_ID: z.string().min(1).optional(),
  VERTEX_REGION: z.string().min(1).default("eu"),
  LLM_TIMEOUT_MS: z.coerce.number().int().min(5000).default(90_000),
  /** Plafond de coût estimé par CV (USD, tarifs publics) : au-delà, mode dégradé. */
  LLM_MAX_COST_USD_PER_CV: z.coerce.number().positive().default(0.3),
  /** Générations par session et par jour. */
  LLM_DAILY_QUOTA: z.coerce.number().int().min(1).default(10),
  /** Adresse publique de l'application : liens des e-mails (connexion, confirmation, désabonnement). */
  APP_BASE_URL: z.url({ protocol: /^https?$/ }).default("http://localhost:3000"),
  /**
   * Serveur d'envoi (décision Q18) : Mailpit en local (smtp://mailpit:1025), relais
   * SMTP de Brevo en préprod et en prod. Absent : comptes et veille désactivés.
   */
  SMTP_URL: z
    .string()
    .regex(/^smtps?:\/\//, "smtp:// ou smtps://")
    .optional(),
  MAIL_FROM: z.string().min(3).default("Attesta <ne-pas-repondre@attesta.localhost>"),
  /** Jeton attendu dans l'en-tête Authorization des webhooks Brevo (plaintes, rebonds). */
  BREVO_WEBHOOK_TOKEN: z.string().min(32, "doit contenir au moins 32 caractères").optional(),
  /** Vecteurs de la veille : BGE-M3 sur TEI (décision Q15) ; « hash » : tests et développement. */
  EMBEDDINGS_PROVIDER: z.enum(["tei", "hash"]).default("hash"),
  TEI_URL: z.url({ protocol: /^https?$/ }).optional(),
  /** TEI privé sur Cloud Run : authentification par jeton d'identité Google. */
  TEI_GOOGLE_ID_TOKEN: bool("false"),
  /** Sources de la veille, séparées par des virgules (décision Q14). */
  JOBWATCH_SOURCES: z
    .string()
    .default("ba")
    .transform((v) =>
      v
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
    )
    .pipe(z.array(z.enum(["ba", "adzuna"])).min(1)),
  ADZUNA_APP_ID: z.string().min(1).optional(),
  ADZUNA_APP_KEY: z.string().min(1).optional(),
  /** Rapprochement des métiers par l'API publique ESCO (désactivable hors ligne). */
  ESCO_ENABLED: bool("true"),
  /** Plafond de coût du rerank par abonné et par jour (USD, tarifs publics). */
  JOBWATCH_LLM_MAX_COST_USD: z.coerce.number().positive().default(0.1),
});

type BaseEnv = z.infer<typeof Base>;

function commonRules(env: BaseEnv, ctx: z.RefinementCtx) {
  if (env.LLM_PROVIDER === "vertex" && !env.VERTEX_PROJECT_ID) {
    ctx.addIssue({
      code: "custom",
      path: ["VERTEX_PROJECT_ID"],
      message: "requis quand LLM_PROVIDER=vertex",
    });
  }
  if (env.NODE_ENV === "production" && (env.LLM_PROVIDER === "anthropic" || env.LLM_PROVIDER === "demo")) {
    ctx.addIssue({
      code: "custom",
      path: ["LLM_PROVIDER"],
      message: "en production, seul « vertex » (traitement dans l'UE) ou « none » est admis",
    });
  }
  if (env.EMBEDDINGS_PROVIDER === "tei" && !env.TEI_URL) {
    ctx.addIssue({ code: "custom", path: ["TEI_URL"], message: "requis quand EMBEDDINGS_PROVIDER=tei" });
  }
  if (env.JOBWATCH_SOURCES.includes("adzuna") && !(env.ADZUNA_APP_ID && env.ADZUNA_APP_KEY)) {
    ctx.addIssue({
      code: "custom",
      path: ["ADZUNA_APP_KEY"],
      message: "ADZUNA_APP_ID et ADZUNA_APP_KEY sont requis pour la source adzuna",
    });
  }
  if (env.NODE_ENV === "production") {
    if (!env.APP_BASE_URL.startsWith("https://"))
      ctx.addIssue({ code: "custom", path: ["APP_BASE_URL"], message: "https:// obligatoire en production" });
    if (!env.SMTP_URL) ctx.addIssue({ code: "custom", path: ["SMTP_URL"], message: "requis en production" });
  }
}

const WebEnv = Base.extend({
  SESSION_SECRET: z.string().min(32, "doit contenir au moins 32 caractères"),
}).superRefine((env, ctx) => {
  commonRules(env, ctx);
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
  // Sans jeton, le webhook refuserait tout en silence : plaintes et rebonds seraient ignorés.
  if (env.NODE_ENV === "production" && !env.BREVO_WEBHOOK_TOKEN) {
    ctx.addIssue({ code: "custom", path: ["BREVO_WEBHOOK_TOKEN"], message: "requis en production" });
  }
});

/** Worker de veille : base et envoi obligatoires ; aucun secret de session. */
const WorkerEnv = Base.superRefine((env, ctx) => {
  commonRules(env, ctx);
  if (!env.DATABASE_URL) ctx.addIssue({ code: "custom", path: ["DATABASE_URL"], message: "requis" });
  if (!env.SMTP_URL) ctx.addIssue({ code: "custom", path: ["SMTP_URL"], message: "requis" });
  if (env.NODE_ENV === "production" && env.EMBEDDINGS_PROVIDER === "hash")
    ctx.addIssue({
      code: "custom",
      path: ["EMBEDDINGS_PROVIDER"],
      message: "« hash » n'a aucune valeur sémantique : interdit en production",
    });
});

export type Config = z.infer<typeof WebEnv>;
export type WorkerConfig = z.infer<typeof WorkerEnv>;

export class ConfigError extends Error {
  constructor(readonly problems: string[]) {
    super(`Configuration invalide :\n- ${problems.join("\n- ")}`);
    this.name = "ConfigError";
  }
}

/** Lit et valide l'environnement. Les messages citent les variables, jamais leurs valeurs. */
export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  return parse(WebEnv, env);
}

export function loadWorkerConfig(env: NodeJS.ProcessEnv = process.env): WorkerConfig {
  return parse(WorkerEnv, env);
}

function parse<T extends z.ZodType>(schema: T, env: NodeJS.ProcessEnv): z.infer<T> {
  const result = schema.safeParse(env);
  if (!result.success) {
    throw new ConfigError(result.error.issues.map((i) => `${i.path.join(".")} : ${i.message}`));
  }
  return result.data;
}
