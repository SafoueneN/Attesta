import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Outils communs aux suites de bout en bout (e2e/frontend). Ils ne dépendent que de ce qu'un utilisateur
 * voit : libellés, rôles ARIA, URL publiques. Aucun détail d'implémentation.
 */

/**
 * Aucune violation critique ou sérieuse des règles WCAG 2.2 A/AA détectables automatiquement. Le contraste
 * se mesure sur l'état final : on attend la fin des animations finies réglées sur l'horloge (fondu
 * d'entrée), pas des boucles (squelette, indicateur d'activité) ni de celles pilotées par le défilement.
 */
export async function expectAccessible(page: Page) {
  // Deux constats de calme à 150 ms d'écart : une page chargée à la demande peut lancer son animation
  // juste après un premier constat.
  for (let calm = 0, tries = 0; calm < 2 && tries < 40; tries++) {
    const idle = await page.evaluate(() =>
      document
        .getAnimations()
        .every(
          (a) =>
            a.playState !== "running" ||
            !(a.timeline instanceof DocumentTimeline) ||
            a.effect?.getComputedTiming().iterations === Infinity,
        ),
    );
    calm = idle ? calm + 1 : 0;
    await page.waitForTimeout(150);
  }
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    // Aperçu du CV : document du PDF en iframe `sandbox=""` (ADR 0026, point 7). Sans script, axe ne peut
    // pas y être injecté et l'analyse ne rendrait jamais la main ; la page elle-même reste contrôlée.
    .exclude('iframe[sandbox=""]')
    .analyze();
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}
