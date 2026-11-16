// Évaluation du vrai modèle sur le jeu de référence (profils fictifs uniquement) : npm run eval:live.
// Chaque exécution appelle le fournisseur configuré (AI_PROVIDER et sa clé, ADR 0047) et coûte de l'argent.
//
// Mesures par cas : lignes rédigées, lignes retirées (taux d'invention brut du modèle), score de fidélité,
// mots-clés signalés, coût et latence. Le CV final doit toujours être à 100 % ; le taux d'invention brut est
// l'indicateur à suivre d'une version de prompt à l'autre. Résultats dans evals/results/ (non versionné).
import { mkdirSync, writeFileSync } from "node:fs";
import { createAiProvider } from "@attesta/llm-client";
import { CASES } from "../evals/cases.js";
import { loadConfig } from "../src/config.js";
import { checkFaithfulness } from "../src/faithfulness.js";
import { generateTailoredCv, prompts } from "../src/pipeline.js";

const config = loadConfig({ DATABASE_URL: "postgres://non-utilisee@localhost/eval", ...process.env });
const provider = createAiProvider(config, config.NODE_ENV);
if (!provider || provider.kind === "demo") {
  console.error("Définissez AI_PROVIDER (claude, groq, mistral…) et sa clé pour évaluer un vrai modèle.");
  process.exit(2);
}

const rows = [];
for (const evalCase of CASES) {
  const started = Date.now();
  const result = await generateTailoredCv(
    { provider, maxCostUsd: config.MAX_COST_PER_CV_USD },
    { profile: evalCase.profile, offerText: evalCase.offerText, analysis: evalCase.analysis },
  );
  const costUsd = result.usage.reduce((sum, u) => sum + u.costUsd, 0);
  if (result.status !== "ok") {
    rows.push({ id: evalCase.id, status: result.status, reason: result.reason, costUsd });
    continue;
  }
  const drafted = result.report.checkedLines;
  rows.push({
    id: evalCase.id,
    status: "ok",
    drafted,
    removed: result.removed.length,
    rawInventionRate: drafted ? result.removed.length / drafted : 0,
    exportedScore: checkFaithfulness(result.cv, evalCase.profile).report.score,
    missingKeywords: result.cv.missingKeywords,
    expectedMissing: evalCase.expectedMissing,
    costUsd,
    latencyMs: Date.now() - started,
  });
}

console.table(rows);
mkdirSync(new URL("../evals/results/", import.meta.url), { recursive: true });
const file = new URL(
  `../evals/results/${new Date().toISOString().slice(0, 10)}-${provider.model}.json`,
  import.meta.url,
);
writeFileSync(
  file,
  JSON.stringify({ model: provider.model, pipeline: prompts.signature("redaction"), rows }, null, 2),
);
console.log(`Résultats : ${file.pathname}`);

const failed = rows.filter((r) => r.status !== "ok" || r.exportedScore !== 1);
process.exit(failed.length ? 1 : 0);
