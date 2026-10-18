import { Writable } from "node:stream";
import { createLogger } from "@attesta/logger";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { AppError, buildOpenApi, createServiceApp, parseInput, toYaml } from "../src/index.js";

function setup(readiness = {}) {
  const lines: Record<string, unknown>[] = [];
  const destination = new Writable({
    write(chunk, _enc, done) {
      lines.push(JSON.parse(chunk.toString()));
      done();
    },
  });
  const logger = createLogger({ service: "essai", destination });
  const Body = z.object({ nom: z.string().min(1, "Le nom est obligatoire.") });
  const app = createServiceApp({
    service: "essai",
    logger,
    readiness,
    routes: (a) => {
      a.post("/v1/echo/:id", (req, res) => {
        const body = parseInput(Body, req.body);
        logger.info({ event: "echo" }, "echo");
        res.json({ id: req.params.id, nom: body.nom });
      });
      a.get("/v1/refus", () => {
        throw new AppError("interdit", 403, "Accès refusé.");
      });
      a.get("/v1/panne", () => {
        throw new Error("détail interne avec lea@example.org");
      });
    },
  });
  return { app, lines };
}

const UUID = /^[0-9a-f-]{36}$/;

describe("createServiceApp", () => {
  it("répond à /health sans dépendance", async () => {
    const res = await request(setup().app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "essai" });
  });

  it("/ready : 200 si toutes les dépendances répondent", async () => {
    const res = await request(setup({ base: async () => undefined }).app).get("/ready");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok", service: "essai", checks: { base: "ok" } });
  });

  it("/ready : 503 sans détail technique si une dépendance échoue", async () => {
    const { app, lines } = setup({
      base: async () => {
        throw new Error("mot de passe refusé pour attesta_profiles");
      },
    });
    const res = await request(app).get("/ready");
    expect(res.status).toBe(503);
    expect(res.body.checks).toEqual({ base: "echec" });
    expect(JSON.stringify(res.body)).not.toContain("mot de passe");
    expect(lines.some((l) => l.event === "ready_echec")).toBe(true);
  });

  it("crée un X-Request-Id, le renvoie et l'ajoute aux journaux de la requête", async () => {
    const { app, lines } = setup();
    const res = await request(app).post("/v1/echo/42").send({ nom: "x" });
    expect(res.status).toBe(200);
    const id = res.headers["x-request-id"];
    expect(id).toMatch(UUID);
    expect(lines.find((l) => l.event === "echo")?.requestId).toBe(id);
  });

  it("reprend un X-Request-Id valide et refuse un identifiant mal formé", async () => {
    const { app } = setup();
    const valid = "0b6f3c1e-1111-4222-8333-444455556666";
    expect((await request(app).get("/health").set("X-Request-Id", valid)).headers["x-request-id"]).toBe(
      valid,
    );
    const forged = (await request(app).get("/health").set("X-Request-Id", "<script>")).headers[
      "x-request-id"
    ];
    expect(forged).toMatch(UUID);
  });

  it("journalise la route déclarée, jamais l'URL réelle ni le corps", async () => {
    const { app, lines } = setup();
    await request(app).post("/v1/echo/identifiant-secret?q=lea").send({ nom: "Léa Martin" });
    const access = lines.find((l) => l.event === "http");
    expect(access).toMatchObject({ method: "POST", route: "/v1/echo/:id", status: 200 });
    const text = JSON.stringify(lines);
    expect(text).not.toContain("identifiant-secret");
    expect(text).not.toContain("Léa Martin");
  });

  it("refuse une entrée invalide en 400 au format commun, avec les champs en cause", async () => {
    const res = await request(setup().app).post("/v1/echo/1").send({ nom: "" });
    expect(res.status).toBe(400);
    expect(res.headers["content-type"]).toContain("application/problem+json");
    expect(res.body).toMatchObject({
      type: "urn:attesta:erreur:entree_invalide",
      title: "Certaines informations sont invalides.",
      status: 400,
      errors: [{ champ: "nom", message: "Le nom est obligatoire." }],
    });
    expect(res.body.requestId).toMatch(UUID);
  });

  it("refuse un JSON illisible en 400", async () => {
    const res = await request(setup().app)
      .post("/v1/echo/1")
      .set("Content-Type", "application/json")
      .send("{ pas du json");
    expect(res.status).toBe(400);
    expect(res.body.type).toBe("urn:attesta:erreur:json_invalide");
  });

  it("renvoie le message public d'une AppError", async () => {
    const res = await request(setup().app).get("/v1/refus");
    expect(res.status).toBe(403);
    expect(res.body).toMatchObject({ type: "urn:attesta:erreur:interdit", title: "Accès refusé." });
  });

  it("masque le détail d'une erreur inattendue au client", async () => {
    const { app, lines } = setup();
    const res = await request(app).get("/v1/panne");
    expect(res.status).toBe(500);
    expect(res.body.title).toBe("Une erreur inattendue est survenue. Réessayez dans un instant.");
    expect(JSON.stringify(res.body)).not.toContain("lea@example.org");
    expect(lines.some((l) => l.event === "erreur_serveur")).toBe(true);
  });

  it("renvoie 404 au format commun pour une route inconnue", async () => {
    const res = await request(setup().app).get("/v1/inconnue");
    expect(res.status).toBe(404);
    expect(res.body.type).toBe("urn:attesta:erreur:introuvable");
  });

  it("ajoute les en-têtes de sécurité et retire X-Powered-By", async () => {
    const res = await request(setup().app).get("/health");
    expect(res.headers["x-powered-by"]).toBeUndefined();
    expect(res.headers["x-content-type-options"]).toBe("nosniff");
  });
});

describe("buildOpenApi", () => {
  const doc = buildOpenApi({ title: "Essai", version: "1.0.0", description: "Service d'essai" }, [
    {
      method: "post",
      path: "/v1/echo/{id}",
      operationId: "echo",
      summary: "Renvoie le nom",
      auth: true,
      body: z.object({ nom: z.string() }),
      responses: {
        200: { description: "Nom renvoyé", schema: z.object({ nom: z.string() }) },
        400: { description: "Entrée invalide" },
      },
    },
  ]);

  it("inclut les routes de santé et les opérations du service", () => {
    expect(Object.keys(doc.paths)).toEqual(["/health", "/ready", "/v1/echo/{id}"]);
  });

  it("décrit le corps, la sécurité et le format d'erreur commun", () => {
    const op = doc.paths["/v1/echo/{id}"]!.post;
    expect(op).toMatchObject({
      security: [{ bearer: [] }],
      requestBody: {
        content: { "application/json": { schema: { properties: { nom: { type: "string" } } } } },
      },
      responses: {
        "400": {
          content: { "application/problem+json": { schema: { required: expect.arrayContaining(["type"]) } } },
        },
      },
    });
  });
});

describe("toYaml", () => {
  it("produit un YAML lisible, chaînes entre guillemets", () => {
    expect(
      toYaml({ openapi: "3.1.0", info: { title: "Essai: x" }, tags: ["a", "no"], vide: [], n: 1, ok: true }),
    ).toBe(
      [
        'openapi: "3.1.0"',
        "info:",
        '  title: "Essai: x"',
        "tags:",
        '  - "a"',
        '  - "no"',
        "vide: []",
        "n: 1",
        "ok: true",
        "",
      ].join("\n"),
    );
  });

  it("gère les listes d'objets et les clés spéciales", () => {
    expect(toYaml({ "200": { d: "x" }, l: [{ a: 1 }] })).toBe(
      ['"200":', '  d: "x"', "l:", "  -", "    a: 1", ""].join("\n"),
    );
  });
});
