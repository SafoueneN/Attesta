import { Profile, type OfferAnalysis } from "@attesta/schema";
import type { DraftOutput, OfferAnalysisOutput } from "../src/index.js";

/** Profil fictif de la persona Léa. Aucune donnée réelle. */
export const lea = Profile.parse({
  basics: {
    name: "Léa Martin",
    label: "Développeuse back-end",
    email: "lea.martin@example.org",
    phone: "+33 6 00 00 00 00",
    location: { city: "Lyon", countryCode: "FR" },
    summary: "Développeuse back-end, 5 ans d'expérience sur des API Node.js.",
  },
  work: [
    {
      name: "Transports Rhône",
      position: "Développeuse back-end",
      startDate: "2021-03",
      highlights: [
        "Migration de 12 services Express vers Node.js 20",
        "Réduction de 40 % du temps de réponse de l'API de réservation",
        "Participation aux revues de code de l'équipe",
      ],
    },
    {
      name: "Agence Web Sud",
      position: "Développeuse junior",
      startDate: "2019-09",
      endDate: "2021-02",
      highlights: ["Maintenance de sites PHP pour 20 clients"],
    },
  ],
  education: [
    { institution: "INSA Lyon", studyType: "Diplôme d'ingénieur", area: "Informatique", endDate: "2019" },
  ],
  skills: [
    { name: "Node.js", keywords: ["Express", "PostgreSQL"] },
    { name: "Docker", keywords: [] },
  ],
  languages: [{ language: "Anglais", fluency: "C1" }],
});

export const offerText = `Développeur back-end Node.js (H/F) – CDI – Lyon
Vous concevez des API performantes en Node.js et PostgreSQL.
Une expérience de Kubernetes est un plus.`;

export const analysisOutput: OfferAnalysisOutput = {
  title: "Développeur back-end Node.js (H/F)",
  company: null,
  language: "fr",
  location: "Lyon",
  contractType: "cdi",
  requirements: [
    {
      text: "API performantes en Node.js et PostgreSQL",
      priority: "must",
      skills: ["Node.js", "PostgreSQL"],
    },
    { text: "Expérience de Kubernetes", priority: "nice", skills: ["Kubernetes"] },
  ],
  keywords: [
    { term: "Node.js", weight: 1 },
    { term: "PostgreSQL", weight: 0.9 },
    { term: "API", weight: 0.8 },
    { term: "Kubernetes", weight: 0.4 },
  ],
};

export const analysis: OfferAnalysis = {
  title: analysisOutput.title,
  language: "fr",
  location: "Lyon",
  contractType: "cdi",
  requirements: analysisOutput.requirements,
  keywords: analysisOutput.keywords,
};

/** Rédaction fidèle : chaque ligne reprend des faits cités. L'expérience 2 est omise (le code la rajoute). */
export const honestDraft: DraftOutput = {
  headline: { text: "Développeuse back-end Node.js", sources: ["/basics/label", "/skills/0"] },
  summary: [{ text: "5 ans d'expérience sur des API Node.js", sources: ["/basics/summary"] }],
  work: [
    {
      ref: "/work/0",
      highlights: [
        {
          text: "Réduction de 40 % du temps de réponse d'une API de réservation",
          sources: ["/work/0/highlights/1"],
        },
        { text: "Migration de 12 services Express vers Node.js 20", sources: ["/work/0/highlights/0"] },
      ],
    },
  ],
  projects: [],
  skills: ["/skills/0", "/skills/1"],
};

/** Rédaction piégée : chiffre modifié, outil inventé, compétence de l'offre ajoutée, source inventée. */
export const inventedDraft: DraftOutput = {
  headline: { text: "Développeuse back-end Node.js", sources: ["/basics/label", "/skills/0"] },
  summary: [{ text: "Experte Kubernetes avec 5 ans d'expérience", sources: ["/basics/summary"] }],
  work: [
    {
      ref: "/work/0",
      highlights: [
        {
          text: "Réduction de 60 % du temps de réponse de l'API de réservation",
          sources: ["/work/0/highlights/1"],
        },
        {
          text: "Migration de 12 services vers Node.js 20 sur AWS Lambda",
          sources: ["/work/0/highlights/0"],
        },
        { text: "Mise en place de la CI", sources: ["/work/0/highlights/9"] },
        { text: "Migration de 12 services Express vers Node.js 20", sources: ["/work/0/highlights/0"] },
      ],
    },
  ],
  projects: [],
  skills: ["/skills/0"],
};
