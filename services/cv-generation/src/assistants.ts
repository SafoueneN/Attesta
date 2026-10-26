import { assist, createPromptLoader, type DemoHandler, type LlmProvider } from "@attesta/llm-client";
import type { OfferAnalysis, Profile, TailoredCv } from "@attesta/shared-schemas";
import { z } from "zod";
import { factIndex, profileCorpus } from "./facts.js";
import { checkLine, cvLines, lineContext, normalize } from "./faithfulness.js";
import { resourcesFor } from "./resources.js";

/*
 * Assistants d'un CV généré (ADR 0028, rôles 2, 3, 4, 6 et 8 ; évolutions ADR 0029). Ils partent de
 * l'instantané de la génération (profil, CV, analyse de l'offre) : aucun autre service n'est appelé. L'IA
 * explique et conseille ; le code garde la main sur ce qui est vérifiable (pointeurs, chiffres, mots-clés,
 * noms propres, extraits).
 */

export const assistantPrompts = createPromptLoader(new URL("../prompts/", import.meta.url), {
  "juge-fidelite": "v2",
  "coach-questions": "v2",
  "coach-retour": "v2",
  "plan-progression": "v1",
  traduction: "v2",
  "conseils-ats": "v1",
});

export interface GenerationSnapshot {
  profile: Profile;
  cv: TailoredCv;
  analysis: OfferAnalysis;
  offerTitle: string;
  offerText: string;
}

const has = (haystack: string, term: string) => {
  const needle = normalize(term);
  return needle.trim().length > 0 && normalize(haystack).includes(needle);
};
/** Nombres d'un texte, normalisés (« 1 200 » = « 1200 », « 40,5 » = « 40.5 »). */
const numbers = (text: string) =>
  (text.match(/\d[\d\s.,]*\d|\d/g) ?? []).map((n) => n.replace(/[\s.]/g, "").replace(",", ".")).sort();

/**
 * Mots-clés utiles : l'analyse sans IA d'anciennes offres a pu prendre pour des compétences le lieu écrit
 * en fin de titre (« … – Paris La Défense ») ou des mots de deux lettres ; on les écarte.
 */
export function meaningful(
  g: Pick<GenerationSnapshot, "offerTitle" | "analysis"> & { offerText?: string },
  terms: string[],
) {
  const location = /\s[–—-]\s([^–—-]+)$/.exec(g.offerTitle)?.[1] ?? g.analysis.location ?? "";
  const place = normalize(location);
  const places = placeNames(g.offerText ?? "");
  // « BI », « C# », « R » sont des compétences ; « La », « de » non.
  const word = (t: string) => t.trim().length > 2 || /^[\p{Lu}\d+#]+$/u.test(t.trim());
  return terms.filter(
    (t) =>
      word(t) &&
      !NOT_SKILLS.has(normalize(t).trim()) &&
      !(location && place.includes(normalize(t))) &&
      !places.has(normalize(t)),
  );
}

/**
 * Lieux cités dans l'annonce, repérés sans modèle (même règle que jobs-matching) : après « à », « sur »,
 * « in », « bei », sur une ligne « Lieu : … », ou seuls dans une ligne de conditions (« CDI, 39 h, Mérignac »).
 */
function placeNames(offerText: string): Set<string> {
  const places = new Set<string>();
  const after =
    /(?:\b(?:à|sur|près de|proche de|in|bei|nahe)\s+)(\p{Lu}[\p{L}'-]+(?:[\s-]\p{Lu}[\p{L}'-]+)*)/gu;
  for (const m of offerText.matchAll(after)) for (const w of m[1]!.split(/[\s-]+/)) places.add(normalize(w));
  for (const l of offerText.split(/\r?\n/)) {
    const label = /^\s*(?:lieu|localisation|ville|standort|arbeitsort|location)\s*:\s*(.+)$/iu.exec(l);
    if (label)
      for (const w of label[1]!.split(/[\s,()–-]+/)) if (/^\p{Lu}/u.test(w)) places.add(normalize(w));
    if (/\b(cdi|cdd|stage|alternance|freelance|int[ée]rim|vollzeit|teilzeit)\b/i.test(l))
      for (const part of l.split(/[,;·|]/).map((p) => p.trim().replace(/[.]$/, "")))
        if (/^\p{Lu}[\p{Ll}'-]+(?:[\s-]\p{Lu}[\p{Ll}'-]+)*$/u.test(part))
          for (const w of part.split(/[\s-]+/)) places.add(normalize(w));
  }
  return places;
}

/** Mots d'annonce qui ne sont pas des compétences : contrat, horaire, mentions légales. */
const NOT_SKILLS = new Set([
  "cdi",
  "cdd",
  "h f",
  "f h",
  "m w d",
  "rtt",
  "sas",
  "sarl",
  "smic",
  "temps plein",
  "temps partiel",
]);

/** Entrée du CV (`/work/0`) à laquelle appartient une ligne, au sens du contrôle de fidélité. */
function entryRefOf(cv: TailoredCv, path: string): string | undefined {
  const [, section, index] = path.split("/");
  if (section === "work") return cv.work[Number(index)]?.ref;
  if (section === "projects") return cv.projects[Number(index)]?.ref;
  return undefined;
}

/** Lignes du CV avec le texte de leurs sources, pour le juge et le coach. */
function linesWithSources(g: GenerationSnapshot) {
  const facts = factIndex(g.profile);
  return cvLines(g.cv).map(({ path, line }) => ({
    path,
    text: line.text,
    sources: line.sources.map((p) => ({ pointer: p, text: facts.get(p) ?? "" })),
  }));
}

/* --- 2. Juge de fidélité --------------------------------------------------------------------------- */

const Verdicts = z.object({
  verdicts: z.array(
    z.object({
      path: z.string(),
      verdict: z.enum(["fidele", "nuance", "infidele"]),
      explanation: z.string(),
      suggestion: z.string().nullable(),
    }),
  ),
});

export async function judgeFidelity(provider: LlmProvider, g: GenerationSnapshot) {
  const lignes = linesWithSources(g);
  const { data, kind } = await assist({
    provider,
    step: "juge-fidelite",
    system: assistantPrompts.system("juge-fidelite"),
    data: { lignes },
    schema: Verdicts,
    // La qualité du jugement prime ici sur le coût (ADR 0029, point 3).
    effort: "high",
    maxTokens: 12000,
  });
  const byPath = new Map(cvLines(g.cv).map((l) => [l.path, l.line]));
  const ctx = lineContext(g.profile, g.cv.missingKeywords, g.offerText);
  return {
    verdicts: data.verdicts
      .filter((v) => byPath.has(v.path))
      .map((v) => {
        const line = byPath.get(v.path)!;
        const text = v.suggestion?.trim().replace(/\s+/g, " ").slice(0, 500);
        // Garde-fou : une reformulation n'est proposée que si elle passe le contrôle de fidélité de la ligne.
        const valid =
          v.verdict !== "fidele" &&
          text &&
          text !== line.text &&
          checkLine({ text, sources: line.sources }, ctx, entryRefOf(g.cv, v.path)).length === 0;
        return { ...v, suggestion: valid ? text : null };
      }),
    providerKind: kind,
  };
}

/* --- 3. Coach d'entretien -------------------------------------------------------------------------- */

const Questions = z.object({
  questions: z.array(
    z.object({ question: z.string(), intent: z.string(), sources: z.array(z.string()), tip: z.string() }),
  ),
});
const STAR_PARTS = ["situation", "task", "action", "result"] as const;
const Feedback = z.object({
  star: z.object({ situation: z.boolean(), task: z.boolean(), action: z.boolean(), result: z.boolean() }),
  highlights: z.array(z.object({ part: z.enum(STAR_PARTS), excerpt: z.string() })),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  facts: z.array(z.string()),
  followUp: z.string().nullable(),
});

export type InterviewLevel = "rh" | "manager" | "technique";

export async function interviewPrep(provider: LlmProvider, g: GenerationSnapshot, level: InterviewLevel) {
  const facts = factIndex(g.profile);
  const { data, kind } = await assist({
    provider,
    step: "coach-questions",
    system: assistantPrompts.system("coach-questions"),
    data: {
      offre: { titre: g.offerTitle, exigences: g.analysis.requirements },
      niveau: level,
      competences_absentes: meaningful(g, g.cv.missingKeywords),
      faits: [...facts].map(([pointer, text]) => ({ pointer, text })),
    },
    schema: Questions,
    effort: "medium",
  });
  return {
    questions: data.questions
      .slice(0, 10)
      .map((q) => ({ ...q, sources: q.sources.filter((p) => facts.has(p)) })),
    providerKind: kind,
  };
}

export async function interviewFeedback(
  provider: LlmProvider,
  g: GenerationSnapshot,
  input: { question: string; answer: string },
) {
  const facts = factIndex(g.profile);
  const { data, kind } = await assist({
    provider,
    step: "coach-retour",
    system: assistantPrompts.system("coach-retour"),
    data: {
      question: input.question,
      reponse_du_candidat: input.answer,
      faits: [...facts].map(([pointer, text]) => ({ pointer, text })),
    },
    schema: Feedback,
  });
  // Garde-fou : un extrait n'est surligné que s'il figure mot pour mot dans la réponse du candidat.
  const answer = input.answer.replace(/\s+/g, " ");
  const highlights = data.highlights
    .map((h) => ({ part: h.part, excerpt: h.excerpt.trim().replace(/\s+/g, " ") }))
    .filter((h) => h.excerpt.length >= 3 && answer.includes(h.excerpt) && data.star[h.part])
    .slice(0, 8);
  return {
    star: data.star,
    highlights,
    strengths: data.strengths.slice(0, 4),
    improvements: data.improvements.slice(0, 4),
    facts: data.facts
      .filter((p) => facts.has(p))
      .slice(0, 3)
      .map((pointer) => ({ pointer, text: facts.get(pointer)! })),
    followUp: data.followUp?.trim().slice(0, 300) || null,
    providerKind: kind,
  };
}

/* --- 4. Plan de progression ------------------------------------------------------------------------ */

const Plan = z.object({
  items: z.array(
    z.object({
      skill: z.string(),
      why: z.string(),
      steps: z.array(z.string()),
      project: z.string(),
      weeks: z.number().int().min(1).max(52),
    }),
  ),
});

async function planFor(
  provider: LlmProvider,
  missing: string[],
  requirements: OfferAnalysis["requirements"],
  skills: Profile["skills"],
) {
  const { data, kind } = await assist({
    provider,
    step: "plan-progression",
    system: assistantPrompts.system("plan-progression"),
    data: { competences_absentes: missing, exigences: requirements, competences_du_candidat: skills },
    schema: Plan,
  });
  // Seules les compétences réellement signalées absentes font l'objet d'un plan ; liens tirés du catalogue.
  return {
    items: data.items
      .filter((i) => missing.some((m) => has(i.skill, m) || has(m, i.skill)))
      .map((i) => ({ ...i, resources: resourcesFor(i.skill) })),
    kind,
  };
}

export async function learningPlan(provider: LlmProvider, g: GenerationSnapshot) {
  const missing = meaningful(g, g.cv.missingKeywords).slice(0, 8);
  if (!missing.length) return { items: [], providerKind: provider.kind };
  const { items, kind } = await planFor(provider, missing, g.analysis.requirements, g.profile.skills);
  return { items, providerKind: kind };
}

/**
 * Plan sur tous les CV du candidat (ADR 0029) : les compétences absentes les plus demandées d'abord, celles
 * qui reviennent dans plusieurs offres méritent l'effort en premier.
 */
export async function learningOverview(provider: LlmProvider, gens: GenerationSnapshot[]) {
  const count = new Map<string, { skill: string; offerTitles: Set<string> }>();
  for (const g of gens)
    for (const skill of meaningful(g, g.cv.missingKeywords)) {
      const key = normalize(skill);
      const entry = count.get(key) ?? { skill, offerTitles: new Set<string>() };
      entry.offerTitles.add(g.offerTitle);
      count.set(key, entry);
    }
  const skills = [...count.values()]
    .map((s) => ({ skill: s.skill, offers: s.offerTitles.size, offerTitles: [...s.offerTitles].slice(0, 5) }))
    .sort((a, b) => b.offers - a.offers || a.skill.localeCompare(b.skill))
    .slice(0, 10);
  const top = skills.slice(0, 5).map((s) => s.skill);
  if (!top.length || !gens[0]) return { skills, items: [], providerKind: provider.kind };
  const requirements = gens
    .flatMap((g) => g.analysis.requirements)
    .filter((r) => top.some((t) => has(r.text, t)))
    .slice(0, 20);
  const { items, kind } = await planFor(provider, top, requirements, gens[0].profile.skills);
  return { skills, items, providerKind: kind };
}

/* --- 6. Traduction fidèle -------------------------------------------------------------------------- */

const Translated = z.object({ lines: z.array(z.object({ path: z.string(), text: z.string() })) });

/** Glossaire métier imposé au traducteur : termes de CV dont la traduction varie trop d'un modèle à l'autre. */
export const TRANSLATION_GLOSSARY: Record<"en" | "de", Record<string, string>> = {
  en: {
    "tableau de bord": "dashboard",
    "tableaux de bord": "dashboards",
    "entrepôt de données": "data warehouse",
    "revue de code": "code review",
    "mise en production": "deployment",
    alternance: "work-study programme",
    stage: "internship",
    "chef de projet": "project manager",
  },
  de: {
    "tableau de bord": "Dashboard",
    "tableaux de bord": "Dashboards",
    "entrepôt de données": "Data Warehouse",
    "revue de code": "Code-Review",
    "mise en production": "Produktivsetzung",
    alternance: "duales Studium",
    stage: "Praktikum",
    "chef de projet": "Projektleiter/in",
  },
};

/** Noms propres du profil (employeurs, projets, écoles, compétences) : ils doivent survivre à la traduction. */
function properNouns(profile: Profile): string[] {
  return [
    ...profile.work.map((w) => w.name),
    ...profile.projects.map((p) => p.name),
    ...profile.education.map((e) => e.institution),
    ...profile.certificates.map((c) => c.name),
    ...profile.skills.flatMap((s) => [s.name, ...s.keywords]),
  ].filter((t): t is string => Boolean(t && t.trim().length > 1));
}

/**
 * Une traduction est admise si elle garde les mêmes nombres et chaque nom propre de l'original. Renvoie la
 * raison du refus, en français, ou `null`.
 */
export function translationIssue(profile: Profile, source: string, text: string): string | null {
  if (numbers(text).join("|") !== numbers(source).join("|"))
    return "Les chiffres doivent rester ceux de l'original.";
  const lost = properNouns(profile).find((n) => has(source, n) && !has(text, n));
  return lost ? `« ${lost} » doit rester tel quel.` : null;
}

export async function translateCv(provider: LlmProvider, g: GenerationSnapshot, lang: "en" | "de") {
  const lignes = cvLines(g.cv).map(({ path, line }) => ({ path, text: line.text }));
  const { data, kind } = await assist({
    provider,
    step: "traduction",
    system: assistantPrompts.system("traduction"),
    data: { langue: lang, glossaire: TRANSLATION_GLOSSARY[lang], lignes },
    schema: Translated,
    maxTokens: 8000,
  });
  const source = new Map(lignes.map((l) => [l.path, l.text]));
  // Garde-fou : mêmes nombres et mêmes noms propres que l'original, sinon la ligne est écartée.
  const kept = data.lines.filter(
    (l) => source.has(l.path) && !translationIssue(g.profile, source.get(l.path)!, l.text),
  );
  const keptPaths = new Set(kept.map((l) => l.path));
  return {
    lang,
    lines: kept.map((l) => ({ path: l.path, source: source.get(l.path)!, text: l.text })),
    rejected: lignes.length - kept.length,
    rejectedPaths: lignes.filter((l) => !keptPaths.has(l.path)).map((l) => l.path),
    edited: [] as string[],
    providerKind: kind,
  };
}

/* --- 8. Conseillère ATS ---------------------------------------------------------------------------- */

const Advice = z.object({ advice: z.array(z.object({ term: z.string(), advice: z.string() })) });

/** Statut de chaque mot-clé, calculé par le code : l'IA ne fait que formuler le conseil. */
export function keywordStatus(
  g: Pick<GenerationSnapshot, "cv" | "profile" | "offerTitle" | "analysis" | "offerText">,
) {
  const lines = cvLines(g.cv);
  const facts = factIndex(g.profile);
  const corpus = profileCorpus(g.profile);
  const terms = meaningful(
    g,
    g.analysis.keywords.map((k) => k.term),
  );
  return terms.slice(0, 20).map((term) => {
    const inCv = lines.find(({ line }) => has(line.text, term));
    if (inCv) return { term, status: "place" as const, where: inCv.path };
    const fact = [...facts].find(([, text]) => has(text, term));
    if (fact || has(corpus, term)) return { term, status: "a_placer" as const, where: fact?.[0] ?? null };
    return { term, status: "absent" as const, where: null };
  });
}

export async function atsAdvice(provider: LlmProvider, g: GenerationSnapshot) {
  const keywords = keywordStatus(g);
  const { data, kind } = await assist({
    provider,
    step: "conseils-ats",
    system: assistantPrompts.system("conseils-ats"),
    data: { offre: g.offerTitle, mots_cles: keywords },
    schema: Advice,
  });
  const advice = new Map(data.advice.map((a) => [normalize(a.term), a.advice]));
  return {
    keywords: keywords.map((k) => ({ ...k, advice: advice.get(normalize(k.term)) ?? defaultAdvice(k) })),
    providerKind: kind,
  };
}

function defaultAdvice(k: { term: string; status: "place" | "a_placer" | "absent" }) {
  if (k.status === "place") return `« ${k.term} » figure déjà dans votre CV : les logiciels le repéreront.`;
  if (k.status === "a_placer")
    return `« ${k.term} » est dans votre profil mais pas dans ce CV : reprenez la réalisation qui le cite.`;
  return `« ${k.term} » n'apparaît pas dans votre profil : ne l'ajoutez que si vous le maîtrisez vraiment.`;
}

/** Refus d'une proposition ATS, avec sa raison en français. */
export class AtsProposalError extends Error {}

/**
 * Conseil appliqué (ADR 0029, point 4) : le fait du profil qui contient le mot-clé, recopié tel quel, à
 * ajouter à l'entrée du CV qui le porte (ou au résumé pour une compétence). Aucun texte n'est rédigé.
 */
export function atsProposal(g: GenerationSnapshot, term: string, wanted?: string) {
  const facts = factIndex(g.profile);
  const matching = [...facts].filter(
    ([pointer, text]) =>
      has(text, term) &&
      /^\/(work|projects)\/\d+\/(highlights\/\d+|summary|description)$|^\/skills\/\d+$|^\/basics\/summary$/.test(
        pointer,
      ),
  );
  if (!matching.length)
    throw new AtsProposalError(
      `« ${term} » ne figure dans aucun fait du profil qu'on puisse reprendre tel quel.`,
    );
  const entryFor = (pointer: string): string | null => {
    const [, section, index] = pointer.split("/");
    if (section === "work" || section === "projects") {
      const list = section === "work" ? g.cv.work : g.cv.projects;
      const i = list.findIndex((e) => e.ref === `/${section}/${index}`);
      return i >= 0 ? `/${section}/${i}` : null;
    }
    return g.cv.summary.length < 4 ? "/summary" : null;
  };
  const candidates = matching
    .map(([pointer, text]) => ({ pointer, text, entry: entryFor(pointer) }))
    .filter((c): c is { pointer: string; text: string; entry: string } => c.entry !== null);
  // Entrée choisie par glisser-déposer : le fait doit en venir (le résumé admet tout fait).
  const chosen = wanted
    ? (candidates.find((c) => c.entry === wanted) ??
      (wanted === "/summary" && g.cv.summary.length < 4
        ? { ...candidates[0]!, entry: "/summary" }
        : undefined))
    : candidates[0];
  if (!chosen)
    throw new AtsProposalError(
      wanted
        ? `« ${term} » ne vient pas de cette rubrique du CV : déposez-le sur l'expérience qui le cite.`
        : `L'expérience qui cite « ${term} » n'apparaît pas dans ce CV ciblé (ou le résumé est complet).`,
    );
  const [, section, index] = chosen.entry.split("/");
  const entryLabel =
    section === "summary"
      ? "Résumé"
      : section === "work"
        ? (() => {
            const w = g.profile.work[Number(g.cv.work[Number(index)]!.ref.split("/")[2])]!;
            return [w.position, w.name].filter(Boolean).join(" · ");
          })()
        : (g.profile.projects[Number(g.cv.projects[Number(index)]!.ref.split("/")[2])]?.name ?? "Projet");
  return {
    term,
    entry: chosen.entry,
    entryLabel,
    text: chosen.text.slice(0, 500),
    sources: [chosen.pointer],
  };
}

/** Couverture des mots-clés de chaque CV, calcul du code seul : pour comparer les offres entre elles. */
export function atsCoverage(
  g: Pick<GenerationSnapshot, "cv" | "profile" | "offerTitle" | "analysis" | "offerText">,
) {
  const status = keywordStatus(g);
  return {
    placed: status.filter((k) => k.status === "place").length,
    possible: status.filter((k) => k.status !== "absent").length,
    total: status.length,
  };
}

/* --- Mode démonstration : réponses construites à partir des vraies données, sans modèle ------------- */

const ESCALATION = [
  "dirige",
  "pilote",
  "pilotage",
  "reconnu",
  "expert",
  "leader",
  "chef",
  "seul",
  "responsable de",
  "supervise",
];

const GLOSSARY: Record<"en" | "de", [RegExp, string][]> = {
  en: [
    [/\bréduction de\b/gi, "reduced"],
    [/\bmigration de\b/gi, "migrated"],
    [/\bmise en place de\b/gi, "set up"],
    [/\bdéveloppement de\b/gi, "developed"],
    [/\bconception de\b/gi, "designed"],
    [/\brevue de code\b/gi, "code review"],
    [/\bdu temps de réponse\b/gi, "response time"],
    [/\bservices\b/gi, "services"],
    [/\btests d'intégration\b/gi, "integration tests"],
    [/\bdéveloppeuse\b|\bdéveloppeur\b/gi, "developer"],
  ],
  de: [
    [/\bréduction de\b/gi, "Reduzierung von"],
    [/\bmigration de\b/gi, "Migration von"],
    [/\bmise en place de\b/gi, "Einführung von"],
    [/\bdéveloppement de\b/gi, "Entwicklung von"],
    [/\bconception de\b/gi, "Konzeption von"],
    [/\brevue de code\b/gi, "Code-Review"],
    [/\bdu temps de réponse\b/gi, "der Antwortzeit"],
    [/\btests d'intégration\b/gi, "Integrationstests"],
    [/\bdéveloppeuse\b|\bdéveloppeur\b/gi, "Entwickler/in"],
  ],
};

/** Repères de la méthode STAR en mode démonstration (texte normalisé). */
const STAR_MARKERS: Record<(typeof STAR_PARTS)[number], RegExp> = {
  situation: /\b(lorsque|quand|chez|dans le cadre|contexte|projet|situation)\b/,
  task: /\b(objectif|mission|devais|charge|but|besoin)\b/,
  action: /\b(j ai|nous avons|mis en place|developpe|concu|organise|propose|ecrit)\b/,
  result: /\b(resultat|permis|reduit|augmente|gagne|ameliore)\b|\d/,
};

const LEVEL_QUESTIONS: Record<InterviewLevel, { question: string; intent: string; tip: string }[]> = {
  rh: [
    {
      question: "Présentez-vous en deux minutes.",
      intent: "Vérifier la clarté de votre parcours et le lien avec le poste.",
      tip: "Trois temps : qui vous êtes, deux réalisations marquantes, pourquoi ce poste maintenant.",
    },
    {
      question: "Où vous voyez-vous dans trois ans ?",
      intent: "Mesurer la cohérence de votre projet avec le poste.",
      tip: "Restez concret : les compétences que vous voulez approfondir dans ce poste.",
    },
  ],
  manager: [
    {
      question: "Racontez une situation où vous avez dû gérer une priorité imprévue.",
      intent: "Évaluer votre organisation et votre sang-froid.",
      tip: "Méthode STAR, et terminez par ce que vous en avez retenu.",
    },
  ],
  technique: [
    {
      question:
        "Comment vous y prendriez-vous pour fiabiliser une chaîne de données qui échoue une fois par semaine ?",
      intent: "Évaluer votre démarche de diagnostic, pas une réponse toute faite.",
      tip: "Pensez à voix haute : observer, isoler la cause, corriger, prévenir.",
    },
  ],
};

export const assistantDemoHandlers: Record<string, DemoHandler> = {
  "juge-fidelite": (input) => {
    const { lignes } = input as { lignes: ReturnType<typeof linesWithSources> };
    return {
      verdicts: lignes.map((l) => {
        const source = l.sources.map((s) => s.text).join(" ");
        const added = ESCALATION.find((w) => has(l.text, w) && !has(source, w));
        if (added)
          return {
            path: l.path,
            verdict: "nuance" as const,
            explanation: `« ${added} » renforce le rôle décrit par la source. Vérifiez que c'est exact.`,
            // Démonstration : la reformulation la plus sûre est la source elle-même.
            suggestion: l.sources[0]?.text ?? null,
          };
        return {
          path: l.path,
          verdict: "fidele" as const,
          explanation:
            normalize(l.text) === normalize(source)
              ? "Recopiée à l'identique de votre profil."
              : "Reformulation conforme au sens de la source.",
          suggestion: null,
        };
      }),
    };
  },
  "coach-questions": (input) => {
    const { offre, niveau, competences_absentes, faits } = input as {
      offre: { titre: string; exigences: OfferAnalysis["requirements"] };
      niveau: InterviewLevel;
      competences_absentes: string[];
      faits: { pointer: string; text: string }[];
    };
    const related = (term: string) => faits.filter((f) => has(f.text, term)).map((f) => f.pointer);
    const fromRequirements = offre.exigences
      .filter((r) => r.priority === "must")
      .slice(0, niveau === "technique" ? 4 : 2)
      .map((r) => {
        const skill = r.skills[0] ?? r.text;
        return {
          question:
            niveau === "technique"
              ? `Comment utiliseriez-vous ${skill} pour répondre à ce besoin : « ${r.text} » ?`
              : `Pouvez-vous décrire une situation concrète où vous avez utilisé ${skill} ?`,
          intent: `Vérifier votre maîtrise de « ${skill} », exigée par l'offre.`,
          sources: related(skill).slice(0, 2),
          tip: "Répondez avec la méthode STAR : situation, tâche, action, résultat chiffré.",
        };
      });
    const highlight = faits.find((f) => /\d/.test(f.text));
    const behaviour =
      highlight && niveau !== "technique"
        ? [
            {
              question: `Racontez-nous comment vous avez obtenu ce résultat : « ${highlight.text} ».`,
              intent: "Comprendre votre rôle exact et votre manière de travailler.",
              sources: [highlight.pointer],
              tip: "Précisez ce que vous avez fait vous-même, et ce qui revient à l'équipe.",
            },
          ]
        : [];
    const gaps = competences_absentes.slice(0, 2).map((k) => ({
      question: `L'offre mentionne ${k}. Quelle est votre expérience dans ce domaine ?`,
      intent: `Évaluer votre honnêteté et votre capacité à progresser sur « ${k} ».`,
      sources: [],
      tip: "Dites franchement que vous ne l'avez pas pratiqué, puis montrez comment vous l'apprendriez.",
    }));
    return {
      questions: [
        {
          question: `Pourquoi le poste « ${offre.titre} » vous intéresse-t-il ?`,
          intent: "Mesurer votre motivation et votre connaissance de l'offre.",
          sources: [],
          tip: "Reliez deux exigences de l'offre à deux réalisations de votre parcours.",
        },
        ...LEVEL_QUESTIONS[niveau].map((q) => ({ ...q, sources: [] })),
        ...fromRequirements,
        ...behaviour,
        ...gaps,
      ],
    };
  },
  "coach-retour": (input) => {
    const { reponse_du_candidat: answer, faits } = input as {
      reponse_du_candidat: string;
      faits: { pointer: string; text: string }[];
    };
    const n = normalize(answer);
    const star = Object.fromEntries(STAR_PARTS.map((p) => [p, STAR_MARKERS[p].test(n)])) as Record<
      (typeof STAR_PARTS)[number],
      boolean
    >;
    // Extraits : la première phrase de la réponse qui porte chaque repère, recopiée telle quelle.
    const sentences = answer
      .replace(/\s+/g, " ")
      .split(/(?<=[.!?;])\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const highlights = STAR_PARTS.flatMap((part) => {
      const s = star[part] && sentences.find((x) => STAR_MARKERS[part].test(normalize(x)));
      return s ? [{ part, excerpt: s }] : [];
    });
    const labels = {
      situation: "le contexte",
      task: "votre objectif",
      action: "vos actions",
      result: "le résultat",
    };
    const words = new Set(n.split(" ").filter((w) => w.length > 5));
    const close = faits
      .map((f) => ({
        f,
        score: normalize(f.text)
          .split(" ")
          .filter((w) => words.has(w)).length,
      }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 2)
      .map((x) => x.f.pointer);
    return {
      star,
      highlights,
      strengths: STAR_PARTS.filter((k) => star[k]).map((k) => `Vous exposez clairement ${labels[k]}.`),
      improvements: [
        ...STAR_PARTS.filter((k) => !star[k]).map(
          (k) => `Ajoutez ${labels[k]} pour compléter la méthode STAR.`,
        ),
        ...(answer.length < 300
          ? ["Développez un peu : une bonne réponse dure environ une à deux minutes."]
          : []),
      ],
      facts: close,
      followUp: !star.result
        ? "Et concrètement, quel a été le résultat ? Pouvez-vous le chiffrer ?"
        : !star.action
          ? "Qu'avez-vous fait, vous, personnellement ?"
          : "Si c'était à refaire, que changeriez-vous ?",
    };
  },
  "plan-progression": (input) => {
    const { competences_absentes, exigences, competences_du_candidat } = input as {
      competences_absentes: string[];
      exigences: OfferAnalysis["requirements"];
      competences_du_candidat: Profile["skills"];
    };
    const base =
      competences_du_candidat[0]?.keywords[0] ?? competences_du_candidat[0]?.name ?? "vos outils actuels";
    return {
      items: competences_absentes.slice(0, 5).map((skill) => {
        const req = exigences.find((r) => has(r.text, skill));
        return {
          skill,
          why: req
            ? `${req.priority === "must" ? "Exigé" : "Apprécié"} par l'offre : « ${req.text} ».`
            : "Cité parmi les mots-clés de l'offre.",
          steps: [
            `Suivre la documentation officielle de ${skill} et un tutoriel de prise en main.`,
            `Reproduire un cas d'usage simple de ${skill} en lien avec ${base}.`,
            "Publier le résultat (dépôt public, article court) pour pouvoir le montrer.",
          ],
          project: `Intégrer ${skill} à un petit projet personnel utilisant ${base}, puis ajouter la réalisation obtenue à votre profil.`,
          weeks: req?.priority === "must" ? 4 : 2,
        };
      }),
    };
  },
  traduction: (input) => {
    const { langue, lignes } = input as { langue: "en" | "de"; lignes: { path: string; text: string }[] };
    return {
      lines: lignes.map((l) => ({
        path: l.path,
        text: GLOSSARY[langue].reduce((t, [pattern, word]) => t.replace(pattern, word), l.text),
      })),
    };
  },
  "conseils-ats": (input) => {
    const { mots_cles } = input as { mots_cles: ReturnType<typeof keywordStatus> };
    return { advice: mots_cles.map((k) => ({ term: k.term, advice: defaultAdvice(k) })) };
  },
};
