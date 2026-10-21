import { describe, expect, it } from "vitest";
import { criteriaLabel, parisNow } from "../src/daily.js";
import { skillGaps } from "../src/gaps.js";
import { confirmSubscriptionMessage, dailyReportMessage, MailError, SmtpMailer } from "../src/mail.js";

describe("planification", () => {
  it("donne la date et l'heure de Paris", () => {
    expect(parisNow(new Date("2026-10-21T22:30:00Z"))).toEqual({ date: "2026-10-22", hour: 0 });
    expect(parisNow(new Date("2026-07-01T05:00:00Z"))).toEqual({ date: "2026-07-01", hour: 7 });
  });
});

describe("rapport 2 : écarts de compétences", () => {
  const paid = (min: number, skills: string[]) => ({
    missingSkills: skills,
    salaryMinEur: min,
    salaryMaxEur: min + 10_000,
  });

  it("priorité = 0,5 × fréquence + 0,3 × écart de salaire − 0,2 × effort", () => {
    const postings = [
      paid(60_000, ["Kubernetes"]),
      paid(62_000, ["Kubernetes"]),
      paid(64_000, ["Kubernetes", "Go"]),
      paid(45_000, []),
      paid(46_000, ["Go"]),
      paid(47_000, []),
    ];
    const [first, second] = skillGaps(postings, ["Node.js"]);
    expect(first!.skill).toBe("Kubernetes");
    expect(first!.frequency).toBe(0.5);
    expect(first!.salary.status).toBe("ok");
    // Écart de médianes ≥ 30 % : composante salaire à 1.
    expect(first!.priority).toBeCloseTo(0.5 * 0.5 + 0.3 * 1 - 0.2 * 0.5);
    expect(second!.skill).toBe("Go");
  });

  it("moins de 3 salaires de chaque côté : données insuffisantes, composante nulle", () => {
    const [gap] = skillGaps([{ missingSkills: ["Terraform"], salaryMinEur: null, salaryMaxEur: null }], []);
    expect(gap!.salary).toEqual({ status: "insuffisant", sample: 0 });
    expect(gap!.priority).toBeCloseTo(0.5 * 1 - 0.2 * 0.5);
  });

  it("effort réduit si un outil voisin figure dans le profil", () => {
    const [gap] = skillGaps(
      [{ missingSkills: ["React Native"], salaryMinEur: null, salaryMaxEur: null }],
      ["React"],
    );
    expect(gap!.effort).toBe(0.25);
  });

  it("aucune offre : aucun écart", () => {
    expect(skillGaps([], ["Node.js"])).toEqual([]);
  });
});

describe("e-mails : erreurs SMTP assainies", () => {
  it("aucune adresse dans l'erreur ; échec de connexion : message certainement pas parti", async () => {
    const mailer = new SmtpMailer("smtp://127.0.0.1:9", "Attesta <x@attesta.localhost>");
    const error = await mailer
      .send({ to: "destinataire.secret@example.org", subject: "s", text: "t", html: "<p>t</p>" })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(MailError);
    expect(JSON.stringify({ ...(error as object), message: (error as Error).message })).not.toContain(
      "destinataire",
    );
    expect((error as MailError).notSent).toBe(true);
  });
});

describe("e-mails", () => {
  it("rapport quotidien : désabonnement en un clic (RFC 8058), deux pièces jointes, aucun suivi", () => {
    const message = dailyReportMessage({
      to: "abonne@example.org",
      deliveryId: "00000000-0000-4000-8000-000000000001",
      date: "16/10/2026",
      offers: [{ title: "Dev <script>", company: "X", url: "https://example.org/1" }],
      unsubscribeUrl: "https://attesta.example/veille/desabonner/jeton",
      oneClickUrl: "https://attesta.example/api/watch/v1/subscriptions/unsubscribe/jeton",
      attachments: [
        { filename: "a.pdf", content: new Uint8Array([1]), contentType: "application/pdf" },
        { filename: "b.pdf", content: new Uint8Array([2]), contentType: "application/pdf" },
      ],
    });
    expect(message.headers).toEqual({
      "List-Unsubscribe": "<https://attesta.example/api/watch/v1/subscriptions/unsubscribe/jeton>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      "X-Mailin-custom": "00000000-0000-4000-8000-000000000001",
    });
    expect(message.subject).toBe("Attesta – 1 nouvelle offre (16/10/2026)");
    expect(message.html).not.toContain("<script>");
    expect(message.html).not.toMatch(/<img/i);
    expect(message.attachments).toHaveLength(2);
  });

  it("lien de confirmation présent dans le texte et le HTML", () => {
    for (const m of [confirmSubscriptionMessage("a@example.org", "https://x.example/veille/confirmer/t")]) {
      expect(m.text).toMatch(/https:\/\/x\.example\//);
      expect(m.html).toMatch(/href="https:\/\/x\.example\//);
      expect(m.headers).toBeUndefined();
    }
  });

  it("libellé des critères", () => {
    expect(
      criteriaLabel({ occupations: ["Dev web"], city: "Berlin", radiusKm: 25, workingTime: "plein" }),
    ).toBe("Dev web · Berlin (25 km) · temps plein");
  });
});
