import pg from "pg";
import { PgBoss } from "pg-boss";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { LOCK_TIMEOUT_MS, lockTestDatabase } from "../../../test-support/db-lock.js";
import { DemoProvider, LlmUnavailableError, ScriptedProvider } from "@attesta/llm";
import type { PdfRenderer } from "@attesta/render";
import { Profile } from "@attesta/schema";
import { createLogger } from "@attesta/shared";
import { leaProfile } from "../../schema/test/fixtures.js";
import {
  embedPending,
  HashEmbeddings,
  JobwatchRepository,
  MailError,
  MemoryMailer,
  runDaily,
  type DailyDeps,
  type JobSource,
  type Posting,
} from "../src/index.js";

/**
 * Veille de bout en bout sur un vrai PostgreSQL migré, avec pg-boss : ingestion,
 * déduplication, filtres durs, matching hybride, rerank, rapports, envoi,
 * idempotence. Offres et profil fictifs ; aucun réseau.
 */
const url = process.env.TEST_DATABASE_URL;
if (process.env.CI && !url) throw new Error("TEST_DATABASE_URL est requis en CI");

const BERLIN = { lat: 52.52, lon: 13.405 };

function posting(overrides: Partial<Posting> & Pick<Posting, "externalId" | "title" | "body">): Posting {
  return {
    source: "test",
    company: "Beispiel GmbH",
    city: "Berlin",
    country: "DE",
    lat: BERLIN.lat,
    lon: BERLIN.lon,
    lang: "de",
    workingTime: null,
    postedAt: "2026-10-15",
    url: `https://example.org/offres/${overrides.externalId}`,
    salaryMinEur: null,
    salaryMaxEur: null,
    ...overrides,
  };
}

/** Source simulée : renvoie ses offres, sauf celles déjà connues. */
class FakeSource implements JobSource {
  readonly countries = ["DE"] as const;
  calls = 0;
  failuresLeft = 0;

  constructor(
    readonly id: string,
    public postings: Posting[],
  ) {}

  async *search(_query: unknown, { isKnown }: { isKnown: (id: string) => Promise<boolean> }) {
    this.calls++;
    if (this.failuresLeft > 0) {
      this.failuresLeft--;
      throw new Error("source indisponible");
    }
    for (const p of this.postings) if (!(await isKnown(p.externalId))) yield { ...p, source: this.id };
  }
}

class FakeRenderer implements PdfRenderer {
  readonly html: string[] = [];
  async render(html: string) {
    this.html.push(html);
    return new TextEncoder().encode("%PDF-1.7 faux");
  }
  async close() {}
}

describe.skipIf(!url)("veille quotidienne (PostgreSQL, pg-boss)", () => {
  const pool = new pg.Pool({ connectionString: url });
  const boss = new PgBoss({ connectionString: url, max: 2, schema: "pgboss_test" });
  const repo = new JobwatchRepository(pool);
  const logger = createLogger("silent");
  let subscriptionId: string;

  let unlock: () => Promise<void> = async () => {};
  beforeAll(async () => {
    unlock = await lockTestDatabase(url!);
    await boss.start();
  }, LOCK_TIMEOUT_MS);
  afterAll(async () => {
    await boss.stop({ graceful: false, close: true });
    await pool.end();
    await unlock();
  });

  beforeEach(async () => {
    await pool.query("TRUNCATE app_user, job_posting, job_source_run, esco_cache, email_event CASCADE");
    await boss.deleteAllJobs();
    const user = await pool.query<{ id: string }>(
      "INSERT INTO app_user (email, email_verified_at) VALUES ('abonne@example.org', now()) RETURNING id",
    );
    const version = await pool.query<{ id: string }>(
      "INSERT INTO profile_version (user_id, version, data, schema_version) VALUES ($1, 1, $2, '1') RETURNING id",
      [user.rows[0]!.id, JSON.stringify(Profile.parse(leaProfile))],
    );
    const sub = await pool.query<{ id: string }>(
      `INSERT INTO watch_subscription (user_id, profile_version_id, occupations, country, city, lat, lon,
         radius_km, working_time, status, confirmed_at, unsubscribe_token)
       VALUES ($1, $2, '{"Développeuse back-end"}', 'DE', 'Berlin', $3, $4, 25, 'plein', 'active', now(), 'jeton-desabonnement-0000000000')
       RETURNING id`,
      [user.rows[0]!.id, version.rows[0]!.id, BERLIN.lat, BERLIN.lon],
    );
    subscriptionId = sub.rows[0]!.id;
  });

  const offers = () => [
    posting({
      externalId: "1",
      title: "Backend-Entwickler Node.js (m/w/d)",
      body: "Node.js, PostgreSQL und GraphQL.",
    }),
    // Hors du rayon de 25 km (Munich).
    posting({
      externalId: "2",
      title: "Backend-Entwickler Node.js",
      body: "Node.js",
      city: "München",
      lat: 48.14,
      lon: 11.58,
    }),
    // Temps partiel : exclu (l'abonné cherche un temps plein).
    posting({
      externalId: "3",
      title: "Node.js Entwickler Teilzeit",
      body: "Node.js",
      workingTime: "partiel",
    }),
    // Trop ancienne (plus de 14 jours).
    posting({ externalId: "4", title: "Node.js Entwickler", body: "Node.js", postedAt: "2026-09-01" }),
  ];

  function deps(overrides: Partial<DailyDeps> = {}) {
    const source = new FakeSource("test", offers());
    // Une seconde source relaie la même offre : dédupliquée par empreinte.
    const mirror = new FakeSource("miroir", [offers()[0]!]);
    const mailer = new MemoryMailer();
    const renderer = new FakeRenderer();
    const d: DailyDeps = {
      boss,
      repo,
      sources: [source, mirror],
      dailyRequestLimits: { test: 100, miroir: 100 },
      embeddings: new HashEmbeddings(),
      llm: { provider: new DemoProvider(), maxCostUsd: 1 },
      renderer,
      mailer,
      baseUrl: "https://attesta.example",
      logger,
      retryDelaySeconds: 1,
      ...overrides,
    };
    return { d, source, mirror, mailer, renderer };
  }

  it("ingère, déduplique, filtre, classe et envoie un seul e-mail avec deux rapports", async () => {
    const { d, mailer, renderer } = deps();
    const summary = await runDaily(d, "2026-10-16");

    expect(summary.ingestion.test).toMatchObject({ fetched: 4, inserted: 4, duplicates: 0, errors: 0 });
    expect(summary.ingestion.miroir).toMatchObject({ fetched: 1, inserted: 0, duplicates: 1 });
    expect(summary.embedded).toBe(4);
    expect(summary.subscribers).toEqual({ envoye: 1 });
    expect(summary.failedJobs).toBe(0);

    expect(mailer.sent).toHaveLength(1);
    const [mail] = mailer.sent;
    expect(mail!.to).toBe("abonne@example.org");
    expect(mail!.attachments?.map((a) => a.filename)).toEqual([
      "offres-2026-10-16.pdf",
      "points-a-ameliorer-2026-10-16.pdf",
    ]);
    const delivery0 = await pool.query("SELECT id FROM email_delivery");
    expect(mail!.headers?.["X-Mailin-custom"]).toBe(delivery0.rows[0].id);
    expect(mail!.headers?.["List-Unsubscribe"]).toBe(
      "<https://attesta.example/veille/desabonner/jeton-desabonnement-0000000000>",
    );

    const { rows } = await pool.query<{ title: string; missing: string[] }>(
      `SELECT p.title, m.missing_skills AS missing FROM match_result m JOIN job_posting p ON p.id = m.posting_id
       WHERE m.subscription_id = $1 ORDER BY m.rank`,
      [subscriptionId],
    );
    expect(rows.map((r) => r.title)).toEqual(["Backend-Entwickler Node.js (m/w/d)"]);
    expect(rows[0]!.missing).toEqual(["GraphQL"]);

    // Rapport 1 sans nom ni coordonnées du candidat ; profil anonymisé envoyé au rerank.
    const [offersHtml, gapsHtml] = renderer.html;
    expect(offersHtml).toContain("Backend-Entwickler Node.js (m/w/d)");
    expect(gapsHtml).toContain("GraphQL");
    for (const html of renderer.html) {
      expect(html).not.toContain("Léa");
      expect(html).not.toContain("lea.martin@example.org");
    }

    const runs = await pool.query("SELECT source, requests, inserted FROM job_source_run ORDER BY source");
    expect(runs.rows).toHaveLength(2);
    const delivery = await pool.query("SELECT status, provider_message_id FROM email_delivery");
    expect(delivery.rows).toEqual([{ status: "envoye", provider_message_id: "<memoire-1@attesta.test>" }]);
  });

  it("relance le même jour : aucun second e-mail ; le lendemain sans offre nouvelle : aucun e-mail", async () => {
    const first = deps();
    await runDaily(first.d, "2026-10-16");

    const again = deps();
    const rerun = await runDaily(again.d, "2026-10-16");
    expect(rerun.subscribers).toEqual({ "deja-envoye": 1 });
    expect(again.mailer.sent).toHaveLength(0);

    const nextDay = deps();
    const summary = await runDaily(nextDay.d, "2026-10-17");
    expect(summary.ingestion.test).toMatchObject({ fetched: 0 });
    expect(summary.subscribers).toEqual({ "aucune-offre": 1 });
    expect(nextDay.mailer.sent).toHaveLength(0);
  });

  it("source en échec : relancée par pg-boss, puis réussie", async () => {
    const { d, source, mailer } = deps();
    source.failuresLeft = 1;
    const summary = await runDaily(d, "2026-10-16");
    expect(source.calls).toBe(2);
    expect(summary.failedJobs).toBe(0);
    expect(mailer.sent).toHaveLength(1);
    const errors = await pool.query("SELECT sum(errors)::int AS n FROM job_source_run WHERE source = 'test'");
    expect(errors.rows[0].n).toBe(1);
  });

  it("source durablement en panne : job compté en échec, les abonnés sont quand même traités", async () => {
    const { d, mirror, source } = deps();
    source.failuresLeft = 10;
    mirror.postings = offers().slice(0, 1);
    const summary = await runDaily(d, "2026-10-16");
    expect(source.calls).toBe(3);
    expect(summary.failedJobs).toBe(1);
    expect(summary.subscribers).toEqual({ envoye: 1 });
  });

  it("refus explicite du serveur SMTP : réservation levée, la relance envoie", async () => {
    const { d } = deps();
    let attempts = 0;
    const sent: string[] = [];
    d.mailer = {
      async send(message) {
        if (attempts++ === 0) throw new MailError(undefined, 451, true);
        sent.push(message.to);
        return { messageId: "<ok@test>" };
      },
    };
    const summary = await runDaily(d, "2026-10-16");
    expect(sent).toEqual(["abonne@example.org"]);
    expect(summary.subscribers).toEqual({ envoye: 1 });
  });

  it("issue incertaine (coupure pendant la transmission) : jamais de second envoi le même jour", async () => {
    const { d } = deps();
    let attempts = 0;
    d.mailer = {
      async send() {
        attempts++;
        throw new MailError("ETIMEDOUT", undefined, false);
      },
    };
    const summary = await runDaily(d, "2026-10-16");
    expect(attempts).toBe(1);
    expect(summary.subscribers).toEqual({ "deja-envoye": 1 });
    const delivery = await pool.query("SELECT status FROM email_delivery");
    expect(delivery.rows).toEqual([{ status: "en_cours" }]);
  });

  it("e-mail jamais parti : les offres restent proposables le lendemain", async () => {
    const failing = deps();
    failing.d.mailer = {
      async send() {
        throw new MailError("ECONNECTION", undefined, true);
      },
    };
    const first = await runDaily(failing.d, "2026-10-16");
    expect(first.failedJobs).toBe(1);

    const nextDay = deps();
    const summary = await runDaily(nextDay.d, "2026-10-17");
    expect(summary.subscribers).toEqual({ envoye: 1 });
    expect(nextDay.mailer.sent[0]!.subject).toContain("1 nouvelle offre");
    const rows = await pool.query("SELECT run_date::text FROM match_result");
    expect(rows.rows).toEqual([{ run_date: "2026-10-17" }]);
  });

  it("rerank indisponible : rapport envoyé en mode dégradé (classement de la recherche)", async () => {
    const { d, mailer, renderer } = deps({
      llm: {
        provider: new ScriptedProvider({ "rerank-offres": [{ error: new LlmUnavailableError("503") }] }),
        maxCostUsd: 1,
      },
    });
    await runDaily(d, "2026-10-16");
    expect(mailer.sent).toHaveLength(1);
    expect(renderer.html[0]).toContain("classées par la recherche seule");
  });

  it("abonnement désabonné ou en attente : aucun traitement", async () => {
    await pool.query("UPDATE watch_subscription SET status = 'desabonnee'");
    const { d, mailer } = deps();
    const summary = await runDaily(d, "2026-10-16");
    expect(summary.subscribers).toEqual({});
    expect(mailer.sent).toHaveLength(0);
  });

  it("budget de requêtes épuisé pour la journée : la source n'est plus appelée", async () => {
    const { d } = deps();
    await pool.query(
      "INSERT INTO job_source_run (source, run_date, requests) VALUES ('test', '2026-10-16', 100)",
    );
    const summary = await runDaily(d, "2026-10-16");
    expect(summary.ingestion.test?.requests ?? 0).toBe(0);
  });

  it("vectorise par lots les offres sans vecteur ; purge : offres de plus de 60 jours", async () => {
    await repo.insertPosting(
      posting({ externalId: "vieille", title: "Alt", body: "x", postedAt: "2020-01-01" }),
    );
    await repo.insertPosting(posting({ externalId: "neuve", title: "Neu", body: "y" }));
    expect(await embedPending({ repo, embeddings: new HashEmbeddings() })).toBe(2);
    expect(await embedPending({ repo, embeddings: new HashEmbeddings() })).toBe(0);
    // Veille en attente avec un lien encore valide : conservée, même créée il y a longtemps.
    await pool.query(
      "UPDATE watch_subscription SET status = 'en_attente', created_at = now() - interval '30 days', confirm_expires_at = now() + interval '1 day'",
    );
    const purged = await repo.purge();
    expect(purged.offres).toBe(1);
    expect(purged.veillesNonConfirmees).toBe(0);
    await pool.query("UPDATE watch_subscription SET confirm_expires_at = now() - interval '1 minute'");
    expect((await repo.purge()).veillesNonConfirmees).toBe(1);
    const left = await pool.query("SELECT count(*)::int AS n FROM job_embedding");
    expect(left.rows[0].n).toBe(1);
  });
});
