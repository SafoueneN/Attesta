import { Basics, JobOfferInput, Profile } from "@attesta/schema";
import { z } from "zod";

/**
 * Brouillon du formulaire, tel que saisi (chaînes brutes). Il vit uniquement
 * dans la session anonyme (2 h glissantes, 24 h au plus : docs/adr/0006).
 */
export interface BasicsForm {
  name: string;
  label: string;
  email: string;
  phone: string;
  city: string;
  countryCode: string;
  url: string;
  summary: string;
}

export interface WorkForm {
  name: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string;
  summary: string;
  /** Une réalisation par ligne. */
  highlights: string;
}

export interface EducationForm {
  institution: string;
  studyType: string;
  area: string;
  startDate: string;
  endDate: string;
}

export interface Draft {
  basics: BasicsForm;
  work: WorkForm[];
  education: EducationForm[];
  /** Une compétence par ligne : « Nom : mot-clé, mot-clé ». */
  skills: string;
  /** Une langue par ligne : « Langue : niveau ». */
  languages: string;
  offer: { rawText: string; sourceUrl: string };
}

export const emptyWork = (): WorkForm => ({
  name: "",
  position: "",
  location: "",
  startDate: "",
  endDate: "",
  summary: "",
  highlights: "",
});

export const emptyEducation = (): EducationForm => ({
  institution: "",
  studyType: "",
  area: "",
  startDate: "",
  endDate: "",
});

export const emptyDraft = (): Draft => ({
  basics: { name: "", label: "", email: "", phone: "", city: "", countryCode: "", url: "", summary: "" },
  work: [emptyWork()],
  education: [emptyEducation()],
  skills: "",
  languages: "",
  offer: { rawText: "", sourceUrl: "" },
});

// ---------------------------------------------------------------------------
// Lecture du corps de requête (champs inconnus ignorés, valeurs non textuelles vidées)

type Body = Record<string, unknown>;

const str = (value: unknown, max = 20_000): string => (typeof value === "string" ? value.slice(0, max) : "");

/** `qs` produit un objet à clés numériques au-delà de 20 éléments : on le ramène à un tableau. */
const asArray = (value: unknown): Body[] => {
  const list = Array.isArray(value) ? value : value && typeof value === "object" ? Object.values(value) : [];
  return list.filter((v): v is Body => Boolean(v) && typeof v === "object").slice(0, 30);
};

const pick = <K extends string>(source: unknown, keys: readonly K[]): Record<K, string> => {
  const body = (source && typeof source === "object" ? source : {}) as Body;
  return Object.fromEntries(keys.map((k) => [k, str(body[k])])) as Record<K, string>;
};

const WORK_KEYS = ["name", "position", "location", "startDate", "endDate", "summary", "highlights"] as const;
const EDUCATION_KEYS = ["institution", "studyType", "area", "startDate", "endDate"] as const;
const BASICS_KEYS = ["name", "label", "email", "phone", "city", "countryCode", "url", "summary"] as const;

/** Reporte dans le brouillon les champs de l'étape soumise. */
export function mergeStep(draft: Draft, step: number, body: Body): Draft {
  switch (step) {
    case 1:
      return { ...draft, basics: pick(body.basics, BASICS_KEYS) };
    case 2:
      return {
        ...draft,
        work: asArray(body.work).map((w) => pick(w, WORK_KEYS)),
        education: asArray(body.education).map((e) => pick(e, EDUCATION_KEYS)),
        skills: str(body.skills),
        languages: str(body.languages),
      };
    case 3:
      return { ...draft, offer: pick(body.offer, ["rawText", "sourceUrl"]) };
    default:
      return draft;
  }
}

// ---------------------------------------------------------------------------
// Conversion vers le contrat Zod

const opt = (s: string) => (s.trim() ? s.trim() : undefined);
const lines = (s: string) =>
  s
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
const isBlank = (entry: object) => Object.values(entry).every((v) => typeof v !== "string" || !v.trim());

/** Sépare « Nom : a, b » en nom et liste ; sans « : », toute la ligne est le nom. */
function splitLabelled(line: string): [string, string] {
  const at = line.indexOf(":");
  return at === -1 ? [line, ""] : [line.slice(0, at).trim(), line.slice(at + 1).trim()];
}

function toBasics(b: BasicsForm) {
  const city = opt(b.city);
  const countryCode = opt(b.countryCode.toUpperCase());
  return {
    name: b.name,
    label: opt(b.label),
    email: opt(b.email),
    phone: opt(b.phone),
    url: opt(b.url),
    summary: opt(b.summary),
    location: city || countryCode ? { city, countryCode } : undefined,
  };
}

/** Entrées non vides, avec leur index dans le formulaire pour y rattacher les erreurs. */
function kept<T extends object>(entries: T[]) {
  return entries.map((entry, index) => ({ entry, index })).filter(({ entry }) => !isBlank(entry));
}

function toParcours(d: Draft) {
  const work = kept(d.work);
  const education = kept(d.education);
  return {
    value: {
      work: work.map(({ entry: w }) => ({
        name: w.name,
        position: w.position,
        location: opt(w.location),
        startDate: w.startDate.trim(),
        endDate: opt(w.endDate),
        summary: opt(w.summary),
        highlights: lines(w.highlights),
      })),
      education: education.map(({ entry: e }) => ({
        institution: e.institution,
        studyType: opt(e.studyType),
        area: opt(e.area),
        startDate: opt(e.startDate),
        endDate: opt(e.endDate),
      })),
      skills: lines(d.skills).map((line) => {
        const [name, rest] = splitLabelled(line);
        return {
          name,
          keywords: rest
            .split(",")
            .map((k) => k.trim())
            .filter(Boolean),
        };
      }),
      languages: lines(d.languages).map((line) => {
        const [language, fluency] = splitLabelled(line);
        return { language, fluency: opt(fluency) };
      }),
    },
    indexMap: { work: work.map((w) => w.index), education: education.map((e) => e.index) },
  };
}

export function draftToProfile(d: Draft) {
  return { basics: toBasics(d.basics), ...toParcours(d).value };
}

// ---------------------------------------------------------------------------
// Validation par étape

export interface FieldError {
  /** Identifiant HTML du champ concerné. */
  field: string;
  message: string;
}

const Parcours = Profile.pick({ work: true, education: true, skills: true, languages: true });

function basicsField(path: PropertyKey[]): string {
  const key = path[0] === "location" ? path[1] : path[0];
  return `basics-${String(key)}`;
}

function parcoursField(path: PropertyKey[], indexMap: Record<"work" | "education", number[]>) {
  const [section, index, key, subIndex] = path;
  if (section === "work" || section === "education") {
    const formIndex = indexMap[section][Number(index)] ?? 0;
    const line = key === "highlights" && typeof subIndex === "number" ? subIndex + 1 : undefined;
    return { field: `${section}-${formIndex}-${String(key ?? "name")}`, line };
  }
  return { field: String(section), line: typeof index === "number" ? index + 1 : undefined };
}

const withLine = (message: string, line?: number) => (line ? `Ligne ${line} : ${message}` : message);

export function validateStep(draft: Draft, step: number): FieldError[] {
  if (step === 1) {
    const result = Basics.safeParse(toBasics(draft.basics));
    return result.success
      ? []
      : result.error.issues.map((i) => ({ field: basicsField(i.path), message: i.message }));
  }
  if (step === 2) {
    const { value, indexMap } = toParcours(draft);
    const result = Parcours.safeParse(value);
    const errors: FieldError[] = result.success
      ? []
      : result.error.issues.map((i) => {
          const { field, line } = parcoursField(i.path, indexMap);
          return { field, message: withLine(i.message, line) };
        });
    if (value.work.length === 0 && value.education.length === 0) {
      errors.push({ field: "work-0-position", message: "Ajoutez au moins une expérience ou une formation." });
    }
    return errors;
  }
  if (step === 3) {
    const result = JobOfferInput.safeParse({
      rawText: draft.offer.rawText,
      sourceUrl: opt(draft.offer.sourceUrl),
    });
    return result.success
      ? []
      : result.error.issues.map((i) => ({ field: `offer-${String(i.path[0])}`, message: i.message }));
  }
  return [];
}

/**
 * Étape la plus avancée accessible : la première étape de saisie (1 à 3) encore
 * invalide, ou 5 si la saisie est complète (l'aperçu n'a rien à valider).
 */
export function lastReachableStep(draft: Draft): number {
  for (const step of [1, 2, 3]) if (validateStep(draft, step).length > 0) return step;
  return 5;
}

/** Profil complet et validé, utilisable pour l'aperçu et l'export. */
export function validProfile(draft: Draft): Profile | undefined {
  const result = Profile.safeParse(draftToProfile(draft));
  return result.success ? result.data : undefined;
}

export const Variant = z.enum(["ats", "design"]).catch("ats");
