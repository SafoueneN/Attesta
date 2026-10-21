import { describe, expect, it } from "vitest";
import { httpUpstreams } from "../src/upstreams.js";

const json = (status: number, body?: unknown) =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("services appelés par la veille", () => {
  it("demande à auth un jeton par audience et portée, le met en cache, et appelle les routes internes", async () => {
    const calls: { url: string; body?: string; auth?: string }[] = [];
    const fetchImpl = (async (url: string, init: RequestInit) => {
      const headers = init.headers as Record<string, string>;
      calls.push({ url, body: init.body as string | undefined, auth: headers.authorization });
      if (url.endsWith("/internal/v1/token")) {
        const { audience, scope } = JSON.parse(init.body as string);
        return json(200, { accessToken: `jeton.${audience}.${scope.replace(":", "-")}`, expiresIn: 300 });
      }
      if (url.includes("/contact")) return json(200, { id: "u", email: "lea@example.org", status: "active" });
      if (url.includes("/profile")) return json(404, { status: 404 });
      if (url.includes("/cities/resolve"))
        return json(200, { nom: "Berlin", pays: "DE", lat: 52.5, lon: 13.4 });
      if (url.includes("/ingestion")) return json(200, { sources: {}, embedded: 0 });
      if (url.includes("/matching")) return json(200, { degraded: true, postings: [], profileSkills: [] });
      return new Response(new Uint8Array([37, 80, 68, 70]), {
        status: 200,
        headers: { "content-type": "application/pdf" },
      });
    }) as unknown as typeof fetch;
    const up = httpUpstreams(
      {
        auth: "http://auth",
        profiles: "http://profiles",
        jobsMatching: "http://jobs",
        lettersExport: "http://letters",
      },
      "s".repeat(32),
      fetchImpl,
    );

    expect(await up.contact("u")).toMatchObject({ email: "lea@example.org" });
    expect(await up.contact("u")).toMatchObject({ email: "lea@example.org" });
    expect(await up.profile("u")).toBeUndefined();
    expect(await up.resolveCity("jeton-utilisateur", "DE", "Berlin")).toMatchObject({ nom: "Berlin" });
    expect(await up.ingest([], "2026-10-21")).toEqual({ sources: {}, embedded: 0 });
    expect(
      (
        await up.match({
          profile: { basics: { name: "x" } } as never,
          criteria: {} as never,
          excludePostingIds: [],
          date: "2026-10-21",
        })
      ).degraded,
    ).toBe(true);
    expect([...(await up.offersReport({} as never))]).toEqual([37, 80, 68, 70]);

    const tokenRequests = calls
      .filter((c) => c.url.endsWith("/internal/v1/token"))
      .map((c) => JSON.parse(c.body!));
    // Un seul jeton par couple audience/portée, malgré deux appels à contact.
    expect(tokenRequests.map((r) => `${r.audience} ${r.scope}`)).toEqual([
      "auth users:contact",
      "profiles profiles:read",
      "jobs-matching matching:run",
      "letters-export reports:render",
    ]);
    expect(tokenRequests.every((r) => r.service === "job-watch")).toBe(true);
    expect(calls.find((c) => c.url.includes("/cities/resolve"))!.auth).toBe("Bearer jeton-utilisateur");
    expect(calls.find((c) => c.url.includes("/reports/offers"))!.auth).toBe(
      "Bearer jeton.letters-export.reports-render",
    );
  });
});
