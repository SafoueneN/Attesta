import { usdToEur } from "./pricing.js";
import {
  LlmBudgetExceededError,
  type LlmProvider,
  type LlmRequest,
  type LlmResult,
  type LlmUsage,
} from "./provider.js";

/**
 * Stockage de la consommation, dans la table `llm_usage` du service (ADR 0016, point 6) : jamais de
 * contenu, seulement l'étape, le modèle, les jetons, le coût et la latence.
 */
export interface UsageStore {
  record(usage: LlmUsage): Promise<void>;
  /** Coût cumulé du mois civil en cours, en USD. */
  monthCostUsd(): Promise<number>;
  /** Détail du mois par étape, pour le tableau de bord. */
  monthByStep(): Promise<{ step: string; calls: number; costUsd: number }[]>;
}

/** Exécuteur SQL minimal (`pg.Pool#query`) : le paquet ne dépend pas du pilote PostgreSQL. */
export type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/**
 * `UsageStore` sur la table `llm_usage` du service :
 * `(id, at, step, model, input_tokens, output_tokens, cost_usd, latency_ms)`.
 */
export function pgUsageStore(query: Query): UsageStore {
  const month = "at >= date_trunc('month', now())";
  return {
    async record(u) {
      await query(
        `INSERT INTO llm_usage (step, model, input_tokens, output_tokens, cost_usd, latency_ms)
         VALUES ($1, $2, $3, $4, $5, $6)`,
        [u.step, u.model, u.inputTokens, u.outputTokens, u.costUsd, u.latencyMs],
      );
    },
    async monthCostUsd() {
      const { rows } = await query(
        `SELECT coalesce(sum(cost_usd), 0)::float8 AS cost FROM llm_usage WHERE ${month}`,
      );
      return Number(rows[0]?.cost ?? 0);
    },
    async monthByStep() {
      const { rows } = await query(
        `SELECT step, count(*)::int AS calls, coalesce(sum(cost_usd), 0)::float8 AS cost
         FROM llm_usage WHERE ${month} GROUP BY step ORDER BY step`,
      );
      return rows.map((r) => ({ step: String(r.step), calls: Number(r.calls), costUsd: Number(r.cost) }));
    },
  };
}

/** Stockage en mémoire : tests et service démarré sans base. */
export function memoryUsageStore(): UsageStore & { entries: LlmUsage[] } {
  const entries: LlmUsage[] = [];
  return {
    entries,
    async record(u) {
      entries.push(u);
    },
    async monthCostUsd() {
      return entries.reduce((sum, u) => sum + u.costUsd, 0);
    },
    async monthByStep() {
      const by = new Map<string, { step: string; calls: number; costUsd: number }>();
      for (const u of entries) {
        const s = by.get(u.step) ?? { step: u.step, calls: 0, costUsd: 0 };
        s.calls++;
        s.costUsd += u.costUsd;
        by.set(u.step, s);
      }
      return [...by.values()];
    },
  };
}

export interface BudgetOptions {
  service: string;
  store: UsageStore;
  monthlyBudgetEur: number;
  /** Appels par minute au plus (seau à jetons local, ADR 0016, point 1). */
  maxCallsPerMinute?: number;
  /** Appelé après chaque appel, pour le journal (jamais de contenu). */
  onUsage?: (usage: LlmUsage) => void;
}

/**
 * Enveloppe un fournisseur : refuse l'appel au-delà du budget du mois (`LlmBudgetExceededError`), limite
 * le débit et enregistre chaque consommation, y compris celle d'une sortie rejetée.
 */
export class BudgetedProvider implements LlmProvider {
  readonly kind: LlmProvider["kind"];
  readonly model: string;
  private tokens: number;
  private refilledAt = Date.now();

  constructor(
    private readonly inner: LlmProvider,
    private readonly options: BudgetOptions,
  ) {
    this.kind = inner.kind;
    this.model = inner.model;
    this.tokens = options.maxCallsPerMinute ?? Infinity;
  }

  private takeToken(): boolean {
    const rate = this.options.maxCallsPerMinute;
    if (!rate) return true;
    const now = Date.now();
    this.tokens = Math.min(rate, this.tokens + ((now - this.refilledAt) / 60_000) * rate);
    this.refilledAt = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    if (this.inner.kind === "ia") {
      const spentEur = usdToEur(await this.options.store.monthCostUsd());
      if (spentEur >= this.options.monthlyBudgetEur) throw new LlmBudgetExceededError(this.options.service);
      if (!this.takeToken()) throw new LlmBudgetExceededError(this.options.service);
    }
    const record = async (usage: LlmUsage) => {
      this.options.onUsage?.(usage);
      if (this.inner.kind === "ia") await this.options.store.record(usage);
    };
    try {
      const result = await this.inner.generate(request);
      await record(result.usage);
      return result;
    } catch (error) {
      const usage = (error as { usage?: LlmUsage }).usage;
      if (usage) await record(usage);
      throw error;
    }
  }

  /** Résumé du mois pour le tableau de bord d'administration. */
  async summary() {
    const byStep = await this.options.store.monthByStep();
    return {
      service: this.options.service,
      month: new Date().toISOString().slice(0, 7),
      calls: byStep.reduce((n, s) => n + s.calls, 0),
      costEur: round(usdToEur(byStep.reduce((n, s) => n + s.costUsd, 0))),
      budgetEur: this.options.monthlyBudgetEur,
      byStep: byStep.map((s) => ({ step: s.step, calls: s.calls, costEur: round(usdToEur(s.costUsd)) })),
    };
  }
}

const round = (n: number) => Math.round(n * 10_000) / 10_000;
