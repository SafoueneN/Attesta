import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { api, ApiError, refreshSession, session } from "../src/api/client";
import { streamGeneration } from "../src/api/sse";

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

const sessionBody = (token: string, role: "candidate" | "admin" | "guest" = "candidate") => ({
  accessToken: token,
  expiresIn: 900,
  user: { id: "u", role },
});

describe("client de l'API", () => {
  let calls: { url: string; init: RequestInit }[];

  beforeEach(() => {
    calls = [];
    session.set(null);
  });
  afterEach(() => vi.unstubAllGlobals());

  const stub = (handler: (url: string, init: RequestInit) => Response | Promise<Response>) =>
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return handler(url, init);
    });

  it("ouvre une session d'invité quand aucune session n'existe, avec l'en-tête anti-CSRF", async () => {
    stub((url) => (url.endsWith("/refresh") ? json(401, {}) : json(200, sessionBody("t-invite", "guest"))));
    expect(await refreshSession()).toBe(true);
    expect(session.user()?.role).toBe("guest");
    expect(calls.map((c) => c.url)).toEqual(["/api/auth/v1/session/refresh", "/api/auth/v1/session/guest"]);
    expect(calls.every((c) => (c.init.headers as Record<string, string>)["X-Attesta-Csrf"] === "1")).toBe(
      true,
    );
  });

  it("garde le jeton en mémoire et l'envoie en Bearer", async () => {
    session.set(sessionBody("jeton-1"));
    stub(() => json(200, { ok: true }));
    expect(await api("/profiles/v1/profiles/me")).toEqual({ ok: true });
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe("Bearer jeton-1");
  });

  it("sur un 401, ne rafraîchit qu'une fois pour des requêtes concurrentes, puis rejoue", async () => {
    session.set(sessionBody("expire"));
    stub((url, init) => {
      if (url.endsWith("/refresh")) return json(200, sessionBody("neuf"));
      const auth = (init.headers as Record<string, string>).Authorization;
      return auth === "Bearer neuf" ? json(200, { url }) : json(401, { title: "expiré" });
    });
    const [a, b] = await Promise.all([api<{ url: string }>("/a"), api<{ url: string }>("/b")]);
    expect([a.url, b.url]).toEqual(["/api/a", "/api/b"]);
    expect(calls.filter((c) => c.url.endsWith("/refresh"))).toHaveLength(1);
  });

  it("transmet le message français et les champs en cause d'une erreur", async () => {
    session.set(sessionBody("t"));
    stub(() =>
      json(400, {
        type: "urn:attesta:erreur:entree_invalide",
        title: "Certaines informations sont invalides.",
        status: 400,
        errors: [{ champ: "email", message: "Adresse e-mail invalide" }],
      }),
    );
    const error = (await api("/x").catch((e: unknown) => e)) as ApiError;
    expect(error).toBeInstanceOf(ApiError);
    expect(error.code).toBe("entree_invalide");
    expect(error.fieldErrors).toEqual([{ champ: "email", message: "Adresse e-mail invalide" }]);
  });

  it("signale une coupure réseau sans jargon", async () => {
    session.set(sessionBody("t"));
    stub(() => Promise.reject(new TypeError("Failed to fetch")));
    await expect(api("/x")).rejects.toMatchObject({
      status: 0,
      message: expect.stringMatching(/Connexion impossible/),
    });
  });

  it("lit le flux SSE de la génération, même découpé n'importe où", async () => {
    session.set(sessionBody("t"));
    const chunks = [
      'data: {"type":"progress","message":"Offre analysée"}\n\nda',
      'ta: {"type":"progress","message":"Rédaction"}\n\n',
      'data: {"type":"done","generationId":"6f0e9a3c-1111-4222-8333-944455556666","status":"ok"}\n\n',
    ];
    stub(
      () =>
        new Response(
          new ReadableStream({
            start(controller) {
              for (const c of chunks) controller.enqueue(new TextEncoder().encode(c));
              controller.close();
            },
          }),
          { status: 200, headers: { "content-type": "text/event-stream" } },
        ),
    );
    const events: string[] = [];
    await streamGeneration("o", (e) => events.push(e.type === "progress" ? e.message : e.type));
    expect(events).toEqual(["Offre analysée", "Rédaction", "done"]);
    expect((calls[0]!.init.headers as Record<string, string>).Accept).toBe("text/event-stream");
  });
});
