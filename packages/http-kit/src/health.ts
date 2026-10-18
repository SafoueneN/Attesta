import { Router } from "express";

/** Vérification de disponibilité : résout si la dépendance répond, rejette sinon. */
export type ReadinessCheck = () => Promise<unknown>;

const CHECK_TIMEOUT_MS = 2000;

/**
 * `/health` (vivacité) : le processus répond, sans dépendance. `/ready` (disponibilité) : chaque
 * vérification doit aboutir en moins de 2 s (ADR 0020). Le détail d'un échec reste dans le journal.
 */
export function healthRoutes(
  service: string,
  checks: Record<string, ReadinessCheck>,
  onFailure?: (name: string, err: unknown) => void,
) {
  const router = Router();
  router.get("/health", (_req, res) => {
    res.json({ status: "ok", service });
  });
  router.get("/ready", async (_req, res) => {
    const results = await Promise.all(
      Object.entries(checks).map(async ([name, check]) => {
        try {
          await withTimeout(check(), CHECK_TIMEOUT_MS);
          return [name, "ok"] as const;
        } catch (err) {
          onFailure?.(name, err);
          return [name, "echec"] as const;
        }
      }),
    );
    const ready = results.every(([, state]) => state === "ok");
    res.status(ready ? 200 : 503).json({
      status: ready ? "ok" : "indisponible",
      service,
      checks: Object.fromEntries(results),
    });
  });
  return router;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`délai de ${ms} ms dépassé`)), ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}
