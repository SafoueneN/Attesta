/** Contexte d'une requête ou d'un job : ajouté à chaque ligne de journal (ADR 0020). */
export interface RequestContext {
    requestId: string;
}
/** Exécute `fn` dans le contexte donné ; les journaux émis pendant `fn` portent son `requestId`. */
export declare function runWithContext<T>(context: RequestContext, fn: () => T): T;
export declare function currentRequestId(): string | undefined;
