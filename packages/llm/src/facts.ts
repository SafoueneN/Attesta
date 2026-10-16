import type { Profile } from "@attesta/schema";

/** Un fait du profil, désigné par son pointeur JSON. Seule matière autorisée pour la rédaction. */
export interface Fact {
  pointer: string;
  text: string;
}

/** Entrée de parcours présentée au modèle, sans employeur ni établissement (minimisation). */
export interface EntryOutline {
  ref: string;
  title: string;
  period: string;
}

/**
 * Faits rédigeables du profil. Nom, e-mail, téléphone, adresse, liens, employeurs
 * et établissements n'en font pas partie : le modèle n'en a pas besoin pour
 * reformuler, et le code les réinjecte au rendu (docs/adr/0006).
 */
export function profileFacts(profile: Profile): Fact[] {
  const facts: Fact[] = [];
  const add = (pointer: string, text: string | undefined) => {
    if (text?.trim()) facts.push({ pointer, text });
  };
  add("/basics/label", profile.basics.label);
  add("/basics/summary", profile.basics.summary);
  profile.work.forEach((w, i) => {
    add(`/work/${i}/position`, w.position);
    add(`/work/${i}/summary`, w.summary);
    w.highlights.forEach((h, j) => add(`/work/${i}/highlights/${j}`, h));
  });
  profile.projects.forEach((p, i) => {
    add(`/projects/${i}/name`, p.name);
    add(`/projects/${i}/description`, p.description);
    p.highlights.forEach((h, j) => add(`/projects/${i}/highlights/${j}`, h));
  });
  profile.skills.forEach((s, i) =>
    add(`/skills/${i}`, s.keywords.length ? `${s.name} : ${s.keywords.join(", ")}` : s.name),
  );
  return facts;
}

export function entryOutlines(profile: Profile) {
  const period = (start?: string, end?: string) =>
    [start, end ?? (start ? "en cours" : undefined)].filter(Boolean).join(" → ");
  return {
    work: profile.work.map((w, i): EntryOutline => ({
      ref: `/work/${i}`,
      title: w.position,
      period: period(w.startDate, w.endDate),
    })),
    projects: profile.projects.map((p, i): EntryOutline => ({
      ref: `/projects/${i}`,
      title: p.name,
      period: period(p.startDate, p.endDate),
    })),
    skills: profile.skills.map((s, i) => ({ ref: `/skills/${i}`, name: s.name })),
  };
}

/** Texte d'un fait par pointeur, pour le contrôle de fidélité. */
export function factIndex(profile: Profile): Map<string, string> {
  return new Map(profileFacts(profile).map((f) => [f.pointer, f.text]));
}

/** Corpus de tout ce que le candidat a déclaré (hors coordonnées), pour les mots-clés. */
export function profileCorpus(profile: Profile): string {
  return [
    ...profileFacts(profile).map((f) => f.text),
    ...profile.education.flatMap((e) => [e.studyType, e.area, ...e.courses]),
    ...profile.languages.map((l) => l.language),
    ...profile.certificates.map((c) => c.name),
  ]
    .filter(Boolean)
    .join("\n");
}
