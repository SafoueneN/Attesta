import fc from "fast-check";
import { afterEach, describe, expect, it, vi } from "vitest";
import { skillGaps, type GapPosting } from "../src/gaps.js";
import { MemoryMailer, type MailMessage } from "../src/mail.js";
import { recipientOf, sendDueReminders, startReminders, type ReminderDeps } from "../src/reminders.js";
import type { ReminderRow, WatchStore } from "../src/store.js";
import { testLogger } from "./helpers.js";

/*
 * Rappels par courriel (ADR 0029, 0030) en tests unitaires sur API simulée : base, service auth et serveur
 * SMTP remplacés par des doubles ; écarts de compétences (rapport 2) en propriétés (fast-check).
 */

const reminder = (id: string, userId = "u1", kind: ReminderRow["kind"] = "relance"): ReminderRow => ({
  id,
  userId,
  kind,
  sendOn: "2026-10-25",
  title: "Relancer Métropole Numérique",
  detail: "Candidature envoyée le 15/10",
  link: null,
  sentAt: null,
});

function doubles(
  options: {
    due?: ReminderRow[];
    contacts?: Record<string, { email: string | null } | undefined>;
    veille?: Record<string, { status: string; recipientEmail: string | null }>;
    mailer?: ReminderDeps["mailer"];
  } = {},
) {
  const marked: string[] = [];
  const store = {
    dueReminders: vi.fn(async () => options.due ?? []),
    markReminderSent: vi.fn(async (id: string) => void marked.push(id)),
    subscription: vi.fn(async (userId: string) => options.veille?.[userId]),
  } as unknown as WatchStore;
  const contact = vi.fn(async (userId: string) => {
    const c = options.contacts?.[userId];
    return c && { id: userId, email: c.email, status: "active" as const };
  });
  const log = testLogger();
  const mailer = options.mailer ?? new MemoryMailer();
  const deps: ReminderDeps = {
    store,
    upstreams: { contact },
    mailer,
    logger: log.logger,
    appBaseUrl: "http://localhost:8081",
  };
  return { deps, marked, contact, log, mailer };
}

describe("adresse d'envoi (recipientOf)", () => {
  const store = (s?: { status: string; recipientEmail: string | null }) =>
    ({ subscription: async () => s }) as unknown as Pick<WatchStore, "subscription">;

  it.each([
    [
      "veille active avec adresse",
      { status: "active", recipientEmail: "veille@example.org" },
      "compte@example.org",
      "veille@example.org",
    ],
    [
      "veille active sans adresse : celle du compte",
      { status: "active", recipientEmail: null },
      "compte@example.org",
      "compte@example.org",
    ],
    [
      "veille arrêtée : celle du compte",
      { status: "desabonnee", recipientEmail: "veille@example.org" },
      "compte@example.org",
      "compte@example.org",
    ],
    ["sans veille, compte par identifiant : aucune", undefined, null, null],
  ])("%s", async (_cas, s, account, expected) => {
    expect(await recipientOf(store(s), "u1", account)).toBe(expected);
  });
});

describe("envoi des rappels du jour (API simulée)", () => {
  it("envoie à l'adresse de la veille, marque le rappel envoyé et ne journalise que des compteurs", async () => {
    const { deps, marked, log, mailer } = doubles({
      due: [reminder("r1")],
      contacts: { u1: { email: null } },
      veille: { u1: { status: "active", recipientEmail: "amina@example.org" } },
    });
    expect(await sendDueReminders(deps, "2026-10-25")).toEqual({ sent: 1, failed: 0 });
    const [mail] = (mailer as MemoryMailer).sent as MailMessage[];
    expect(mail).toMatchObject({
      to: "amina@example.org",
      subject: "Attesta – rappel : Relancer Métropole Numérique",
    });
    expect(marked).toEqual(["r1"]);
    expect(log.lines.at(-1)).toMatchObject({ event: "rappels", sent: 1, failed: 0 });
    expect(JSON.stringify(log.lines)).not.toContain("amina@example.org");
    expect(JSON.stringify(log.lines)).not.toContain("Métropole");
  });

  it("compte effacé, ou aucune adresse : le rappel est clos sans envoi", async () => {
    const { deps, marked, mailer } = doubles({
      due: [reminder("r1", "efface"), reminder("r2", "sans-adresse")],
      contacts: { "sans-adresse": { email: null } },
    });
    expect(await sendDueReminders(deps, "2026-10-25")).toEqual({ sent: 0, failed: 0 });
    expect(marked).toEqual(["r1", "r2"]);
    expect((mailer as MemoryMailer).sent).toEqual([]);
  });

  it("échec d'envoi : compté, le rappel reste à envoyer, les suivants partent quand même", async () => {
    let calls = 0;
    const flaky = {
      send: async (m: MailMessage) => {
        if (calls++ === 0) throw new Error("SMTP indisponible");
        return { messageId: `<${m.to}>` };
      },
    };
    const { deps, marked } = doubles({
      due: [reminder("r1"), reminder("r2")],
      contacts: { u1: { email: "compte@example.org" } },
      mailer: flaky,
    });
    expect(await sendDueReminders(deps, "2026-10-25")).toEqual({ sent: 1, failed: 1 });
    expect(marked).toEqual(["r2"]);
  });

  it("service auth en panne : échec compté, rien n'est marqué", async () => {
    const { deps, marked, contact } = doubles({ due: [reminder("r1")] });
    contact.mockRejectedValueOnce(new Error("auth 503"));
    expect(await sendDueReminders(deps, "2026-10-25")).toEqual({ sent: 0, failed: 1 });
    expect(marked).toEqual([]);
  });

  it("aucun rappel dû : aucune ligne de journal ; lit au plus 100 rappels par passage", async () => {
    const { deps, log } = doubles();
    expect(await sendDueReminders(deps, "2026-10-25")).toEqual({ sent: 0, failed: 0 });
    expect(deps.store.dueReminders).toHaveBeenCalledWith("2026-10-25", 100);
    expect(log.lines.filter((l) => l.event === "rappels")).toEqual([]);
  });

  describe("planification", () => {
    afterEach(() => vi.useRealTimers());

    it("passe tout de suite, puis toutes les 15 minutes, jusqu'à l'arrêt", async () => {
      vi.useFakeTimers();
      const { deps } = doubles();
      const stop = startReminders(deps, () => "2026-10-25");
      await vi.advanceTimersByTimeAsync(0);
      expect(deps.store.dueReminders).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(15 * 60 * 1000 - 1);
      expect(deps.store.dueReminders).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(deps.store.dueReminders).toHaveBeenCalledTimes(2);
      stop();
      await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
      expect(deps.store.dueReminders).toHaveBeenCalledTimes(2);
    });

    it("une base en panne n'arrête pas la planification : avertissement sans contenu", async () => {
      vi.useFakeTimers();
      const { deps, log } = doubles();
      vi.mocked(deps.store.dueReminders).mockRejectedValueOnce(
        Object.assign(new Error("x"), { name: "DatabaseError" }),
      );
      const stop = startReminders(deps, () => "2026-10-25");
      await vi.advanceTimersByTimeAsync(0);
      expect(log.lines.at(-1)).toMatchObject({ event: "rappels_erreur", errorType: "DatabaseError" });
      stop();
    });
  });
});

describe("écarts de compétences : propriétés (fuzzing fast-check)", () => {
  const salary = fc.option(fc.integer({ min: 20_000, max: 150_000 }), { nil: null });
  const posting: fc.Arbitrary<GapPosting> = fc.record({
    missingSkills: fc.uniqueArray(
      fc.constantFrom("Kubernetes", "React", "SAP", "Power BI", "Scrum", "AWS", "Go"),
      {
        maxLength: 4,
      },
    ),
    salaryMinEur: salary,
    salaryMaxEur: salary,
  });
  const skills = fc.subarray(["React Native", "Node.js", "SAP S/4HANA", "Excel"]);

  it("bornes : fréquence dans ]0, 1], effort 0,25 ou 0,5, priorité dans [−0,1 ; 0,8], au plus `limit` écarts", () => {
    fc.assert(
      fc.property(
        fc.array(posting, { maxLength: 12 }),
        skills,
        fc.integer({ min: 1, max: 8 }),
        (ps, known, limit) => {
          const gaps = skillGaps(ps, known, limit);
          expect(gaps.length).toBeLessThanOrEqual(limit);
          for (const g of gaps) {
            expect(g.frequency).toBeGreaterThan(0);
            expect(g.frequency).toBeLessThanOrEqual(1);
            expect(g.count).toBe(Math.round(g.frequency * ps.length));
            expect([0.25, 0.5]).toContain(g.effort);
            expect(g.priority).toBeGreaterThanOrEqual(-0.1 - 1e-9);
            expect(g.priority).toBeLessThanOrEqual(0.8 + 1e-9);
            if (g.salary.status === "ok")
              expect(g.salary.rangeWith[0]).toBeLessThanOrEqual(g.salary.rangeWith[1]);
          }
        },
      ),
      { numRuns: 1000 },
    );
  });

  it("classement : priorité décroissante, puis nombre d'offres", () => {
    fc.assert(
      fc.property(fc.array(posting, { maxLength: 12 }), skills, (ps, known) => {
        const gaps = skillGaps(ps, known, 10);
        for (let i = 1; i < gaps.length; i++) {
          const [a, b] = [gaps[i - 1]!, gaps[i]!];
          expect(a.priority > b.priority || (a.priority === b.priority && a.count >= b.count)).toBe(true);
        }
      }),
    );
  });

  it("aucune compétence déjà déclarée n'est proposée comme écart, aucune n'est inventée", () => {
    fc.assert(
      fc.property(fc.array(posting, { maxLength: 12 }), (ps) => {
        const asked = new Set(ps.flatMap((p) => p.missingSkills));
        for (const g of skillGaps(ps, [], 10)) expect(asked.has(g.skill)).toBe(true);
      }),
    );
  });
});
