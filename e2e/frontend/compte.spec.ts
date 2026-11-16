import { expect, test } from "@playwright/test";
import {
  expectAccessible,
  fillOffer,
  fillParcours,
  fillProfile,
  generate,
  signIn,
  signUp,
  uniqueEmail,
} from "./support.js";

test.describe("comptes, lettres, veille et RGPD (pile compose)", () => {
  test.skip(!process.env.E2E_BASE_URL, "pile compose requise (E2E_BASE_URL)");

  test("lettre de motivation contrôlée, export des données puis suppression du compte", async ({ page }) => {
    // Connexion, génération, lettre, deux PDF, export et suppression : parcours long.
    test.setTimeout(90_000);
    const email = uniqueEmail("lettre");
    const username = await signUp(page);
    await expectAccessible(page);

    await page.goto("/cv/etape/1");
    await fillProfile(page, email);
    await fillParcours(page);
    await fillOffer(page);
    await generate(page);

    await page.getByLabel("Ton de la lettre").selectOption("chaleureux");
    await page.getByRole("button", { name: "Rédiger la lettre de motivation" }).click();
    await expect(page.getByRole("heading", { level: 1, name: /^Lettre pour/ })).toBeVisible();
    await expect(page.getByText("Sourcé dans votre CV").first()).toBeVisible();
    await expectAccessible(page);

    await page.getByLabel("Paragraphe 1").fill("Je maîtrise Kubernetes au quotidien.");
    await page.getByRole("button", { name: "Enregistrer et recontrôler" }).click();
    await expect(page.getByText("Lettre enregistrée et recontrôlée.")).toBeVisible();
    await expect(
      page.getByText("« Kubernetes » est demandé par l'offre mais absent de votre profil"),
    ).toBeVisible();
    const [letterPdf] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Télécharger en PDF" }).click(),
    ]);
    expect(letterPdf.suggestedFilename()).toBe("lettre-lea-martin.pdf");

    await page.goto("/compte");
    const [archive] = await Promise.all([
      page.waitForEvent("download"),
      page.getByRole("button", { name: "Télécharger mes données" }).click(),
    ]);
    expect(archive.suggestedFilename()).toBe("attesta-mes-donnees.json");
    const data = JSON.parse(
      await (await import("node:fs/promises")).readFile((await archive.path())!, "utf8"),
    );
    expect(data.auth.compte.username).toBe(username);
    expect(Object.keys(data)).toEqual(
      expect.arrayContaining(["profiles", "cv-generation", "letters-export", "jobs-matching"]),
    );

    await page.getByRole("button", { name: "Supprimer mon compte" }).click();
    const dialog = page.getByRole("dialog", { name: "Supprimer définitivement votre compte ?" });
    await dialog.getByLabel(/Je comprends/).check();
    await dialog.getByRole("button", { name: "Supprimer définitivement" }).click();
    await expect(page.getByText("Vos données ont été effacées.")).toBeVisible();
    await expect(page.getByRole("link", { name: "Se connecter" })).toBeVisible();
  });

  test("veille emploi : adresse de réception choisie, active dès l'enregistrement, puis arrêt", async ({
    page,
  }) => {
    test.skip(!process.env.E2E_FULL, "profil compose full requis (job-watch)");
    const email = uniqueEmail("veille");
    // Adresse de réception différente de celle du profil : c'est elle qui reçoit les rapports (ADR 0030).
    const recipient = uniqueEmail("reception");
    await signUp(page);
    await page.goto("/cv/etape/1");
    await fillProfile(page, email);
    await fillParcours(page);
    // Le profil doit être enregistré avant de quitter la page : la veille en dépend (sinon 409).
    await expect(page.getByText(/Profil enregistré \(version \d+\)/)).toBeVisible();

    await page.goto("/veille");
    const address = page.getByLabel("Adresse de réception des rapports");
    await expect(address).toHaveValue(email);
    await page.getByLabel("Métiers recherchés").fill("Backend-Entwickler");
    await page.getByLabel("Ville").fill("Berlin");
    await address.fill(recipient);
    await page.getByLabel(/J'accepte de recevoir la veille/).check();
    await page.getByRole("button", { name: "Créer ma veille" }).click();
    await expect(page.getByText(/Votre veille est active : les rapports seront envoyés/)).toBeVisible();
    await expect(page.getByText(`Adresse de réception : ${recipient}`)).toBeVisible();
    await expect(page.getByText("Active", { exact: true })).toBeVisible();
    await expectAccessible(page);
    await page.getByRole("button", { name: "Arrêter la veille" }).click();
    await expect(page.getByText("Arrêtée", { exact: true })).toBeVisible();
  });

  test("administration : réservée à l'administrateur, sans donnée personnelle", async ({ page }) => {
    const candidate = await signUp(page);
    await page.goto("/admin");
    await expect(page.getByRole("heading", { level: 1, name: "Accès refusé" })).toBeVisible();

    await page.getByRole("button", { name: "Se déconnecter" }).click();
    await signIn(page, "admin", process.env.E2E_ADMIN_PASSWORD ?? "admin-dev-uniquement");
    await page.getByRole("link", { name: "Administration" }).click();
    await expect(page.getByRole("heading", { level: 2, name: "Santé des services" })).toBeVisible();
    await expect(
      page.getByRole("region", { name: "Santé des services" }).getByText("Génération de CV"),
    ).toBeVisible();
    await expect(page.getByRole("meter").first()).toBeVisible();
    await expect(page.locator("main")).not.toContainText(candidate);
    await expectAccessible(page);
  });
});
