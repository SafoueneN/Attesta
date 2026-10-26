import type { Logger } from "@attesta/logger";
import { reminderMessage, type Mailer } from "./mail.js";
import type { WatchStore } from "./store.js";
import type { Upstreams } from "./upstreams.js";

/*
 * Rappels par courriel (ADR 0029, point 5). Toutes les 15 minutes, les rappels du jour (heure de Paris)
 * partent à l'adresse confirmée de la veille, sinon à celle d'un ancien compte par lien (ADR 0030) ; un échec d'envoi est retenté au passage suivant. Jamais de contenu dans
 * les journaux : seulement des compteurs.
 */

export interface ReminderDeps {
  store: WatchStore;
  upstreams: Pick<Upstreams, "contact">;
  mailer: Mailer;
  logger: Logger;
  appBaseUrl: string;
}

/**
 * Adresse d'envoi d'un candidat : celle qu'il a saisie et confirmée dans la veille, sinon celle de son compte
 * (anciens comptes par lien de connexion). Un compte par identifiant sans veille confirmée n'en a pas.
 */
export async function recipientOf(
  store: Pick<WatchStore, "subscription">,
  userId: string,
  accountEmail: string | null,
): Promise<string | null> {
  const s = await store.subscription(userId);
  const confirmed = s?.status === "active" ? s.recipientEmail : null;
  return confirmed ?? accountEmail;
}

export async function sendDueReminders(
  deps: ReminderDeps,
  today: string,
): Promise<{ sent: number; failed: number }> {
  const due = await deps.store.dueReminders(today, 100);
  let sent = 0;
  let failed = 0;
  for (const r of due) {
    try {
      const contact = await deps.upstreams.contact(r.userId);
      if (!contact) {
        // Compte effacé entre-temps : le rappel n'a plus de destinataire.
        await deps.store.markReminderSent(r.id);
        continue;
      }
      const to = await recipientOf(deps.store, r.userId, contact.email);
      if (!to) {
        // Aucune adresse confirmée : le rappel reste visible dans l'application, sans envoi.
        await deps.store.markReminderSent(r.id);
        continue;
      }
      await deps.mailer.send(reminderMessage(to, r, deps.appBaseUrl));
      await deps.store.markReminderSent(r.id);
      sent++;
    } catch {
      failed++;
    }
  }
  if (due.length) deps.logger.info({ event: "rappels", sent, failed }, "rappels");
  return { sent, failed };
}

export function startReminders(deps: ReminderDeps, now: () => string): () => void {
  const tick = () =>
    sendDueReminders(deps, now()).catch((error) =>
      deps.logger.warn({ event: "rappels_erreur", errorType: (error as Error)?.name }, "rappels"),
    );
  const timer = setInterval(tick, 15 * 60 * 1000);
  timer.unref();
  void tick();
  return () => clearInterval(timer);
}
