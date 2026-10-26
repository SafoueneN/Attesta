import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { expectAccessible } from "../support.js";

/*
 * Recette par user story (pile compose : frontend, gateway, six services). Tests fonctionnels en boîte noire :
 * seulement ce que voit l'utilisateur (libellés, rôles ARIA, fichiers téléchargés). Une capture d'écran par
 * étape clé, dans CAPTURES_DIR (rapport de tests). Comptes de démonstration : npm run demo:seed.
 *
 *   E2E_BASE_URL=http://localhost:8081 CAPTURES_DIR=test-results/captures npx playwright test e2e/frontend/recette
 */

const CAPTURES = process.env.CAPTURES_DIR ?? "test-results/captures";
mkdirSync(CAPTURES, { recursive: true });
const DEMO = { username: "amina.diallo", password: "demo-attesta-local" };
const ADMIN = { username: "admin", password: process.env.E2E_ADMIN_PASSWORD ?? "admin-dev-uniquement" };

// Tests indépendants : un échec n'empêche pas les suivants ; un seul navigateur à la fois (pile locale).
test.describe.configure({ mode: "default" });
test.skip(!process.env.E2E_BASE_URL, "pile compose requise (E2E_BASE_URL)");

/** Capture d'écran ; adresses e-mail masquées (captures destinées à un rapport partagé). */
const shot = (page: Page, name: string) =>
  page.screenshot({
    path: `${CAPTURES}/${name}.png`,
    fullPage: false,
    mask: [page.locator('input[type="email"]'), page.getByText(/[\w.+-]+@[\w-]+\.[\w.]+/)],
  });
const unique = (prefix: string) => `${prefix}.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

async function login(page: Page, { username, password } = DEMO) {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}

async function createAccount(page: Page, username = unique("recette")) {
  await page.goto("/connexion");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("recette-mot-de-passe");
  await page.getByLabel("Confirmer le mot de passe").fill("recette-mot-de-passe");
  await page.getByLabel(/politique de confidentialité/).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Votre compte est créé" })).toBeVisible();
  return username;
}

/** Premier CV ciblé du compte de démonstration. */
async function firstCv(page: Page) {
  await page.goto("/mes-cv");
  await page.locator('main a[href^="/mes-cv/"]').first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Exporter" })).toBeVisible();
}

test("US01 · créer un compte avec un identifiant, sans e-mail, et recevoir 8 codes de récupération", async ({
  page,
}) => {
  await page.goto("/connexion");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  const summary = page.getByRole("alert");
  await expect(summary).toContainText("Acceptez la politique de confidentialité");
  await shot(page, "US01-1-creation-erreurs");

  await createAccount(page);
  await expect(page.locator("ol li")).toHaveCount(8);
  await expectAccessible(page);
  await shot(page, "US01-2-codes-de-recuperation");
  const go = page.getByRole("button", { name: "Continuer" });
  await expect(go).toBeDisabled();
  await page.getByLabel("J'ai mis mes codes en lieu sûr.").check();
  await go.click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
});

test("US02 · se connecter ; un mauvais mot de passe est refusé sans révéler si le compte existe", async ({
  page,
}) => {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(DEMO.username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("pas-le-bon-mot-de-passe");
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByText("Identifiant ou mot de passe incorrect.")).toBeVisible();
  await shot(page, "US02-1-mot-de-passe-incorrect");
  await login(page);
  await expectAccessible(page);
  await shot(page, "US02-2-mon-compte");
});

test("US03 · importer son CV PDF : le profil se pré-remplit sans IA, à relire", async ({ page }) => {
  // Le PDF importé est un vrai CV exporté par Attesta (compte de démonstration).
  await login(page);
  await firstCv(page);
  await page.getByLabel(/J'ai relu mon CV/).check();
  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger le CV ciblé (PDF)" }).click(),
  ]);
  const pdf = (await download.path())!;

  await page.context().clearCookies();
  await createAccount(page);
  await page.goto("/cv/etape/1");
  await page.locator('input[type="file"][accept*="pdf"]').setInputFiles(pdf);
  await expect(
    page.getByText(/Profil pré-rempli à partir de votre CV \(lecture automatique, sans IA\)/),
  ).toBeVisible({
    timeout: 30_000,
  });
  await expect(page.getByLabel("Nom et prénom")).not.toHaveValue("");
  await shot(page, "US03-1-import-pdf-message");
  await page.getByLabel("Nom et prénom").scrollIntoViewIfNeeded();
  await shot(page, "US03-2-import-pdf-champs-pre-remplis");
});

test("US04 · parcourir le catalogue d'offres des quatre pays et filtrer par pays", async ({ page }) => {
  await login(page);
  await page.goto("/offres/collectees");
  await expect(page.getByRole("button", { name: /^Toutes les régions/ })).toBeVisible();
  await shot(page, "US04-1-catalogue-toutes-regions");
  await page.getByRole("button", { name: /^Tunisie/ }).click();
  await expect(page.getByRole("button", { name: "Cibler cette offre" }).first()).toBeVisible();
  await expectAccessible(page);
  await shot(page, "US04-2-catalogue-tunisie");
});

test("US05 · générer un CV ciblé : chaque ligne est contrôlée contre le profil", async ({ page }) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto("/cv/etape/3");
  await page
    .getByLabel("Annonce complète")
    .fill(
      "Chef de projet transformation digitale (H/F) – Lyon\nVous pilotez des projets de transformation, en méthode agile (Scrum), avec Jira. Une expérience de Kubernetes est un plus.",
    );
  await page.getByRole("button", { name: "Analyser l'offre et continuer" }).click();
  await expect(page.getByText("Étape 4 sur 4")).toBeVisible();
  await shot(page, "US05-1-offre-analysee");
  await page.getByRole("button", { name: "Générer mon CV ciblé" }).click();
  await expect(page.getByRole("heading", { level: 2, name: "Exporter" })).toBeVisible({ timeout: 90_000 });
  await expect(page.getByText(/Fidélité/).first()).toBeVisible();
  // Jauge animée (compteur jusqu'au score) : capture une fois l'animation finie.
  await page.waitForTimeout(2000);
  await shot(page, "US05-2-cv-genere-fidelite");
  await page.getByRole("tab", { name: "Relecture ligne par ligne" }).click();
  await shot(page, "US05-3-relecture-ligne-par-ligne");
});

test("US06 · exporter en PDF et en Word, selon le modèle et les usages du pays", async ({ page }) => {
  await login(page);
  await firstCv(page);
  await page.getByLabel("Moderne").check();
  await page.getByLabel("Allemagne").check();
  await page.getByLabel(/J'ai relu mon CV/).check();
  await shot(page, "US06-1-export-modele-pays");
  const [pdf] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Télécharger le CV ciblé (PDF)" }).click(),
  ]);
  expect((await readFile((await pdf.path())!)).subarray(0, 5).toString()).toBe("%PDF-");
  const [docx] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "Version Word (.docx)" }).click(),
  ]);
  expect(docx.suggestedFilename()).toMatch(/\.docx$/);
  expect((await readFile((await docx.path())!)).subarray(0, 2).toString()).toBe("PK");
});

test("US07 · partager son CV en ligne par un lien secret, révocable", async ({ page, browser }) => {
  await login(page);
  await firstCv(page);
  // Partage seulement après la relecture du CV (contrôle de fidélité avant toute diffusion).
  await page.getByLabel(/J'ai relu mon CV/).check();
  await page.getByLabel(/Je comprends que mes coordonnées seront visibles/).check();
  await page.getByRole("button", { name: "Créer un lien de partage" }).click();
  const link = page.locator('main a[href*="/cv-en-ligne/"]').first();
  await expect(link).toBeVisible();
  await shot(page, "US07-1-lien-de-partage");
  const visitor = await browser.newPage();
  await visitor.goto((await link.getAttribute("href"))!);
  await expect(visitor.locator("iframe[title='CV partagé']")).toBeVisible();
  await visitor.waitForTimeout(1500);
  await visitor.screenshot({ path: `${CAPTURES}/US07-2-cv-en-ligne-visiteur.png` });
  await visitor.close();
});

test("US08 · rédiger une lettre de motivation sourcée dans le CV", async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await firstCv(page);
  await page.getByRole("button", { name: "Rédiger la lettre de motivation" }).click();
  await expect(page.getByRole("heading", { level: 1, name: /^Lettre pour/ })).toBeVisible({
    timeout: 60_000,
  });
  await expectAccessible(page);
  await shot(page, "US08-1-lettre-de-motivation");
});

test("US09 · consulter et mettre à jour sa veille emploi (rapports par e-mail)", async ({ page }) => {
  await login(page);
  await page.goto("/veille");
  await expect(page.getByLabel("Adresse de réception des rapports")).not.toHaveValue("");
  await shot(page, "US09-1-veille-emploi");
  // Le consentement est redemandé, et journalisé, à chaque enregistrement.
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.getByRole("alert")).toContainText("Cochez la case pour accepter de recevoir la veille");
  await page.getByLabel(/J'accepte de recevoir la veille par e-mail/).check();
  await page.getByRole("button", { name: "Mettre à jour" }).click();
  await expect(page.getByText(/Votre veille est active : les rapports seront envoyés/)).toBeVisible();
  await shot(page, "US09-2-veille-mise-a-jour");
  await expectAccessible(page);
});

test("US10 · suivre ses candidatures par étape", async ({ page }) => {
  await login(page);
  await page.goto("/candidatures");
  await expect(page.getByRole("heading", { level: 1, name: "Mes candidatures" })).toBeVisible();
  await expect(page.getByLabel("Étape").first()).toBeVisible();
  await shot(page, "US10-1-candidatures");
});

test("US11 · faire juger la fidélité de son CV par l'assistant IA", async ({ page }) => {
  await login(page);
  await firstCv(page);
  await page.getByRole("link", { name: /Ouvrir le Studio IA/ }).click();
  await expect(page.getByRole("button", { name: "Rejuger" })).toBeVisible({ timeout: 30_000 });
  await shot(page, "US11-1-studio-juge-de-fidelite");
});

test("US12 · administration réservée à l'administrateur, sans donnée personnelle", async ({ page }) => {
  await login(page);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();
  await shot(page, "US12-1-acces-refuse-candidat");
  await page.context().clearCookies();
  await login(page, ADMIN);
  await page.goto("/admin");
  await expect(page.getByRole("heading", { level: 1 })).not.toHaveText("Accès refusé");
  await expect(page.locator("main")).not.toContainText(DEMO.username);
  await page.waitForTimeout(1500);
  await shot(page, "US12-2-administration");
});

test("US13 · supprimer son compte et toutes ses données (RGPD)", async ({ page }) => {
  await createAccount(page);
  await page.getByLabel("J'ai mis mes codes en lieu sûr.").check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  const dialog = page.getByRole("dialog", { name: "Supprimer définitivement votre compte ?" });
  await dialog.getByLabel(/Je comprends/).check();
  await shot(page, "US13-1-suppression-confirmation");
  await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
  await expect(page.getByRole("link", { name: "Se connecter" }).first()).toBeVisible();
  await shot(page, "US13-2-compte-supprime");
});
