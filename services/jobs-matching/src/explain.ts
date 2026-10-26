import { assist, type DemoHandler, type LlmProvider } from "@attesta/llm-client";
import type { Profile } from "@attesta/shared-schemas";
import { z } from "zod";
import { demoAnalysis, placeNames, prompts } from "./analysis.js";
import type { StoredPosting } from "./repository.js";
import { normalize } from "./text.js";

/*
 * Explication de correspondance (ADR 0028, rôle 5). L'IA repère les compétences demandées par l'annonce et
 * rédige une synthèse ; le code décide de ce que le candidat possède (fait du profil à l'appui), de ce qui
 * manque et du score. L'IA ne peut donc pas « gonfler » une correspondance.
 */

const Explained = z.object({
  required: z.array(z.object({ skill: z.string(), priority: z.enum(["must", "nice"]) })),
  summary: z.string(),
});

const has = (haystack: string, term: string) => {
  const needle = normalize(term);
  return needle.trim().length > 1 && normalize(haystack).includes(needle);
};

/** Textes du profil où chercher une preuve, avec un libellé lisible. */
function evidenceSources(profile: Profile) {
  return [
    ...profile.work.flatMap((w) => w.highlights.map((h) => ({ text: h, label: `${w.position} : ${h}` }))),
    ...profile.projects.flatMap((p) => p.highlights.map((h) => ({ text: h, label: `${p.name} : ${h}` }))),
    ...profile.skills.map((s) => ({
      text: [s.name, ...s.keywords].join(" "),
      label: `Compétence ${s.name} : ${s.keywords.join(", ")}`,
    })),
    ...profile.education.map((e) => ({
      text: [e.studyType, e.area, e.institution, ...e.courses].filter(Boolean).join(" "),
      label: `Formation : ${[e.studyType, e.area].filter(Boolean).join(" ")} – ${e.institution}`,
    })),
    ...profile.certificates.map((c) => ({ text: c.name, label: `Certificat : ${c.name}` })),
    ...profile.languages.map((l) => ({ text: l.language, label: `Langue : ${l.language}` })),
  ];
}

const postingText = (p: StoredPosting) =>
  [p.title, p.company, p.city, "", p.body]
    .filter((l) => l !== null)
    .join("\n")
    .slice(0, 8000);

export async function explainMatch(provider: LlmProvider, posting: StoredPosting, profile: Profile) {
  const { data, kind } = await assist({
    provider,
    step: "explication-correspondance",
    system: prompts.system("explication-correspondance"),
    data: {
      annonce: postingText(posting),
      competences_du_candidat: profile.skills.map((s) => ({ name: s.name, keywords: s.keywords })),
    },
    schema: Explained,
  });
  const sources = evidenceSources(profile);
  const notSkills = excluded(posting);
  const required = [
    ...new Map(data.required.map((r) => [normalize(r.skill), { ...r, skill: r.skill.trim() }])).values(),
  ]
    .filter((r) => r.skill.length > 1 && !notSkills.has(normalize(r.skill)))
    .slice(0, 20);
  const matched: { skill: string; evidence: string }[] = [];
  const missing: string[] = [];
  const missingMust: string[] = [];
  // Score pondéré : une exigence compte double par rapport à un simple souhait.
  let earned = 0;
  let total = 0;
  for (const { skill, priority } of required) {
    const weight = priority === "must" ? 2 : 1;
    total += weight;
    const proof = sources.find((s) => has(s.text, skill));
    if (proof) {
      matched.push({ skill, evidence: proof.label });
      earned += weight;
    } else {
      missing.push(skill);
      if (priority === "must") missingMust.push(skill);
    }
  }
  return {
    score: total ? Math.round((earned / total) * 100) : 0,
    matched,
    missing,
    missingMust,
    summary: data.summary,
    providerKind: kind,
  };
}

/** Lieu, employeur et pays de l'annonce : jamais des compétences. */
function excluded(posting: StoredPosting): Set<string> {
  const set = placeNames(postingText(posting));
  for (const part of [posting.city, posting.company].filter(Boolean) as string[])
    for (const w of part.split(/[\s,()–-]+/)) if (w.length > 1) set.add(normalize(w));
  return set;
}

/**
 * Scores de toute une liste d'offres, calculés par le code seul (ADR 0029) : termes techniques de l'annonce
 * retrouvés dans le profil. Aucun appel au modèle ; l'explication détaillée reste à la demande.
 */
export function quickScores(postings: StoredPosting[], profile: Profile) {
  const corpus = evidenceSources(profile)
    .map((s) => s.text)
    .join("\n");
  return postings.map((p) => {
    const notSkills = excluded(p);
    // Même repérage que l'analyse sans IA : sigles et termes techniques, lieux et noms communs allemands exclus.
    const terms = demoAnalysis(`${p.title}\n${p.body}`)
      .keywords.map((k) => k.term)
      .filter((t) => t.length > 1 && !notSkills.has(normalize(t)))
      .slice(0, 25);
    const matched = terms.filter((t) => has(corpus, t)).length;
    return {
      id: p.id,
      score: terms.length ? Math.round((matched / terms.length) * 100) : 0,
      matched,
      total: terms.length,
    };
  });
}

const escapeRegExp = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, String.raw`\$&`);

/** Démonstration : compétences repérées par l'analyse sans IA, synthèse construite à partir du résultat. */
export const explainDemoHandlers: Record<string, DemoHandler> = {
  "explication-correspondance": (input) => {
    const { annonce, competences_du_candidat } = input as {
      annonce: string;
      competences_du_candidat: { name: string; keywords: string[] }[];
    };
    // Démonstration : un terme cité près de « requis », « indispensable », « maîtrise » est exigé.
    const required = demoAnalysis(annonce).keywords.map((k) => {
      const term = escapeRegExp(k.term);
      const must = new RegExp(
        `(requis|indispensable|ma[iî]trise|obligatoire|exig)[^.\\n]{0,80}${term}|${term}[^.\\n]{0,40}(requis|indispensable|obligatoire)`,
        "i",
      ).test(annonce);
      return { skill: k.term, priority: must ? ("must" as const) : ("nice" as const) };
    });
    const mine = competences_du_candidat.flatMap((s) => [s.name, ...s.keywords]);
    const shared = required.map((r) => r.skill).filter((r) => mine.some((m) => has(m, r) || has(r, m)));
    const summary = shared.length
      ? `Cette annonce cite ${shared.slice(0, 3).join(", ")}, que vous maîtrisez. Vérifiez les autres exigences avant de postuler.`
      : "Peu de compétences de votre profil apparaissent dans cette annonce : elle semble éloignée de votre parcours.";
    return { required, summary };
  },
};
