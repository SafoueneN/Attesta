import { describe, expect, it } from "vitest";
import { EmployerBoards, type Employer } from "../src/sources/employers.js";
import type { Fetch } from "../src/sources/http.js";
import { RequestBudget, type Posting, type SourceQuery } from "../src/types.js";

/*
 * Campagne QA (A-05) : sites carrière des employeurs (Greenhouse, Lever, SmartRecruiters) sur des réponses
 * enregistrées. Cas nominaux, tableaux vides, offres et réponses malformées, panne d'un employeur, budget,
 * cache, filtres métier, période et rayon. Aucun réseau.
 */

const today = new Date().toISOString();
const old = new Date(Date.now() - 60 * 86_400_000).toISOString();

const greenhouse = {
  jobs: [
    {
      id: 1,
      title: "Backend Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/1",
      location: { name: "Berlin, Germany" },
      first_published: today,
      updated_at: today,
      language: "en",
      content: "&lt;p&gt;We build &amp;amp; run APIs.&lt;/p&gt;",
      departments: [{ name: "Engineering" }],
    },
    { id: 2, title: "", absolute_url: "pas-une-url", updated_at: today },
    {
      id: 3,
      title: "Backend Engineer (ancienne)",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/3",
      location: { name: "Berlin" },
      updated_at: old,
    },
    {
      id: 4,
      title: "Office Manager",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/4",
      location: { name: "Berlin" },
      updated_at: today,
    },
    {
      id: 5,
      title: "Backend Engineer",
      absolute_url: "https://boards.greenhouse.io/acme/jobs/5",
      location: { name: "München" },
      updated_at: today,
    },
  ],
};

const lever = [
  {
    id: "lv-1",
    text: "Senior Backend Developer",
    hostedUrl: "https://jobs.lever.co/beta/lv-1",
    createdAt: Date.now(),
    descriptionPlain:
      "  Wir suchen Verstärkung für unser Backend-Team in Berlin. Sie arbeiten mit der Plattform und die Kollegen unterstützen Sie.  ",
    categories: { location: "Remote", allLocations: ["Berlin"], commitment: "Teilzeit", team: "Platform" },
  },
  { id: "lv-2", text: "Backend", hostedUrl: "ftp://jobs.lever.co/beta/lv-2", createdAt: Date.now() },
];

const smart = {
  content: [
    {
      id: "sr-1",
      name: "Backend Developer (m/w/d)",
      releasedDate: today,
      location: { city: "Potsdam", country: "de", latitude: "52.39", longitude: "13.06" },
      company: { name: "Gamma AG" },
      typeOfEmployment: { label: "Full-time" },
      function: { label: "Engineering" },
    },
    { id: "sr-2", releasedDate: today },
  ],
};

const EMPLOYERS: Employer[] = [
  { ats: "greenhouse", id: "acme", name: "Acme" },
  { ats: "lever", id: "beta", name: "Beta" },
  { ats: "smartrecruiters", id: "gamma", name: "Gamma" },
];

function fetchFrom(routes: Record<string, unknown>, calls: string[] = []): Fetch {
  return async (url) => {
    calls.push(url);
    const hit = Object.entries(routes).find(([part]) => url.includes(part));
    if (!hit || hit[1] === 503) return { ok: false, status: 503, json: async () => ({}) } as never;
    return { ok: true, status: 200, json: async () => hit[1] } as never;
  };
}

const query: SourceQuery = {
  country: "DE",
  occupation: "Backend",
  city: "Berlin",
  radiusKm: 50,
  sinceDays: 3,
};

async function run(source: EmployerBoards, q = query, budget = new RequestBudget(10), known: string[] = []) {
  const skipped = { n: 0 };
  const out: Posting[] = [];
  for await (const p of source.search(q, {
    budget,
    isKnown: async (id) => known.includes(id),
    onSkip: () => skipped.n++,
  }))
    out.push(p);
  return { out, skipped: skipped.n };
}

describe("EmployerBoards (campagne QA)", () => {
  it("lit les trois logiciels, filtre métier, période de 14 jours et rayon, et compte les offres malformées", async () => {
    const source = new EmployerBoards(
      EMPLOYERS,
      fetchFrom({ greenhouse: greenhouse, lever: lever, smartrecruiters: smart }),
    );
    const { out, skipped } = await run(source);
    expect(out.map((p) => p.externalId)).toEqual([
      "greenhouse:acme:1",
      "lever:beta:lv-1",
      "smartrecruiters:gamma:sr-1",
    ]);
    // Une offre malformée par logiciel : id 2 (Greenhouse), lv-2 (Lever), sr-2 (SmartRecruiters).
    expect(skipped).toBe(3);
  });

  it("normalise chaque offre : HTML décodé, langue, temps de travail, ville, coordonnées, entreprise", async () => {
    const source = new EmployerBoards(
      EMPLOYERS,
      fetchFrom({ greenhouse: greenhouse, lever: lever, smartrecruiters: smart }),
    );
    const [gh, lv, sr] = (await run(source)).out;
    expect(gh).toMatchObject({
      title: "Backend Engineer",
      company: "Acme",
      lang: "en",
      country: "DE",
      city: "Berlin",
    });
    expect(gh!.body).toContain("We build & run APIs.");
    expect(gh!.body).not.toContain("<p>");
    expect({ workingTime: lv!.workingTime, city: lv!.city, lang: lv!.lang }).toEqual({
      workingTime: "partiel",
      city: "Berlin",
      lang: "de",
    });
    expect(lv!.body).toBe(
      "Wir suchen Verstärkung für unser Backend-Team in Berlin. Sie arbeiten mit der Plattform und die Kollegen unterstützen Sie.",
    );
    expect(sr).toMatchObject({ company: "Gamma AG", workingTime: "plein", lat: 52.39, lon: 13.06 });
    expect(sr!.url).toBe("https://jobs.smartrecruiters.com/gamma/sr-1");
    expect(sr!.body).toBe("Backend Developer (m/w/d)\nEngineering · Full-time");
  });

  it("transmet métier et pays à SmartRecruiters (recherche côté serveur)", async () => {
    const calls: string[] = [];
    await run(new EmployerBoards([EMPLOYERS[2]!], fetchFrom({ smartrecruiters: smart }, calls)));
    const url = new URL(calls[0]!);
    expect(url.searchParams.get("q")).toBe("Backend");
    expect(url.searchParams.get("country")).toBe("de");
  });

  it("ne renvoie rien pour des tableaux vides, sans erreur", async () => {
    const source = new EmployerBoards(
      EMPLOYERS,
      fetchFrom({ greenhouse: { jobs: [] }, lever: [], smartrecruiters: { content: [] } }),
    );
    expect(await run(source)).toEqual({ out: [], skipped: 0 });
  });

  it("continue avec les autres employeurs si l'un est en panne ou renvoie une réponse malformée", async () => {
    const source = new EmployerBoards(
      EMPLOYERS,
      fetchFrom({ greenhouse: 503, lever: { pas: "un tableau" }, smartrecruiters: smart }),
    );
    const { out, skipped } = await run(source);
    expect(out.map((p) => p.externalId)).toEqual(["smartrecruiters:gamma:sr-1"]);
    expect(skipped).toBe(3); // panne + réponse malformée + offre sr-2
  });

  it("lit un tableau Greenhouse une seule fois par période de cache", async () => {
    const calls: string[] = [];
    const source = new EmployerBoards([EMPLOYERS[0]!], fetchFrom({ greenhouse: greenhouse }, calls));
    await run(source);
    await run(source, { ...query, occupation: "Engineer" });
    expect(calls).toHaveLength(1);
  });

  it("s'arrête quand le budget de requêtes est épuisé", async () => {
    const calls: string[] = [];
    const source = new EmployerBoards(EMPLOYERS, fetchFrom({ greenhouse: greenhouse, lever: lever }, calls));
    const { out } = await run(source, query, new RequestBudget(0));
    expect(out).toEqual([]);
    expect(calls).toEqual([]);
  });

  it("écarte les offres déjà connues, et ne cherche rien hors d'une ville connue", async () => {
    const source = new EmployerBoards([EMPLOYERS[0]!], fetchFrom({ greenhouse: greenhouse }));
    expect((await run(source, query, new RequestBudget(10), ["greenhouse:acme:1"])).out).toEqual([]);
    expect((await run(source, { ...query, city: "Atlantis" })).out).toEqual([]);
  });

  it("élargit le rayon : München (≈ 500 km) entre avec 600 km", async () => {
    const source = new EmployerBoards([EMPLOYERS[0]!], fetchFrom({ greenhouse: greenhouse }));
    const ids = (await run(source, { ...query, radiusKm: 600 })).out.map((p) => p.externalId);
    expect(ids).toContain("greenhouse:acme:5");
  });

  it("limite connue : une description allemande de moins de 5 mots-outils est classée « en »", async () => {
    const short = [{ ...lever[0], descriptionPlain: "Wir suchen Verstärkung für das Team." }];
    const source = new EmployerBoards([EMPLOYERS[1]!], fetchFrom({ lever: short }));
    expect((await run(source)).out[0]!.lang).toBe("en");
  });
});
