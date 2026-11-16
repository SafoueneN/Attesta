import { expect, type Page } from "@playwright/test";

/*
 * Outils de la campagne QA (fichiers qa-*.spec.ts) : mêmes parcours que la recette (libellés, rôles ARIA),
 * plus un accès à l'API avec le jeton de la session du navigateur, pour les contrôles d'autorisation
 * (IDOR) et d'effacement (RGPD).
 */

export const DEMO = { username: "amina.diallo", password: "demo-attesta-local" };
export const unique = (prefix: string) =>
  `${prefix}.${Date.now().toString(36)}${Math.floor(Math.random() * 1e4)}`;

export async function login(page: Page, { username, password } = DEMO) {
  await page.goto("/connexion");
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Me connecter" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
}

/** Compte neuf, codes de récupération confirmés, jusqu'à « Mon compte ». */
export async function createAccount(page: Page, username = unique("qa")) {
  await page.goto("/connexion");
  await page.getByRole("tab", { name: "Créer un compte" }).click();
  await page.getByLabel("Identifiant").fill(username);
  await page.getByLabel("Mot de passe", { exact: true }).fill("recette-mot-de-passe");
  await page.getByLabel("Confirmer le mot de passe").fill("recette-mot-de-passe");
  await page.getByLabel(/politique de confidentialité/).check();
  await page.getByRole("button", { name: "Créer mon compte" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Votre compte est créé" })).toBeVisible();
  await page.getByLabel(/J'ai mis mes codes en lieu sûr/).check();
  await page.getByRole("button", { name: "Continuer" }).click();
  await expect(page.getByRole("heading", { level: 1, name: "Mon compte" })).toBeVisible();
  return username;
}

/** Premier CV ciblé du compte connecté, jusqu'à la rubrique d'export. */
export async function firstCv(page: Page) {
  await page.goto("/mes-cv");
  await page.locator('main a[href^="/mes-cv/"]').first().click();
  await expect(page.getByRole("heading", { level: 2, name: "Exporter" })).toBeVisible();
  return page.url().split("/mes-cv/")[1]!;
}

/** Jeton d'accès de la session du navigateur (rotation du refresh token, comme le frontend). */
export async function accessToken(page: Page): Promise<string> {
  return page.evaluate(async () => {
    const res = await fetch("/api/auth/v1/session/refresh", {
      method: "POST",
      headers: { "X-Attesta-Csrf": "1" },
      credentials: "same-origin",
    });
    if (!res.ok) throw new Error(`refresh ${res.status}`);
    return ((await res.json()) as { accessToken: string }).accessToken;
  });
}

/** Appel d'API depuis la page, avec un jeton donné ; renvoie le statut et le corps JSON s'il y en a un. */
export async function call(page: Page, token: string, method: string, path: string, body?: unknown) {
  return page.evaluate(
    async ({ token, method, path, body }) => {
      const res = await fetch(`/api${path}`, {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await res.text();
      let json: unknown = null;
      try {
        json = JSON.parse(text);
      } catch {
        // corps vide ou non JSON
      }
      return { status: res.status, json };
    },
    { token, method, path, body },
  );
}

/** Identifiant de l'utilisateur porté par le jeton (claim `sub`). */
export const subjectOf = (token: string) =>
  (JSON.parse(Buffer.from(token.split(".")[1]!, "base64url").toString("utf8")) as { sub: string }).sub;
