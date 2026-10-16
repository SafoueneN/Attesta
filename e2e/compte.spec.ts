import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

/**
 * Compte et veille, de bout en bout, contre la pile compose : les e-mails sont lus
 * dans Mailpit (MAILPIT_URL). Sans Mailpit (serveur local des autres tests), le
 * fichier est ignoré : les comptes y sont désactivés.
 */
const mailpit = process.env.MAILPIT_URL;
test.skip(!mailpit, "MAILPIT_URL absent : comptes désactivés sur le serveur local");

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const blocking = violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  expect(blocking.map((v) => `${v.id} : ${v.help} (${v.nodes.length})`)).toEqual([]);
}

/** Lien du dernier e-mail reçu par `to`, dont le chemin commence par `path`. */
async function linkFromMail(to: string, path: string): Promise<string> {
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

test("compte : connexion par lien, profil, veille en double opt-in, désabonnement, suppression", async ({
  page,
}) => {
  const email = `e2e-${Date.now()}@attesta.localhost`;

  // CV minimal dans la session.
  await page.goto("/cv/etape/1");
  await page.getByLabel("Nom et prénom").fill("Camille Exemple");
  await page.getByLabel("Titre professionnel").fill("Développeuse back-end");
  await page.getByRole("button", { name: "Continuer" }).click();
  const work = page.getByRole("group", { name: "Expérience 1" });
  await work.getByLabel("Poste", { exact: true }).fill("Développeuse back-end");
  await work.getByLabel("Employeur").fill("Entreprise Fictive");
  await work.getByLabel("Début").fill("2020-01");
  await page.getByRole("textbox", { name: "Compétences" }).fill("Node.js : TypeScript, PostgreSQL");
  await page.getByRole("button", { name: "Continuer" }).click();

  // Connexion.
  await page.getByRole("link", { name: "Mon compte et ma veille" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  await expectAccessible(page);
  await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
  await expect(page.getByRole("alert")).toContainText("Saisissez une adresse e-mail valide");
  await expectAccessible(page);
  await page.getByLabel("Adresse e-mail").fill(email);
  await page.getByLabel(/politique de confidentialité/).check();
  await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
  await expect(page.getByRole("status")).toContainText("lien de connexion");

  await page.goto(await linkFromMail(email, "/compte/connexion"));
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();

  // Profil, puis veille.
  await page.getByRole("button", { name: "Enregistrer le CV de cette session comme profil" }).click();
  await expect(page.getByRole("status")).toContainText("Profil enregistré (version 1)");
  await expectAccessible(page);
  await page.getByLabel("Métiers recherchés").fill("Développeur back-end");
  await page.getByLabel("Ville").fill("Atlantis");
  await page.getByRole("button", { name: "Activer ma veille" }).click();
  await expect(page.getByRole("alert")).toContainText("Ville introuvable");
  await expectAccessible(page);
  await page.getByLabel("Ville").fill("Munich");
  await page.getByLabel(/J'accepte de recevoir/).check();
  await page.getByRole("button", { name: "Activer ma veille" }).click();
  await expect(page.getByText("en attente de confirmation")).toBeVisible();

  await page.goto(await linkFromMail(email, "/veille/confirmer"));
  await expectAccessible(page);
  await page.getByRole("button", { name: "Confirmer ma veille" }).click();
  await expect(page.getByRole("status")).toContainText("veille emploi est active");

  // Arrêt de la veille, puis suppression du compte.
  await page.goto("/compte");
  await expect(page.getByText("active", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Arrêter ma veille" }).click();
  await expect(page.getByText("arrêtée", { exact: true })).toBeVisible();
  await page.getByLabel(/supprimer définitivement/).check();
  await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  await expect(page.getByRole("status")).toContainText("Vos données ont été effacées");
});
