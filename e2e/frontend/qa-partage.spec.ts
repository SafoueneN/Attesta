import { expect, test } from "@playwright/test";
import { firstCv, login } from "./qa-support.js";

/*
 * Campagne QA · US07 : un lien de partage révoqué, ou inventé, ne montre plus aucun CV (page
 * d'indisponibilité, API publique en 404). Transition d'état : actif → révoqué.
 */

test.skip(!process.env.E2E_BASE_URL, "pile compose requise (E2E_BASE_URL)");

test("US07 · après révocation, le lien de partage affiche une page d'indisponibilité (404)", async ({
  page,
  browser,
}) => {
  await login(page);
  await firstCv(page);
  await page.getByLabel(/J'ai relu mon CV/).check();
  await page.getByLabel(/Je comprends que mes coordonnées seront visibles/).check();
  const created = page.waitForResponse(
    (r) => r.url().endsWith("/api/letters/v1/shares") && r.request().method() === "POST",
  );
  await page.getByRole("button", { name: "Créer un lien de partage" }).click();
  const share = (await (await created).json()) as { id: string; url: string };
  const token = share.url.split("/cv-en-ligne/")[1]!;

  const visitor = await browser.newPage();
  await visitor.goto(share.url);
  await expect(visitor.locator("iframe[title='CV partagé']")).toBeVisible();

  // Révocation de ce lien précis (le plus récent de la liste).
  const revoked = page.waitForResponse(
    (r) => r.url().endsWith(`/api/letters/v1/shares/${share.id}`) && r.request().method() === "DELETE",
  );
  await page.getByRole("button", { name: "Révoquer" }).last().click();
  expect((await revoked).status()).toBe(204);
  await expect(page.getByText("Lien révoqué : le CV n'est plus visible.")).toBeVisible();

  await visitor.reload();
  await expect(visitor.getByRole("heading", { level: 1, name: "Ce CV n'est plus partagé" })).toBeVisible();
  await expect(visitor.locator("iframe[title='CV partagé']")).toHaveCount(0);
  const api = await visitor.request.get(`/api/letters/v1/public/cv/${token}`, {
    headers: { Accept: "text/html" },
  });
  expect(api.status()).toBe(404);
  await visitor.close();
});

test("US07 · un lien de partage inventé affiche la même page d'indisponibilité (404)", async ({ page }) => {
  const forged = "a".repeat(43);
  await page.goto(`/cv-en-ligne/${forged}`);
  await expect(page.getByRole("heading", { level: 1, name: "Ce CV n'est plus partagé" })).toBeVisible();
  const api = await page.request.get(`/api/letters/v1/public/cv/${forged}`, {
    headers: { Accept: "text/html" },
  });
  expect(api.status()).toBe(404);
});
