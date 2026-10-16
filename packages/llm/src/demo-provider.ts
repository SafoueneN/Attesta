import type { OfferAnalysis } from "@attesta/schema";
import type { EntryOutline, Fact } from "./facts.js";
import { normalize } from "./faithfulness.js";
import type { DraftOutput, OfferAnalysisOutput } from "./llm-schemas.js";
import { LlmUnavailableError, type LlmProvider, type LlmRequest, type LlmResult } from "./provider.js";

/**
 * Fournisseur de démonstration, sans modèle ni réseau. Il recopie les faits du
 * profil, ordonnés par recouvrement avec l'offre : aucune reformulation. Sert au
 * développement local et aux tests de bout en bout ; l'interface l'indique
 * explicitement au candidat. Interdit en production.
 */
export class DemoProvider implements LlmProvider {
  readonly kind = "demo" as const;
  readonly model = "demo";

  async generate<T>(request: LlmRequest<T>): Promise<LlmResult<T>> {
    const usage = {
      step: request.step,
      model: this.model,
      inputTokens: 0,
      outputTokens: 0,
      costUsd: 0,
      latencyMs: 0,
    };
    if (request.step === "analyse-offre") {
      const { offerText } = request.input as { offerText: string };
      return { data: request.schema.parse(demoAnalysis(offerText)), usage };
    }
    if (request.step === "redaction") {
      const { analysis, facts, outline } = request.input as {
        analysis: OfferAnalysis;
        facts: Fact[];
        outline: { work: EntryOutline[]; projects: EntryOutline[]; skills: { ref: string; name: string }[] };
      };
      return { data: request.schema.parse(demoDraft(analysis, facts, outline)), usage };
    }
    if (request.step === "rerank-offres") {
      // Sans modèle : l'ordre de l'étage de rappel est conservé, aucune compétence citée.
      const { offres } = request.input as { offres: { id: string }[] };
      const data = {
        offres: offres.map((o, i) => ({ id: o.id, pertinence: 100 - i, competencesManquantes: [] })),
      };
      return { data: request.schema.parse(data), usage };
    }
    throw new LlmUnavailableError("Import de CV indisponible en mode démonstration");
  }
}

/**
 * Termes techniques de l'offre : majuscules internes, chiffres, points (Node.js,
 * PostgreSQL, AWS) et noms propres en milieu de phrase (Kubernetes).
 */
function demoAnalysis(offerText: string): OfferAnalysisOutput {
  const technical = [...offerText.matchAll(/[\p{L}][\p{L}\p{N}.+#-]*[\p{L}\p{N}+#]/gu)]
    .filter(({ 0: term, index }) => {
      if (/[.+#\d]/.test(term) || /\p{Lu}.*\p{Lu}/u.test(term)) return true;
      const before = offerText.slice(0, index).trimEnd();
      const midSentence =
        before.length > 0 && !/[.!?:\n]$/.test(before) && !/\n\s*$/.test(offerText.slice(0, index));
      return midSentence && /^\p{Lu}/u.test(term);
    })
    .map((m) => m[0]);
  const unique = [...new Map(technical.map((t) => [normalize(t), t])).values()].slice(0, 20);
  return {
    title: offerText.split(/\r?\n/)[0]!.trim().slice(0, 120) || "Offre",
    company: null,
    language: "fr",
    location: null,
    contractType: null,
    requirements: [],
    keywords: unique.map((term) => ({ term, weight: 1 })),
  };
}

function demoDraft(
  analysis: OfferAnalysis,
  facts: Fact[],
  outline: { work: EntryOutline[]; projects: EntryOutline[]; skills: { ref: string; name: string }[] },
): DraftOutput {
  const keywords = analysis.keywords.map((k) => normalize(k.term));
  const relevance = (text: string) => keywords.filter((k) => normalize(text).includes(k)).length;
  const line = (f: Fact) => ({ text: f.text, sources: [f.pointer] });
  const of = (prefix: string) =>
    facts.filter((f) => f.pointer.startsWith(prefix)).sort((a, b) => relevance(b.text) - relevance(a.text));
  const entries = (list: EntryOutline[]) =>
    list
      .map((e) => ({ ref: e.ref, highlights: of(`${e.ref}/highlights/`).map(line) }))
      .sort((a, b) => sum(b.highlights) - sum(a.highlights));
  const sum = (lines: { text: string }[]) => lines.reduce((n, l) => n + relevance(l.text), 0);
  const label = facts.find((f) => f.pointer === "/basics/label");
  const summary = facts.find((f) => f.pointer === "/basics/summary");
  return {
    headline: label ? line(label) : null,
    summary: summary ? [line(summary)] : [],
    work: entries(outline.work),
    projects: entries(outline.projects),
    skills: [...outline.skills].sort((a, b) => relevance(b.name) - relevance(a.name)).map((s) => s.ref),
  };
}
