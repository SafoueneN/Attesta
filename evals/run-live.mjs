// Évaluation du vrai modèle sur le jeu de référence (profils fictifs uniquement).
// Chaque exécution appelle le fournisseur configuré et coûte de l'argent.
//
//   LLM_PROVIDER=vertex VERTEX_PROJECT_ID=... npm run evals:live
//
// Mesures par cas : lignes rédigées, lignes retirées (taux d'invention brut du
// modèle), score de fidélité, mots-clés signalés, coût et latence. Le CV final
// doit toujours être à 100 % ; le taux d'invention brut est l'indicateur à suivre
// d'une version de prompt à l'autre.
import { mkdirSync, writeFileSync } from "node:fs";
import {
  AnthropicProvider,
  createClaudeClient,
  generateTailoredCv,
  checkFaithfulness,
  PIPELINE_VERSION,
} from "@attesta/llm";
import { loadConfig } from "@attesta/shared";
import { CASES } from "./dist/cases.js";

const config = loadConfig({ SESSION_SECRET: "x".repeat(32), SESSION_STORE: "memory", ...process.env });
if (config.LLM_PROVIDER !== "vertex" && config.LLM_PROVIDER !== "anthropic") {
  console.error(
    "Définissez LLM_PROVIDER=vertex (ou anthropic, en développement) pour évaluer un vrai modèle.",
  );
  process.exit(2);
}

const provider = new AnthropicProvider(
  createClaudeClient({
    provider: config.LLM_PROVIDER,
    timeoutMs: config.LLM_TIMEOUT_MS,
    vertexProjectId: config.VERTEX_PROJECT_ID,
    vertexRegion: config.VERTEX_REGION,
  }),
  { model: config.LLM_MODEL, timeoutMs: config.LLM_TIMEOUT_MS },
);

const rows = [];
for (const evalCase of CASES) {
  const started = Date.now();
  const result = await generateTailoredCv(
    { provider, maxCostUsd: config.LLM_MAX_COST_USD_PER_CV },
    { profile: evalCase.profile, offerText: evalCase.offerText },
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
    removedLines: result.removed,
    costUsd,
    latencyMs: Date.now() - started,
  });
}

console.table(rows.map(({ removedLines: _detail, ...row }) => row));
mkdirSync(new URL("./results/", import.meta.url), { recursive: true });
const file = new URL(
  `./results/${new Date().toISOString().slice(0, 10)}-${config.LLM_MODEL}.json`,
  import.meta.url,
);
writeFileSync(file, JSON.stringify({ model: config.LLM_MODEL, pipeline: PIPELINE_VERSION, rows }, null, 2));
console.log(`Résultats : ${file.pathname}`);

const failed = rows.filter((r) => r.status !== "ok" || r.exportedScore !== 1);
process.exit(failed.length ? 1 : 0);
