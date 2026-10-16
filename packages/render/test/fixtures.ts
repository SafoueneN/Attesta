import { Profile } from "@attesta/schema";

/** Profil fictif complet (persona Léa), toutes sections renseignées. */
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
      location: "Lyon",
      startDate: "2021-03",
      highlights: [
        "Migration de 12 services Express vers Node.js 20",
        "Réduction de 40 % du temps de réponse de l'API de réservation",
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
    {
      institution: "INSA Lyon",
      studyType: "Diplôme d'ingénieur",
      area: "Informatique",
      startDate: "2014-09",
      endDate: "2019-06",
    },
  ],
  skills: [
    { name: "Node.js", keywords: ["Express", "PostgreSQL"] },
    { name: "Docker", keywords: [] },
  ],
  languages: [
    { language: "Français", fluency: "langue maternelle" },
    { language: "Anglais", fluency: "C1" },
  ],
  certificates: [{ name: "AWS Cloud Practitioner", issuer: "Amazon", date: "2023-05" }],
});
