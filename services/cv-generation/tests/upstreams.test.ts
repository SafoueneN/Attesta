import { describe, expect, it } from "vitest";
import { httpUpstreams } from "../src/upstreams.js";
import { analysis, lea, offerText } from "./fixtures.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("services amont (jeton relayé)", () => {
  it("lit le profil et l'offre avec le jeton de l'utilisateur, et valide les contrats", async () => {
    const calls: { url: string; auth: string }[] = [];
    const upstreams = httpUpstreams(
      { profiles: "http://profiles:4002", jobsMatching: "http://jobs-matching:4004" },
      (async (url: string, init: RequestInit) => {
        calls.push({ url, auth: (init.headers as Record<string, string>).authorization! });
        if (url.includes("/profiles/")) {
          return json(200, {
            version: 2,
            createdAt: "2026-10-21T00:00:00.000Z",
            schemaVersion: "1.0.0",
            profile: lea,
          });
        }
        return json(200, {
          id: "6f0e9a3c-1111-4222-8333-944455556666",
          title: analysis.title,
          company: null,
          createdAt: "2026-10-21T00:00:00.000Z",
          sourceUrl: null,
          rawText: offerText,
          analysis,
          providerKind: "ia",
          postingId: null,
        });
      }) as unknown as typeof fetch,
    );
    expect((await upstreams.profile("jeton"))?.version).toBe(2);
    expect((await upstreams.offer("jeton", "6f0e9a3c-1111-4222-8333-944455556666"))?.title).toBe(
      analysis.title,
    );
    expect(calls.map((c) => c.url)).toEqual([
      "http://profiles:4002/internal/v1/profiles/me",
      "http://jobs-matching:4004/internal/v1/offers/6f0e9a3c-1111-4222-8333-944455556666",
    ]);
    expect(calls.every((c) => c.auth === "Bearer jeton")).toBe(true);
  });

  it("traduit un 404 en absence, et rejette une réponse hors contrat", async () => {
    const missing = httpUpstreams({ profiles: "http://p", jobsMatching: "http://j" }, (async () =>
      json(404, { status: 404 })) as unknown as typeof fetch);
    expect(await missing.profile("t")).toBeUndefined();
    expect(await missing.offer("t", "x")).toBeUndefined();
    const broken = httpUpstreams({ profiles: "http://p", jobsMatching: "http://j" }, (async () =>
      json(200, { version: "trois" })) as unknown as typeof fetch);
    await expect(broken.profile("t")).rejects.toThrow();
  });
});
