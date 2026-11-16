import { ScriptedProvider } from "@attesta/llm-client";
import { describe, expect, it } from "vitest";
import { CASES } from "../evals/cases.js";
import { checkFaithfulness, cvLines } from "../src/faithfulness.js";
import { generateTailoredCv } from "../src/pipeline.js";

/**
 * Évaluation de fidélité en mode rejeu (CI, sans réseau), porte bloquante. Elle mesure le contrôle, pas le
 * modèle : chaque invention étiquetée doit être retirée (rappel = 100 %) et aucune ligne fidèle ne doit
 * l'être (aucun faux positif). Le vrai modèle s'évalue avec `npm run eval:live` (scripts/eval-live.ts).
 */
describe.each(CASES)("éval $id", (evalCase) => {
  it(`${evalCase.description}`, async () => {
    const provider = new ScriptedProvider({ redaction: [{ data: evalCase.recorded.draft }] });

    const result = await generateTailoredCv(
      { provider, maxCostUsd: 1 },
      { profile: evalCase.profile, offerText: evalCase.offerText, analysis: evalCase.analysis },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const removed = result.removed.map((r) => r.text);
    const kept = cvLines(result.cv).map((l) => l.line.text);
    // Zéro invention dans le CV exporté
    expect(checkFaithfulness(result.cv, evalCase.profile, evalCase.offerText).report.score).toBe(1);
    for (const invention of evalCase.inventions) expect(kept).not.toContain(invention);
    // Rappel : toutes les inventions étiquetées sont retirées
    expect(removed.sort()).toEqual([...evalCase.inventions].sort());
    // Les compétences demandées absentes sont signalées
    expect(result.cv.missingKeywords).toEqual(evalCase.expectedMissing);
  });
});
