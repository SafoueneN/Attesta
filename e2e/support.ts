import AxeBuilder from "@axe-core/playwright";
import { expect, type Page } from "@playwright/test";

/**
 * Outils communs à la suite de parité (e2e/parite). Ils ne dépendent que de ce qu'un utilisateur voit :
 * libellés, rôles ARIA, URL publiques, e-mails reçus. Aucun détail d'implémentation, pour que la même
 * suite reste valable avant, pendant et après l'extraction en microservices (docs/adr/0011).
 */

/** Boîte de réception Mailpit (pile compose). Absente : les tests de comptes sont ignorés. */
export const mailpit = process.env.MAILPIT_URL;

/** Aucune violation critique ou sérieuse des règles WCAG 2.2 A/AA détectables automatiquement. */
export async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

export async function fillProfile(page: Page) {
  await page.getByLabel("Nom et prénom").fill("Léa Martin");
  await page.getByLabel("Titre professionnel").fill("Développeuse back-end");
  await page.getByLabel("Adresse e-mail").fill("lea.martin@example.org");
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
    .fill("Migration de 12 services Express\nRéduction de 40 % du temps de réponse");
  const education = page.getByRole("group", { name: "Formation 1" });
  await education.getByLabel("Établissement").fill("INSA Lyon");
  await education.getByLabel("Fin").fill("2019");
  await page.getByRole("textbox", { name: "Compétences" }).fill("Node.js : Express, PostgreSQL");
  await page.getByRole("button", { name: "Continuer" }).click();
}

export async function fillOffer(
  page: Page,
  text = "Nous recherchons une développeuse ou un développeur back-end Node.js pour notre plateforme.",
) {
  await page.getByLabel("Texte de l'offre").fill(text);
  await page.getByRole("button", { name: "Continuer" }).click();
}

/** Lien du dernier e-mail reçu par `to`, dont le chemin commence par `path`. */
export async function linkFromMail(to: string, path: string): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const { messages } = await (
      await fetch(`${mailpit}/api/v1/search?query=${encodeURIComponent(`to:${to}`)}`)
    ).json();
    for (const m of messages ?? []) {
      const message = await (await fetch(`${mailpit}/api/v1/message/${m.ID}`)).json();
      const match = new RegExp(`https?://[^\\s"]+(${path}/[A-Za-z0-9_-]+)`).exec(message.Text);
      if (match) return match[1]!;
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error(`Aucun e-mail pour ${to} contenant ${path}`);
}

/** Connexion par lien magique, depuis la page de connexion jusqu'à « Mon compte ». */
export async function login(page: Page, email: string) {
  await page.goto("/compte/connexion");
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/politique de confidentialité/).check();
  await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
  await expect(page.getByRole("status")).toContainText("lien de connexion");
  await page.goto(await linkFromMail(email, "/compte/connexion"));
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}
