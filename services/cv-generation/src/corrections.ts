import {
  TailoredCv,
  type Corrections,
  type CvLine,
  type FaithfulnessReport,
  type Profile,
} from "@attesta/shared-schemas";
import { factIndex } from "./facts.js";
import { checkFaithfulness, cvLines, sanitizeText } from "./faithfulness.js";

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

export interface Corrected {
  cv: TailoredCv;
  report: FaithfulnessReport;
  edited: string[];
}

/**
 * Corrections du candidat : texte modifié ou ligne retirée. Les sources sont conservées ; le score est
 * recalculé, mais une ligne modifiée n'est jamais retirée d'office : le candidat décide, l'écart reste
 * affiché ligne par ligne.
 */
/** Ajout refusé (source inconnue, étrangère à l'entrée, entrée pleine), avec sa raison en français. */
export class AdditionError extends Error {}

/**
 * Lignes ajoutées (ADR 0029) : un fait du profil recopié avec sa source, dans l'entrée qui le porte. Les
 * sources doivent exister et, pour une expérience ou un projet, appartenir à cette entrée.
 */
function withAdditions(cv: TailoredCv, profile: Profile, additions: Corrections["additions"]) {
  const facts = factIndex(profile);
  const added: string[] = [];
  let next = cv;
  for (const a of additions) {
    if (a.sources.some((s) => !facts.has(s)))
      throw new AdditionError("Une source de la ligne ajoutée n'existe pas dans votre profil.");
    const text = sanitizeText(a.text).replace(/\s+/g, " ").trim().slice(0, 500);
    if (a.entry === "/summary") {
      if (next.summary.length >= 4) throw new AdditionError("Le résumé compte déjà quatre lignes.");
      next = { ...next, summary: [...next.summary, { text, sources: a.sources }] };
      added.push(`/summary/${next.summary.length - 1}`);
      continue;
    }
    const [, section, index] = a.entry.split("/") as [string, "work" | "projects", string];
    const i = Number(index);
    const entry = next[section][i];
    if (!entry) throw new AdditionError("Cette rubrique n'existe pas dans le CV.");
    if (a.sources.some((s) => !s.startsWith(`${entry.ref}/`)))
      throw new AdditionError("La source de la ligne ajoutée ne vient pas de cette rubrique.");
    if (entry.highlights.length >= 20) throw new AdditionError("Cette rubrique est déjà complète.");
    const highlights = [...entry.highlights, { text, sources: a.sources }];
    next = { ...next, [section]: next[section].map((e, j) => (j === i ? { ...e, highlights } : e)) };
    added.push(`/${section}/${i}/highlights/${highlights.length - 1}`);
  }
  return { cv: next, added };
}

export function applyCorrections(
  current: { cv: TailoredCv; edited: string[] },
  profile: Profile,
  offerText: string,
  corrections: Corrections["lines"],
  additions: Corrections["additions"] = [],
): Corrected {
  if (additions.length) {
    const result = withAdditions(current.cv, profile, additions);
    current = { cv: result.cv, edited: [...current.edited, ...result.added] };
  }
  const byPath = new Map(corrections.map((c) => [c.path, c]));
  const edited = new Set(current.edited);
  const kept: string[] = [];
  const corrected = mapLines(current.cv, (line, path) => {
    const change = byPath.get(path);
    if (change?.remove) return null;
    const text =
      change?.text !== undefined
        ? sanitizeText(change.text).replace(/\s+/g, " ").trim().slice(0, 500)
        : line.text;
    if (!text) return null;
    if (text !== line.text) edited.add(path);
    kept.push(path);
    return { ...line, text };
  });
  const cv = TailoredCv.parse(corrected);
  // Un retrait décale les positions : chaque ligne conservée est suivie de son ancienne à sa nouvelle position.
  const newPaths = cvLines(cv).map((l) => l.path);
  const moved = new Map(kept.map((old, k) => [old, newPaths[k]!]));
  return {
    cv,
    report: checkFaithfulness(cv, profile, offerText).report,
    edited: [...edited].flatMap((path) => moved.get(path) ?? []),
  };
}
