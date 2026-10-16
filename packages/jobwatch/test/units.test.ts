import { describe, expect, it } from "vitest";
import { Profile } from "@attesta/schema";
import { leaProfile } from "../../schema/test/fixtures.js";
import {
  Adzuna,
  BaJobsuche,
  baPosting,
  confirmSubscriptionMessage,
  dailyReportMessage,
  distanceKm,
  EMBEDDING_DIMENSIONS,
  EMBEDDING_MAX_CHARS,
  EmbeddingError,
  TeiEmbeddings,
  EscoClient,
  findCity,
  HashEmbeddings,
  htmlToText,
  locationScore,
  loginLinkMessage,
  MailError,
  SmtpMailer,
  matchingProfile,
  postingFingerprint,
  reciprocalRankFusion,
  RequestBudget,
  scrubContacts,
  searchTitles,
  skillGaps,
  SourceError,
  technicalTerms,
  websearchQuery,
  type Fetch,
  type Occupation,
} from "../src/index.js";
import { coverage, criteriaLabel, deterministicMissing } from "../src/matching.js";

/** Réponses HTTP enregistrées (données fictives), servies selon le chemin demandé. */
function fakeFetch(routes: Record<string, unknown>, calls: string[] = []): Fetch {
  return async (url) => {
    calls.push(url);
    const match = Object.entries(routes).find(([prefix]) => url.includes(prefix));
    if (!match) return { ok: false, status: 404, json: async () => ({}) };
    return { ok: true, status: 200, json: async () => match[1] };
  };
}

describe("texte des offres", () => {
  it("entité numérique invalide : caractère de remplacement, jamais d'exception", () => {
    expect(htmlToText("a&#99999999;b&#x110000;c&#0;")).toBe("a\ufffdb\ufffdc\ufffd");
  });

  it("htmlToText retire balises et entités, garde les retours à la ligne", () => {
    expect(htmlToText("<p>Node.js &amp; <strong>SQL</strong></p><p>Lyon&nbsp;3e</p>")).toBe(
      "Node.js & SQL\nLyon 3e",
    );
  });

  it("l'empreinte ignore (m/w/d), la casse et les accents", () => {
    const a = postingFingerprint({
      title: "Backend-Entwickler (m/w/d)",
      company: "Muster GmbH",
      city: "Köln",
      postedAt: "2026-10-15",
    });
    const b = postingFingerprint({
      title: "backend-entwickler",
      company: "MUSTER GMBH",
      city: "Koln",
      postedAt: "2026-10-15",
    });
    const c = postingFingerprint({
      title: "Backend-Entwickler",
      company: "Muster GmbH",
      city: "Köln",
      postedAt: "2026-10-16",
    });
    expect(a.equals(b)).toBe(true);
    expect(a.equals(c)).toBe(false);
  });

  it("en allemand, seuls les signes forts désignent un terme technique", () => {
    const terms = technicalTerms(
      "Sie entwickeln Software mit TypeScript, Node.js und SAP S4 bei der Muster GmbH, z.B. im Team Kubernetes.",
      "de",
    );
    expect(terms).toEqual(expect.arrayContaining(["TypeScript", "Node.js", "SAP", "S4"]));
    expect(terms).not.toContain("Software");
    expect(terms).not.toContain("GmbH");
    expect(terms).not.toContain("z.B");
  });

  it("en français, les noms propres en milieu de phrase comptent", () => {
    expect(technicalTerms("Vous maîtrisez Node.js et Kubernetes.", "fr")).toEqual(["Node.js", "Kubernetes"]);
  });

  it("requête websearch : guillemets neutralisés, termes reliés par OR", () => {
    expect(websearchQuery(["Web-Designer", 'a "b" c', "  "])).toBe('"Web-Designer" OR "a b c"');
  });
});

describe("géographie", () => {
  it("trouve une ville par son nom local ou son exonyme, dans le bon pays", () => {
    expect(findCity("Munich", "DE")?.nom).toBe("Munich");
    expect(findCity("münchen", "DE")?.nom).toBe("Munich");
    expect(findCity("Lyon", "FR")?.pays).toBe("FR");
    expect(findCity("Lyon", "DE")).toBeUndefined();
  });

  it("distance Berlin–Paris ≈ 878 km ; score de lieu borné", () => {
    const berlin = findCity("Berlin", "DE")!;
    const paris = findCity("Paris", "FR")!;
    expect(distanceKm(berlin, paris)).toBeGreaterThan(870);
    expect(distanceKm(berlin, paris)).toBeLessThan(890);
    expect(locationScore(berlin, berlin, 25)).toBe(1);
    expect(locationScore(berlin, paris, 25)).toBe(0);
    expect(locationScore(berlin, { lat: null, lon: null }, 25)).toBeNull();
  });
});

describe("fusion RRF", () => {
  it("additionne les rangs réciproques des deux listes", () => {
    const fused = reciprocalRankFusion([
      ["a", "b", "c"],
      ["c", "a"],
    ]);
    expect(fused.map((f) => f.id)).toEqual(["a", "c", "b"]);
    expect(fused[0]!.score).toBeCloseTo(1 / 61 + 1 / 62);
  });
});

describe("anonymisation", () => {
  const profile = Profile.parse({
    ...leaProfile,
    work: [
      {
        ...leaProfile.work![0]!,
        highlights: ["Contact : lea.martin@example.org ou +33 6 12 34 56 78, https://lea.example.org"],
      },
    ],
  });
  const anonymous = matchingProfile(profile);

  it("retire nom, e-mail, téléphone, liens, employeur et établissement", () => {
    for (const forbidden of ["Léa", "Martin", "lea.martin", "+33", "https://", "Transports Rhône", "INSA"]) {
      expect(anonymous.text).not.toContain(forbidden);
    }
    expect(anonymous.text).toContain("Développeuse back-end");
    expect(anonymous.skills).toEqual(["Node.js", "Express", "PostgreSQL"]);
  });

  it("scrubContacts remplace les numéros français, allemands et internationaux", () => {
    expect(scrubContacts("Tél. 06 12 34 56 78")).toBe("Tél. [retiré]");
    expect(scrubContacts("Handy 0151 12345678, Büro 030/1234567")).toBe("Handy [retiré], Büro [retiré]");
  });

  it("retire du texte libre le nom, l'employeur, l'établissement et la ville déclarés", () => {
    const p = matchingProfile(
      Profile.parse({
        ...leaProfile,
        basics: {
          ...leaProfile.basics,
          summary: "Je suis Léa Martin, à Lyon, ex-Transports Rhône et INSA Lyon.",
        },
        skills: [{ name: "Node.js", keywords: ["Express", "Rhône"] }],
      }),
    );
    for (const forbidden of ["Léa", "Martin", "Lyon", "Transports", "INSA"])
      expect(p.text).not.toContain(forbidden);
    // Terme identifiant aussi déclaré comme compétence : gardé pour le matching.
    expect(p.text).toContain("Rhône");
    // Corpus local (jamais envoyé) : complet, pour ne pas signaler une compétence écrite.
    expect(p.corpus).toContain("Transports Rhône");
  });

  it("couverture et compétences manquantes calculées sans modèle", () => {
    const posting = { title: "Backend-Entwickler", body: "Node.js, PostgreSQL und GraphQL", lang: "de" };
    expect(coverage(posting, anonymous)).toBeCloseTo(2 / 3);
    expect(deterministicMissing(posting, anonymous)).toEqual(["GraphQL"]);
    // Limite connue : en allemand, un nom d'outil sans signe distinctif échappe au
    // repérage sans modèle ; seul le rerank LLM le signale.
    expect(deterministicMissing({ ...posting, body: "Kubernetes" }, anonymous)).toEqual([]);
    expect(coverage({ ...posting, body: "Teamarbeit" }, anonymous)).toBeNull();
  });
});

describe("rapport 2 : écarts de compétences", () => {
  const paid = (min: number, skills: string[]) => ({
    missingSkills: skills,
    salaryMinEur: min,
    salaryMaxEur: min + 10_000,
  });

  it("priorité = 0,5 × fréquence + 0,3 × écart de salaire − 0,2 × effort", () => {
    const postings = [
      paid(60_000, ["Kubernetes"]),
      paid(62_000, ["Kubernetes"]),
      paid(64_000, ["Kubernetes", "Go"]),
      paid(45_000, []),
      paid(46_000, ["Go"]),
      paid(47_000, []),
    ];
    const [first, second] = skillGaps(postings, ["Node.js"]);
    expect(first!.skill).toBe("Kubernetes");
    expect(first!.frequency).toBe(0.5);
    expect(first!.salary.status).toBe("ok");
    // Écart de médianes ≥ 30 % : composante salaire à 1.
    expect(first!.priority).toBeCloseTo(0.5 * 0.5 + 0.3 * 1 - 0.2 * 0.5);
    expect(second!.skill).toBe("Go");
  });

  it("moins de 3 salaires de chaque côté : données insuffisantes, composante nulle", () => {
    const [gap] = skillGaps([{ missingSkills: ["Terraform"], salaryMinEur: null, salaryMaxEur: null }], []);
    expect(gap!.salary).toEqual({ status: "insuffisant", sample: 0 });
    expect(gap!.priority).toBeCloseTo(0.5 * 1 - 0.2 * 0.5);
  });

  it("effort réduit si un outil voisin figure dans le profil", () => {
    const [gap] = skillGaps(
      [{ missingSkills: ["React Native"], salaryMinEur: null, salaryMaxEur: null }],
      ["React"],
    );
    expect(gap!.effort).toBe(0.25);
  });

  it("aucune offre : aucun écart", () => {
    expect(skillGaps([], ["Node.js"])).toEqual([]);
  });
});

describe("vecteurs par hachage (tests uniquement)", () => {
  it("dimension 1024, norme 1, déterministes", async () => {
    const e = new HashEmbeddings();
    const [a, b] = await e.embed(["Node.js PostgreSQL", "Node.js PostgreSQL"]);
    expect(a).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...a!)).toBeCloseTo(1);
    expect(a).toEqual(b);
  });
});

describe("connecteur BA Jobsuche (réponses fictives)", () => {
  const detail = {
    referenznummer: "10000-0000000001-S",
    stellenangebotsTitel: "Backend-Entwickler (m/w/d)",
    stellenangebotsBeschreibung: "<p>Node.js und Kubernetes</p>",
    firma: "Beispiel GmbH",
    stellenlokationen: [{ adresse: { ort: "Berlin" }, breite: 52.52, laenge: 13.4 }],
    datumErsteVeroeffentlichung: "2026-10-15",
    arbeitszeitVollzeit: true,
    arbeitszeitTeilzeitVormittag: false,
    verguetungsangabe: "MONATSGEHALT",
    festgehalt: 4000,
  };

  it("normalise une offre : temps plein, salaire mensuel annualisé, lien public", () => {
    const p = baPosting(detail);
    expect(p).toMatchObject({
      source: "ba",
      title: "Backend-Entwickler (m/w/d)",
      body: "Node.js und Kubernetes",
      city: "Berlin",
      workingTime: "plein",
      salaryMinEur: 48_000,
      lang: "de",
      url: "https://www.arbeitsagentur.de/jobsuche/jobdetail/10000-0000000001-S",
    });
  });

  it("offre republiée : date de la publication en cours, et non de la première", () => {
    const p = baPosting({
      ...detail,
      datumErsteVeroeffentlichung: "2026-04-10",
      veroeffentlichungszeitraum: { von: "2026-10-14" },
    });
    expect(p.postedAt).toBe("2026-10-14");
  });

  it("taux horaire non converti ; offre ouverte aux deux temps non classée", () => {
    const p = baPosting({
      ...detail,
      verguetungsangabe: "STUNDENLOHN",
      festgehalt: 21,
      arbeitszeitTeilzeitVormittag: true,
    });
    expect(p.salaryMinEur).toBeNull();
    expect(p.workingTime).toBeNull();
  });

  it("recherche, saute les offres connues, respecte le budget de requêtes", async () => {
    const calls: string[] = [];
    const fetchFn = fakeFetch(
      {
        "/pc/v6/jobs": {
          ergebnisliste: [{ referenznummer: "A" }, { referenznummer: "B" }, { referenznummer: "C" }],
        },
        "/pc/v4/jobdetails/": detail,
      },
      calls,
    );
    const source = new BaJobsuche(fetchFn);
    const budget = new RequestBudget(3);
    const found = [];
    for await (const p of source.search(
      { country: "DE", occupation: "Backend-Entwickler", city: "Berlin", radiusKm: 25, sinceDays: 3 },
      { isKnown: async (id) => id === "A", budget },
    ))
      found.push(p);
    // 1 recherche + 2 détails (A connue) = 3 requêtes, plafond atteint.
    expect(found).toHaveLength(2);
    expect(budget.spent).toBe(3);
    expect(calls[0]).toContain("was=Backend-Entwickler");
    expect(calls[0]).toContain("umkreis=25");
  });

  it("ne cherche pas hors d'Allemagne ; format inattendu : erreur visible", async () => {
    const source = new BaJobsuche(fakeFetch({ "/pc/v6/jobs": { ergebnisliste: [{ ref: 1 }] } }));
    const run = async (country: "DE" | "FR") => {
      const out = [];
      for await (const p of source.search(
        { country, occupation: "x", city: "Berlin", radiusKm: 10, sinceDays: 1 },
        { isKnown: async () => false, budget: new RequestBudget(5) },
      ))
        out.push(p);
      return out;
    };
    expect(await run("FR")).toEqual([]);
    await expect(run("DE")).rejects.toThrow();
  });

  it("source en erreur HTTP : SourceError avec le statut, sans l'URL", async () => {
    const source = new BaJobsuche(async () => ({ ok: false, status: 503, json: async () => ({}) }));
    const results = source.search(
      { country: "DE", occupation: "x", city: "Berlin", radiusKm: 10, sinceDays: 1 },
      { isKnown: async () => false, budget: new RequestBudget(5) },
    );
    const iterator = results[Symbol.asyncIterator]();
    const error = await iterator.next().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SourceError);
    expect((error as SourceError).status).toBe(503);
    expect((error as Error).message).not.toContain("http");
  });
});

describe("ingestion tolérante aux offres isolées", () => {
  it("BA : offre retirée (404) ou détail mal formé : ignorée et comptée, la suite continue", async () => {
    let call = 0;
    const fetchFn: Fetch = async (url) => {
      if (url.includes("/pc/v6/jobs"))
        return {
          ok: true,
          status: 200,
          json: async () => ({
            ergebnisliste: [{ referenznummer: "A" }, { referenznummer: "B" }, { referenznummer: "C" }],
          }),
        };
      call++;
      if (call === 1) return { ok: false, status: 404, json: async () => ({}) };
      if (call === 2) return { ok: true, status: 200, json: async () => ({ referenznummer: "B" }) };
      return {
        ok: true,
        status: 200,
        json: async () => ({
          referenznummer: "C",
          stellenangebotsTitel: "Dev",
          datumErsteVeroeffentlichung: "2026-10-15",
        }),
      };
    };
    let skipped = 0;
    const found = [];
    for await (const p of new BaJobsuche(fetchFn).search(
      { country: "DE", occupation: "Dev", city: "Berlin", radiusKm: 25, sinceDays: 3 },
      { isKnown: async () => false, budget: new RequestBudget(10), onSkip: () => skipped++ },
    ))
      found.push(p.externalId);
    expect(found).toEqual(["C"]);
    expect(skipped).toBe(2);
  });

  it("BA : panne de la source (503) sur un détail : la recherche s'interrompt (relance pg-boss)", async () => {
    const fetchFn: Fetch = async (url) =>
      url.includes("/pc/v6/jobs")
        ? { ok: true, status: 200, json: async () => ({ ergebnisliste: [{ referenznummer: "A" }] }) }
        : { ok: false, status: 503, json: async () => ({}) };
    const run = async () => {
      const found = [];
      for await (const p of new BaJobsuche(fetchFn).search(
        { country: "DE", occupation: "Dev", city: "Berlin", radiusKm: 25, sinceDays: 3 },
        { isKnown: async () => false, budget: new RequestBudget(10) },
      ))
        found.push(p);
      return found;
    };
    await expect(run()).rejects.toThrow(SourceError);
  });
});

describe("e-mails : erreurs SMTP assainies", () => {
  it("aucune adresse dans l'erreur ; échec de connexion : message certainement pas parti", async () => {
    const mailer = new SmtpMailer("smtp://127.0.0.1:9", "Attesta <x@attesta.localhost>");
    const error = await mailer
      .send({ to: "destinataire.secret@example.org", subject: "s", text: "t", html: "<p>t</p>" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(JSON.stringify({ ...(error as object), message: (error as Error).message })).not.toContain(
      "destinataire",
    );
    expect((error as MailError).notSent).toBe(true);
  });
});

describe("connecteur Adzuna (réponses fictives)", () => {
  const result = {
    id: 42,
    title: "<strong>Développeur</strong> back-end",
    description: "Node.js et Kubernetes…",
    created: "2026-10-15T08:00:00Z",
    redirect_url: "https://www.adzuna.fr/details/42",
    company: { display_name: "Exemple SAS" },
    location: { display_name: "Lyon, Rhône", area: ["France", "Rhône", "Lyon"] },
    latitude: 45.76,
    longitude: 4.83,
    salary_min: 45_000,
    salary_max: 55_000,
    salary_is_predicted: "0",
    contract_time: "full_time",
  };

  const search = async (results: unknown[]) => {
    const calls: string[] = [];
    const source = new Adzuna(
      { appId: "id", appKey: "cle" },
      fakeFetch({ "api.adzuna.com": { results } }, calls),
    );
    const found = [];
    for await (const p of source.search(
      { country: "FR", occupation: "Développeur", city: "Lyon", radiusKm: 25, sinceDays: 3 },
      { isKnown: async () => false, budget: new RequestBudget(5) },
    ))
      found.push(p);
    return { found, calls };
  };

  it("normalise ; un salaire estimé par Adzuna n'est jamais repris", async () => {
    const { found, calls } = await search([result, { ...result, id: 43, salary_is_predicted: "1" }]);
    expect(found[0]).toMatchObject({
      externalId: "42",
      title: "Développeur back-end",
      city: "Lyon",
      salaryMinEur: 45_000,
      workingTime: "plein",
      lang: "fr",
    });
    expect(found[1]!.salaryMinEur).toBeNull();
    expect(calls[0]).toContain("/jobs/fr/search/1?");
  });

  it("résultat mal formé (lien non http(s)) : écarté seul, les autres sont gardés", async () => {
    const { found } = await search([{ ...result, id: 1, redirect_url: "javascript:alert(1)" }, result]);
    expect(found.map((p) => p.externalId)).toEqual(["42"]);
  });
});

describe("ESCO, pivot entre langues", () => {
  const response = {
    _embedded: {
      results: [
        {
          uri: "http://data.europa.eu/esco/occupation/1",
          preferredLabel: {
            fr: "développeur web/développeuse web",
            de: "Web-Designer/Web-Designerin",
            "en-us": "web developer",
          },
        },
      ],
    },
  };

  it("garde la première forme des libellés et met la réponse en cache", async () => {
    const calls: string[] = [];
    const store = new Map<string, Occupation[]>();
    const cache = {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: Occupation[]) => void store.set(k, v),
    };
    const esco = new EscoClient(cache, fakeFetch({ "esco/api/search": response }, calls));
    const first = await esco.occupations("Développeur web", "fr");
    await esco.occupations("developpeur  WEB", "fr");
    expect(first[0]!.labels).toEqual({ fr: "développeur web", de: "Web-Designer", en: "web developer" });
    expect(calls).toHaveLength(1);
  });

  it("intitulés par langue : la saisie de l'abonné d'abord, puis les libellés ESCO de la langue", () => {
    const occupations: Occupation[] = [{ uri: "u", labels: { fr: "développeur web", de: "Web-Designer" } }];
    const own = ["Développeur web", "Intégrateur"];
    expect(searchTitles(own, occupations, "fr")).toEqual(["Développeur web", "Intégrateur"]);
    expect(searchTitles(own, occupations, "de")).toEqual(["Développeur web", "Intégrateur", "Web-Designer"]);
  });

  it("rapprochement écarté s'il ne contient pas le mot principal de l'intitulé", async () => {
    const store = new Map<string, Occupation[]>();
    const cache = {
      get: async (k: string) => store.get(k),
      set: async (k: string, v: Occupation[]) => void store.set(k, v),
    };
    const fetchFn = fakeFetch({
      "esco/api/search": {
        _embedded: {
          results: [
            { uri: "a", preferredLabel: { fr: "agent de back-office", de: "Back-Office-Mitarbeiter" } },
            { uri: "b", preferredLabel: { fr: "développeur de jeux numériques", de: "Game-Programmierer" } },
          ],
        },
      },
    });
    const found = await new EscoClient(cache, fetchFn).occupations("Développeur back-end", "fr");
    expect(found.map((o) => o.uri)).toEqual(["b"]);
  });
});

describe("e-mails", () => {
  it("rapport quotidien : désabonnement en un clic (RFC 8058), deux pièces jointes, aucun suivi", () => {
    const message = dailyReportMessage({
      to: "abonne@example.org",
      deliveryId: "00000000-0000-4000-8000-000000000001",
      date: "16/10/2026",
      offers: [{ title: "Dev <script>", company: "X", url: "https://example.org/1" }],
      unsubscribeUrl: "https://attesta.example/veille/desabonner/jeton",
      attachments: [
        { filename: "a.pdf", content: new Uint8Array([1]), contentType: "application/pdf" },
        { filename: "b.pdf", content: new Uint8Array([2]), contentType: "application/pdf" },
      ],
    });
    expect(message.headers).toEqual({
      "List-Unsubscribe": "<https://attesta.example/veille/desabonner/jeton>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Mailin-custom": "00000000-0000-4000-8000-000000000001",
    });
    expect(message.subject).toBe("Attesta – 1 nouvelle offre (16/10/2026)");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toMatch(/<img/i);
    expect(message.attachments).toHaveLength(2);
  });

  it("liens de connexion et de confirmation présents dans le texte et le HTML", () => {
    for (const m of [
      loginLinkMessage("a@example.org", "https://x.example/compte/connexion/t"),
      confirmSubscriptionMessage("a@example.org", "https://x.example/veille/confirmer/t"),
    ]) {
      expect(m.text).toMatch(/https:\/\/x\.example\//);
      expect(m.html).toMatch(/href="https:\/\/x\.example\//);
      expect(m.headers).toBeUndefined();
    }
  });

  it("libellé des critères", () => {
    expect(
      criteriaLabel({ occupations: ["Dev web"], city: "Berlin", radiusKm: 25, workingTime: "plein" }),
    ).toBe("Dev web · Berlin (25 km) · temps plein");
  });
});

describe("client TEI (faux serveur local)", () => {
  async function server(reply: (inputs: string[]) => unknown, status = 200) {
    const { createServer } = await import("node:http");
    const received: { inputs: string[]; truncate: boolean }[] = [];
    const srv = createServer((req, res) => {
      let body = "";
      req
        .on("data", (d) => (body += d))
        .on("end", () => {
          const parsed = JSON.parse(body);
          received.push(parsed);
          res
            .writeHead(status, { "content-type": "application/json" })
            .end(JSON.stringify(reply(parsed.inputs)));
        });
    });
    await new Promise<void>((resolve) => srv.listen(0, "127.0.0.1", resolve));
    const { port } = srv.address() as { port: number };
    return { url: `http://127.0.0.1:${port}`, received, close: () => srv.close() };
  }
  const vec = () => new Array(EMBEDDING_DIMENSIONS).fill(0.01);

  it("envoie par lots, tronque les textes, renvoie les vecteurs dans l'ordre", async () => {
    const s = await server((inputs) => inputs.map(vec));
    try {
      const tei = new TeiEmbeddings(s.url, { batchSize: 2 });
      const vectors = await tei.embed(["a", "b", "c".repeat(5000)]);
      expect(vectors).toHaveLength(3);
      expect(s.received.map((r) => r.inputs.length)).toEqual([2, 1]);
      expect(s.received[1]!.inputs[0]).toHaveLength(EMBEDDING_MAX_CHARS);
      expect(s.received[0]!.truncate).toBe(true);
    } finally {
      s.close();
    }
  });

  it("dimension inattendue, erreur HTTP, serveur injoignable : EmbeddingError", async () => {
    const wrong = await server((inputs) => inputs.map(() => [1, 2, 3]));
    const failing = await server(() => ({}), 503);
    try {
      await expect(new TeiEmbeddings(wrong.url).embed(["a"])).rejects.toThrow(EmbeddingError);
      await expect(new TeiEmbeddings(failing.url).embed(["a"])).rejects.toThrow(/503/);
      await expect(new TeiEmbeddings("http://127.0.0.1:9").embed(["a"])).rejects.toThrow(/injoignable/);
    } finally {
      wrong.close();
      failing.close();
    }
  });

  it("jeton d'identité Google exigé mais indisponible (hors Google Cloud) : erreur explicite", async () => {
    const s = await server((inputs) => inputs.map(vec));
    try {
      await expect(new TeiEmbeddings(s.url, { googleIdToken: true }).embed(["a"])).rejects.toThrow(/jeton/);
      expect(s.received).toHaveLength(0);
    } finally {
      s.close();
    }
  });
});
