import { Writable } from "node:stream";
import request from "supertest";
import { afterAll, describe, expect, it } from "vitest";
import {
  DemoProvider,
  LlmUnavailableError,
  ScriptedProvider,
  type DraftOutput,
  type LlmProvider,
  type LlmRequest,
  type OfferAnalysisOutput,
} from "@attesta/llm";
import { PuppeteerPdfRenderer, renderCvHtml, viewFromProfile } from "@attesta/render";
import { Profile } from "@attesta/schema";
import { createLogger } from "@attesta/shared";
import { csrfFrom, submit, testApp, validBasics, validParcours } from "./helpers.js";

const offer = {
  "offer[rawText]":
    "Développeur back-end Node.js (H/F). Vous concevez des API performantes avec PostgreSQL. Une expérience de Kubernetes est un plus.",
};

const analysis: OfferAnalysisOutput = {
  title: "Développeur back-end Node.js",
  company: null,
  language: "fr",
  location: null,
  contractType: null,
  requirements: [],
  keywords: [
    { term: "Node.js", weight: 1 },
    { term: "Kubernetes", weight: 0.4 },
  ],
};

/** Une ligne fidèle, une ligne au chiffre modifié, une ligne avec une compétence absente. */
const draft: DraftOutput = {
  headline: null,
  summary: [],
  work: [
    {
      ref: "/work/0",
      highlights: [
        { text: "Réduction de 40 % du temps de réponse", sources: ["/work/0/highlights/1"] },
        { text: "Réduction de 75 % du temps de réponse", sources: ["/work/0/highlights/1"] },
        { text: "Migration de 12 services Express sur Kubernetes", sources: ["/work/0/highlights/0"] },
      ],
    },
  ],
  projects: [],
  skills: ["/skills/0"],
};

function iaApp(provider: LlmProvider, options: { dailyQuota?: number; logs?: string[] } = {}) {
  const sink = new Writable({
    write(chunk, _enc, done) {
      options.logs?.push(chunk.toString());
      done();
    },
  });
  return testApp({
    ia: { provider, maxCostUsd: 1, dailyQuota: options.dailyQuota ?? 10 },
    logger: createLogger("info", sink),
  });
}

const scripted = (redaction: DraftOutput | Error = draft) =>
  new ScriptedProvider({
    "analyse-offre": [{ data: analysis }],
    redaction: [redaction instanceof Error ? { error: redaction } : { data: redaction }],
  });

async function fillSteps(agent: ReturnType<typeof testApp>["agent"]) {
  await submit(agent, 1, { ...validBasics, action: "next" });
  await submit(agent, 2, { ...validParcours, action: "next" });
  await submit(agent, 3, { ...offer, action: "next" });
}

async function generate(agent: ReturnType<typeof testApp>["agent"]) {
  const page = await agent.get("/cv/etape/4");
  return agent
    .post("/cv/generer")
    .type("form")
    .send({ _csrf: csrfFrom(page.text) });
}

describe("génération : parcours sans JavaScript", () => {
  it("indique clairement quand l'IA n'est pas activée", async () => {
    const { agent } = testApp();
    await fillSteps(agent);

    const page = await agent.get("/cv/etape/4");

    expect(page.text).toContain("La génération par IA n'est pas activée");
    expect(page.text).not.toContain("Générer mon CV");
  });

  it("affiche le score, les lignes retirées avec leur raison et les compétences signalées", async () => {
    const { agent } = iaApp(scripted());
    await fillSteps(agent);

    const res = await generate(agent);
    const page = await agent.get("/cv/etape/4");

    expect(res.headers.location).toBe("/cv/etape/4");
    expect(page.text).toContain("Contenu généré par une IA, à relire.");
    expect(page.text).toContain("<strong>33 %</strong>");
    expect(page.text).toContain("le chiffre « 75 » ne figure pas dans la source");
    expect(page.text).toContain("« Kubernetes » est demandé par l&#39;offre mais absent de votre profil");
    expect(page.text).toMatch(/Demandé par l'offre, absent de votre profil[\s\S]*<li>Kubernetes<\/li>/);
    expect(page.text).toContain("Expérience 1 (Développeuse back-end) – réalisation 2");
  });

  it("n'expose aucune ligne retirée dans l'aperçu ni dans le PDF", async () => {
    const { agent, renderer } = iaApp(scripted());
    await fillSteps(agent);
    await generate(agent);

    const preview = await agent.get("/cv/apercu");
    await submit(agent, 5, { reviewed: "yes", action: "export" });

    for (const html of [preview.text, renderer.calls[0]!]) {
      expect(html).toContain("Réduction de 40 % du temps de réponse");
      expect(html).not.toContain("75 %");
      expect(html).not.toContain("Kubernetes");
    }
  });

  it("enregistre les corrections du candidat et les exporte", async () => {
    const { agent, renderer } = iaApp(scripted());
    await fillSteps(agent);
    await generate(agent);
    const page = await agent.get("/cv/etape/4");

    await agent
      .post("/cv/generation/corrections")
      .type("form")
      .send({
        _csrf: csrfFrom(page.text),
        generation: /name="generation" value="([^"]+)"/.exec(page.text)?.[1],
        line_0: "Temps de réponse de l'API réduit de 40 %",
        line_1: "Migration de 12 services Express vers Node.js 20",
        remove_1: "yes",
      });
    const after = await agent.get("/cv/etape/4");
    await submit(agent, 5, { reviewed: "yes", action: "export" });

    expect(after.text).toContain("(modifiée par vous)");
    expect(after.text).toContain("Vos corrections sont enregistrées.");
    expect(renderer.calls[0]).toContain("Temps de réponse de l&#39;API réduit de 40 %");
    expect(renderer.calls[0]).not.toContain("Migration de 12 services Express vers Node.js 20");
  });

  it("ignore une génération devenue obsolète quand le profil change", async () => {
    const { agent } = iaApp(scripted());
    await fillSteps(agent);
    await generate(agent);

    await submit(agent, 1, { ...validBasics, "basics[label]": "Développeuse Node.js", action: "next" });
    const page = await agent.get("/cv/etape/4");

    expect(page.text).toContain("Votre profil ou l'offre ont changé depuis la dernière génération");
    expect(page.text).toContain("Générer mon CV");
  });

  it("bascule en mode dégradé avec un message clair si le fournisseur est indisponible", async () => {
    const { agent } = iaApp(scripted(new LlmUnavailableError("503", 503)));
    await fillSteps(agent);

    await generate(agent);
    const page = await agent.get("/cv/etape/4");

    expect(page.text).toContain("La reformulation par IA est indisponible pour le moment.");
    expect(page.text).toContain('role="alert"');
  });

  it("applique le quota quotidien de générations", async () => {
    const { agent } = iaApp(new DemoProvider(), { dailyQuota: 1 });
    await fillSteps(agent);

    await generate(agent);
    await generate(agent);
    const page = await agent.get("/cv/etape/4");

    expect(page.text).toContain("Limite de 1 appels à l&#39;IA par jour atteinte");
  });

  it("ne journalise ni le contenu du CV ni l'identité, mais trace coût et score", async () => {
    const logs: string[] = [];
    const { agent } = iaApp(scripted(), { logs });
    await fillSteps(agent);

    await generate(agent);

    const all = logs.join("");
    expect(all).toContain('"event":"llm_usage"');
    expect(all).toContain('"event":"generation"');
    for (const personal of ["Léa Martin", "Transports Rhône", "Réduction de 40"])
      expect(all).not.toContain(personal);
  });
});

describe("génération : progression en direct (SSE)", () => {
  it("diffuse les étapes puis la redirection, avec un jeton à usage unique", async () => {
    const { agent } = iaApp(new DemoProvider());
    await fillSteps(agent);
    const page = await agent.get("/cv/etape/4");
    const stream = /data-stream="([^"]+)"/.exec(page.text)![1]!.replace(/&amp;/g, "&");

    const first = await agent.get(stream).buffer(true);
    const replay = await agent.get(stream);

    expect(first.headers["content-type"]).toContain("text/event-stream");
    expect(first.text).toContain("event: progress");
    expect(first.text).toContain("Analyse de l'offre…");
    expect(first.text).toContain("Contrôle de fidélité");
    expect(first.text).toContain('event: done\ndata: {"redirect":"/cv/etape/4"}');
    expect(replay.status).toBe(403);
  });

  it("refuse un flux sans jeton", async () => {
    const { agent } = iaApp(new DemoProvider());
    await fillSteps(agent);

    const res = await agent.get("/cv/generer/flux");

    expect(res.status).toBe(403);
  });
});

describe("import d'un CV PDF", () => {
  const pdfRenderer = new PuppeteerPdfRenderer({ maxConcurrency: 1, timeoutMs: 30_000 });
  afterAll(() => pdfRenderer.close());

  const extracted = {
    basics: {
      name: "Sam Durand",
      label: "Développeur",
      email: null,
      phone: null,
      city: "Nantes",
      countryCode: "FR",
      url: null,
      summary: null,
    },
    work: [
      {
        name: "ACME",
        position: "Développeur",
        location: null,
        startDate: "2020-01",
        endDate: null,
        summary: null,
        highlights: ["Refonte du site"],
      },
    ],
    education: [],
    skills: [{ name: "PHP", keywords: ["Symfony"] }],
    languages: [],
  };

  async function upload(agent: ReturnType<typeof testApp>["agent"], file: Buffer, name = "cv.pdf") {
    const page = await agent.get("/cv/etape/1");
    return agent.post("/cv/import").field("_csrf", csrfFrom(page.text)).attach("cv", file, name);
  }

  it("pré-remplit le formulaire et demande une relecture", async () => {
    const profile = Profile.parse({
      basics: { name: "Sam Durand", summary: "Développeur web depuis 2020, PHP et Symfony." },
    });
    const pdf = Buffer.from(
      await pdfRenderer.render(renderCvHtml(viewFromProfile(profile), { variant: "ats" })),
    );
    const provider = new ScriptedProvider({ "extraction-cv": [{ data: extracted }] });
    const { agent } = iaApp(provider);

    const res = await upload(agent, pdf);
    const page = await agent.get("/cv/etape/1");
    const step2 = await agent.get("/cv/etape/2");

    expect(res.headers.location).toBe("/cv/etape/1");
    expect(page.text).toContain("Profil pré-rempli à partir de votre CV");
    expect(page.text).toContain('value="Sam Durand"');
    expect(step2.text).toContain("PHP : Symfony");
    expect(provider.requests[0]!.messages[0]!.content).toContain("Sam Durand");
  });

  it("refuse un fichier qui n'est pas un PDF, même nommé .pdf", async () => {
    const { agent } = iaApp(scripted());

    await upload(agent, Buffer.from("MZ exécutable déguisé"), "cv.pdf");
    const page = await agent.get("/cv/etape/1");

    expect(page.text).toContain("Le fichier n&#39;est pas un PDF valide.");
  });

  it("refuse l'envoi sans jeton CSRF", async () => {
    const { agent } = iaApp(scripted());
    await agent.get("/cv/etape/1");

    const res = await agent.post("/cv/import").attach("cv", Buffer.from("%PDF-1.7"), "cv.pdf");

    expect(res.status).toBe(403);
  });

  it("n'est pas proposé sans modèle d'IA réel", async () => {
    const { agent } = iaApp(new DemoProvider());

    const page = await agent.get("/cv/etape/1");

    expect(page.text).not.toContain("Importer et pré-remplir");
  });
});

/** Fournisseur de démo qui attend un signal avant de répondre : simule un appel long. */
class GatedProvider implements LlmProvider {
  readonly kind = "demo" as const;
  readonly model = "demo";
  private readonly demo = new DemoProvider();
  private release!: () => void;
  private readonly gate = new Promise<void>((resolve) => (this.release = resolve));
  open() {
    this.release();
  }
  async generate<T>(req: LlmRequest<T>) {
    await this.gate;
    return this.demo.generate(req);
  }
}

const pause = () => new Promise((resolve) => setTimeout(resolve, 50));

describe("génération et session concurrentes", () => {
  it("un effacement demandé pendant la génération reste effectif", async () => {
    const provider = new GatedProvider();
    const { app, agent } = iaApp(provider);
    const first = await agent.get("/cv/etape/1");
    const sessionCookie = (first.headers["set-cookie"] as unknown as string[])[0]!.split(";")[0]!;
    await fillSteps(agent);
    const page = await agent.get("/cv/etape/4");

    const generation = agent
      .post("/cv/generer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) })
      .then((r) => r);
    await pause();
    const erase = await agent
      .post("/cv/effacer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) });
    provider.open();
    const done = await generation;
    const replay = await request(app).get("/cv/etape/1").set("Cookie", sessionCookie);

    expect(erase.headers.location).toBe("/?efface=1");
    expect(done.headers.location).toBe("/?efface=1");
    expect(replay.text).not.toContain("Léa Martin");
  });

  it("refuse une seconde génération simultanée pour la même session", async () => {
    const provider = new GatedProvider();
    const { agent } = iaApp(provider);
    await fillSteps(agent);
    const page = await agent.get("/cv/etape/4");

    const first = agent
      .post("/cv/generer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) })
      .then((r) => r);
    await pause();
    await agent
      .post("/cv/generer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) });
    provider.open();
    await first;
    const after = await agent.get("/cv/etape/4");

    expect(after.text).toContain("Un traitement par l&#39;IA est déjà en cours");
    expect(after.text).toContain("Démonstration : contenu recopié de votre profil");
  });

  it("compte l'import dans le quota d'appels à l'IA", async () => {
    const extracted = {
      basics: {
        name: "Sam",
        label: null,
        email: null,
        phone: null,
        city: null,
        countryCode: null,
        url: null,
        summary: null,
      },
      work: [],
      education: [],
      skills: [],
      languages: [],
    };
    const { agent } = iaApp(new ScriptedProvider({ "extraction-cv": [{ data: extracted }] }), {
      dailyQuota: 1,
    });
    const profile = Profile.parse({
      basics: { name: "Sam", summary: "Développeur web depuis 2020, PHP et Symfony." },
    });
    const renderer = new PuppeteerPdfRenderer({ maxConcurrency: 1, timeoutMs: 30_000 });
    const pdf = Buffer.from(
      await renderer.render(renderCvHtml(viewFromProfile(profile), { variant: "ats" })),
    );
    await renderer.close();

    for (let i = 0; i < 2; i++) {
      const step1 = await agent.get("/cv/etape/1");
      await agent.post("/cv/import").field("_csrf", csrfFrom(step1.text)).attach("cv", pdf, "cv.pdf");
    }
    const page = await agent.get("/cv/etape/1");

    expect(page.text).toContain("Limite de 1 appels à l&#39;IA par jour atteinte");
  });
});
