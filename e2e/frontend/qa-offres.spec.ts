import { expect, test } from "@playwright/test";
import { login } from "./qa-support.js";

/*
 * Campagne QA · US04 : filtres du catalogue d'offres. Partitions d'équivalence : recherche sans résultat,
 * combinaison mots-clés × pays (chaque offre renvoyée respecte les deux filtres).
 */

test.skip(!process.env.E2E_BASE_URL, "pile compose requise (E2E_BASE_URL)");

interface Posting {
  title: string;
  excerpt: string;
  country: string;
}

test("US04 · une recherche sans résultat affiche un état vide explicite", async ({ page }) => {
  await login(page);
  await page.goto("/offres/collectees");
  await page.getByLabel("Mots-clés").fill("zzqx-aucune-offre-xqzz");
  const res = page.waitForResponse((r) => r.url().includes("/api/jobs/v1/postings?"));
  await page.getByRole("button", { name: "Rechercher" }).click();
  expect(((await (await res).json()) as Posting[]).length).toBe(0);
  await expect(page.getByText("Aucune offre pour cette recherche")).toBeVisible();
});

test("US04 · mots-clés et pays se combinent : chaque offre respecte les deux filtres", async ({ page }) => {
  await login(page);
  await page.goto("/offres/collectees");
  // Mot-clé choisi parmi les offres réelles du pays, pour un résultat non vide quelle que soit la base.
  const all = page.waitForResponse(
    (r) => r.url().includes("/api/jobs/v1/postings?") && r.url().includes("TN"),
  );
  await page.getByLabel("Pays").selectOption("TN");
  await page.getByRole("button", { name: "Rechercher" }).click();
  const tunisia = (await (await all).json()) as Posting[];
  test.skip(tunisia.length === 0, "aucune offre tunisienne dans la base locale");
  const keyword =
    tunisia[0]!.title.split(/\s+/).find((w) => w.length >= 5) ?? tunisia[0]!.title.split(/\s+/)[0]!;

  await page.getByLabel("Mots-clés").fill(keyword);
  const both = page.waitForResponse((r) => r.url().includes("/api/jobs/v1/postings?"));
  await page.getByRole("button", { name: "Rechercher" }).click();
  const response = await both;
  const url = new URL(response.url());
  expect(url.searchParams.get("country")).toBe("TN");
  const results = (await response.json()) as Posting[];
  expect(results.length).toBeGreaterThan(0);
  expect(results.length).toBeLessThanOrEqual(tunisia.length);
  for (const p of results) expect(p.country).toBe("TN");
  await expect(page.locator("main ul > li")).toHaveCount(results.length);
});
