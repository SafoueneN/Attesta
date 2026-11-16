import { createServer } from "node:net";
import { describe, expect, it } from "vitest";
import { loginLinkMessage, SmtpMailer } from "../src/mail.js";

/*
 * Campagne QA (A-09) : échec d'envoi SMTP. Le serveur visé est un port local fermé : aucune connexion
 * sortante. L'erreur ne garde que le code SMTP, jamais l'adresse du destinataire.
 */

async function closedPort() {
  const server = createServer();
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const { port } = server.address() as { port: number };
  await new Promise<void>((resolve) => server.close(() => resolve()));
  return port;
}

describe("SmtpMailer : échec d'envoi (campagne QA)", () => {
  it("transforme un serveur injoignable en « envoi impossible (code) », sans adresse ni cause chaînée", async () => {
    const mailer = new SmtpMailer(
      `smtp://127.0.0.1:${await closedPort()}`,
      "Attesta <test@attesta.localhost>",
    );
    const error = await mailer.send(loginLinkMessage("lea.martin@example.org", "http://localhost/lien")).then(
      () => undefined,
      (e: unknown) => e as Error,
    );
    expect(error).toBeInstanceOf(Error);
    expect(error?.message).toMatch(/^envoi impossible \([A-Z]+( \d{3})?\)$/);
    expect(error?.message).not.toContain("lea.martin");
    expect(error?.cause).toBeUndefined();
  }, 15_000);
});

describe("loginLinkMessage (campagne QA)", () => {
  it("échappe le lien dans la version HTML et le laisse intact dans la version texte", () => {
    const link = `http://localhost/connexion?t="><script>alert(1)</script>&x='y'`;
    const message = loginLinkMessage("lea.martin@example.org", link);
    expect(message.html).not.toContain("<script>");
    expect(message.html).toContain("&lt;script&gt;");
    expect(message.html).toContain("&quot;");
    expect(message.html).toContain("&#39;y&#39;");
    expect(message.text).toContain(`Me connecter : ${link}`);
    expect(message.subject).toBe("Attesta – votre lien de connexion");
  });
});
