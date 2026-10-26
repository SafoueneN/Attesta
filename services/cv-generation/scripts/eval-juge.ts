// Évaluation du juge de fidélité (ADR 0029) sur des cas annotés : npm run eval:juge.
// Sans configuration, le mode démonstration est évalué ; avec LLM_PROVIDER=anthropic|vertex, le modèle réel.
// Aucun contenu n'est journalisé ailleurs que dans cette sortie : les cas sont fictifs.
import { readFileSync } from "node:fs";
import { createLlmProvider, parseStepModels } from "@attesta/llm-client";
import type { Profile, TailoredCv } from "@attesta/shared-schemas";
import { assistantDemoHandlers, judgeFidelity } from "../src/assistants.js";

interface Case {
  text: string;
  sources: string[];
  expected: "fidele" | "a_revoir";
}
const { cases } = JSON.parse(
  readFileSync(new URL("../evals/juge-fidelite.json", import.meta.url), "utf8"),
) as {
  cases: Case[];
};

const provider = createLlmProvider(
  {
    provider: (process.env.LLM_PROVIDER as "anthropic" | "vertex" | undefined) ?? "demo",
    model: process.env.LLM_MODEL ?? "claude-opus-5-5",
    timeoutMs: 60_000,
    stepModels: parseStepModels(process.env.LLM_STEP_MODELS),
    vertexProjectId: process.env.VERTEX_PROJECT_ID,
  },
  assistantDemoHandlers,
)!;

// Un profil fictif par cas : une expérience, ses sources pour réalisations, la ligne à juger.
const profile: Profile = {
  basics: { name: "Cas d'évaluation", profiles: [] },
  work: [{ name: "Entreprise fictive", position: "Analyste", highlights: cases.flatMap((c) => c.sources) }],
  education: [],
  skills: [],
  languages: [],
  projects: [],
  certificates: [],
} as unknown as Profile;
let offset = 0;
const cv = {
  summary: [],
  work: [
    {
      ref: "/work/0",
      highlights: cases.map((c) => {
        const sources = c.sources.map((_, i) => `/work/0/highlights/${offset + i}`);
        offset += c.sources.length;
        return { text: c.text, sources };
      }),
    },
  ],
  projects: [],
  skills: [],
  missingKeywords: [],
} as unknown as TailoredCv;

const { verdicts, providerKind } = await judgeFidelity(provider, {
  profile,
  cv,
  offerTitle: "Évaluation",
  offerText: "",
  analysis: { title: "Évaluation", language: "fr", requirements: [], keywords: [] },
});
const flagged = new Set(verdicts.filter((v) => v.verdict !== "fidele").map((v) => v.path));
let tp = 0;
let fp = 0;
let fn = 0;
cases.forEach((c, i) => {
  const got = flagged.has(`/work/0/highlights/${i}`);
  const want = c.expected === "a_revoir";
  if (got && want) tp++;
  else if (got) fp++;
  else if (want) fn++;
  console.log(
    `${got === want ? "✓" : "✗"} ${c.expected.padEnd(8)} ${got ? "signalée" : "fidèle  "}  ${c.text}`,
  );
});
const precision = tp + fp ? tp / (tp + fp) : 1;
const recall = tp + fn ? tp / (tp + fn) : 1;
console.log(
  `\nFournisseur : ${providerKind} · précision ${(precision * 100).toFixed(0)} % · rappel ${(recall * 100).toFixed(0)} % (${cases.length} cas)`,
);
