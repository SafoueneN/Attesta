import { Router } from "express";
const CHECK_TIMEOUT_MS = 2000;
/**
 * `/health` (vivacité) : le processus répond, sans dépendance. `/ready` (disponibilité) : chaque
 * vérification doit aboutir en moins de 2 s (ADR 0020). Le détail d'un échec reste dans le journal.
 */
export function healthRoutes(service, checks, onFailure) {
    const router = Router();
    router.get("/health", (_req, res) => {
        res.json({ status: "ok", service });
    });
    router.get("/ready", async (_req, res) => {
        const results = await Promise.all(Object.entries(checks).map(async ([name, check]) => {
            try {
                await withTimeout(check(), CHECK_TIMEOUT_MS);
                return [name, "ok"];
            }
            catch (err) {
                onFailure?.(name, err);
                return [name, "echec"];
            }
        }));
        const ready = results.every(([, state]) => state === "ok");
        res.status(ready ? 200 : 503).json({
            status: ready ? "ok" : "indisponible",
            service,
            checks: Object.fromEntries(results),
        });
    });
    return router;
}
function withTimeout(promise, ms) {
    let timer;
    const timeout = new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms);
    });
    return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
