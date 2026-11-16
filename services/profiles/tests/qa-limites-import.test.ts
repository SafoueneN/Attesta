import { randomUUID } from "node:crypto";
import { BudgetedProvider, memoryUsageStore, ScriptedProvider } from "@attesta/llm-client";
import pg from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createApp } from "../src/app.js";
import { migrate } from "../src/db.js";
import { extractPdfText, MAX_PDF_BYTES } from "../src/extraction.js";
import { rulesProfile } from "../src/import-rules.js";
import { ProfileStore } from "../src/store.js";
import { leaProfile, tokens } from "./fixtures.js";
import { testLogger } from "./helpers.js";
import { createTestDatabase } from "./pg.js";

/*
 * Campagne QA : valeurs limites de l'import PDF (5 Mo exactement, 5 Mo + 1 octet), PDF multipages, et
 * données réalistes (noms arabes, accentués, très longs). Boîte noire sur l'API, boîte blanche sur
 * l'extraction.
 */

/**
 * PDF valide de plusieurs pages (Helvetica, WinAnsi), complété par un flux inutilisé pour atteindre une
 * taille exacte : les offsets de la table xref restent justes.
 */
function pdf(pages: string[][], totalBytes?: number): Buffer {
  const escape = (s: string) =>
    [...s]
      .map((c) => {
        if (c === "(" || c === ")" || c === "\\") return `\\${c}`;
        const code = c.charCodeAt(0);
        return code > 126 ? `\\${code.toString(8).padStart(3, "0")}` : c;
      })
      .join("");
  const build = (padding: number) => {
    const font = 3 + pages.length * 2;
    const objects = [
      "<< /Type /Catalog /Pages 2 0 R >>",
      `<< /Type /Pages /Kids [${pages.map((_, i) => `${3 + i * 2} 0 R`).join(" ")}] /Count ${pages.length} >>`,
    ];
    pages.forEach((lines, i) => {
      const stream = [
        "BT",
        "/F1 11 Tf",
        "14 TL",
        "50 790 Td",
        ...lines.map((l) => `(${escape(l)}) '`),
        "ET",
      ].join("\n");
      objects.push(
        `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 ${font} 0 R >> >> /Contents ${4 + i * 2} 0 R >>`,
        `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
      );
    });
    objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>");
    objects.push(`<< /Length ${padding} >>\nstream\n${" ".repeat(padding)}\nendstream`);
    let body = "%PDF-1.4\n";
    const offsets: number[] = [];
    objects.forEach((object, i) => {
      offsets.push(Buffer.byteLength(body, "latin1"));
      body += `${i + 1} 0 obj\n${object}\nendobj\n`;
    });
    const xref = Buffer.byteLength(body, "latin1");
    body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
    body += offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
    body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    return Buffer.from(body, "latin1");
  };
  if (totalBytes === undefined) return build(0);
  // La longueur déclarée du flux change le nombre de chiffres : deux passes suffisent à tomber juste.
  let padding = totalBytes - build(0).byteLength;
  for (let i = 0; i < 3; i++) padding += totalBytes - build(padding).byteLength;
  const out = build(padding);
  if (out.byteLength !== totalBytes) throw new Error(`taille ${out.byteLength} ≠ ${totalBytes}`);
  return out;
}

const CV = [
  "Sam Durand",
  "Développeur chez ACME, Lyon",
  "Refonte du site vitrine en 2021",
  "Compétences : PHP, Symfony",
];

describe("extraction PDF : valeurs limites (campagne QA)", () => {
  it("accepte un PDF de 5 Mo exactement", async () => {
    const file = pdf([CV], MAX_PDF_BYTES);
    expect(file.byteLength).toBe(5 * 1024 * 1024);
    expect(await extractPdfText(new Uint8Array(file))).toContain("Refonte du site vitrine en 2021");
  }, 30_000);

  it("refuse un PDF valide de 5 Mo + 1 octet", async () => {
    await expect(extractPdfText(new Uint8Array(pdf([CV], MAX_PDF_BYTES + 1)))).rejects.toThrow(
      "Le fichier dépasse 5 Mo.",
    );
  });

  it("lit toutes les pages d'un PDF de 3 pages, accents compris", async () => {
    const text = await extractPdfText(
      new Uint8Array(
        pdf([
          ["Éléonore Lefèvre-Ndiaye", "Cheffe de projet à Montréal"],
          ["Expérience : pilotage d'une équipe de 12 personnes"],
          ["Langues : français, anglais, wolof"],
        ]),
      ),
    );
    expect(text).toContain("Éléonore Lefèvre-Ndiaye");
    expect(text).toContain("pilotage d'une équipe de 12 personnes");
    expect(text).toContain("wolof");
  });

  it("ne lit que les 10 premières pages d'un PDF de 11 pages", async () => {
    const pages = Array.from({ length: 11 }, (_, i) => [`Page numéro ${i + 1} du curriculum vitae détaillé`]);
    const text = await extractPdfText(new Uint8Array(pdf(pages)));
    expect(text).toContain("Page numéro 10 du curriculum");
    expect(text).not.toContain("Page numéro 11 du curriculum");
  });
});

describe("extraction par règles : noms réalistes (campagne QA)", () => {
  it.each([
    ["arabe", "أمينة ديالو"],
    ["accentué et composé", "Éléonore Çelik-Lefèvre"],
    ["avec particule", "Jean-Baptiste de La Fontaine"],
  ])("garde un nom %s tel qu'il est écrit", (_cas, name) => {
    const profile = rulesProfile([name, "Cheffe de projet", "lea.martin@example.org"].join("\n"));
    expect(profile.basics.name).toBe(name);
  });
});

const db = await createTestDatabase("profiles");
const t = await tokens();

describe.skipIf(!db)("API profiles : valeurs limites (campagne QA, intégration PostgreSQL)", () => {
  let pool: pg.Pool;
  let store: ProfileStore;
  const userId = randomUUID();

  beforeAll(async () => {
    await migrate(db!.url);
    pool = new pg.Pool({ connectionString: db!.url, max: 3 });
    store = new ProfileStore(pool);
  });
  afterAll(async () => {
    await pool?.end();
    await db?.drop();
  });
  beforeEach(() => pool.query("TRUNCATE profile_version, llm_usage, profile_evidence"));

  const app = () =>
    createApp({
      ...testLogger(),
      readiness: {},
      store,
      verifier: t.verifier,
      llm: new BudgetedProvider(new ScriptedProvider({ "extraction-cv": [{ error: new Error("panne") }] }), {
        service: "profiles",
        store: memoryUsageStore(),
        monthlyBudgetEur: 2,
      }),
      evidenceKey: Buffer.alloc(32, 7),
    });

  it("importe un PDF de 5 Mo exactement et refuse 5 Mo + 1 octet avec un message en français", async () => {
    const token = await t.user(userId);
    const ok = await request(app())
      .post("/v1/profiles/import")
      .auth(token, { type: "bearer" })
      .attach("cv", pdf([CV], MAX_PDF_BYTES), "cv.pdf");
    expect(ok.status).toBe(200);
    const tooBig = await request(app())
      .post("/v1/profiles/import")
      .auth(token, { type: "bearer" })
      .attach("cv", pdf([CV], MAX_PDF_BYTES + 1), "cv.pdf");
    expect(tooBig.status).toBe(400);
    expect(tooBig.body.title).toBe("Le fichier dépasse 5 Mo ou n'est pas accepté.");
  }, 60_000);

  it.each([
    ["arabe", "أمينة ديالو"],
    ["accentué", "Éléonore Çelik-Lefèvre"],
    ["de 200 caractères, la limite", "Ñ".repeat(200)],
  ])("enregistre et relit à l'identique un nom %s", async (_cas, name) => {
    const token = await t.user(userId);
    const put = await request(app())
      .put("/v1/profiles/me")
      .auth(token, { type: "bearer" })
      .send({ profile: { ...leaProfile, basics: { ...leaProfile.basics, name } } });
    expect(put.status).toBe(201);
    const got = await request(app()).get("/v1/profiles/me").auth(token, { type: "bearer" });
    expect(got.body.profile.basics.name).toBe(name);
  });

  it("refuse un nom de 201 caractères, avec le champ en cause", async () => {
    const token = await t.user(userId);
    const res = await request(app())
      .put("/v1/profiles/me")
      .auth(token, { type: "bearer" })
      .send({ profile: { ...leaProfile, basics: { ...leaProfile.basics, name: "a".repeat(201) } } });
    expect(res.status).toBe(400);
    expect(res.body.errors).toEqual(
      expect.arrayContaining([expect.objectContaining({ champ: "profile.basics.name" })]),
    );
  });
});
