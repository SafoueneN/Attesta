import nodemailer from "nodemailer";

/**
 * Envoi d'e-mails (décision Q18) : SMTP, vers Mailpit en local et vers le relais
 * SMTP de Brevo (UE) en préprod et en prod. Aucun pixel de suivi, aucune image
 * distante, aucun lien réécrit : les e-mails sont du texte et du HTML minimal.
 */

export interface MailAttachment {
  filename: string;
  content: Uint8Array;
  contentType: string;
}

export interface MailMessage {
  to: string;
  subject: string;
  text: string;
  html: string;
  headers?: Record<string, string>;
  attachments?: MailAttachment[];
}

export interface Mailer {
  /** Identifiant attribué au message, rapproché ensuite des retours du fournisseur. */
  send(message: MailMessage): Promise<{ messageId: string }>;
}

/**
 * Échec d'envoi, sans l'adresse ni la réponse du serveur (qui la citent souvent) :
 * seuls le code d'erreur et le code SMTP sont conservés, pour les journaux et pg-boss.
 */
export class MailError extends Error {
  constructor(
    readonly code: string | undefined,
    readonly responseCode: number | undefined,
    /** Vrai seulement si le message n'a certainement pas été accepté par le serveur. */
    readonly notSent: boolean,
  ) {
    super(`envoi impossible (${code ?? "inconnu"}${responseCode ? ` ${responseCode}` : ""})`);
    this.name = "MailError";
  }
}

/**
 * Erreurs de nodemailer qui ne peuvent survenir qu'avant la transmission du message.
 * « ECONNECTION » et « ESOCKET » n'en font pas partie : nodemailer les emploie aussi
 * pour une coupure en cours de transmission.
 */
const BEFORE_SENDING = new Set(["EAUTH", "EENVELOPE", "EDNS", "ECONFIG", "ETLS"]);
/** Appels système d'une connexion jamais établie. */
const NEVER_CONNECTED = new Set(["connect", "getaddrinfo"]);

export class SmtpMailer implements Mailer {
  private readonly transport;

  constructor(
    smtpUrl: string,
    private readonly from: string,
  ) {
    this.transport = nodemailer.createTransport(smtpUrl);
  }

  async send(message: MailMessage) {
    let info;
    try {
      info = await this.transport.sendMail({
        from: this.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        html: message.html,
        headers: message.headers,
        attachments: message.attachments?.map((a) => ({
          filename: a.filename,
          content: Buffer.from(a.content),
          contentType: a.contentType,
        })),
      });
    } catch (error) {
      const { code, responseCode, syscall } = error as {
        code?: string;
        responseCode?: number;
        syscall?: string;
      };
      // Réponse d'erreur du serveur, échec de configuration, d'authentification ou
      // d'enveloppe, connexion jamais établie : le message n'est pas parti. Toute autre
      // erreur (délai, coupure) est incertaine : la réservation reste (au plus un envoi).
      const notSent =
        typeof responseCode === "number" ||
        (code !== undefined && BEFORE_SENDING.has(code)) ||
        (syscall !== undefined && NEVER_CONNECTED.has(syscall));
      throw new MailError(code, responseCode, notSent);
    }
    return { messageId: info.messageId };
  }
}

/** Boîte d'envoi en mémoire : tests uniquement. */
export class MemoryMailer implements Mailer {
  readonly sent: MailMessage[] = [];

  async send(message: MailMessage) {
    this.sent.push(message);
    return { messageId: `<memoire-${this.sent.length}@attesta.test>` };
  }
}

const escapeHtml = (text: string) =>
  text.replace(
    /[&<>"']/g,
    (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!,
  );

function layout(paragraphs: string[], link?: { href: string; label: string }) {
  const html = [
    ...paragraphs.map((p) => `<p>${escapeHtml(p).replace(/\n/g, "<br>")}</p>`),
    link ? `<p><a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a></p>` : "",
  ].join("\n");
  const text = [...paragraphs, ...(link ? [`${link.label} : ${link.href}`] : [])].join("\n\n");
  return { html: `<!doctype html><html lang="fr"><body>${html}</body></html>`, text };
}

export function loginLinkMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Attesta – votre lien de connexion",
    ...layout(
      [
        "Bonjour,",
        "Voici votre lien de connexion à Attesta. Il est valable 15 minutes et ne sert qu'une fois.",
        "Si vous n'avez rien demandé, ignorez cet e-mail : aucun compte n'est créé sans ce lien.",
      ],
      { href: link, label: "Me connecter" },
    ),
  };
}

export function confirmSubscriptionMessage(to: string, link: string): MailMessage {
  return {
    to,
    subject: "Attesta – confirmez votre veille emploi",
    ...layout(
      [
        "Bonjour,",
        "Vous avez demandé à recevoir chaque jour un rapport d'offres d'emploi. Confirmez votre inscription avec le lien ci-dessous (valable 48 heures).",
        "Sans confirmation, vous ne recevrez rien. Vous pourrez vous désabonner à tout moment, en un clic, depuis chaque e-mail.",
      ],
      { href: link, label: "Confirmer ma veille" },
    ),
  };
}

export interface DailyMessageInput {
  to: string;
  /** Identifiant de l'envoi, renvoyé par Brevo dans ses webhooks (en-tête X-Mailin-custom). */
  deliveryId: string;
  date: string;
  offers: { title: string; company: string | null; url: string }[];
  unsubscribeUrl: string;
  attachments: MailAttachment[];
}

/**
 * E-mail quotidien. En-têtes List-Unsubscribe et List-Unsubscribe-Post (RFC 8058) :
 * les messageries proposent alors le désabonnement en un clic.
 */
export function dailyReportMessage(input: DailyMessageInput): MailMessage {
  const n = input.offers.length;
  const top = input.offers
    .slice(0, 5)
    .map((o) => `• ${o.title}${o.company ? ` – ${o.company}` : ""}`)
    .join("\n");
  const body = layout(
    [
      `Bonjour,`,
      `${n} nouvelle${n > 1 ? "s" : ""} offre${n > 1 ? "s" : ""} correspond${n > 1 ? "ent" : ""} à votre profil aujourd'hui. Vous trouverez en pièces jointes le rapport des offres et celui des points à améliorer.`,
      top,
      "Ce rapport est calculé à partir de votre profil Attesta, sans votre nom ni vos coordonnées.",
    ],
    { href: input.unsubscribeUrl, label: "Me désabonner" },
  );
  return {
    to: input.to,
    subject: `Attesta – ${n} nouvelle${n > 1 ? "s" : ""} offre${n > 1 ? "s" : ""} (${input.date})`,
    ...body,
    headers: {
      "List-Unsubscribe": `<${input.unsubscribeUrl}>`,
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Mailin-custom": input.deliveryId,
    },
    attachments: input.attachments,
  };
}
