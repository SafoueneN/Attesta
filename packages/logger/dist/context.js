import { AsyncLocalStorage } from "node:async_hooks";
const storage = new AsyncLocalStorage();
/** Exécute `fn` dans le contexte donné ; les journaux émis pendant `fn` portent son `requestId`. */
export function runWithContext(context, fn) {
    return storage.run(context, fn);
}
export function currentRequestId() {
    return storage.getStore()?.requestId;
}
