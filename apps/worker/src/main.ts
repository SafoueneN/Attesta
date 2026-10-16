import pg from "pg";
import { PgBoss } from "pg-boss";
import {
  Adzuna,
  BaJobsuche,
  EscoClient,
  HashEmbeddings,
  JobwatchRepository,
  pgUsageRecorder,
  runDaily,
  SmtpMailer,
  TeiEmbeddings,
  type JobSource,
} from "@attesta/jobwatch";
import { createLlmProvider } from "@attesta/llm";
import { PuppeteerPdfRenderer } from "@attesta/render";
import { createLogger, loadWorkerConfig, type WorkerConfig } from "@attesta/shared";

/**
 * Exécution quotidienne de la veille : purge, ingestion, matching, rapports, envoi.
 * Lancée chaque matin par Cloud Scheduler (Cloud Run Job, infra/terraform) ; en
 * local : `docker compose run --rm veille`. Code de sortie 1 si un job a échoué
 * après ses relances (le Cloud Run Job est alors marqué en échec, et une alerte part).
 * `--date=AAAA-MM-JJ` rejoue une date précise (reprise après incident).
 */

/** Requêtes par jour et par source : Adzuna en autorise 250 (on garde une marge). */
const DAILY_REQUEST_LIMITS: Record<string, number> = { ba: 1500, adzuna: 200 };

/** Date du jour à Paris : un envoi par abonné et par jour civil français. */
export function parisDate(now = new Date()): string {
  return new Intl.DateTimeFormat("sv-SE", { timeZone: "Europe/Paris" }).format(now);
}

function sources(config: WorkerConfig): JobSource[] {
  return config.JOBWATCH_SOURCES.map((id) =>
    id === "adzuna"
      ? new Adzuna({ appId: config.ADZUNA_APP_ID!, appKey: config.ADZUNA_APP_KEY! })
      : new BaJobsuche(),
  );
}

async function main() {
  const config = loadWorkerConfig();
  const logger = createLogger(config.LOG_LEVEL);
  const dateArg = process.argv.find((a) => a.startsWith("--date="))?.slice("--date=".length);
  if (dateArg && !/^\d{4}-\d{2}-\d{2}$/.test(dateArg)) throw new Error("--date attend AAAA-MM-JJ");
  const date = dateArg ?? parisDate();

  const pool = new pg.Pool({ connectionString: config.DATABASE_URL, max: config.PG_POOL_MAX });
  const boss = new PgBoss({ connectionString: config.DATABASE_URL, max: 2, schema: "pgboss" });
  boss.on("error", (error) => logger.error({ errorType: error.name }, "pg-boss: erreur"));
  const renderer = new PuppeteerPdfRenderer({
    maxConcurrency: config.PDF_MAX_CONCURRENCY,
    timeoutMs: config.PDF_TIMEOUT_MS,
    executablePath: config.PUPPETEER_EXECUTABLE_PATH,
    noSandbox: config.PDF_CHROMIUM_NO_SANDBOX,
  });
  const repo = new JobwatchRepository(pool);
  const provider = createLlmProvider({
    provider: config.LLM_PROVIDER,
    model: config.LLM_MODEL,
    timeoutMs: config.LLM_TIMEOUT_MS,
    vertexProjectId: config.VERTEX_PROJECT_ID,
    vertexRegion: config.VERTEX_REGION,
  });

  let exitCode = 0;
  try {
    await boss.start();
    logger.info({ event: "purge", ...(await repo.purge()) }, "veille: purge");
    const summary = await runDaily(
      {
        boss,
        repo,
        sources: sources(config),
        dailyRequestLimits: DAILY_REQUEST_LIMITS,
        embeddings:
          config.EMBEDDINGS_PROVIDER === "tei"
            ? new TeiEmbeddings(config.TEI_URL!, { googleIdToken: config.TEI_GOOGLE_ID_TOKEN })
            : new HashEmbeddings(),
        esco: config.ESCO_ENABLED ? new EscoClient(repo.escoCache()) : undefined,
        llm: provider
          ? {
              provider,
              maxCostUsd: config.JOBWATCH_LLM_MAX_COST_USD,
              onUsage: pgUsageRecorder(pool, logger),
            }
          : undefined,
        renderer,
        mailer: new SmtpMailer(config.SMTP_URL!, config.MAIL_FROM),
        baseUrl: config.APP_BASE_URL,
        logger,
      },
      date,
    );
    logger.info({ event: "veille_terminee", ...summary }, "veille: exécution terminée");
    if (summary.failedJobs > 0) exitCode = 1;
  } catch (error) {
    logger.error({ err: error }, "veille: exécution interrompue");
    exitCode = 1;
  } finally {
    await Promise.allSettled([boss.stop({ graceful: true, close: true }), renderer.close()]);
    await pool.end();
  }
  process.exit(exitCode);
}

await main();
