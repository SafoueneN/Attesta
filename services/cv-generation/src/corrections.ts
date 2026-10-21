import {
  TailoredCv,
  type Corrections,
  type CvLine,
  type FaithfulnessReport,
  type Profile,
} from "@attesta/shared-schemas";
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
export function applyCorrections(
  current: { cv: TailoredCv; edited: string[] },
  profile: Profile,
  offerText: string,
  corrections: Corrections["lines"],
): Corrected {
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
