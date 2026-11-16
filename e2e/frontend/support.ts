import { expect, type Page } from "@playwright/test";

export { expectAccessible } from "../support.js";

/**
 * Outils de la suite du frontend React (pile compose : frontend, gateway et les six services) : seulement
 * ce qu'un utilisateur voit (libellés, rôles ARIA, fichiers téléchargés).
 */

export async function fillProfile(page: Page, email = "lea.martin@example.org") {
  await page.getByLabel("Nom et prénom").fill("Léa Martin");
  await page.getByLabel("Titre professionnel").fill("Développeuse back-end");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel("Ville").fill("Lyon");
  await page.getByRole("button", { name: "Continuer" }).click();
}

export async function fillParcours(page: Page) {
  const work = page.getByRole("group", { name: "Expérience 1" });
  await work.getByLabel("Poste", { exact: true }).fill("Développeuse back-end");
  await work.getByLabel("Employeur").fill("Transports Rhône");
  await work.getByLabel("Début").fill("2021-03");
  await work
    .getByLabel("Réalisations")
    .fill("Migration de 12 services Express vers Node.js 20\nRéduction de 40 % du temps de réponse");
  const education = page.getByRole("group", { name: "Formation 1" });
  await education.getByLabel("Établissement").fill("INSA Lyon");
  await education.getByLabel("Année d'obtention").fill("2019");
  await page.getByRole("textbox", { name: "Compétences" }).fill("Node.js : Express, PostgreSQL");
  await page.getByRole("button", { name: "Enregistrer et continuer" }).click();
}

export const OFFER =
  "Développeur back-end Node.js (H/F)\nVous concevez des API avec PostgreSQL pour notre plateforme. Une expérience de Kubernetes est un plus.";

export async function fillOffer(page: Page, text = OFFER) {
  await page.getByLabel("Annonce complète").fill(text);
  await page.getByRole("button", { name: "Analyser l'offre et continuer" }).click();
}

/** Génère le CV ciblé et attend la page de relecture. */
export async function generate(page: Page) {
  await page.getByRole("button", { name: "Générer mon CV ciblé" }).click();
  await expect(
    page.getByRole("heading", { level: 1, name: "Développeur back-end Node.js (H/F)" }),
  ).toBeVisible({ timeout: 60_000 });
}

/** Adresse unique par test : les comptes ne se mélangent pas d'une exécution à l'autre. */
export const uniqueEmail = (prefix: string) =>
  `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1e6)}@example.org`;

/** Identifiant unique par test (ADR 0030 : 3 à 30 caractères, [a-z0-9._-]). */
export const uniqueUsername = (prefix: string) =>
  `${prefix}.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export const PASSWORD = "e2e-mot-de-passe";

/** Compte neuf par identifiant et mot de passe, codes de récupération confirmés, jusqu'à « Mon compte ». */
export async function signUp(page: Page, username = uniqueUsername("e2e")) {
  await page.goto("/connexion");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(PASSWORD);
  await page.getByLabel("Confirmer le mot de passe").fill(PASSWORD);
  await page.getByLabel(/politique de confidentialité/).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Votre compte est créé" })).toBeVisible();
  await page.getByLabel(/J'ai mis mes codes en lieu sûr/).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  return username;
}

/** Connexion à un compte existant, jusqu'à « Mon compte ». */
export async function signIn(page: Page, username: string, password = PASSWORD) {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}
