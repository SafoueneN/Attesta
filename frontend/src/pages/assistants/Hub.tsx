import type { Generation, Profile } from "@attesta/shared-schemas";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";
import { cv, profiles } from "../../api/endpoints";
import { useDocumentTitle } from "../../components/ui";
import { CountUp } from "../../lib/motion";
import { ASSISTANTS, type AssistantId } from "../studio/Studio";
import { useAssistantResults } from "./shared";

/*
 * Centre de contrôle des assistants (ADR 0029, 0032) : un score de préparation calculé sur vos vraies
 * données (profil, dernier CV, entretien), le parcours en trois étapes avec l'état de chaque assistant,
 * et la prochaine action recommandée. Chaque carte ouvre l'assistant dans le Studio IA.
 */

const richness = (p: Profile) => {
  const items = [...p.work, ...p.projects];
  if (!items.length) return 0;
  return (
    items.reduce(
      (n, i) =>
        n + (i.highlights.filter((h) => /\d/.test(h)).length / 3 + Math.min(i.highlights.length, 3) / 3) / 2,
      0,
    ) / items.length
  );
};

function Ring({ value }: { value: number }) {
  const c = 2 * Math.PI * 120;
  return (
    <div className="relative grid size-72 shrink-0 place-items-center">
      <svg aria-hidden="true" viewBox="0 0 280 280" className="absolute inset-0 -rotate-90">
        <circle cx="140" cy="140" r="120" fill="none" strokeWidth="22" className="stroke-surface-sunken" />
        <circle
          cx="140"
          cy="140"
          r="120"
          fill="none"
          strokeWidth="22"
          strokeLinecap="round"
          className="ring-draw stroke-accent"
          style={{ strokeDasharray: c, strokeDashoffset: c * (1 - value / 100), ["--ring-c" as string]: c }}
        />
      </svg>
      <div className="text-center">
        <span className="block text-7xl leading-none font-extrabold">
          <CountUp value={value} />
        </span>
        <span className="text-sm text-ink-muted">sur 100 · préparation</span>
      </div>
    </div>
  );
}

function Center({ generation, profile }: { generation?: Generation; profile?: Profile }) {
  const { stored } = useAssistantResults(generation?.id ?? "");
  const judge = stored<{ revision: number; verdicts: { verdict: string }[] }>("juge-fidelite");
  const ats = stored<{ keywords: { status: string }[] }>("conseils-ats");
  const history = stored<{ feedback: { star: Record<string, boolean> } }[]>("coach-historique") ?? [];
  const flagged =
    generation && judge && judge.revision === generation.revision
      ? judge.verdicts.filter((v) => v.verdict !== "fidele").length
      : null;
  const atsPct = ats?.keywords.length
    ? ats.keywords.filter((k) => k.status === "place").length / ats.keywords.length
    : null;
  const recent = history.slice(-5);
  const star = recent.length
    ? recent.reduce((n, h) => n + Object.values(h.feedback.star).filter(Boolean).length, 0) /
      recent.length /
      4
    : 0;
  const parts = {
    profil: Math.round((profile ? richness(profile) : 0) * 100),
    cv: generation
      ? Math.round(
          ((generation.report?.score ?? 0) * 0.4 +
            (flagged === null ? 0.3 : flagged ? 0.6 : 1) * 0.3 +
            (atsPct ?? 0) * 0.3) *
            100,
        )
      : 0,
    entretien: Math.round(star * 100),
  };
  const score = Math.round((parts.profil + parts.cv + parts.entretien) / 3);
  const to = (id: AssistantId) =>
    id === "profil" && !generation
      ? "/assistants/profil"
      : generation
        ? `/studio/${generation.id}/${id}`
        : "/cv";
  const translated = Boolean(stored("traduction:en") || stored("traduction:de"));
  const status: Record<AssistantId, [string, "ok" | "warn" | "idle", string]> = {
    profil: [
      `${parts.profil} %`,
      parts.profil >= 70 ? "ok" : "warn",
      parts.profil >= 70 ? "Profil détaillé" : "Des expériences sans chiffres",
    ],
    juge: [
      flagged === null ? "À lancer" : flagged ? String(flagged) : "OK",
      flagged ? "warn" : flagged === 0 ? "ok" : "idle",
      flagged ? `${flagged} ligne(s) à trancher` : flagged === 0 ? "Tout est fidèle" : "Pas encore jugé",
    ],
    ats: [
      atsPct === null ? "À scanner" : `${Math.round(atsPct * 100)} %`,
      atsPct !== null && atsPct >= 0.8 ? "ok" : atsPct === null ? "idle" : "warn",
      atsPct === null ? "Pas encore scanné" : "Lisibilité par les logiciels",
    ],
    traduction: [translated ? "Prête" : "—", translated ? "ok" : "idle", "Anglais ou allemand"],
    coach: [
      history.length ? `${(star * 4).toFixed(1)}/4` : "—",
      star >= 0.75 ? "ok" : history.length ? "warn" : "idle",
      history.length ? `${history.length} réponse(s) travaillée(s)` : "Pas encore d'entretien blanc",
    ],
    plan: [
      stored("plan-progression") ? "Tracé" : "—",
      stored("plan-progression") ? "ok" : "idle",
      "Combler l'écart, pour de vrai",
    ],
  };
  // Prochaine action : la première étape faible, dans l'ordre du parcours.
  const next: [string, AssistantId] =
    parts.profil < 60
      ? ["enrichir votre profil avec l'intervieweuse", "profil"]
      : flagged === null || flagged > 0
        ? [flagged ? `trancher ${flagged} ligne(s) avec le juge` : "faire juger votre CV", "juge"]
        : atsPct === null || atsPct < 0.8
          ? ["rendre votre CV lisible par les logiciels", "ats"]
          : !history.length
            ? ["passer un entretien blanc", "coach"]
            : ["tracer votre plan de progression", "plan"];
  const tone = {
    ok: "bg-proved-soft text-proved",
    warn: "bg-flagged-soft text-flagged",
    idle: "bg-surface-sunken text-ink-subtle",
  };
  const groups = [...new Set(ASSISTANTS.map((a) => a.group))];
  const groupScore: Record<string, number> = {
    Avant: parts.profil,
    "Le CV": parts.cv,
    Après: parts.entretien,
  };

  return (
    <div className="space-y-12">
      <section className="grid items-center gap-10 lg:grid-cols-[auto_minmax(0,1fr)]">
        <Ring value={score} />
        <div className="space-y-5">
          <p className="eyebrow">Votre préparation{generation ? ` · « ${generation.offerTitle} »` : ""}</p>
          <h1 className="text-4xl font-extrabold tracking-tight text-balance lg:text-5xl">
            {score >= 80 ? "Votre candidature est solide." : "Quelques actions pour une candidature solide."}
          </h1>
          <div className="grid grid-cols-3 gap-3">
            {Object.entries({
              Profil: parts.profil,
              CV: parts.cv,
              Entretien: parts.entretien,
            }).map(([k, v]) => (
              <div key={k} className="card p-4">
                <span className="text-xs font-bold text-ink-subtle">{k}</span>
                <span className={`block text-3xl font-extrabold ${v >= 70 ? "text-proved" : "text-flagged"}`}>
                  {v}
                </span>
              </div>
            ))}
          </div>
          <Link
            to={to(next[1])}
            viewTransition
            className="inline-flex items-center gap-3 rounded-full bg-accent py-2 pr-2 pl-6 font-extrabold text-on-accent transition-transform hover:-translate-y-0.5"
          >
            Continuer : {next[0]}
            <span className="grid size-10 place-items-center rounded-full bg-on-accent text-accent">→</span>
          </Link>
        </div>
      </section>

      <ol className="journey relative grid gap-8 lg:grid-cols-3 lg:gap-5">
        {groups.map((g, s) => (
          <li key={g} className="relative animate-enter space-y-4" style={{ animationDelay: `${s * 120}ms` }}>
            <div className="flex items-center gap-3">
              <span
                className={`journey-dot grid size-11 shrink-0 place-items-center rounded-full font-extrabold ${groupScore[g]! >= 70 ? "bg-proved text-on-accent" : "bg-accent text-on-accent"}`}
              >
                {groupScore[g]! >= 70 ? "✓" : s + 1}
              </span>
              <div className="relative bg-paper pr-3">
                <h2 className="text-lg font-extrabold">{g}</h2>
                <p className="text-xs text-ink-muted">{groupScore[g]} %</p>
              </div>
            </div>
            <ul className="space-y-3">
              {ASSISTANTS.filter((a) => a.group === g).map((a, i) => {
                const [label, t, note] = status[a.id];
                return (
                  <li
                    key={a.id}
                    className="animate-enter"
                    style={{ animationDelay: `${s * 120 + i * 60 + 80}ms` }}
                  >
                    <Link
                      to={to(a.id)}
                      viewTransition
                      className={`group card flex flex-col gap-2 p-4 transition-all hover:-translate-y-1 ${t === "warn" ? "border-flagged" : ""}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="grid size-10 place-items-center rounded-xl bg-accent text-on-accent transition-transform group-hover:-rotate-6">
                          <svg
                            aria-hidden="true"
                            viewBox="0 0 24 24"
                            className="size-5"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.8"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          >
                            <path d={a.icon} />
                          </svg>
                        </span>
                        <span className="min-w-0 flex-1 font-bold">{a.label}</span>
                        <span className={`rounded-full px-2 py-0.5 text-xs font-extrabold ${tone[t]}`}>
                          {label}
                        </span>
                      </span>
                      <span className="text-sm text-ink-muted">{note}</span>
                      <span className="text-xs font-bold text-accent-text">
                        Ouvrir{" "}
                        <span
                          aria-hidden="true"
                          className="inline-block transition-transform group-hover:translate-x-1"
                        >
                          →
                        </span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </li>
        ))}
      </ol>

      <div className="card grid gap-4 text-sm md:grid-cols-3">
        <p>
          <b>Vous décidez.</b> Aucune proposition n'entre dans votre profil ou votre CV sans votre accord.
        </p>
        <p>
          <b>Tout est contrôlé.</b> Ce qui est écrit pour un recruteur est confronté à votre CV vérifié.
        </p>
        <p>
          <b>Transparence.</b> Chaque réponse dit si elle vient de l'IA ou du mode démonstration.
        </p>
      </div>
    </div>
  );
}

export function AssistantsHub() {
  useDocumentTitle("Assistants IA");
  const list = useQuery({ queryKey: ["generations"], queryFn: cv.generations });
  const latestId = list.data?.find((g) => g.status === "ok")?.id;
  const latest = useQuery({
    queryKey: ["generation", latestId],
    queryFn: () => cv.generation(latestId!),
    enabled: Boolean(latestId),
  });
  const profile = useQuery({ queryKey: ["profil"], queryFn: profiles.current, retry: false });
  if (list.isPending || (latestId && latest.isPending)) return null;
  return (
    <div className="space-y-6">
      {!latestId && (
        <p className="card text-ink-muted">
          Les assistants du CV travaillent sur un CV ciblé.{" "}
          <Link to="/cv" className="link">
            Créez d'abord un CV ciblé
          </Link>
          .
        </p>
      )}
      <Center generation={latest.data} profile={profile.data?.profile} />
    </div>
  );
}
