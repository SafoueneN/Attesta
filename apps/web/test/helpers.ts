import request from "supertest";
import type { PdfRenderer } from "@attesta/render";
import { createLogger, loadConfig } from "@attesta/shared";
import { createApp, type AppDeps } from "../src/app.js";

/** Renderer simulé : enregistre le HTML reçu, renvoie un faux PDF. */
export class FakeRenderer implements PdfRenderer {
  readonly calls: string[] = [];
  async render(html: string) {
    this.calls.push(html);
    return new TextEncoder().encode("%PDF-1.7 faux");
  }
  async close() {}
}

export function testApp(overrides: Partial<AppDeps> = {}) {
  const renderer = new FakeRenderer();
  const app = createApp({
    config: loadConfig({ SESSION_SECRET: "s".repeat(32), SESSION_STORE: "memory", NODE_ENV: "test" }),
    logger: createLogger("silent"),
    renderer,
    ...overrides,
  });
  return { app, renderer, agent: request.agent(app) };
}

export const csrfFrom = (html: string) => /name="_csrf" value="([^"]+)"/.exec(html)?.[1] ?? "";

export const validBasics = { "basics[name]": "Léa Martin", "basics[label]": "Développeuse back-end" };

export const validParcours = {
  "work[0][position]": "Développeuse back-end",
  "work[0][name]": "Transports Rhône",
  "work[0][startDate]": "2021-03",
  "work[0][highlights]": "Migration de 12 services Express\nRéduction de 40 % du temps de réponse",
  skills: "Node.js : Express, PostgreSQL",
  languages: "Anglais : C1",
};

export const validOffer = {
  "offer[rawText]":
    "Nous recherchons une développeuse ou un développeur back-end Node.js pour notre plateforme de réservation.",
};

/** Soumet une étape avec le jeton CSRF de la page courante. */
export async function submit(
  agent: ReturnType<typeof request.agent>,
  step: number,
  fields: Record<string, string>,
) {
  const page = await agent.get(`/cv/etape/${step}`);
  return agent
    .post(`/cv/etape/${step}`)
    .type("form")
    .send({ _csrf: csrfFrom(page.text), ...fields });
}
