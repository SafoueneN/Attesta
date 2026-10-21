import { AppError, createServiceClient, UpstreamError, type ServiceClient } from "@attesta/http-kit";
import type { Logger } from "@attesta/logger";
import type { Signer } from "./keys.js";
import type { AuthStore } from "./store.js";

/** Abandon d'une suppression après 24 h de reprises, avec alerte au journal (ADR 0019, point 2.3). */
const GIVE_UP_MS = 24 * 60 * 60 * 1000;

export interface RgpdDeps {
  store: AuthStore;
  signer: Signer;
  logger: Logger;
  /** Client par service détenteur de données. */
  clients: Map<string, ServiceClient>;
}

export function holderClients(holders: Map<string, string>, fetchImpl?: typeof fetch) {
  return new Map(
    [...holders].map(([target, baseUrl]) => [
      target,
      createServiceClient({ target, baseUrl, timeoutMs: 10_000, fetchImpl }),
    ]),
  );
}

/**
 * Traite les lignes dues de l'outbox : `DELETE /internal/v1/users/{id}` chez chaque service, avec un jeton
 * de service `users:delete` ; un 204 ou un 404 valent confirmation (idempotence).
 */
export async function processOutbox({ store, signer, logger, clients }: RgpdDeps): Promise<number> {
  const due = await store.dueOutbox();
  for (const row of due) {
    const client = clients.get(row.target);
    try {
      if (client) {
        const token = await signer.serviceToken("auth", row.target, "users:delete");
        await client.json("DELETE", `/internal/v1/users/${row.userId}`, { token, accept: [200, 204, 404] });
      }
      await store.outboxDone(row.id);
    } catch (error) {
      const giveUp = row.ageMs > GIVE_UP_MS;
      const reason = error instanceof UpstreamError ? `${error.upstreamStatus ?? "injoignable"}` : "erreur";
      await store.outboxFailed(row.id, row.attempts, reason, giveUp);
      logger[giveUp ? "error" : "warn"](
        {
          event: giveUp ? "rgpd_suppression_abandonnee" : "rgpd_suppression_reprise",
          target: row.target,
          reason,
        },
        "suppression distribuée",
      );
    }
  }
  if (due.length) await store.finishDeletions();
  return due.length;
}

/**
 * Export (ADR 0019, point 3) : données d'`auth` et de chaque service (`users:export`, 10 s par service).
 * Un service injoignable fait échouer l'export, plutôt que de produire une archive incomplète.
 */
export async function exportAll({ store, signer, clients }: Omit<RgpdDeps, "logger">, userId: string) {
  const services = await Promise.all(
    [...clients].map(async ([target, client]) => {
      const token = await signer.serviceToken("auth", target, "users:export");
      try {
        const { data } = await client.json<{ data: unknown }>("GET", `/internal/v1/users/${userId}/export`, {
          token,
        });
        return [target, data.data] as const;
      } catch (error) {
        throw new AppError(
          "export_incomplet",
          503,
          "L'export de vos données n'a pas pu être complété : un service ne répond pas. Réessayez dans quelques minutes.",
          undefined,
          { cause: error },
        );
      }
    }),
  );
  return {
    exportedAt: new Date().toISOString(),
    auth: await store.exportData(userId),
    ...Object.fromEntries(services),
  };
}

/** Boucle de fond : outbox toutes les 5 s, purge toutes les heures. */
export function startWorkers(deps: RgpdDeps, targets: string[], everyMs = 5000) {
  let running = false;
  const tick = async () => {
    if (running) return;
    running = true;
    try {
      await processOutbox(deps);
    } catch (error) {
      deps.logger.warn({ event: "outbox_erreur", errorType: (error as Error)?.name }, "outbox");
    } finally {
      running = false;
    }
  };
  const purge = async () => {
    try {
      const { inactive } = await deps.store.purge(targets);
      if (inactive) deps.logger.info({ event: "purge_inactifs", count: inactive }, "purge");
    } catch (error) {
      deps.logger.warn({ event: "purge_erreur", errorType: (error as Error)?.name }, "purge");
    }
  };
  const outbox = setInterval(tick, everyMs);
  const hourly = setInterval(purge, 60 * 60 * 1000);
  outbox.unref();
  hourly.unref();
  void purge();
  return () => {
    clearInterval(outbox);
    clearInterval(hourly);
  };
}
