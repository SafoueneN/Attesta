import { describe, expect, it } from "vitest";
import { csrfFrom, submit, testApp, validBasics, validOffer, validParcours } from "./helpers.js";

async function completeSteps(agent: ReturnType<typeof testApp>["agent"]) {
  await submit(agent, 1, { ...validBasics, action: "next" });
  await submit(agent, 2, { ...validParcours, action: "next" });
  await submit(agent, 3, { ...validOffer, action: "next" });
}

describe("pages publiques", () => {
  it("sert l'accueil sans créer de session, avec une CSP stricte", async () => {
    const { agent } = testApp();

    const res = await agent.get("/");

    expect(res.status).toBe(200);
    expect(res.headers["set-cookie"]).toBeUndefined();
    expect(res.headers["content-security-policy"]).toContain("script-src 'self'");
    expect(res.headers["x-powered-by"]).toBeUndefined();
  });

  it("répond au contrôle de santé", async () => {
    const res = await testApp().agent.get("/health");
    expect(res.status).toBe(200);
    expect(res.body).toEqual({ status: "ok" });
  });

  it("affiche une page 404 en français", async () => {
    const res = await testApp().agent.get("/inconnu");
    expect(res.status).toBe(404);
    expect(res.text).toContain("Page introuvable");
  });
});

describe("parcours en 5 étapes", () => {
  it("annonce l'étape courante et marque la progression", async () => {
    const res = await testApp().agent.get("/cv/etape/1");

    expect(res.text).toContain("Étape 1 sur 5");
    expect(res.text).toMatch(/aria-current="step"[^>]*>\s*<span>Profil/);
    expect(res.headers["cache-control"]).toBe("no-store");
  });

  it("refuse un nom vide avec un message relié au champ", async () => {
    const { agent } = testApp();

    const res = await submit(agent, 1, { "basics[name]": "", action: "next" });

    expect(res.status).toBe(422);
    expect(res.text).toContain("<title>Erreur : ");
    expect(res.text).toContain('<a href="#basics-name">Ce champ est obligatoire</a>');
    expect(res.text).toMatch(
      /id="basics-name"[^>]*aria-describedby="basics-name-error"[^>]*aria-invalid="true"/,
    );
  });

  it("empêche de sauter une étape incomplète", async () => {
    const res = await testApp().agent.get("/cv/etape/4");
    expect(res.status).toBe(303);
    expect(res.headers.location).toBe("/cv/etape/1");
  });

  it("revient en arrière sans perdre la saisie, même invalide", async () => {
    const { agent } = testApp();
    await submit(agent, 1, { ...validBasics, action: "next" });

    const back = await submit(agent, 2, { "work[0][position]": "Poste en cours de saisie", action: "prev" });
    const again = await agent.get("/cv/etape/2");

    expect(back.headers.location).toBe("/cv/etape/1");
    expect(again.text).toContain('value="Poste en cours de saisie"');
  });

  it("ajoute et supprime des expériences sans JavaScript", async () => {
    const { agent } = testApp();
    await submit(agent, 1, { ...validBasics, action: "next" });

    const added = await submit(agent, 2, { ...validParcours, action: "add-work" });
    const withTwo = await agent.get("/cv/etape/2");
    await submit(agent, 2, { ...validParcours, action: "remove-work-0" });
    const withOne = await agent.get("/cv/etape/2");

    expect(added.headers.location).toBe("/cv/etape/2#work-1");
    expect(withTwo.text).toContain("Expérience 2");
    expect(withOne.text).not.toContain("Expérience 2");
    expect(withOne.text).not.toContain("Transports Rhône");
  });

  it("rattache les erreurs au bon champ en ignorant les blocs vides", async () => {
    const { agent } = testApp();
    await submit(agent, 1, { ...validBasics, action: "next" });

    const res = await submit(agent, 2, {
      "work[0][position]": "",
      "work[1][position]": "Développeuse",
      "work[1][name]": "Agence",
      "work[1][startDate]": "2022-01",
      "work[1][endDate]": "2021-01",
      skills: "Node.js\n : Express",
      action: "next",
    });

    expect(res.status).toBe(422);
    expect(res.text).toContain('href="#work-1-endDate">La date de fin précède la date de début');
    expect(res.text).toContain('href="#skills">Ligne 2 : Ce champ est obligatoire');
  });

  it("exige une offre suffisamment détaillée", async () => {
    const { agent } = testApp();
    await submit(agent, 1, { ...validBasics, action: "next" });
    await submit(agent, 2, { ...validParcours, action: "next" });

    const res = await submit(agent, 3, { "offer[rawText]": "Poste back-end", action: "next" });

    expect(res.status).toBe(422);
    expect(res.text).toContain("L&#39;offre semble trop courte");
  });

  it("affiche l'aperçu avec le même HTML que le PDF, sous nonce CSP", async () => {
    const { agent } = testApp();
    await completeSteps(agent);

    const step4 = await agent.get("/cv/etape/4");
    const preview = await agent.get("/cv/apercu?variant=design");

    expect(step4.text).toContain('src="/cv/apercu?variant=ats"');
    expect(preview.status).toBe(200);
    expect(preview.text).toContain("Léa Martin");
    expect(preview.text).toContain('class="cv cv--design"');
    const nonce = /<style nonce="([^"]+)">/.exec(preview.text)?.[1];
    expect(preview.headers["content-security-policy"]).toContain(`'nonce-${nonce}'`);
  });

  it("exige la relecture avant l'export, puis renvoie le PDF", async () => {
    const { agent, renderer } = testApp();
    await completeSteps(agent);

    const refused = await submit(agent, 5, { variant: "design", action: "export" });
    const exported = await submit(agent, 5, { variant: "design", reviewed: "yes", action: "export" });

    expect(refused.status).toBe(422);
    expect(refused.text).toContain("Confirmez que vous avez relu votre CV");
    expect(exported.status).toBe(200);
    expect(exported.headers["content-type"]).toBe("application/pdf");
    expect(exported.headers["content-disposition"]).toContain("cv-attesta-design.pdf");
    expect(renderer.calls).toHaveLength(1);
    expect(renderer.calls[0]).toContain("Réduction de 40 % du temps de réponse");
  });
});

describe("sécurité et données", () => {
  it("rejette un POST sans jeton CSRF", async () => {
    const { agent } = testApp();
    await agent.get("/cv/etape/1");

    const res = await agent
      .post("/cv/etape/1")
      .type("form")
      .send({ ...validBasics });

    expect(res.status).toBe(403);
    expect(res.text).toContain("Rechargez la page");
  });

  it("efface la session à la demande", async () => {
    const { agent } = testApp();
    await submit(agent, 1, { ...validBasics, action: "next" });
    const page = await agent.get("/cv/etape/1");

    const res = await agent
      .post("/cv/effacer")
      .type("form")
      .send({ _csrf: csrfFrom(page.text) });
    const after = await agent.get("/cv/etape/1");

    expect(res.headers.location).toBe("/?efface=1");
    expect(after.text).not.toContain("Léa Martin");
  });

  it("limite le nombre d'exports PDF", async () => {
    const { agent } = testApp({ limits: { general: 1000, export: 1 } });
    await completeSteps(agent);

    const first = await submit(agent, 5, { reviewed: "yes", action: "export" });
    const second = await submit(agent, 5, { reviewed: "yes", action: "export" });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
  });
});

describe("sondes", () => {
  it("la vivacité ne dépend pas de la base", async () => {
    const res = await testApp().agent.get("/livez");
    expect(res.status).toBe(200);
  });
});
