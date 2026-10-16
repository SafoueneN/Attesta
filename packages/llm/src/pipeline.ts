import { createHash } from "node:crypto";
import { OfferAnalysis, TailoredCv, type Profile } from "@attesta/schema";
import { z } from "zod";
import { entryOutlines, profileFacts } from "./facts.js";
import { checkFaithfulness, missingKeywords, type RemovedLine } from "./faithfulness.js";
import { DraftOutput, OfferAnalysisOutput } from "./llm-schemas.js";
import { dataBlock, PIPELINE_VERSION, systemPrompt } from "./prompts.js";
import {
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type LlmMessage,
  type LlmProvider,
  type LlmUsage,
} from "./provider.js";

/** Relances après une sortie non conforme au contrat (en plus du premier essai). */
export const MAX_SCHEMA_RETRIES = 2;

export type ProgressEvent =
  | { stage: "analyse"; status: "start" }
  | { stage: "analyse"; status: "done"; keywords: number }
  | { stage: "redaction"; status: "start"; attempt: number }
  | { stage: "controle"; status: "done"; supported: number; checked: number };

export interface PipelineDeps {
  provider: LlmProvider;
  /** Budget par CV, au-delà duquel aucun nouvel appel n'est lancé. */
  maxCostUsd: number;
  /** Cache des analyses d'offre (texte public, aucune donnée du candidat). */
  analysisCache?: Map<string, OfferAnalysis>;
  onUsage?: (usage: LlmUsage) => void;
}

export interface PipelineInput {
  profile: Profile;
  offerText: string;
}

export type DegradedReason = "indisponible" | "refus" | "budget" | "non-conforme";

export type GenerationResult =
  | {
      status: "ok";
      cv: TailoredCv;
      report: ReturnType<typeof checkFaithfulness>["report"];
      removed: RemovedLine[];
      analysis: OfferAnalysis;
      usage: LlmUsage[];
      model: string;
      providerKind: LlmProvider["kind"];
      pipelineVersion: string;
    }
  | { status: "degraded"; reason: DegradedReason; usage: LlmUsage[] };

class BudgetExceededError extends Error {}

const sha256 = (text: string) => createHash("sha256").update(text).digest("hex");

/**
 * Pipeline de génération : analyse de l'offre, rédaction ciblée, validation par
 * le contrat strict avec relances bornées, puis contrôle de fidélité. Toute panne
 * du fournisseur aboutit au mode dégradé, jamais à une sortie non validée.
 */
export async function generateTailoredCv(
  deps: PipelineDeps,
  input: PipelineInput,
  options: { onProgress?: (event: ProgressEvent) => void; signal?: AbortSignal } = {},
): Promise<GenerationResult> {
  const usage: LlmUsage[] = [];
  const spent = () => usage.reduce((sum, u) => sum + u.costUsd, 0);
  const record = (u: LlmUsage) => {
    usage.push(u);
    deps.onUsage?.(u);
  };
  const guardBudget = () => {
    if (spent() >= deps.maxCostUsd) throw new BudgetExceededError();
  };

  try {
    options.onProgress?.({ stage: "analyse", status: "start" });
    const analysis = await analyseOffer(deps, input.offerText, record, options.signal);
    const missing = missingKeywords(analysis, input.profile);
    options.onProgress?.({ stage: "analyse", status: "done", keywords: analysis.keywords.length });

    guardBudget();
    const cv = await draft(deps, input.profile, analysis, missing, record, guardBudget, options);

    const outcome = checkFaithfulness(cv, input.profile);
    options.onProgress?.({
      stage: "controle",
      status: "done",
      supported: outcome.report.supportedLines,
      checked: outcome.report.checkedLines,
    });
    return {
      status: "ok",
      ...outcome,
      analysis,
      usage,
      model: deps.provider.model,
      providerKind: deps.provider.kind,
      pipelineVersion: PIPELINE_VERSION,
    };
  } catch (error) {
    if (error instanceof LlmSchemaError && error.usage) record(error.usage);
    const reason = degradedReason(error);
    if (!reason) throw error;
    return { status: "degraded", reason, usage };
  }
}

function degradedReason(error: unknown): DegradedReason | undefined {
  if (error instanceof LlmUnavailableError) return "indisponible";
  if (error instanceof LlmRefusalError) return "refus";
  if (error instanceof BudgetExceededError) return "budget";
  if (error instanceof LlmSchemaError) return "non-conforme";
  return undefined;
}

async function analyseOffer(
  deps: PipelineDeps,
  offerText: string,
  record: (u: LlmUsage) => void,
  signal?: AbortSignal,
): Promise<OfferAnalysis> {
  const key = `${deps.provider.model}:${PIPELINE_VERSION}:${sha256(offerText)}`;
  const cached = deps.analysisCache?.get(key);
  if (cached) return cached;

  const { data, usage } = await deps.provider.generate({
    step: "analyse-offre",
    system: systemPrompt("analyse-offre"),
    messages: [{ role: "user", content: dataBlock("offre", { texte: offerText }) }],
    schema: OfferAnalysisOutput,
    effort: "low",
    maxTokens: 8000,
    input: { offerText },
    signal,
  });
  record(usage);
  const analysis = toOfferAnalysis(data);
  deps.analysisCache?.set(key, analysis);
  return analysis;
}

/** Ramène la sortie du modèle au contrat : nulls retirés, bornes appliquées. */
export function toOfferAnalysis(data: OfferAnalysisOutput): OfferAnalysis {
  const clean = (s: string | null) => (s?.trim() ? s.trim().slice(0, 200) : undefined);
  const result = OfferAnalysis.safeParse({
    title: clean(data.title) ?? "Offre sans intitulé",
    company: clean(data.company),
    language: data.language,
    location: clean(data.location),
    contractType: data.contractType ?? undefined,
    requirements: data.requirements
      .filter((r) => r.text.trim())
      .slice(0, 40)
      .map((r) => ({
        text: r.text.trim().slice(0, 300),
        priority: r.priority,
        skills: r.skills
          .map((s) => s.trim().slice(0, 200))
          .filter(Boolean)
          .slice(0, 10),
      })),
    keywords: data.keywords
      .filter((k) => k.term.trim())
      .slice(0, 60)
      .map((k) => ({ term: k.term.trim().slice(0, 200), weight: Math.min(1, Math.max(0, k.weight)) })),
  });
  if (!result.success) throw new LlmSchemaError("Analyse d'offre non conforme au contrat");
  return result.data;
}

type DraftOptions = { onProgress?: (event: ProgressEvent) => void; signal?: AbortSignal };

async function draft(
  deps: PipelineDeps,
  profile: Profile,
  analysis: OfferAnalysis,
  missing: string[],
  record: (u: LlmUsage) => void,
  guardBudget: () => void,
  options: DraftOptions,
): Promise<TailoredCv> {
  const facts = profileFacts(profile);
  const outline = entryOutlines(profile);
  const messages: LlmMessage[] = [
    {
      role: "user",
      content: [
        dataBlock("offre_analysee", analysis),
        dataBlock("faits", facts),
        dataBlock("parcours", outline),
      ].join("\n\n"),
    },
  ];

  for (let attempt = 1; attempt <= 1 + MAX_SCHEMA_RETRIES; attempt++) {
    if (attempt > 1) guardBudget();
    options.onProgress?.({ stage: "redaction", status: "start", attempt });
    let output: DraftOutput;
    try {
      const result = await deps.provider.generate({
        step: "redaction",
        system: systemPrompt("redaction"),
        messages,
        schema: DraftOutput,
        effort: "medium",
        maxTokens: 16000,
        input: { profile, analysis, facts, outline },
        signal: options.signal,
      });
      record(result.usage);
      output = result.data;
    } catch (error) {
      if (!(error instanceof LlmSchemaError) || attempt > MAX_SCHEMA_RETRIES) throw error;
      if (error.usage) record(error.usage);
      continue;
    }

    const parsed = TailoredCv.safeParse(assemble(output, profile, missing));
    if (parsed.success) return parsed.data;
    if (attempt > MAX_SCHEMA_RETRIES) break;
    // Relance bornée : le modèle reçoit sa réponse et la liste exacte des écarts au contrat.
    messages.push(
      { role: "assistant", content: JSON.stringify(output) },
      {
        role: "user",
        content: `Ta réponse ne respecte pas le contrat. Corrige uniquement ces points et renvoie l'objet complet :\n${z.prettifyError(parsed.error)}`,
      },
    );
  }
  throw new LlmSchemaError("CV ciblé non conforme au contrat après relances");
}

/**
 * Complète la sortie du modèle par le code : aucune expérience, aucun projet,
 * aucune formation ni compétence du profil n'est perdu. Les entrées que le modèle
 * n'a pas reprises sont ajoutées avec leurs faits d'origine, recopiés à l'identique.
 */
export function assemble(output: DraftOutput, profile: Profile, missing: string[]): unknown {
  const verbatim = (section: "work" | "projects", i: number) =>
    profile[section][i]!.highlights.map((text, j) => ({
      text,
      sources: [`/${section}/${i}/highlights/${j}`],
    }));
  const complete = <E extends { ref: string }>(section: "work" | "projects", proposed: E[]) => {
    const seen = new Set<string>();
    const entries = proposed.filter((e) => !seen.has(e.ref) && seen.add(e.ref));
    const added = profile[section]
      .map((_, i) => `/${section}/${i}`)
      .filter((ref) => !seen.has(ref))
      .map((ref) => ({ ref, highlights: verbatim(section, Number(ref.split("/")[2])) }));
    return [...entries, ...added];
  };
  const allRefs = (section: "education" | "languages" | "certificates" | "skills") =>
    profile[section].map((_, i) => `/${section}/${i}`);
  const skills = [
    ...new Set([...output.skills.filter((r) => allRefs("skills").includes(r)), ...allRefs("skills")]),
  ];

  return {
    headline: output.headline ?? undefined,
    summary: output.summary,
    work: complete("work", output.work),
    projects: complete("projects", output.projects),
    education: allRefs("education").map((ref) => ({ ref })),
    skills,
    languages: allRefs("languages"),
    certificates: allRefs("certificates"),
    missingKeywords: missing.slice(0, 60),
  };
}
