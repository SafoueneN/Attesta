import { describe, expect, it } from "vitest";
import { checkFaithfulness, cvLines, generateTailoredCv, ScriptedProvider } from "@attesta/llm";
import { CASES } from "./cases.js";

/**
 * Évaluation de fidélité en mode rejeu (CI, sans réseau). Elle mesure le
 * contrôle, pas le modèle : chaque invention étiquetée doit être retirée
 * (rappel = 100 %) et aucune ligne fidèle ne doit l'être (aucun faux positif).
 * L'évaluation du vrai modèle se lance avec `npm run evals:live` (evals/run-live.mjs).
 */
describe.each(CASES)("éval $id", (evalCase) => {
  it(`${evalCase.description}`, async () => {
    const provider = new ScriptedProvider({
      "analyse-offre": [{ data: evalCase.recorded.analysis }],
      redaction: [{ data: evalCase.recorded.draft }],
    });

    const result = await generateTailoredCv(
      { provider, maxCostUsd: 1 },
      { profile: evalCase.profile, offerText: evalCase.offerText },
    );

    expect(result.status).toBe("ok");
    if (result.status !== "ok") return;
    const removed = result.removed.map((r) => r.text);
    const kept = cvLines(result.cv).map((l) => l.line.text);
    // Zéro invention dans le CV exporté
    expect(checkFaithfulness(result.cv, evalCase.profile).report.score).toBe(1);
    for (const invention of evalCase.inventions) expect(kept).not.toContain(invention);
    // Rappel : toutes les inventions étiquetées sont retirées
    expect(removed.sort()).toEqual([...evalCase.inventions].sort());
    // Les compétences demandées absentes sont signalées
    expect(result.cv.missingKeywords).toEqual(evalCase.expectedMissing);
  });
});
