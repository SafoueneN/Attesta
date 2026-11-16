import { expect, test } from "@playwright/test";
import { login } from "./qa-support.js";

/*
 * Campagne QA · US10 : le changement d'étape d'une candidature est enregistré et survit au rechargement
 * de la page. Transitions d'état : chaque étape est atteignable depuis n'importe quelle autre.
 */

test.skip(!process.env.E2E_BASE_URL, "pile compose requise (E2E_BASE_URL)");

test("US10 · le changement d'étape persiste après rechargement, et peut revenir en arrière", async ({
  page,
}) => {
  await login(page);
  await page.goto("/candidatures");
  // Tableau par étape : la carte change de colonne à chaque étape, on la suit donc par son lien, pas par sa place.
  const href = await page.locator('main li a[href^="/mes-cv/"]').first().getAttribute("href");
  const stage = page.locator("main li", { has: page.locator(`a[href="${href}"]`) }).getByLabel("Étape");
  await expect(stage).toBeVisible();
  const initial = await stage.inputValue();

  for (const next of ["entretien", "refus", "a_envoyer"].filter((s) => s !== initial).concat(initial)) {
    const saved = page.waitForResponse(
      (r) => r.url().includes("/api/letters/v1/applications/tracking/") && r.request().method() === "PUT",
    );
    await stage.selectOption(next);
    expect((await saved).status()).toBe(200);
    await page.reload();
    await expect(stage).toHaveValue(next);
  }
});
