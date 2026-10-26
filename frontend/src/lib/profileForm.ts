import { Basics, JobOfferInput, Profile, type ImportedProfile } from "@attesta/shared-schemas";

/**
 * Brouillon du formulaire, tel que saisi (chaînes brutes), repris du parcours du monolithe : une
 * réalisation par ligne, « Compétence : mot-clé, mot-clé », « Langue : niveau ».
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
  /** Informations personnelles, affichées selon les usages du pays visé (ADR 0036). */
  birthDate: string;
  nationality: string;
  workPermit: string;
  drivingLicence: string;
}

export interface WorkForm {
  name: string;
  position: string;
  location: string;
  startDate: string;
  endDate: string;
  summary: string;
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
  skills: string;
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
  basics: {
    name: "",
    label: "",
    email: "",
    phone: "",
    city: "",
    countryCode: "",
    url: "",
    summary: "",
    birthDate: "",
    nationality: "",
    workPermit: "",
    drivingLicence: "",
  },
  work: [emptyWork()],
  education: [emptyEducation()],
  skills: "",
  languages: "",
  offer: { rawText: "", sourceUrl: "" },
});

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
    birthDate: opt(b.birthDate),
    nationality: opt(b.nationality),
    workPermit: opt(b.workPermit),
    drivingLicence: opt(b.drivingLicence),
  };
}

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

/** Erreur rattachée à un champ du formulaire (identifiant HTML), message en français. */
export interface FieldError {
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

/** Validation d'une étape par le contrat partagé : les mêmes règles que le serveur. */
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

/** Profil complet et validé, prêt à être enregistré. */
export function validProfile(draft: Draft): Profile | undefined {
  const result = Profile.safeParse(draftToProfile(draft));
  return result.success ? result.data : undefined;
}

/** Brouillon depuis un profil enregistré : le candidat reprend où il en était. */
export function draftFromProfile(p: Profile, offer: Draft["offer"] = { rawText: "", sourceUrl: "" }): Draft {
  const s = (v: string | undefined) => v ?? "";
  return {
    basics: {
      name: p.basics.name,
      label: s(p.basics.label),
      email: s(p.basics.email),
      phone: s(p.basics.phone),
      city: s(p.basics.location?.city),
      countryCode: s(p.basics.location?.countryCode),
      url: s(p.basics.url),
      summary: s(p.basics.summary),
      birthDate: s(p.basics.birthDate),
      nationality: s(p.basics.nationality),
      workPermit: s(p.basics.workPermit),
      drivingLicence: s(p.basics.drivingLicence),
    },
    work: p.work.length
      ? p.work.map((w) => ({
          name: w.name,
          position: w.position,
          location: s(w.location),
          startDate: w.startDate,
          endDate: s(w.endDate),
          summary: s(w.summary),
          highlights: w.highlights.join("\n"),
        }))
      : [emptyWork()],
    education: p.education.length
      ? p.education.map((e) => ({
          institution: e.institution,
          studyType: s(e.studyType),
          area: s(e.area),
          startDate: s(e.startDate),
          endDate: s(e.endDate),
        }))
      : [emptyEducation()],
    skills: p.skills
      .map((k) => (k.keywords.length ? `${k.name} : ${k.keywords.join(", ")}` : k.name))
      .join("\n"),
    languages: p.languages.map((l) => (l.fluency ? `${l.language} : ${l.fluency}` : l.language)).join("\n"),
    offer,
  };
}

/** Brouillon pré-rempli depuis un CV importé : le candidat relit chaque champ avant usage. */
export function draftFromImported(ex: ImportedProfile, current: Draft): Draft {
  const s = (v: string | null | undefined) => (v ?? "").trim();
  const work = ex.work.map((w) => ({
    name: s(w.name),
    position: s(w.position),
    location: s(w.location),
    startDate: s(w.startDate),
    endDate: s(w.endDate),
    summary: s(w.summary),
    highlights: w.highlights
      .map((h) => h.trim())
      .filter(Boolean)
      .join("\n"),
  }));
  const education = ex.education.map((e) => ({
    institution: s(e.institution),
    studyType: s(e.studyType),
    area: s(e.area),
    startDate: s(e.startDate),
    endDate: s(e.endDate),
  }));
  return {
    ...current,
    basics: {
      name: s(ex.basics.name),
      label: s(ex.basics.label),
      email: s(ex.basics.email),
      phone: s(ex.basics.phone),
      city: s(ex.basics.city),
      countryCode: s(ex.basics.countryCode).slice(0, 2),
      url: s(ex.basics.url),
      summary: s(ex.basics.summary),
      // Informations personnelles : jamais extraites d'un CV importé, celles déjà saisies sont gardées.
      birthDate: current.basics.birthDate,
      nationality: current.basics.nationality,
      workPermit: current.basics.workPermit,
      drivingLicence: current.basics.drivingLicence,
    },
    work: (work.length ? work : [emptyWork()]).slice(0, 30),
    education: (education.length ? education : [emptyEducation()]).slice(0, 15),
    skills: ex.skills
      .map((k) => (k.keywords.length ? `${k.name} : ${k.keywords.join(", ")}` : k.name))
      .join("\n"),
    languages: ex.languages.map((l) => (l.fluency ? `${l.language} : ${l.fluency}` : l.language)).join("\n"),
  };
}
