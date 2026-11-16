import { AppError, UpstreamError, type ServiceClient } from "@attesta/http-kit";
import type { Logger } from "@attesta/logger";
import { describe, expect, it, vi } from "vitest";
import type { Signer } from "../src/keys.js";
import { exportAll, processOutbox } from "../src/rgpd.js";
import type { AuthStore } from "../src/store.js";

/*
 * Campagne QA (A-07) : suppression distribuée (outbox) et export RGPD, avec des doublures du stockage, du
 * signataire et des clients de service. Boîte blanche : reprise, abandon après 24 h, idempotence, export
 * complet ou refusé.
 */

const HOUR = 60 * 60 * 1000;

function deps(rows: { id: string; target: string; userId: string; attempts: number; ageMs: number }[]) {
  const store = {
    dueOutbox: vi.fn(async () => rows),
    outboxDone: vi.fn(async () => {}),
    outboxFailed: vi.fn(async () => {}),
    finishDeletions: vi.fn(async () => 0),
    exportData: vi.fn(async () => ({ username: "amina.diallo" })),
  };
  const signer = {
    serviceToken: vi.fn(async (_s: string, aud: string, scope: string) => `jeton:${aud}:${scope}`),
  };
  const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
  return {
    store,
    signer,
    logger,
    as: {
      store: store as unknown as AuthStore,
      signer: signer as unknown as Signer,
      logger: logger as unknown as Logger,
    },
  };
}

const client = (target: string, json: ServiceClient["json"]): ServiceClient =>
  ({ target, json, raw: vi.fn() }) as unknown as ServiceClient;

describe("processOutbox (campagne QA)", () => {
  it("supprime chez chaque service avec un jeton users:delete, puis clôt les suppressions", async () => {
    const d = deps([{ id: "o1", target: "profiles", userId: "u1", attempts: 0, ageMs: 1000 }]);
    const json = vi.fn(async () => ({ status: 204, data: undefined }));
    const n = await processOutbox({
      ...d.as,
      clients: new Map([["profiles", client("profiles", json as never)]]),
    });
    expect(n).toBe(1);
    expect(d.signer.serviceToken).toHaveBeenCalledWith("auth", "profiles", "users:delete");
    expect(json).toHaveBeenCalledWith("DELETE", "/internal/v1/users/u1", {
      token: "jeton:profiles:users:delete",
      accept: [200, 204, 404],
    });
    expect(d.store.outboxDone).toHaveBeenCalledWith("o1");
    expect(d.store.finishDeletions).toHaveBeenCalledOnce();
  });

  it("clôt une ligne dont le service n'est plus configuré, sans appel réseau", async () => {
    const d = deps([{ id: "o2", target: "ancien-service", userId: "u1", attempts: 0, ageMs: 0 }]);
    await processOutbox({ ...d.as, clients: new Map() });
    expect(d.signer.serviceToken).not.toHaveBeenCalled();
    expect(d.store.outboxDone).toHaveBeenCalledWith("o2");
  });

  it("reprend plus tard un service injoignable (avertissement, statut du service conservé)", async () => {
    const d = deps([{ id: "o3", target: "profiles", userId: "u1", attempts: 2, ageMs: HOUR }]);
    const json = vi.fn(async () => {
      throw new UpstreamError("profiles", 503);
    });
    await processOutbox({ ...d.as, clients: new Map([["profiles", client("profiles", json as never)]]) });
    expect(d.store.outboxDone).not.toHaveBeenCalled();
    expect(d.store.outboxFailed).toHaveBeenCalledWith("o3", 2, "503", false);
    expect(d.logger.warn).toHaveBeenCalledWith(
      { event: "rgpd_suppression_reprise", target: "profiles", reason: "503" },
      "suppression distribuée",
    );
    expect(d.logger.error).not.toHaveBeenCalled();
  });

  it("abandonne après 24 h, avec une alerte au journal ; « injoignable » sans statut, « erreur » sinon", async () => {
    const d = deps([
      { id: "o4", target: "profiles", userId: "u1", attempts: 40, ageMs: 25 * HOUR },
      { id: "o5", target: "letters-export", userId: "u1", attempts: 1, ageMs: 0 },
    ]);
    const unreachable = vi.fn(async () => {
      throw new UpstreamError("profiles", undefined);
    });
    const broken = vi.fn(async () => {
      throw new TypeError("réponse illisible");
    });
    await processOutbox({
      ...d.as,
      clients: new Map([
        ["profiles", client("profiles", unreachable as never)],
        ["letters-export", client("letters-export", broken as never)],
      ]),
    });
    expect(d.store.outboxFailed).toHaveBeenCalledWith("o4", 40, "injoignable", true);
    expect(d.logger.error).toHaveBeenCalledWith(
      { event: "rgpd_suppression_abandonnee", target: "profiles", reason: "injoignable" },
      "suppression distribuée",
    );
    expect(d.store.outboxFailed).toHaveBeenCalledWith("o5", 1, "erreur", false);
  });

  it("ne fait rien, et ne clôt rien, quand l'outbox est vide", async () => {
    const d = deps([]);
    expect(await processOutbox({ ...d.as, clients: new Map() })).toBe(0);
    expect(d.store.finishDeletions).not.toHaveBeenCalled();
  });
});

describe("exportAll (campagne QA)", () => {
  it("assemble les données d'auth et de chaque service, avec un jeton users:export", async () => {
    const d = deps([]);
    const json = vi.fn(async () => ({ status: 200, data: { data: { profils: 2 } } }));
    const archive = await exportAll(
      {
        store: d.as.store,
        signer: d.as.signer,
        clients: new Map([["profiles", client("profiles", json as never)]]),
      },
      "u1",
    );
    expect(json).toHaveBeenCalledWith("GET", "/internal/v1/users/u1/export", {
      token: "jeton:profiles:users:export",
    });
    expect(archive.auth).toEqual({ username: "amina.diallo" });
    expect((archive as Record<string, unknown>).profiles).toEqual({ profils: 2 });
    expect(Number.isNaN(Date.parse(archive.exportedAt))).toBe(false);
  });

  it("refuse un export incomplet (503, message en français) si un service ne répond pas", async () => {
    const d = deps([]);
    const ok = vi.fn(async () => ({ status: 200, data: { data: {} } }));
    const down = vi.fn(async () => {
      throw new UpstreamError("letters-export", undefined);
    });
    const error = await exportAll(
      {
        store: d.as.store,
        signer: d.as.signer,
        clients: new Map([
          ["profiles", client("profiles", ok as never)],
          ["letters-export", client("letters-export", down as never)],
        ]),
      },
      "u1",
    ).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AppError);
    expect(error).toMatchObject({ status: 503, code: "export_incomplet" });
    expect((error as AppError).publicMessage).toMatch(/^L'export de vos données n'a pas pu être complété/);
  });
});
