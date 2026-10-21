import {
  createPromptLoader,
  dataBlock,
  LlmBudgetExceededError,
  LlmRefusalError,
  LlmSchemaError,
  LlmUnavailableError,
  type LlmMessage,
  type LlmProvider,
  type LlmUsage,
} from "@attesta/llm-client";
import { TailoredCv, type OfferAnalysis, type Profile } from "@attesta/shared-schemas";
import { z } from "zod";
import { entryOutlines, profileFacts, type EntryOutline, type Fact } from "./facts.js";
import {
  checkFaithfulness,
  missingKeywords,
  normalize,
  sanitizeText,
  type RemovedLine,
} from "./faithfulness.js";

/** Prompts versionnés du service (ADR 0016, point 8) ; historique : prompts/CHANGELOG.md. */
export const prompts = createPromptLoader(new URL("../prompts/", import.meta.url), { redaction: "v1" });

/** Relances après une sortie non conforme au contrat (en plus du premier essai). */
export const MAX_SCHEMA_RETRIES = 2;

const Line = z.object({ text: z.string(), sources: z.array(z.string()) });
const EntryLines = z.object({ ref: z.string(), highlights: z.array(Line) });

/** Schéma demandé au modèle : simple, les contraintes du contrat sont vérifiées ensuite. */
export const DraftOutput = z.object({
  headline: Line.nullable(),
  summary: z.array(Line),
  work: z.array(EntryLines),
  projects: z.array(EntryLines),
  skills: z.array(z.string()),
});
export type DraftOutput = z.infer<typeof DraftOutput>;

export type ProgressEvent =
  | { stage: "analyse"; status: "done"; keywords: number }
  | { stage: "redaction"; status: "start"; attempt: number }
  | { stage: "controle"; status: "done"; supported: number; checked: number };

export interface PipelineDeps {
  provider: LlmProvider;
  /** Budget par CV, au-delà duquel aucun nouvel appel n'est lancé. */
  maxCostUsd: number;
}

export interface PipelineInput {
  profile: Profile;
  offerText: string;
  /** Analyse de l'offre, faite par jobs-matching à l'enregistrement de l'offre. */
  analysis: OfferAnalysis;
}

export type DegradedReason = "indisponible" | "refus" | "budget" | "non-conforme";

export type GenerationResult =
  | {
      status: "ok";
      cv: TailoredCv;
      report: ReturnType<typeof checkFaithfulness>["report"];
      removed: RemovedLine[];
      usage: LlmUsage[];
      model: string;
      providerKind: LlmProvider["kind"];
      pipelineVersion: string;
    }
  | { status: "degraded"; reason: DegradedReason; usage: LlmUsage[] };

class BudgetExceededError extends Error {}

/**
 * Pipeline de génération : rédaction ciblée à partir des seuls faits du profil, validation par le contrat
 * strict avec relances bornées, puis contrôle de fidélité. Toute panne du fournisseur aboutit au mode
 * dégradé, jamais à une sortie non validée (ADR 0003).
 */
export async function generateTailoredCv(
  deps: PipelineDeps,
  input: PipelineInput,
  options: { onProgress?: (event: ProgressEvent) => void; signal?: AbortSignal } = {},
): Promise<GenerationResult> {
  const usage: LlmUsage[] = [];
  const spent = () => usage.reduce((sum, u) => sum + u.costUsd, 0);
  const guardBudget = () => {
    if (spent() >= deps.maxCostUsd) throw new BudgetExceededError();
  };

  try {
    const missing = missingKeywords(input.analysis, input.profile);
    options.onProgress?.({ stage: "analyse", status: "done", keywords: input.analysis.keywords.length });
    const cv = await draft(deps, input.profile, input.analysis, missing, usage, guardBudget, options);
    const outcome = checkFaithfulness(cv, input.profile, input.offerText);
    options.onProgress?.({
      stage: "controle",
      status: "done",
      supported: outcome.report.supportedLines,
      checked: outcome.report.checkedLines,
    });
    return {
      status: "ok",
      ...outcome,
      usage,
      model: deps.provider.model,
      providerKind: deps.provider.kind,
      pipelineVersion: prompts.signature("redaction"),
    };
  } catch (error) {
    if (error instanceof LlmSchemaError && error.usage) usage.push(error.usage);
    const reason = degradedReason(error);
    if (!reason) throw error;
    return { status: "degraded", reason, usage };
  }
}

function degradedReason(error: unknown): DegradedReason | undefined {
  if (error instanceof LlmUnavailableError) return "indisponible";
  if (error instanceof LlmRefusalError) return "refus";
  if (error instanceof BudgetExceededError || error instanceof LlmBudgetExceededError) return "budget";
  if (error instanceof LlmSchemaError) return "non-conforme";
  return undefined;
}

type DraftOptions = { onProgress?: (event: ProgressEvent) => void; signal?: AbortSignal };

async function draft(
  deps: PipelineDeps,
  profile: Profile,
  analysis: OfferAnalysis,
  missing: string[],
  usage: LlmUsage[],
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
        system: prompts.system("redaction"),
        messages,
        schema: DraftOutput,
        effort: "medium",
        maxTokens: 16000,
        input: { profile, analysis, facts, outline },
        signal: options.signal,
      });
      usage.push(result.usage);
      output = result.data;
    } catch (error) {
      if (!(error instanceof LlmSchemaError) || attempt > MAX_SCHEMA_RETRIES) throw error;
      if (error.usage) usage.push(error.usage);
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
 * Complète la sortie du modèle par le code : aucune expérience, aucun projet, aucune formation ni
 * compétence du profil n'est perdu. Les entrées que le modèle n'a pas reprises sont ajoutées avec leurs
 * faits d'origine, recopiés à l'identique.
 */
export function assemble(output: DraftOutput, profile: Profile, missing: string[]): unknown {
  const clean = (line: { text: string; sources: string[] }) => ({ ...line, text: sanitizeText(line.text) });
  const cleanEntry = (e: DraftOutput["work"][number]) => ({ ...e, highlights: e.highlights.map(clean) });
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
    headline: output.headline ? clean(output.headline) : undefined,
    summary: output.summary.map(clean),
    work: complete("work", output.work.map(cleanEntry)),
    projects: complete("projects", output.projects.map(cleanEntry)),
    education: allRefs("education").map((ref) => ({ ref })),
    skills,
    languages: allRefs("languages"),
    certificates: allRefs("certificates"),
    missingKeywords: missing.slice(0, 60),
  };
}

/**
 * Rédaction de démonstration, sans modèle : les faits du profil recopiés tels quels, ordonnés par
 * recouvrement avec les mots-clés de l'offre. Aucune reformulation ; l'interface l'indique au candidat.
 */
export function demoDraft(
  analysis: OfferAnalysis,
  facts: Fact[],
  outline: { work: EntryOutline[]; projects: EntryOutline[]; skills: { ref: string; name: string }[] },
): DraftOutput {
  const keywords = analysis.keywords.map((k) => normalize(k.term));
  const relevance = (text: string) => keywords.filter((k) => normalize(text).includes(k)).length;
  const line = (f: Fact) => ({ text: f.text, sources: [f.pointer] });
  const of = (prefix: string) =>
    facts.filter((f) => f.pointer.startsWith(prefix)).sort((a, b) => relevance(b.text) - relevance(a.text));
  const sum = (lines: { text: string }[]) => lines.reduce((n, l) => n + relevance(l.text), 0);
  const entries = (list: EntryOutline[]) =>
    list
      .map((e) => ({ ref: e.ref, highlights: of(`${e.ref}/highlights/`).map(line) }))
      .sort((a, b) => sum(b.highlights) - sum(a.highlights));
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

export const demoHandlers = {
  redaction: (input: unknown) => {
    const { analysis, facts, outline } = input as {
      analysis: OfferAnalysis;
      facts: Fact[];
      outline: { work: EntryOutline[]; projects: EntryOutline[]; skills: { ref: string; name: string }[] };
    };
    return demoDraft(analysis, facts, outline);
  },
};
