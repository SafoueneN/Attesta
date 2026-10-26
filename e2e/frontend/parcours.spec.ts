import { readFile } from "node:fs/promises";
import { expect, test } from "@playwright/test";
import { expectAccessible, fillOffer, fillParcours, fillProfile, generate } from "./support.js";

test("parcours sans compte : profil, offre, génération en direct, relecture et export PDF", async ({
  page,
}) => {
  // Parcours complet, génération comprise (jusqu'à 60 s avec un vrai modèle) : 30 s ne suffisent pas.
  test.setTimeout(90_000);
  await page.goto("/");
  await expectAccessible(page);
  await page.getByRole("link", { name: "Créer mon CV ciblé" }).click();

  await expect(page.getByText("Étape 1 sur 4")).toBeVisible();
  await expectAccessible(page);
  await fillProfile(page);

  await expect(page.getByText("Étape 2 sur 4")).toBeVisible();
  await expectAccessible(page);
  await fillParcours(page);
  await expect(page.getByText(/Profil enregistré \(version \d+\)/)).toBeVisible();

  await expect(page.getByText("Étape 3 sur 4")).toBeVisible();
  await expectAccessible(page);
  await fillOffer(page);

  await expect(page.getByText("Étape 4 sur 4")).toBeVisible();
  await expect(page.getByText(/Mots-clés repérés : .*Node\.js/)).toBeVisible();
  await expectAccessible(page);

  // Progression lue en flux par fetch (SSE), à travers nginx et la gateway.
  const [stream] = await Promise.all([
    page.waitForResponse((r) => r.url().endsWith("/api/cv/v1/generations")),
    generate(page),
  ]);
  expect(stream.headers()["content-type"]).toContain("text/event-stream");

  await expect(page.getByText("Démonstration : faits recopiés, sans IA")).toBeVisible();
  await expect(page.getByText("Fidélité 100 %")).toBeVisible();
  await expect(page.getByText(/Signalés, jamais ajoutés : .*Kubernetes/)).toBeVisible();
  const preview = page.frameLocator('iframe[title="Aperçu du CV, identique au PDF"]');
  await expect(preview.getByRole("heading", { level: 1, name: "Léa Martin" })).toBeVisible();
  await expect(preview.getByText("Réduction de 40 % du temps de réponse")).toBeVisible();
  await expectAccessible(page);

  // Relecture : la source de chaque ligne est montrée ; une correction est enregistrée.
  await page.getByRole("tab", { name: "Relecture ligne par ligne" }).click();
  // Ligne 1 = titre (source : profil) ; la ligne 2 vient d'une réalisation de l'expérience 1.
  await page
    .getByRole("listitem")
    .filter({ has: page.getByRole("textbox", { name: "Ligne 2", exact: true }) })
    .getByText("Source de la ligne")
    .click();
  await expect(page.getByText(/Expérience 1 \(Développeuse back-end\) – réalisation/).first()).toBeVisible();
  await page.getByLabel("Ligne 1", { exact: true }).fill("Développeuse back-end Node.js et PostgreSQL");
  await page.getByRole("button", { name: "Enregistrer mes corrections" }).click();
  await expect(page.getByText("Vos corrections sont enregistrées.")).toBeVisible();
  await expect(page.getByText("Modifiée par vous")).toBeVisible();
  await expectAccessible(page);

  // Export : la relecture humaine est exigée avant le PDF ciblé.
  await page.getByRole("button", { name: "Télécharger le CV ciblé (PDF)" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Confirmez que vous avez relu votre CV" }),
  ).toBeVisible();
  await page.getByLabel(/J'ai relu mon CV/).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger le CV ciblé (PDF)" }).click(),
  ]);
  expect(download.suggestedFilename()).toBe("cv-lea-martin.pdf");
  const pdf = await readFile((await download.path())!);
  expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");

  await page.getByRole("link", { name: "Mes CV" }).click();
  await expect(page.getByRole("link", { name: "Développeur back-end Node.js (H/F)" })).toBeVisible();
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

test("le retour arrière et le rechargement conservent la saisie", async ({ page }) => {
  await page.goto("/cv/etape/1");
  await fillProfile(page);
  await page
    .getByRole("group", { name: "Expérience 1" })
    .getByLabel("Poste", { exact: true })
    .fill("Brouillon conservé");
  await page.getByRole("link", { name: "Étape précédente" }).click();
  await expect(page.getByLabel("Nom et prénom")).toHaveValue("Léa Martin");
  await page.reload();
  await expect(page.getByLabel("Nom et prénom")).toHaveValue("Léa Martin");
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(
    page.getByRole("group", { name: "Expérience 1" }).getByLabel("Poste", { exact: true }),
  ).toHaveValue("Brouillon conservé");
});

test("navigation clavier : lien d'évitement puis contenu", async ({ page }) => {
  await page.goto("/cv/etape/1");
  await page.keyboard.press("Tab");
  const skip = page.getByRole("link", { name: "Aller au contenu" });
  await expect(skip).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.locator("#contenu")).toBeFocused();
});

test.describe("thème sombre", () => {
  test.use({ colorScheme: "dark" });

  test("reste conforme, y compris en état d'erreur", async ({ page }) => {
    await page.goto("/cv/etape/1");
    await expect(page.getByRole("button", { name: "Thème clair" })).toHaveAttribute("aria-pressed", "true");
    await expectAccessible(page);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expectAccessible(page);
  });
});

test("pages publiques accessibles : confidentialité, connexion, page introuvable", async ({ page }) => {
  for (const path of ["/confidentialite", "/connexion", "/nulle-part"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await expectAccessible(page);
  }
  await expect(page.getByRole("heading", { level: 1, name: "Page introuvable" })).toBeVisible();
});

test("une offre trop courte est refusée avec un message clair", async ({ page }) => {
  await page.goto("/cv/etape/1");
  await fillProfile(page);
  await fillParcours(page);
  await fillOffer(page, "Dév Node");
  await expect(page.getByRole("alert")).toContainText("L'offre semble trop courte");
});
