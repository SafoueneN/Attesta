import nodemailer from "nodemailer";

/**
 * Envoi du lien de connexion par SMTP : Mailpit en local, un relais européen hors poste local. Aucun pixel
 * de suivi, aucune image distante, aucun lien réécrit.
 */
export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
}

export interface Mailer {
  send(message: MailMessage): Promise<void>;
}

export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage) {
    try {
      await this.transport.sendMail({ from: this.from, ...message });
    } catch (error) {
      // Le message d'erreur SMTP cite souvent l'adresse : seul le code est conservé, et l'erreur d'origine
      // n'est pas chaînée (pino journaliserait sa cause).
      const { code, responseCode } = error as { code?: string; responseCode?: number };
      // eslint-disable-next-line preserve-caught-error
      throw new Error(`envoi impossible (${code ?? "inconnu"}${responseCode ? ` ${responseCode}` : ""})`);
    }
  }
}

/** Boîte d'envoi en mémoire : tests uniquement. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];
  async send(message: MailMessage) {
    this.sent.push(message);
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

export function loginLinkMessage(to: string, link: string): MailMessage {
  const paragraphs = [
    "Bonjour,",
    "Voici votre lien de connexion à Attesta. Il est valable 15 minutes et ne sert qu'une fois.",
    "Si vous n'avez rien demandé, ignorez cet e-mail : aucun compte n'est créé sans ce lien.",
  ];
  return {
    to,
    subject: "Attesta – votre lien de connexion",
    text: [...paragraphs, `Me connecter : ${link}`].join("\n\n"),
    html: `<!doctype html><html lang="fr"><body>${paragraphs.map((p) => `<p>${escapeHtml(p)}</p>`).join("\n")}
<p><a href="${escapeHtml(link)}">Me connecter</a></p></body></html>`,
  };
}
