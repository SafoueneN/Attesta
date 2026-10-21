/**
 * Libellés du CV par langue. Le français est la seule langue livrée (décision Q4) ;
 * ajouter une langue revient à ajouter une entrée ici.
 */
export const CV_LABELS = {
  fr: {
    summary: "Profil",
    work: "Expérience professionnelle",
    education: "Formation",
    skills: "Compétences",
    languages: "Langues",
    projects: "Projets",
    certificates: "Certifications",
    present: "aujourd'hui",
    courses: "Cours",
    documentTitle: "CV",
  },
} as const;

export type CvLang = keyof typeof CV_LABELS;
export type CvLabels = (typeof CV_LABELS)[CvLang];
