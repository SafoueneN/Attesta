import { readFile } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/** Aucune violation critique ou sérieuse des règles WCAG 2.2 A/AA détectables automatiquement. */
async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

async function fillProfile(page: Page) {
  await page.getByLabel("Nom et prénom").fill("Léa Martin");
  await page.getByLabel("Titre professionnel").fill("Développeuse back-end");
  await page.getByLabel("Adresse e-mail").fill("lea.martin@example.org");
  await page.getByLabel("Ville").fill("Lyon");
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function fillParcours(page: Page) {
  const work = page.getByRole("group", { name: "Expérience 1" });
  await work.getByLabel("Poste", { exact: true }).fill("Développeuse back-end");
  await work.getByLabel("Employeur").fill("Transports Rhône");
  await work.getByLabel("Début").fill("2021-03");
  await work
    .getByLabel("Réalisations")
    .fill("Migration de 12 services Express\nRéduction de 40 % du temps de réponse");
  const education = page.getByRole("group", { name: "Formation 1" });
  await education.getByLabel("Établissement").fill("INSA Lyon");
  await education.getByLabel("Fin").fill("2019");
  await page.getByRole("textbox", { name: "Compétences" }).fill("Node.js : Express, PostgreSQL");
  await page.getByRole("button", { name: "Continuer" }).click();
}

async function fillOffer(page: Page) {
  await page
    .getByLabel("Texte de l'offre")
    .fill("Nous recherchons une développeuse ou un développeur back-end Node.js pour notre plateforme.");
  await page.getByRole("button", { name: "Continuer" }).click();
}

test("parcours complet : saisie, aperçu, relecture et export PDF", async ({ page }) => {
  await page.goto("/");
  await expectAccessible(page);
  await page.getByRole("link", { name: "Commencer mon CV" }).click();

  await expect(page.getByText("Étape 1 sur 5")).toBeVisible();
  await expectAccessible(page);
  await fillProfile(page);

  await expect(page.getByText("Étape 2 sur 5")).toBeVisible();
  await expectAccessible(page);
  await fillParcours(page);

  await expect(page.getByText("Étape 3 sur 5")).toBeVisible();
  await expectAccessible(page);
  await fillOffer(page);

  await expect(page.getByText("Étape 4 sur 5")).toBeVisible();
  const preview = page.frameLocator("iframe.preview");
  await expect(preview.getByRole("heading", { level: 1, name: "Léa Martin" })).toBeVisible();
  await expect(preview.getByText("Réduction de 40 % du temps de réponse")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Continuer" }).click();

  await expect(page.getByText("Étape 5 sur 5")).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Télécharger mon CV (PDF)" }).click();
  await expect(page.getByRole("alert")).toContainText("Confirmez que vous avez relu votre CV");
  await expectAccessible(page);

  await page.getByLabel("J'ai relu mon CV").check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger mon CV (PDF)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("cv-attesta-ats.pdf");
  const pdf = await readFile((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
});

test("les erreurs sont annoncées, reçoivent le focus et mènent au champ", async ({ page }) => {
  await page.goto("/cv/etape/1");
  await page.getByRole("button", { name: "Continuer" }).click();

  const summary = page.getByRole("alert");
  await expect(summary).toBeFocused();
  await expect(page).toHaveTitle(/^Erreur : /);
  await summary.getByRole("link", { name: "Ce champ est obligatoire" }).click();
  await expect(page.getByLabel("Nom et prénom")).toBeFocused();
  await expectAccessible(page);
});

test("le retour arrière conserve la saisie", async ({ page }) => {
  await page.goto("/cv/etape/1");
  await fillProfile(page);
  await page
    .getByRole("group", { name: "Expérience 1" })
    .getByLabel("Poste", { exact: true })
    .fill("Brouillon conservé");
  await page.getByRole("button", { name: "Étape précédente" }).click();

  await expect(page.getByLabel("Nom et prénom")).toHaveValue("Léa Martin");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(
    page.getByRole("group", { name: "Expérience 1" }).getByLabel("Poste", { exact: true }),
  ).toHaveValue("Brouillon conservé");
});

test("navigation clavier : lien d'évitement puis formulaire", async ({ page }) => {
  await page.goto("/cv/etape/1");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await page.keyboard.press("Tab");
  await expect(page.getByLabel("Nom et prénom")).toBeFocused();
});

test.describe("thème sombre", () => {
  test.use({ colorScheme: "dark" });

  test("reste conforme, y compris en état d'erreur", async ({ page }) => {
    await page.goto("/cv/etape/1");
    await expect(page.getByRole("button", { name: "Thème sombre" })).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expectAccessible(page);
  });
});
