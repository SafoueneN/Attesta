import type { ProfileInput } from "../src/index.js";

/** Profil fictif de la persona Léa, développeuse back-end. */
export const leaProfile: ProfileInput = {
  basics: {
    name: "Léa Martin",
    label: "Développeuse back-end",
    email: "lea.martin@example.org",
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
      ],
    },
  ],
  education: [{ institution: "INSA Lyon", studyType: "Diplôme d'ingénieur", area: "Informatique", endDate: "2019" }],
  skills: [{ name: "Node.js", keywords: ["Express", "PostgreSQL"] }],
};
