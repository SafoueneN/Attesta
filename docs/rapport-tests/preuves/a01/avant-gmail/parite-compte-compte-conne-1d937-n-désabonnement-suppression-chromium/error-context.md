# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: parite\compte.spec.ts >> compte : connexion par lien, profil, veille en double opt-in, désabonnement, suppression
- Location: e2e\parite\compte.spec.ts:11:1

# Error details

```
Error: expect(locator).toContainText(expected) failed

Locator: getByRole('status')
Expected substring: "lien de connexion"
Timeout: 5000ms
Error: element(s) not found

Call log:
  - Expect "toContainText" getByRole('status') with timeout 5000ms
  - waiting for getByRole('status')

```

```yaml
- link "Aller au contenu":
  - /url: "#main"
- banner:
  - link "Attesta Le CV qui dit vrai":
    - /url: /
  - link "Mon compte et ma veille":
    - /url: /compte
  - button "Thème sombre"
- main:
  - heading "Une erreur est survenue" [level=1]
  - paragraph: Une erreur inattendue est survenue. Réessayez dans un instant.
  - paragraph:
    - link "Retour à l'accueil":
      - /url: /
- contentinfo:
  - paragraph:
    - text: "Sans compte, vos informations restent dans une session temporaire : elles sont effacées après 2 h d'inactivité, et au plus tard 24 h après votre arrivée. Le PDF est généré à la demande et n'est pas conservé."
    - link "Confidentialité":
      - /url: /confidentialite
  - button "Effacer mes données"
```

# Test source

```ts
  1  | import { expect, test } from "@playwright/test";
  2  | import { expectAccessible, linkFromMail, mailpit } from "../support.js";
  3  | 
  4  | /**
  5  |  * Compte et veille, de bout en bout, contre la pile compose : les e-mails sont lus
  6  |  * dans Mailpit (MAILPIT_URL). Sans Mailpit (serveur local des autres tests), le
  7  |  * fichier est ignoré : les comptes y sont désactivés.
  8  |  */
  9  | test.skip(!mailpit, "MAILPIT_URL absent : comptes désactivés sur le serveur local");
  10 | 
  11 | test("compte : connexion par lien, profil, veille en double opt-in, désabonnement, suppression", async ({
  12 |   page,
  13 | }) => {
  14 |   const email = `e2e-${Date.now()}@attesta.localhost`;
  15 | 
  16 |   // CV minimal dans la session.
  17 |   await page.goto("/cv/etape/1");
  18 |   await page.getByLabel("Nom et prénom").fill("Camille Exemple");
  19 |   await page.getByLabel("Titre professionnel").fill("Développeuse back-end");
  20 |   await page.getByRole("button", { name: "Continuer" }).click();
  21 |   const work = page.getByRole("group", { name: "Expérience 1" });
  22 |   await work.getByLabel("Poste", { exact: true }).fill("Développeuse back-end");
  23 |   await work.getByLabel("Employeur").fill("Entreprise Fictive");
  24 |   await work.getByLabel("Début").fill("2020-01");
  25 |   await page.getByRole("textbox", { name: "Compétences" }).fill("Node.js : TypeScript, PostgreSQL");
  26 |   await page.getByRole("button", { name: "Continuer" }).click();
  27 | 
  28 |   // Connexion.
  29 |   await page.getByRole("link", { name: "Mon compte et ma veille" }).click();
  30 |   await expect(page.getByRole("heading", { level: 1, name: "Connexion" })).toBeVisible();
  31 |   await expectAccessible(page);
  32 |   await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
  33 |   await expect(page.getByRole("alert")).toContainText("Saisissez une adresse e-mail valide");
  34 |   await expectAccessible(page);
  35 |   await page.getByLabel("Adresse e-mail").fill(email);
  36 |   await page.getByLabel(/politique de confidentialité/).check();
  37 |   await page.getByRole("button", { name: "Recevoir mon lien de connexion" }).click();
> 38 |   await expect(page.getByRole("status")).toContainText("lien de connexion");
     |                                          ^ Error: expect(locator).toContainText(expected) failed
  39 | 
  40 |   await page.goto(await linkFromMail(email, "/compte/connexion"));
  41 |   await page.getByRole("button", { name: "Me connecter" }).click();
  42 |   await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  43 | 
  44 |   // Profil, puis veille.
  45 |   await page.getByRole("button", { name: "Enregistrer le CV de cette session comme profil" }).click();
  46 |   await expect(page.getByRole("status")).toContainText("Profil enregistré (version 1)");
  47 |   await expectAccessible(page);
  48 |   await page.getByLabel("Métiers recherchés").fill("Développeur back-end");
  49 |   await page.getByLabel("Ville").fill("Atlantis");
  50 |   await page.getByRole("button", { name: "Activer ma veille" }).click();
  51 |   await expect(page.getByRole("alert")).toContainText("Ville introuvable");
  52 |   await expectAccessible(page);
  53 |   await page.getByLabel("Ville").fill("Munich");
  54 |   await page.getByLabel(/J'accepte de recevoir/).check();
  55 |   await page.getByRole("button", { name: "Activer ma veille" }).click();
  56 |   await expect(page.getByText("en attente de confirmation")).toBeVisible();
  57 | 
  58 |   await page.goto(await linkFromMail(email, "/veille/confirmer"));
  59 |   await expectAccessible(page);
  60 |   await page.getByRole("button", { name: "Confirmer ma veille" }).click();
  61 |   await expect(page.getByRole("status")).toContainText("veille emploi est active");
  62 | 
  63 |   // Arrêt de la veille, puis suppression du compte.
  64 |   await page.goto("/compte");
  65 |   await expect(page.getByText("active", { exact: true })).toBeVisible();
  66 |   await page.getByRole("button", { name: "Arrêter ma veille" }).click();
  67 |   await expect(page.getByText("arrêtée", { exact: true })).toBeVisible();
  68 |   await page.getByLabel(/supprimer définitivement/).check();
  69 |   await page.getByRole("button", { name: "Supprimer mon compte" }).click();
  70 |   await expect(page.getByRole("status")).toContainText("Vos données ont été effacées");
  71 | });
  72 | 
```