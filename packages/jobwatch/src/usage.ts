import type { Pool } from "pg";
import type { LlmUsage } from "@attesta/llm";
import type { Logger } from "@attesta/shared";

/** Journal des coûts LLM en base (13 mois), en plus des journaux applicatifs. Ni contenu, ni session. */
export function pgUsageRecorder(pool: Pool, logger: Logger) {
  return (usage: LlmUsage) => {
    pool
      .query(
        `INSERT INTO llm_usage (step, model, input_tokens, output_tokens, cost_usd, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [usage.step, usage.model, usage.inputTokens, usage.outputTokens, usage.costUsd, usage.latencyMs],
      )
      .catch((error: unknown) =>
        logger.warn({ errorType: (error as Error)?.name }, "llm_usage: écriture impossible"),
      );
  };
}
