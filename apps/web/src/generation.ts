import { createHash } from "node:crypto";
import { TailoredCv, type CvLine, type FaithfulnessReport, type Profile } from "@attesta/schema";
import { checkFaithfulness, cvLines, sanitizeText, type RemovedLine } from "@attesta/llm";
import type { Draft } from "./draft.js";

/** Génération conservée dans la session anonyme (mêmes durées que le brouillon). */
export interface StoredGeneration {
  /** Identifiant aléatoire, repris par le formulaire de relecture. */
  id: string;
  /** Empreinte du profil et de l'offre au moment de la génération. */
  key: string;
  cv: TailoredCv;
  report: FaithfulnessReport;
  removed: RemovedLine[];
  /** Lignes modifiées par le candidat, par position dans le CV. */
  edited: string[];
  providerKind: "ia" | "demo";
  model: string;
  pipelineVersion: string;
}

export function generationKey(profile: Profile, draft: Draft): string {
  return createHash("sha256")
    .update(JSON.stringify([profile, draft.offer.rawText]))
    .digest("hex");
}

/**
 * Génération utilisable pour l'aperçu et l'export : seulement si le profil et
 * l'offre n'ont pas changé depuis (sinon les pointeurs pourraient désigner
 * d'autres faits).
 */
export function currentGeneration(
  stored: StoredGeneration | undefined,
  profile: Profile | undefined,
  draft: Draft,
): { generation?: StoredGeneration; stale: boolean } {
  if (!stored || !profile) return { stale: false };
  return stored.key === generationKey(profile, draft)
    ? { generation: stored, stale: false }
    : { stale: true };
}

/** Applique `fn` à chaque ligne rédigée, dans l'ordre de `cvLines` ; `null` retire la ligne. */
function mapLines(cv: TailoredCv, fn: (line: CvLine, path: string) => CvLine | null): TailoredCv {
  const keep = (lines: CvLine[], prefix: string) =>
    lines.map((line, i) => fn(line, `${prefix}/${i}`)).filter((l): l is CvLine => l !== null);
  const headline = cv.headline ? fn(cv.headline, "/headline") : null;
  return {
    ...cv,
    headline: headline ?? undefined,
    summary: keep(cv.summary, "/summary"),
    work: cv.work.map((e, i) => ({ ...e, highlights: keep(e.highlights, `/work/${i}/highlights`) })),
    projects: cv.projects.map((e, i) => ({
      ...e,
      highlights: keep(e.highlights, `/projects/${i}/highlights`),
    })),
  };
}

/**
 * Corrections du candidat : texte modifié ou ligne retirée. Les sources sont
 * conservées ; le score est recalculé mais une ligne modifiée n'est jamais
 * retirée d'office : le candidat décide, l'écart reste affiché.
 */
export function applyCorrections(
  stored: StoredGeneration,
  profile: Profile,
  offerText: string,
  body: Record<string, unknown>,
): StoredGeneration {
  const paths = cvLines(stored.cv).map((l) => l.path);
  const edited = new Set(stored.edited);
  const kept: string[] = [];
  const corrected = mapLines(stored.cv, (line, path) => {
    const i = paths.indexOf(path);
    if (body[`remove_${i}`] === "yes") return null;
    const raw = body[`line_${i}`];
    const text =
      typeof raw === "string" ? sanitizeText(raw).replace(/\s+/g, " ").trim().slice(0, 500) : line.text;
    if (!text) return null;
    if (text !== line.text) edited.add(path);
    kept.push(path);
    return { ...line, text };
  });
  const cv = TailoredCv.parse(corrected);
  // Un retrait décale les positions : chaque ligne conservée est suivie de son
  // ancienne à sa nouvelle position (même ordre de parcours que `cvLines`).
  const newPaths = cvLines(cv).map((l) => l.path);
  const moved = new Map(kept.map((old, k) => [old, newPaths[k]!]));
  return {
    ...stored,
    cv,
    report: checkFaithfulness(cv, profile, offerText).report,
    edited: [...edited].flatMap((path) => moved.get(path) ?? []),
  };
}

/** Libellé lisible d'un pointeur de fait, pour la vue de traçabilité. */
export function describePointer(profile: Profile, pointer: string): string {
  const [, section, a, field, b] = pointer.split("/");
  const n = Number(a) + 1;
  const m = Number(b) + 1;
  switch (section) {
    case "basics":
      return a === "label" ? "Profil – titre professionnel" : "Profil – résumé";
    case "work": {
      const job = profile.work[Number(a)]?.position ?? "";
      if (field === "highlights") return `Expérience ${n} (${job}) – réalisation ${m}`;
      if (field === "summary") return `Expérience ${n} (${job}) – description`;
      return `Expérience ${n} – intitulé du poste`;
    }
    case "projects":
      return field === "highlights" ? `Projet ${n} – réalisation ${m}` : `Projet ${n}`;
    case "skills":
      return `Compétence : ${profile.skills[Number(a)]?.name ?? n}`;
    default:
      return pointer;
  }
}

/** Raison d'un retrait, en français, pour le candidat. */
export function describeIssue(issue: RemovedLine["issues"][number]): string {
  switch (issue.kind) {
    case "number":
      return `le chiffre « ${issue.value} » ne figure pas dans la source`;
    case "date":
      return `l'année « ${issue.value} » ne figure pas dans la source`;
    case "entity":
      return `« ${issue.value} » ne figure ni dans la source ni dans vos compétences`;
    case "skill":
      return `« ${issue.value} » est demandé par l'offre mais absent de votre profil`;
    case "unresolved-source":
      return "la source citée n'existe pas dans votre profil";
    case "foreign-source":
      return "la source citée appartient à une autre expérience";
  }
}
