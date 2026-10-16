import type { Profile } from "@attesta/schema";

/** Profil réduit à ce qui sert au matching : ni identité, ni coordonnées, ni employeur. */
export interface MatchingProfile {
  /** Texte vectorisé et envoyé au rerank. */
  text: string;
  /** Compétences déclarées (nom et mots-clés), pour la couverture et les écarts. */
  skills: string[];
  /** Tout le texte du profil, pour vérifier qu'une compétence y figure déjà. */
  corpus: string;
}

const CONTACTS = [
  /[\p{L}\p{N}._%+-]+@[\p{L}\p{N}.-]+\.\p{L}{2,}/gu,
  /\bhttps?:\/\/\S+|\bwww\.\S+/gi,
  /(?:\+|\b00)\d[\d\s().-]{7,}\d|\b0\d(?:[\s.-]?\d{2}){4}\b/g,
  // Numéros allemands sans indicatif : « 0151 12345678 », « 030/1234567 ».
  /\b0\d{2,4}[\s/-]?\d{5,8}\b/g,
];

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, (c) => `\\${c}`);

/**
 * Retire du texte libre les valeurs identifiantes déclarées ailleurs dans le profil
 * (nom et ses parties, employeurs, établissements, ville) : « Je suis Marie Dupont,
 * chez Siemens AG » ne doit pas partir vers les vecteurs ni vers le modèle.
 */
export function scrubKnownValues(text: string, values: (string | undefined)[], keep: string[] = []): string {
  // Un terme qui est aussi une compétence déclarée (employeur « Docker Inc »,
  // compétence « Docker ») est gardé : il sert au matching et n'identifie personne seul.
  const kept = new Set(keep.map((k) => k.toLowerCase()));
  const terms = [
    ...new Set(
      values
        .flatMap((v) => (v ? [v.trim(), ...v.trim().split(/\s+/)] : []))
        .filter((t) => t.length >= 3 && !kept.has(t.toLowerCase())),
    ),
  ].sort((a, b) => b.length - a.length);
  return terms.reduce(
    (acc, term) =>
      acc.replace(
        new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(term)}(?![\\p{L}\\p{N}])`, "giu"),
        "[retiré]",
      ),
    text,
  );
}

/** Retire adresses e-mail, liens et numéros de téléphone d'un texte libre. */
export function scrubContacts(text: string): string {
  return CONTACTS.reduce((acc, pattern) => acc.replace(pattern, "[retiré]"), text);
}

/**
 * Anonymisation avant calcul (docs/adr/0007) : nom, coordonnées, adresse, liens,
 * employeurs et établissements ne sont jamais vectorisés ni envoyés au modèle.
 * Le schéma du profil ne comporte ni photo, ni âge, ni genre, ni origine.
 */
export function matchingProfile(profile: Profile): MatchingProfile {
  const skills = profile.skills.flatMap((s) => [s.name, ...s.keywords]);
  const lines = [
    profile.basics.label,
    profile.basics.summary,
    ...profile.work.flatMap((w) => [w.position, w.summary, ...w.highlights]),
    ...profile.projects.flatMap((p) => [p.name, p.description, ...p.highlights]),
    ...profile.education.map((e) => [e.studyType, e.area].filter(Boolean).join(" ")),
    skills.length ? `Compétences : ${skills.join(", ")}` : undefined,
    ...profile.languages.map((l) => [l.language, l.fluency].filter(Boolean).join(" ")),
  ].filter((line): line is string => Boolean(line?.trim()));
  const identifying = [
    profile.basics.name,
    profile.basics.location?.city,
    profile.basics.location?.region,
    ...profile.work.flatMap((w) => [w.name, w.location]),
    ...profile.education.map((e) => e.institution),
  ];
  const contactFree = scrubContacts(lines.join("\n"));
  const text = scrubKnownValues(contactFree, identifying, skills);
  // Le corpus ne quitte pas le processus : il garde tout le texte du profil, pour
  // ne jamais signaler comme manquante une compétence que le candidat a écrite.
  return { text, skills, corpus: contactFree };
}
