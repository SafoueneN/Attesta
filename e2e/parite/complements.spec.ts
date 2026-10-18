import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectAccessible, fillOffer, fillParcours, fillProfile, login, mailpit } from "../support.js";

/**
 * Comportements observables du monolithe v0.4 non couverts par parcours.spec.ts et compte.spec.ts.
 * Ensemble, les trois fichiers forment le contrat de parité de la migration (docs/adr/0011) :
 * ils doivent rester verts après chaque extraction de service.
 */

test.describe("plateforme", () => {
  test("santé, en-têtes de sécurité et page introuvable en français", async ({ page, request }) => {
    const health = await request.get("/health");
    expect(health.status()).toBe(200);
    expect(await health.json()).toEqual({ status: "ok" });

    const home = await request.get("/");
    expect(home.headers()["content-security-policy"]).toContain("default-src");
    expect(home.headers()["x-content-type-options"]).toBe("nosniff");
    expect(home.headers()["x-powered-by"]).toBeUndefined();

    const missing = await page.goto("/page-qui-n-existe-pas");
    expect(missing?.status()).toBe(404);
    await expect(page).toHaveTitle(/Page introuvable/);
    await expectAccessible(page);
  });

  test("politique de confidentialité accessible depuis le pied de page", async ({ page }) => {
    await page.goto("/");
    await page
      .getByRole("link", { name: /confidentialité/i })
      .first()
      .click();
    await expect(page).toHaveURL(/\/confidentialite$/);
    await expect(page).toHaveTitle(/Confidentialité/);
    await expectAccessible(page);
  });

  test("un formulaire envoyé sans jeton CSRF est refusé", async ({ page }) => {
    await page.goto("/cv/etape/1");
    const response = await page.request.post("/cv/etape/1", { form: { name: "Sans jeton" } });
    expect(response.status()).toBe(403);
  });
});

test.describe("parcours CV", () => {
  test("une étape non atteinte renvoie à la première étape incomplète", async ({ page }) => {
    await page.goto("/cv/etape/4");
    await expect(page).toHaveURL(/\/cv\/etape\/1$/);
    await expect(page.getByText("Étape 1 sur 5")).toBeVisible();
  });

  test("ajout et suppression d'une expérience", async ({ page }) => {
    await page.goto("/cv/etape/1");
    await fillProfile(page);
    await page.getByRole("button", { name: "Ajouter une expérience" }).click();
    await expect(page.getByRole("group", { name: "Expérience 2" })).toBeVisible();
    await page.getByRole("button", { name: "Supprimer l'expérience 2" }).click();
    await expect(page.getByRole("group", { name: "Expérience 2" })).toHaveCount(0);
    await expect(page.getByRole("group", { name: "Expérience 1" })).toBeVisible();
  });

  test("mise en page « design » : aperçu puis export", async ({ page }) => {
    await page.goto("/cv/etape/1");
    await fillProfile(page);
    await fillParcours(page);
    await fillOffer(page);

    await page.getByRole("radio", { name: /Design/ }).check();
    await page.getByRole("button", { name: "Afficher cette mise en page" }).click();
    await expect(page.locator("iframe.preview")).toHaveAttribute("title", /mise en page design/);
    await page.getByRole("button", { name: "Continuer" }).click();

    await page.getByRole("radio", { name: /Design/ }).check();
    await page.getByLabel("J'ai relu mon CV").check();
    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Télécharger mon CV (PDF)" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("cv-attesta-design.pdf");
    const pdf = await readFile((await download.path())!);
    expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
  });

  test("« Effacer mes données » vide la session", async ({ page }) => {
    await page.goto("/cv/etape/1");
    await fillProfile(page);
    await page.getByRole("button", { name: "Effacer mes données" }).click();
    await expect(page.getByRole("status")).toContainText("Vos données ont été effacées");
    await page.goto("/cv/etape/2");
    await expect(page).toHaveURL(/\/cv\/etape\/1$/);
    await expect(page.getByLabel("Nom et prénom")).toHaveValue("");
  });
});

test.describe("génération ciblée", () => {
  test("revenir au CV non adapté après une génération", async ({ page }) => {
    await page.goto("/cv/etape/1");
    await fillProfile(page);
    await fillParcours(page);
    await fillOffer(page);
    await page.getByRole("button", { name: "Générer mon CV" }).click();
    await expect(page.getByRole("heading", { name: "Fidélité à votre profil" })).toBeVisible();

    await page.getByRole("button", { name: "Revenir à mon CV non adapté" }).click();
    await expect(page.getByRole("heading", { name: "Adapter mon CV à l'offre" })).toBeVisible();
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByText("Vous exportez votre CV tel que vous l'avez saisi")).toBeVisible();
  });

  test.describe("sans JavaScript", () => {
    test.use({ javaScriptEnabled: false });

    test("la génération fonctionne par simple envoi de formulaire", async ({ page }) => {
      await page.goto("/cv/etape/1");
      await fillProfile(page);
      await fillParcours(page);
      await fillOffer(page);
      await page.getByRole("button", { name: "Générer mon CV" }).click();
      await expect(page.getByRole("heading", { name: "Fidélité à votre profil" })).toBeVisible();
      await expect(page.getByRole("group", { name: /^Ligne 1/ })).toBeVisible();
    });
  });
});

test.describe("compte", () => {
  test.skip(!mailpit, "MAILPIT_URL absent : comptes désactivés sur le serveur local");

  test("export JSON des données, puis déconnexion", async ({ page }) => {
    const email = `e2e-export-${Date.now()}@attesta.localhost`;
    await login(page, email);

    const [download] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("link", { name: "Télécharger toutes mes données (JSON)" }).click(),
    ]);
    expect(download.suggestedFilename()).toBe("attesta-mes-donnees.json");
    const data = await readFile((await download.path())!, "utf8");
    expect(JSON.parse(data)).toBeInstanceOf(Object);
    expect(data).toContain(email);

    await page.getByRole("button", { name: "Me déconnecter" }).click();
    await page.goto("/compte");
    await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  });
});
