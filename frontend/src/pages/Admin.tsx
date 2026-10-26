import type { ServiceStats } from "@attesta/shared-schemas";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { admin, auth, cv, jobs, letters, profiles, watch } from "../api/endpoints";
import { useToast } from "../components/toasts";
import {
  Alert,
  Badge,
  Button,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  useDocumentTitle,
} from "../components/ui";
import { formatDateTime } from "../lib/describe";
import { CountUp } from "../lib/motion";

const SERVICE_LABELS: Record<string, string> = {
  auth: "Comptes (auth)",
  profiles: "Profils",
  "cv-generation": "Génération de CV",
  "jobs-matching": "Offres et classement",
  "job-watch": "Veille emploi",
  "letters-export": "Lettres et export",
};

const COUNTER_LABELS: Record<string, string> = {
  profiles: "Profils de comptes",
  versions: "Versions",
  guests: "Profils d'invités",
  updated7d: "Versions (7 j)",
  generations: "Générations",
  generations7d: "Générations (7 j)",
  degraded: "Sans reformulation",
  averageScore: "Fidélité moyenne",
  removedLines: "Lignes écartées",
  postings: "Offres collectées",
  embeddings: "Vecteurs",
  offers: "Offres des candidats",
  sourceRuns7d: "Collectes (7 j)",
  sourceErrors7d: "Erreurs de collecte (7 j)",
  letters: "Lettres",
  letters7d: "Lettres (7 j)",
  removedParagraphs: "Paragraphes retirés",
  rendersPending: "Rendus en cours",
  active: "Veilles actives",
  pending: "Veilles à confirmer",
  sent7d: "E-mails envoyés (7 j)",
  complaints30d: "Plaintes (30 j)",
  runs7d: "Exécutions (7 j)",
};

const formatCounter = (key: string, value: number) =>
  key === "averageScore" ? `${Math.round(value * 100)} %` : value.toLocaleString("fr-FR");

function Budget({ llm }: { llm: NonNullable<ServiceStats["llm"]> }) {
  const ratio = llm.budgetEur ? Math.min(1, llm.costEur / llm.budgetEur) : 0;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-sm">
        <span>Budget LLM {llm.month}</span>
        <span>
          {llm.costEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })} /{" "}
          {llm.budgetEur.toLocaleString("fr-FR", { style: "currency", currency: "EUR" })}
        </span>
      </div>
      <div
        role="meter"
        aria-label={`Budget LLM consommé : ${Math.round(ratio * 100)} %`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(ratio * 100)}
        className="mt-1 h-2 rounded-full bg-surface-sunken"
      >
        <div
          className={`h-2 rounded-full ${ratio >= 0.9 ? "bg-removed" : ratio >= 0.7 ? "bg-flagged" : "bg-accent"}`}
          style={{ width: `${ratio * 100}%` }}
        />
      </div>
      <p className="mt-1 text-xs text-ink-subtle">{llm.calls} appel(s) ce mois-ci</p>
      {llm.byStep.length > 0 && (
        <table className="mt-3 w-full text-sm">
          <caption className="sr-only">Coût du mois par étape (rôle d'assistant)</caption>
          <thead>
            <tr className="text-left text-xs text-ink-subtle">
              <th scope="col" className="font-semibold">
                Étape
              </th>
              <th scope="col" className="text-right font-semibold">
                Appels
              </th>
              <th scope="col" className="text-right font-semibold">
                Coût
              </th>
            </tr>
          </thead>
          <tbody>
            {[...llm.byStep]
              .sort((a, b) => b.costEur - a.costEur)
              .map((s) => (
                <tr key={s.step} className="border-t border-line">
                  <td className="py-1">{s.step}</td>
                  <td className="py-1 text-right">{s.calls}</td>
                  <td className="py-1 text-right">
                    {s.costEur.toLocaleString("fr-FR", {
                      style: "currency",
                      currency: "EUR",
                      maximumFractionDigits: 3,
                    })}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

/** Avis 👍 / 👎 des candidats sur les assistants (30 jours, anonymes, ADR 0029). */
function Votes({ votes }: { votes: NonNullable<ServiceStats["votes"]> }) {
  if (!votes.length)
    return <p className="mt-3 text-xs text-ink-subtle">Aucun avis sur les assistants ces 30 jours.</p>;
  return (
    <ul className="mt-3 space-y-1 text-sm">
      {votes.map((v) => {
        const total = v.up + v.down;
        return (
          <li key={v.role} className="flex items-center gap-2">
            <span className="w-40 shrink-0 truncate">{v.role}</span>
            <span
              className="flex h-2 flex-1 overflow-hidden rounded-full bg-surface-sunken"
              aria-hidden="true"
            >
              <span className="bg-proved" style={{ width: `${total ? (v.up / total) * 100 : 0}%` }} />
              <span className="bg-removed" style={{ width: `${total ? (v.down / total) * 100 : 0}%` }} />
            </span>
            <span className="w-20 text-right text-xs">
              👍 {v.up} · 👎 {v.down}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

export function Admin() {
  useDocumentTitle("Administration");
  const toast = useToast();
  const queryClient = useQueryClient();
  const health = useQuery({ queryKey: ["admin", "sante"], queryFn: admin.health, refetchInterval: 30_000 });
  const accounts = useQuery({ queryKey: ["admin", "auth"], queryFn: auth.adminStats });
  const runs = useQuery({ queryKey: ["admin", "veille"], queryFn: watch.runs });
  const stats = useQueries({
    queries: [profiles.adminStats, cv.adminStats, jobs.adminStats, letters.adminStats, watch.adminStats].map(
      (fn, i) => ({
        queryKey: ["admin", "stats", i],
        queryFn: fn,
      }),
    ),
  });
  // Catalogue d'offres toutes régions (ADR 0034) : synchronisé seul toutes les 6 h, ou à la demande.
  const sync = useMutation({
    mutationFn: jobs.syncCatalogue,
    onSuccess: (r) => toast.info(r.message),
  });
  const runNow = useMutation({
    mutationFn: watch.runNow,
    onSuccess: (r) => {
      toast.info(r.message);
      setTimeout(() => void queryClient.invalidateQueries({ queryKey: ["admin", "veille"] }), 3000);
    },
  });

  return (
    <div className="space-y-8">
      <PageHeader
        title="Administration"
        lead="Santé de la plateforme, usage et coûts. Aucune donnée personnelle n'est affichée ici."
      />
      <section aria-labelledby="sante">
        <h2 id="sante" className="mb-3 text-xl font-bold">
          Santé des services
        </h2>
        {health.isPending && <Loading />}
        {health.isError && <QueryError error={health.error} />}
        {health.data && (
          <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {health.data.services.map((s, i) => (
              <li
                key={s.service}
                className="card flex animate-enter items-center justify-between gap-2 p-4"
                style={{ animationDelay: `${i * 60}ms` }}
              >
                <div className="flex items-center gap-3">
                  {/* Point vivant : vert qui pulse si le service répond, rouge fixe sinon (l'état est écrit). */}
                  <span
                    aria-hidden="true"
                    className={`live-dot ${s.status === "ok" ? "text-proved" : "text-removed [animation:none]"}`}
                  />
                  <div>
                    <p className="font-semibold">{SERVICE_LABELS[s.service] ?? s.service}</p>
                    <p className="text-xs text-ink-subtle">{s.ms} ms</p>
                  </div>
                </div>
                <Badge tone={s.status === "ok" ? "success" : "error"}>
                  {s.status === "ok"
                    ? "Disponible"
                    : s.status === "injoignable"
                      ? "Injoignable"
                      : "Indisponible"}
                </Badge>
              </li>
            ))}
          </ul>
        )}
      </section>
      <section aria-labelledby="comptes">
        <h2 id="comptes" className="mb-3 text-xl font-bold">
          Comptes
        </h2>
        {accounts.data && (
          <dl className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
            {(
              [
                ["Comptes actifs", accounts.data.users],
                ["Administrateurs", accounts.data.admins],
                ["Nouveaux (30 j)", accounts.data.newUsers30d],
                ["Connexions (7 j)", accounts.data.logins7d],
                ["Suppressions en cours", accounts.data.deletionsPending],
                ["Suppressions en échec", accounts.data.outboxFailed],
              ] as const
            ).map(([label, value]) => (
              <div key={label} className="card p-4">
                <dt className="text-sm text-ink-muted">{label}</dt>
                <dd
                  className={`text-3xl font-bold tracking-tight ${label === "Suppressions en échec" && value > 0 ? "text-removed" : ""}`}
                >
                  <CountUp value={value} />
                </dd>
              </div>
            ))}
          </dl>
        )}
        {accounts.data && accounts.data.outboxFailed > 0 && (
          <div className="mt-3">
            <Alert tone="error" title="Suppressions RGPD en échec">
              Un service n'a pas confirmé l'effacement après 24 heures de reprises : consultez les journaux
              (événement « rgpd_suppression_abandonnee »).
            </Alert>
          </div>
        )}
      </section>
      <section aria-labelledby="services">
        <h2 id="services" className="mb-3 text-xl font-bold">
          Usage et coûts par service
        </h2>
        <div className="grid gap-4 md:grid-cols-2">
          {stats.map((q, i) =>
            q.data ? (
              <div key={q.data.service} className="card">
                <h3 className="font-semibold">{SERVICE_LABELS[q.data.service] ?? q.data.service}</h3>
                <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
                  {Object.entries(q.data.counters).map(([key, value]) => (
                    <div key={key} className="flex justify-between gap-2">
                      <dt className="text-ink-muted">{COUNTER_LABELS[key] ?? key}</dt>
                      <dd className="font-semibold">{formatCounter(key, value)}</dd>
                    </div>
                  ))}
                </dl>
                {q.data.llm && <Budget llm={q.data.llm} />}
                {q.data.votes && <Votes votes={q.data.votes} />}
              </div>
            ) : (
              <div key={i} className="card">
                {q.isError ? <p className="text-sm text-removed">{errorMessage(q.error)}</p> : <Loading />}
              </div>
            ),
          )}
        </div>
      </section>
      <section aria-labelledby="executions">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 id="executions" className="text-xl font-bold">
            Exécutions de la veille
          </h2>
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" busy={sync.isPending} onClick={() => sync.mutate()}>
              Synchroniser le catalogue d'offres
            </Button>
            <Button busy={runNow.isPending} onClick={() => runNow.mutate()}>
              Lancer la veille maintenant
            </Button>
          </div>
        </div>
        {runNow.isError && <Alert tone="error">{errorMessage(runNow.error)}</Alert>}
        {sync.isError && <Alert tone="error">{errorMessage(sync.error)}</Alert>}
        {runs.data?.length === 0 && <p className="text-ink-muted">Aucune exécution pour le moment.</p>}
        {runs.data && runs.data.length > 0 && (
          <div className="card overflow-x-auto p-0">
            <table className="w-full text-left text-sm">
              <caption className="sr-only">Dernières exécutions de la veille</caption>
              <thead className="border-b border-line">
                <tr>
                  <th scope="col" className="px-4 py-2">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Déclenchement
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Début
                  </th>
                  <th scope="col" className="px-4 py-2">
                    Bilan
                  </th>
                </tr>
              </thead>
              <tbody>
                {runs.data.map((r) => (
                  <tr key={r.id} className="border-b border-line last:border-0">
                    <td className="px-4 py-2">{r.runDate}</td>
                    <td className="px-4 py-2">{r.trigger === "manuelle" ? "Manuel" : "Planifié"}</td>
                    <td className="px-4 py-2">{formatDateTime(r.startedAt)}</td>
                    <td className="px-4 py-2">
                      {r.finishedAt ? (
                        Object.entries((r.summary.abonnes as Record<string, number>) ?? {})
                          .map(([k, v]) => `${k} : ${v}`)
                          .join(", ") || "aucun abonné"
                      ) : (
                        <Badge tone="info">En cours</Badge>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
