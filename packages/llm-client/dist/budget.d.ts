import { type LlmProvider, type LlmRequest, type LlmResult, type LlmUsage } from "./provider.js";
/**
 * Stockage de la consommation, dans la table `llm_usage` du service (ADR 0016, point 6) : jamais de
 * contenu, seulement l'étape, le modèle, les jetons, le coût et la latence.
 */
export interface UsageStore {
    record(usage: LlmUsage): Promise<void>;
    /** Coût cumulé du mois civil en cours, en USD. */
    monthCostUsd(): Promise<number>;
    /** Détail du mois par étape, pour le tableau de bord. */
    monthByStep(): Promise<{
        step: string;
        calls: number;
        costUsd: number;
    }[]>;
}
/** Exécuteur SQL minimal (`pg.Pool#query`) : le paquet ne dépend pas du pilote PostgreSQL. */
export type Query = (sql: string, params?: unknown[]) => Promise<{
    rows: Record<string, unknown>[];
}>;
/**
 * `UsageStore` sur la table `llm_usage` du service :
 * `(id, at, step, model, input_tokens, output_tokens, cost_usd, latency_ms)`.
 */
export declare function pgUsageStore(query: Query): UsageStore;
/** Stockage en mémoire : tests et service démarré sans base. */
export declare function memoryUsageStore(): UsageStore & {
    entries: LlmUsage[];
};
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
export declare class BudgetedProvider implements LlmProvider {
    private readonly inner;
    private readonly options;
    readonly kind: LlmProvider["kind"];
    readonly model: string;
    private tokens;
    private refilledAt;
    constructor(inner: LlmProvider, options: BudgetOptions);
    private takeToken;
    generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>>;
    /** Résumé du mois pour le tableau de bord d'administration. */
    summary(): Promise<{
        service: string;
        month: string;
        calls: number;
        costEur: number;
        budgetEur: number;
        byStep: {
            step: string;
            calls: number;
            costEur: number;
        }[];
    }>;
}
