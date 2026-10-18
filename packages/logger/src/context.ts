import { AsyncLocalStorage } from "node:async_hooks";

/** Contexte d'une requête ou d'un job : ajouté à chaque ligne de journal (ADR 0020). */
export interface RequestContext {
  requestId: string;
}

const storage = new AsyncLocalStorage<RequestContext>();

/** Exécute `fn` dans le contexte donné ; les journaux émis pendant `fn` portent son `requestId`. */
export function runWithContext<T>(context: RequestContext, fn: () => T): T {
  return storage.run(context, fn);
}

export function currentRequestId(): string | undefined {
  return storage.getStore()?.requestId;
}
