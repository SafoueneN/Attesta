import {
  findUnresolvedRefs,
  type CvLine,
  type FaithfulnessReport,
  type OfferAnalysis,
  type Profile,
  type TailoredCv,
} from "@attesta/schema";
import { factIndex, profileCorpus } from "./facts.js";

/**
 * Contrôle de fidélité déterministe (étape 4, docs/adr/0003). Aucune ligne n'est
 * déclarée « supported » par un modèle : seulement par ces vérifications.
 *
 * Limites connues : un verbe gonflé (« a participé » → « a dirigé ») ou une
 * paraphrase infidèle sans entité nouvelle passent ce contrôle. La relecture
 * humaine reste obligatoire avant tout export.
 */

type Issue = FaithfulnessReport["lines"][number]["issues"][number];

/** Variantes d'écriture ramenées à une forme unique (liste courte, à enrichir sur mesure). */
const ALIASES: [RegExp, string][] = [
  [/\bnodejs\b/g, "node js"],
  [/\bpostgres\b/g, "postgresql"],
  [/\bk8s\b/g, "kubernetes"],
  [/\bjs\b(?<!node js)/g, "javascript"],
  [/\bts\b/g, "typescript"],
];

/** Minuscules, sans accents, ponctuation réduite à des espaces (sauf + et #). */
export function normalize(text: string): string {
  let s = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9+#]+/g, " ")
    .trim();
  for (const [pattern, replacement] of ALIASES) s = s.replace(pattern, replacement);
  return ` ${s} `;
}

const contains = (haystack: string, term: string) => {
  const needle = normalize(term);
  return needle.trim().length > 0 && haystack.includes(needle);
};

/** Nombres d'un texte, virgule décimale ramenée au point (« 1,5 » = « 1.5 »). */
function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/**
 * Entités probables : sigles (API, AWS), termes techniques (Node.js, C#, S3) et
 * mots à majuscule hors début de phrase (PostgreSQL, Kubernetes).
 */
function entities(text: string): string[] {
  const tokens = text.match(/[\p{L}\p{N}][\p{L}\p{N}.+#/-]*[\p{L}\p{N}+#]|[\p{L}\p{N}]/gu) ?? [];
  return tokens.filter((token, index) => {
    if (/\d/.test(token) && /\p{L}/u.test(token)) return true;
    if (/[.+#]/.test(token) && /\p{L}/u.test(token)) return true;
    if (token.length >= 2 && token === token.toUpperCase() && /\p{L}/u.test(token)) return true;
    return index > 0 && /^\p{Lu}/u.test(token);
  });
}

export interface LineCheckContext {
  facts: Map<string, string>;
  /** Corpus normalisé de tout le profil (hors coordonnées). */
  corpus: string;
  /** Corpus normalisé des compétences déclarées. */
  skills: string;
  /** Mots-clés de l'offre absents du profil : leur présence dans une ligne est une invention. */
  missingKeywords: string[];
}

export function checkLine(line: CvLine, ctx: LineCheckContext): Issue[] {
  const issues: Issue[] = [];
  const sourceTexts = line.sources.map((pointer) => ctx.facts.get(pointer));
  for (const [i, text] of sourceTexts.entries()) {
    if (text === undefined) issues.push({ kind: "unresolved-source", value: line.sources[i]! });
  }
  const sources = sourceTexts.filter((t): t is string => t !== undefined).join("\n");
  const normalizedSources = normalize(sources);
  const sourceNumbers = new Set(numbers(sources));

  for (const n of new Set(numbers(line.text))) {
    if (!sourceNumbers.has(n)) issues.push({ kind: /^(19|20)\d\d$/.test(n) ? "date" : "number", value: n });
  }
  for (const keyword of ctx.missingKeywords) {
    if (contains(normalize(line.text), keyword)) issues.push({ kind: "skill", value: keyword });
  }
  const reported = new Set(issues.map((i) => normalize(i.value)));
  for (const entity of new Set(entities(line.text))) {
    const key = normalize(entity);
    if (reported.has(key) || /^\s*[\d.]+\s*$/.test(key)) continue;
    if (!normalizedSources.includes(key) && !ctx.skills.includes(key)) {
      issues.push({ kind: "entity", value: entity });
    }
  }
  return issues;
}

/** Mots-clés de l'offre sans aucune trace dans le profil : signalés, jamais ajoutés. */
export function missingKeywords(analysis: OfferAnalysis, profile: Profile): string[] {
  const corpus = normalize(profileCorpus(profile));
  const terms = [...analysis.keywords.map((k) => k.term), ...analysis.requirements.flatMap((r) => r.skills)];
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = normalize(term);
    if (seen.has(key) || !key.trim()) return false;
    seen.add(key);
    return !corpus.includes(key);
  });
}

export function lineContext(profile: Profile, missing: string[]): LineCheckContext {
  return {
    facts: factIndex(profile),
    corpus: normalize(profileCorpus(profile)),
    skills: normalize(profile.skills.flatMap((s) => [s.name, ...s.keywords]).join(" ")),
    missingKeywords: missing,
  };
}

/** Lignes rédigées par le modèle, avec leur position dans le CV. */
export function cvLines(cv: TailoredCv): { path: string; line: CvLine }[] {
  return [
    ...(cv.headline ? [{ path: "/headline", line: cv.headline }] : []),
    ...cv.summary.map((line, i) => ({ path: `/summary/${i}`, line })),
    ...cv.work.flatMap((e, i) =>
      e.highlights.map((line, j) => ({ path: `/work/${i}/highlights/${j}`, line })),
    ),
    ...cv.projects.flatMap((e, i) =>
      e.highlights.map((line, j) => ({ path: `/projects/${i}/highlights/${j}`, line })),
    ),
  ];
}

export interface RemovedLine {
  path: string;
  text: string;
  issues: Issue[];
}

export interface FaithfulnessOutcome {
  report: FaithfulnessReport;
  /** CV dont les lignes non prouvées ont été retirées (décision Q9). */
  cv: TailoredCv;
  removed: RemovedLine[];
}

export function checkFaithfulness(cv: TailoredCv, profile: Profile): FaithfulnessOutcome {
  const ctx = lineContext(profile, cv.missingKeywords);
  const unresolvedRefs = new Set(findUnresolvedRefs(cv, profile));
  const checked = cvLines(cv).map(({ path, line }) => {
    const issues = checkLine(line, ctx);
    return { path, line, issues, status: issues.length ? ("unsupported" as const) : ("supported" as const) };
  });
  const supported = checked.filter((c) => c.status === "supported").length;
  const report: FaithfulnessReport = {
    score: checked.length ? supported / checked.length : 1,
    checkedLines: checked.length,
    supportedLines: supported,
    lines: checked.map(({ path, status, issues }) => ({ path, status, issues })),
  };

  const rejected = new Set(checked.filter((c) => c.status === "unsupported").map((c) => c.line));
  const keep = (line: CvLine) => !rejected.has(line);
  const cleaned: TailoredCv = {
    ...cv,
    headline: cv.headline && keep(cv.headline) ? cv.headline : undefined,
    summary: cv.summary.filter(keep),
    work: cv.work
      .filter((e) => !unresolvedRefs.has(e.ref))
      .map((e) => ({ ...e, highlights: e.highlights.filter(keep) })),
    projects: cv.projects
      .filter((e) => !unresolvedRefs.has(e.ref))
      .map((e) => ({ ...e, highlights: e.highlights.filter(keep) })),
    skills: cv.skills.filter((ref) => !unresolvedRefs.has(ref)),
  };
  const removed = checked
    .filter((c) => c.status === "unsupported")
    .map(({ path, line, issues }) => ({ path, text: line.text, issues }));
  return { report, cv: cleaned, removed };
}
