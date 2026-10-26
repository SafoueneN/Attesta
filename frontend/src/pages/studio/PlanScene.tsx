import type { LearningOverview, LearningPlan } from "@attesta/shared-schemas";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { cv } from "../../api/endpoints";
import { Alert, Button, errorMessage } from "../../components/ui";
import { Confetti } from "../../lib/motion";
import { addDays, dayFmt, useLocal } from "../assistants/GenerationAssistants";
import {
  AiBadge,
  isoDay,
  ReminderButton,
  Segmented,
  Thinking,
  useAssistantRun,
  VoteButtons,
} from "../assistants/shared";
import { SceneHeader, useStudio } from "./Studio";

/*
 * Le plan de progression, mis en scène comme une feuille de route : un diagramme de Gantt daté (une barre par
 * compétence), un repère « aujourd'hui », la prochaine étape mise en avant et le détail d'une compétence au
 * clic. Aucune compétence n'entre au CV : le projet mené passe par l'intervieweuse.
 */

const BARS = [
  "bg-accent text-on-accent",
  "bg-proved text-on-accent",
  "bg-flagged text-on-accent",
  "bg-ink-muted text-paper",
];

export function PlanScene() {
  const { generation } = useStudio();
  const [scope, setScope] = useState<"cv" | "tous">("cv");
  const plan = useAssistantRun<LearningPlan>(generation.id, "plan-progression", () =>
    cv.learningPlan(generation.id),
  );
  const overview = useQuery<LearningOverview>({
    queryKey: ["plan-global"],
    queryFn: cv.learningOverview,
    enabled: scope === "tous",
    staleTime: Infinity,
  });
  const data = scope === "cv" ? plan.data : overview.data;
  const key = scope === "cv" ? generation.id : "global";
  const [checked, setChecked] = useLocal<string[]>(`attesta-plan-${key}`, []);
  const [start, setStart] = useLocal<string>(`attesta-plan-debut-${key}`, isoDay(0));
  const [selected, setSelected] = useState(0);
  const [party, setParty] = useState(false);
  const items = data?.items ?? [];
  const total = Math.max(
    1,
    items.reduce((n, i) => n + i.weeks, 0),
  );
  const steps = items.flatMap((i) =>
    i.steps.map((s) => ({ key: `${i.skill}::${s}`, step: s, skill: i.skill })),
  );
  const done = steps.filter((s) => checked.includes(s.key)).length;
  const next = steps.find((s) => !checked.includes(s.key));
  const elapsed = (Date.now() - addDays(start, 0).getTime()) / (7 * 86_400_000);
  const toggle = (k: string, on: boolean, skill: string) =>
    setChecked((list) => {
      const nextList = on ? [...list, k] : list.filter((x) => x !== k);
      const item = items.find((i) => i.skill === skill)!;
      if (on && item.steps.every((s) => nextList.includes(`${skill}::${s}`))) {
        setParty(true);
        setTimeout(() => setParty(false), 2600);
      }
      return nextList;
    });
  const item = items[selected];
  let offset = 0;

  return (
    <div className="space-y-6">
      {party && <Confetti />}
      <SceneHeader
        eyebrow="Plan de progression"
        title={
          items.length
            ? `${items.length} compétence${items.length > 1 ? "s" : ""}, ${total} semaines`
            : "Votre feuille de route"
        }
        actions={
          scope === "cv" && (
            <Button busy={plan.isPending} onClick={() => plan.mutate()}>
              {plan.data ? "Recalculer" : "Tracer ma feuille de route"}
            </Button>
          )
        }
      >
        Les compétences que l'offre demande et que votre profil ne prouve pas encore, à acquérir pour de vrai.
        {data && (
          <span className="mt-2 flex flex-wrap items-center gap-3">
            <AiBadge kind={data.providerKind} />
            <VoteButtons role="plan-progression" kind={data.providerKind} />
          </span>
        )}
      </SceneHeader>

      <div className="flex flex-wrap items-end gap-6">
        <Segmented
          name="portee"
          legend="Portée"
          value={scope}
          onChange={(v) => {
            setScope(v);
            setSelected(0);
          }}
          options={[
            ["cv", "Cette offre"],
            ["tous", "Tous mes CV"],
          ]}
        />
        <div>
          <label htmlFor="debut-plan" className="label">
            Début
          </label>
          <input
            id="debut-plan"
            type="date"
            className="input"
            value={start}
            onChange={(e) => e.target.value && setStart(e.target.value)}
          />
        </div>
        {steps.length > 0 && (
          <p className="ml-auto text-right">
            <span className="block text-3xl font-extrabold">
              {done}/{steps.length}
            </span>
            <span className="text-xs text-ink-subtle">étapes faites</span>
          </p>
        )}
      </div>

      {(plan.isPending || overview.isFetching) && (
        <Thinking label="L'assistant trace votre feuille de route…" />
      )}
      {(plan.error || overview.error) && (
        <Alert tone="error">{errorMessage(plan.error ?? overview.error)}</Alert>
      )}
      {scope === "tous" && overview.data && overview.data.skills.length > 0 && (
        <p className="text-sm text-ink-muted">
          Les plus demandées par vos offres :{" "}
          {overview.data.skills
            .slice(0, 5)
            .map((s) => `${s.skill} (${s.offers})`)
            .join(" · ")}
        </p>
      )}

      {items.length > 0 && (
        <>
          <div className="gantt rounded-[1.75rem] border border-line bg-surface p-5">
            <div
              className="gantt-head grid text-[0.7rem] font-semibold text-ink-subtle"
              style={{ gridTemplateColumns: `9rem repeat(${total}, minmax(0, 1fr))` }}
            >
              <span />
              {Array.from({ length: total }, (_, w) => (
                <span key={w} className="border-l border-line pl-1">
                  {w % Math.ceil(total / 8) === 0 ? dayFmt.format(addDays(start, w * 7)) : ""}
                </span>
              ))}
            </div>
            <div className="relative mt-2 space-y-2">
              {elapsed > 0 && elapsed < total && (
                <span
                  aria-hidden="true"
                  className="today-line absolute top-0 bottom-0 z-10 w-0.5 bg-ink"
                  style={{ left: `calc(9rem + (100% - 9rem) * ${elapsed / total})` }}
                >
                  <span className="absolute -top-5 -translate-x-1/2 rounded-full bg-ink px-2 text-[0.6rem] font-bold whitespace-nowrap text-paper">
                    aujourd'hui
                  </span>
                </span>
              )}
              {items.map((it, i) => {
                const from = offset;
                offset += it.weeks;
                const own = it.steps.map((s) => `${it.skill}::${s}`);
                const progress = own.filter((k) => checked.includes(k)).length / own.length;
                return (
                  <div
                    key={it.skill}
                    className="grid items-center"
                    style={{ gridTemplateColumns: `9rem repeat(${total}, minmax(0, 1fr))` }}
                  >
                    <span className="truncate pr-2 text-sm font-bold">{it.skill}</span>
                    <button
                      type="button"
                      onClick={() => setSelected(i)}
                      aria-pressed={selected === i}
                      className={`gantt-bar relative h-10 overflow-hidden rounded-xl text-left text-xs font-extrabold ${BARS[i % BARS.length]} ${selected === i ? "ring-2 ring-ink ring-offset-2 ring-offset-surface" : ""}`}
                      style={{ gridColumn: `${from + 2} / span ${it.weeks}`, animationDelay: `${i * 120}ms` }}
                    >
                      <span
                        aria-hidden="true"
                        className="absolute inset-y-0 left-0 bg-black/15"
                        style={{ width: `${progress * 100}%` }}
                      />
                      <span className="relative px-3">
                        {it.weeks} sem. · {Math.round(progress * 100)} %
                      </span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>

          {next && (
            <div className="next-step flex flex-wrap items-center gap-4 rounded-[1.75rem] bg-accent p-5 text-on-accent">
              <span className="text-xs font-black tracking-[0.1em] uppercase">
                Prochaine étape · {next.skill}
              </span>
              <span className="min-w-0 flex-1 text-lg font-bold">{next.step}</span>
              <button
                type="button"
                onClick={() => toggle(next.key, true, next.skill)}
                className="rounded-full bg-on-accent px-5 py-2.5 text-sm font-extrabold text-accent"
              >
                ✓ C'est fait
              </button>
            </div>
          )}

          {item && (
            <section
              key={item.skill}
              className="animate-enter grid gap-5 rounded-[1.75rem] border border-line bg-surface p-6 @3xl:grid-cols-[minmax(0,1fr)_18rem]"
            >
              <div className="space-y-4">
                <div>
                  <h3 className="text-2xl font-extrabold">{item.skill}</h3>
                  <p className="text-sm text-ink-muted">{item.why}</p>
                </div>
                <ol className="space-y-2">
                  {item.steps.map((s, j) => {
                    const k = `${item.skill}::${s}`;
                    const on = checked.includes(k);
                    return (
                      <li key={s}>
                        <label
                          className={`flex cursor-pointer items-start gap-3 rounded-2xl border p-3 transition-colors ${on ? "border-proved bg-proved-soft" : "border-line hover:border-line-strong"}`}
                        >
                          <input
                            type="checkbox"
                            className="mt-1 size-4 accent-accent-text"
                            checked={on}
                            onChange={(e) => toggle(k, e.target.checked, item.skill)}
                          />
                          <span className={on ? "text-ink-muted line-through" : ""}>
                            <b className="mr-1">{j + 1}.</b>
                            {s}
                          </span>
                        </label>
                      </li>
                    );
                  })}
                </ol>
                <ReminderButton
                  kind="progression"
                  title={`${item.skill} : ${next?.skill === item.skill ? next.step : item.steps[0]}`}
                  link={`/studio/${generation.id}/plan`}
                />
              </div>
              <aside className="space-y-3">
                <div className="rounded-2xl border-2 border-dashed border-proved bg-proved-soft p-4 text-sm">
                  <p className="font-extrabold">Le projet qui le prouvera</p>
                  <p className="mt-1">{item.project}</p>
                  <Link
                    to={`/studio/${generation.id}/profil?sujet=${encodeURIComponent(item.skill)}`}
                    className="link mt-2 inline-block font-bold"
                  >
                    Projet mené ? Racontez-le →
                  </Link>
                </div>
                {item.resources.length > 0 && (
                  <ul className="space-y-2">
                    {item.resources.map((r) => (
                      <li key={r.url}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center justify-between rounded-2xl bg-surface-sunken p-3 text-sm font-semibold hover:bg-accent-soft"
                        >
                          {r.title} <span aria-hidden="true">↗</span>
                          <span className="sr-only">(nouvel onglet)</span>
                        </a>
                      </li>
                    ))}
                  </ul>
                )}
              </aside>
            </section>
          )}
        </>
      )}
      {data && items.length === 0 && (
        <p className="rounded-[1.75rem] border border-line bg-surface p-6 text-ink-muted">
          Rien à acquérir : votre profil prouve tout ce que demandent vos offres.
        </p>
      )}
    </div>
  );
}
