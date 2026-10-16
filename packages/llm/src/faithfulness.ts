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

/**
 * Retire les caractères de format invisibles (espace sans chasse, marques de
 * direction…) : ils pourraient couper un mot pour échapper au contrôle.
 */
export const sanitizeText = (text: string) => text.replace(/\p{Cf}/gu, "");

/** Nombres d'un texte, virgule décimale ramenée au point (« 1,5 » = « 1.5 »). */
function numbers(text: string): string[] {
  return (text.match(/\d+(?:[.,]\d+)?/g) ?? []).map((n) => n.replace(",", "."));
}

/** Nombres écrits en lettres (fr, en, de), ramenés à leur valeur. « un », « neuf » exclus (ambigus). */
const NUMBER_WORDS: Record<string, string> = Object.fromEntries(
  [
    ["2", "deux two zwei"],
    ["3", "trois three drei"],
    ["4", "quatre four vier"],
    ["5", "cinq five funf"],
    ["6", "six sechs"],
    ["7", "sept seven sieben"],
    ["8", "huit eight acht"],
    ["10", "dix ten zehn"],
    ["12", "douze twelve zwolf"],
    ["15", "quinze fifteen"],
    ["20", "vingt twenty zwanzig"],
    ["30", "trente thirty"],
    ["50", "cinquante fifty"],
    ["100", "cent hundred hundert"],
    ["1000", "mille thousand tausend"],
  ].flatMap(([value, words]) => words!.split(" ").map((w) => [w, value!])),
);

/** Ordres de grandeur et multiplicateurs : à prouver tels quels par la source. */
const QUANTITY_STEMS = [
  "dizaine",
  "douzaine",
  "vingtaine",
  "centaine",
  "millier",
  "million",
  "milliard",
  "doubl",
  "tripl",
  "quadrupl",
];

/**
 * Titres, niveaux et diplômes : leur ajout gonfle un profil sans chiffre ni
 * outil. Préfixes normalisés ; ils doivent figurer dans les sources (ou, pour
 * le titre et l'accroche, ailleurs dans le profil).
 */
const CONTROLLED_STEMS = [
  "master",
  "licence",
  "bachelor",
  "doctor",
  "phd",
  "mba",
  "bts",
  "dut",
  "diplom",
  "ingenieu",
  "certifi",
  "senior",
  "lead",
  "expert",
  "architect",
  "manager",
  "directeur",
  "directrice",
  "chef",
  "responsab",
  "head",
  "cto",
];

/** Unités qui donnent son sens à un nombre : « 40 % » ne prouve pas « 40 mois ». */
const UNIT_GROUPS: Record<string, string> = {
  "%": "%",
  pourcent: "%",
  percent: "%",
  an: "an",
  ans: "an",
  annee: "an",
  annees: "an",
  year: "an",
  years: "an",
  jahre: "an",
  mois: "mois",
  month: "mois",
  months: "mois",
  semaine: "semaine",
  semaines: "semaine",
  week: "semaine",
  weeks: "semaine",
  jour: "jour",
  jours: "jour",
  day: "jour",
  days: "jour",
  heure: "heure",
  heures: "heure",
  h: "heure",
  hour: "heure",
  hours: "heure",
  "€": "€",
  eur: "€",
  euros: "€",
  k: "k",
  "k€": "k",
  fois: "fois",
  x: "fois",
  times: "fois",
};

/** Paires (nombre, groupe d'unité) d'un texte. */
function quantified(text: string): Set<string> {
  const pairs = new Set<string>();
  for (const m of text.matchAll(/(\d+(?:[.,]\d+)?)\s*(%|€|k€|[\p{L}]+)?/gu)) {
    const unitWord = (m[2] ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
    const group = UNIT_GROUPS[unitWord];
    if (group) pairs.add(`${m[1]!.replace(",", ".")} ${group}`);
  }
  return pairs;
}

const words = (normalized: string) => normalized.trim().split(" ").filter(Boolean);
const hasStem = (normalized: string, stem: string) => words(normalized).some((w) => w.startsWith(stem));

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
  /**
   * Termes de l'offre extraits sans modèle et absents du profil : garde-fou si
   * l'analyse LLM a été vidée par une offre piégée. Jamais affichés (bruités).
   */
  guardTerms: string[];
}

/**
 * Contrôle d'une ligne. `entryRef` (ex. « /work/0 ») est l'entrée à laquelle la
 * ligne appartient : ses sources doivent en provenir, et seules les sources
 * comptent. Sans `entryRef` (titre, accroche), une compétence ou un titre
 * déclarés ailleurs dans le profil sont admis.
 */
export function checkLine(line: CvLine, ctx: LineCheckContext, entryRef?: string): Issue[] {
  const issues: Issue[] = [];
  const text = sanitizeText(line.text);
  const sourceTexts = line.sources.map((pointer) => ctx.facts.get(pointer));
  for (const [i, sourceText] of sourceTexts.entries()) {
    const pointer = line.sources[i]!;
    if (sourceText === undefined) issues.push({ kind: "unresolved-source", value: pointer });
    else if (entryRef && !pointer.startsWith(`${entryRef}/`))
      issues.push({ kind: "foreign-source", value: pointer });
  }
  const sources = sourceTexts.filter((t): t is string => t !== undefined).join("\n");
  const normalizedSources = normalize(sources);
  const normalizedLine = normalize(text);
  const allowedElsewhere = entryRef ? "" : ctx.corpus;
  const sourceNumbers = new Set(numbers(sources));

  for (const n of new Set(numbers(text))) {
    if (!sourceNumbers.has(n)) issues.push({ kind: /^(19|20)\d\d$/.test(n) ? "date" : "number", value: n });
  }
  const sourcePairs = quantified(sources);
  for (const pair of quantified(text)) {
    const [n] = pair.split(" ");
    if (sourceNumbers.has(n!) && !sourcePairs.has(pair)) issues.push({ kind: "number", value: pair });
  }
  for (const word of new Set(words(normalizedLine))) {
    const value = NUMBER_WORDS[word];
    if (value && !hasStem(normalizedSources, word) && !sourceNumbers.has(value)) {
      issues.push({ kind: "number", value: word });
    }
  }
  for (const stem of QUANTITY_STEMS) {
    if (hasStem(normalizedLine, stem) && !hasStem(normalizedSources, stem))
      issues.push({ kind: "number", value: stem });
  }
  for (const stem of CONTROLLED_STEMS) {
    if (
      hasStem(normalizedLine, stem) &&
      !hasStem(normalizedSources, stem) &&
      !hasStem(allowedElsewhere, stem)
    ) {
      issues.push({ kind: "entity", value: stem });
    }
  }
  for (const keyword of new Set([...ctx.missingKeywords, ...ctx.guardTerms])) {
    if (contains(normalizedLine, keyword)) issues.push({ kind: "skill", value: keyword });
  }
  const reported = new Set(issues.map((i) => normalize(i.value)));
  const declaredSkills = entryRef ? "" : ctx.skills;
  for (const entity of new Set(entities(text))) {
    const key = normalize(entity);
    if (reported.has(key) || /^\s*[\d.]+\s*$/.test(key)) continue;
    if (!normalizedSources.includes(key) && !declaredSkills.includes(key)) {
      issues.push({ kind: "entity", value: entity });
    }
  }
  return issues;
}

/**
 * Termes techniques d'une offre, extraits sans modèle : sigles, termes à points,
 * chiffres ou majuscules internes, noms propres en milieu de phrase. Complète
 * l'analyse LLM, qu'une offre piégée pourrait vider.
 */
export function offerTerms(offerText: string): string[] {
  const text = sanitizeText(offerText);
  const terms = [...text.matchAll(/[\p{L}][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu)]
    .filter(({ 0: term, index }) => {
      if (/[.+#\d]/.test(term) || /\p{Lu}.*\p{Lu}/u.test(term)) return true;
      const before = text.slice(0, index);
      return before.trim().length > 0 && !/[.!?:;\n(«"“-]\s*$/.test(before) && /^\p{Lu}/u.test(term);
    })
    .map((m) => m[0]);
  return [...new Map(terms.map((t) => [normalize(t), t])).values()];
}

/** Mots-clés de l'offre sans aucune trace dans le profil : signalés, jamais ajoutés. */
export function missingKeywords(analysis: OfferAnalysis, profile: Profile): string[] {
  return absentFromProfile(
    [...analysis.keywords.map((k) => k.term), ...analysis.requirements.flatMap((r) => r.skills)],
    profile,
  );
}

function absentFromProfile(terms: string[], profile: Profile): string[] {
  const corpus = normalize(profileCorpus(profile));
  const seen = new Set<string>();
  return terms.filter((term) => {
    const key = normalize(term);
    if (seen.has(key) || !key.trim()) return false;
    seen.add(key);
    return !corpus.includes(key);
  });
}

export function lineContext(profile: Profile, missing: string[], offerText = ""): LineCheckContext {
  return {
    guardTerms: absentFromProfile(offerTerms(offerText), profile),
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

export function checkFaithfulness(cv: TailoredCv, profile: Profile, offerText = ""): FaithfulnessOutcome {
  const ctx = lineContext(profile, cv.missingKeywords, offerText);
  const unresolvedRefs = new Set(findUnresolvedRefs(cv, profile));
  const entryOf = (path: string) => {
    const [, section, index] = path.split("/");
    if (section !== "work" && section !== "projects") return undefined;
    return cv[section][Number(index)]?.ref;
  };
  const checked = cvLines(cv).map(({ path, line }) => {
    const issues = checkLine(line, ctx, entryOf(path));
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
