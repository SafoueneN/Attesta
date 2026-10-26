import { expect, type Page } from "@playwright/test";
import { linkFromMail } from "../support.js";

export { expectAccessible, mailpit } from "../support.js";

/**
 * Outils de la suite du frontend React (pile compose : frontend, gateway et les six services). Mêmes
 * principes que la parité : seulement ce qu'un utilisateur voit (libellés, rôles ARIA, e-mails reçus).
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

/** Connexion par lien magique, jusqu'à « Mon compte ». */
export async function login(page: Page, email: string) {
  await page.goto("/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/politique de confidentialité/).check();
  await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
  await expect(page.getByText("Lien envoyé")).toBeVisible();
  await page.goto(await linkFromMail(email, "/connexion"));
  await expect(page.getByText(/Vous allez vous connecter au compte/)).toBeVisible();
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}
