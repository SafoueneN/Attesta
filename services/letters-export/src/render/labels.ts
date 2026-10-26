/**
 * Libellés du CV par langue. Le français est la langue de l'interface (décision Q4) ; l'anglais et
 * l'allemand servent au CV traduit (ADR 0029). Ajouter une langue revient à ajouter une entrée ici.
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
  // CV traduit (ADR 0029, point 6) : rubriques dans la langue de la traduction.
  en: {
    summary: "Profile",
    work: "Professional experience",
    education: "Education",
    skills: "Skills",
    languages: "Languages",
    projects: "Projects",
    certificates: "Certifications",
    present: "present",
    courses: "Courses",
    documentTitle: "CV",
  },
  de: {
    summary: "Profil",
    work: "Berufserfahrung",
    education: "Ausbildung",
    skills: "Kenntnisse",
    languages: "Sprachen",
    projects: "Projekte",
    certificates: "Zertifikate",
    present: "heute",
    courses: "Kurse",
    documentTitle: "Lebenslauf",
  },
} as const;

export type CvLang = keyof typeof CV_LABELS;
export type CvLabels = (typeof CV_LABELS)[CvLang];
