import { useEffect, useState } from "react";
import { useToast } from "../../components/toasts";
import { Alert, Button, errorMessage } from "../../components/ui";
import { describePointer, factText } from "../../lib/describe";
import { Diff, useCorrect, useJudge, VERDICT } from "../assistants/GenerationAssistants";
import { AiBadge, cvLines, Thinking, VoteButtons } from "../assistants/shared";
import { SceneHeader, useStudio } from "./Studio";

/*
 * Le juge de fidélité, mis en scène comme une audience : une balance qui penche selon les verdicts, un
 * dossier à la fois, un comparateur « votre CV / vos sources » à faire glisser, et un tampon par décision.
 */

type Decision = "corrigee" | "gardee";

/** Balance : le fléau penche du côté le plus lourd (fidèles à gauche, à revoir à droite). */
function Balance({ faithful, flagged }: { faithful: number; flagged: number }) {
  const total = faithful + flagged || 1;
  const tilt = ((flagged - faithful) / total) * 14;
  return (
    <svg
      viewBox="0 0 260 150"
      className="w-64"
      role="img"
      aria-label={`${faithful} lignes fidèles, ${flagged} à revoir`}
    >
      <path
        d="M130 30v100M95 140h70"
        stroke="currentColor"
        strokeWidth="5"
        strokeLinecap="round"
        className="text-ink-subtle"
      />
      <g className="balance-beam" style={{ transform: `rotate(${tilt}deg)` }}>
        <path
          d="M40 30h180"
          stroke="currentColor"
          strokeWidth="5"
          strokeLinecap="round"
          className="text-ink"
        />
        <path
          d="M40 30l-22 50M40 30l22 50M220 30l-22 50M220 30l22 50"
          stroke="currentColor"
          strokeWidth="2"
          className="text-ink-subtle"
        />
        <path d="M14 80h52a26 12 0 0 1-52 0Z" className="fill-proved" />
        <path d="M194 80h52a26 12 0 0 1-52 0Z" className="fill-flagged" />
        <text x="40" y="112" textAnchor="middle" className="fill-proved text-[18px] font-extrabold">
          {faithful}
        </text>
        <text x="220" y="112" textAnchor="middle" className="fill-flagged text-[18px] font-extrabold">
          {flagged}
        </text>
      </g>
      <circle cx="130" cy="30" r="7" className="fill-accent" />
    </svg>
  );
}

export function JudgeScene() {
  const { generation, setFocus } = useStudio();
  const toast = useToast();
  const judge = useJudge(generation);
  const correct = useCorrect(generation);
  const lines = new Map(cvLines(generation).map((l) => [l.path, l]));
  const verdicts = [...(judge.data?.verdicts ?? [])].sort(
    (a, b) => Number(a.verdict === "fidele") - Number(b.verdict === "fidele"),
  );
  const flagged = verdicts.filter((v) => v.verdict !== "fidele");
  const [index, setIndex] = useState(0);
  const [reveal, setReveal] = useState(55);
  const [decisions, setDecisions] = useState<Record<string, Decision>>({});
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState("");
  const current = verdicts[index];
  const line = current ? lines.get(current.path) : undefined;
  const sources = (line?.sources ?? []).map(
    (s) => factText(generation.profile, s) ?? describePointer(generation.profile, s),
  );
  const done = flagged.length > 0 && flagged.every((v) => decisions[v.path]);

  useEffect(() => {
    setFocus(current?.path ?? null);
    setEditing(false);
    setText(line?.text ?? "");
    setReveal(55);
  }, [current?.path]);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest("input, textarea")) return;
      if (e.key === "ArrowRight") setIndex((i) => Math.min(i + 1, verdicts.length - 1));
      if (e.key === "ArrowLeft") setIndex((i) => Math.max(i - 1, 0));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [verdicts.length]);

  const decide = (d: Decision) => {
    if (!current) return;
    setDecisions((m) => ({ ...m, [current.path]: d }));
    setTimeout(() => setIndex((i) => Math.min(i + 1, verdicts.length - 1)), 650);
  };
  const apply = (value: string) =>
    correct.mutate(
      { lines: [{ path: current!.path, text: value }] },
      {
        onSuccess: () => {
          toast.success("Ligne corrigée : elle s'est posée dans votre CV.");
          decide("corrigee");
        },
      },
    );

  if (!judge.data)
    return (
      <div className="judge-court">
        <SceneHeader eyebrow="Juge de fidélité" title="Que l'audience commence.">
          Le contrôle automatique vérifie chiffres et technologies. Le juge relit le <b>sens</b> : « a
          participé » n'est pas « a dirigé ». Il propose, vous tranchez.
        </SceneHeader>
        <div className="grid place-items-center gap-6 rounded-[2rem] border border-line bg-surface p-12 text-center">
          <Balance faithful={1} flagged={1} />
          <Button size="lg" busy={judge.isPending} onClick={() => judge.mutate()}>
            Faire juger mon CV
          </Button>
          {judge.isPending && <Thinking label="Le juge confronte chaque ligne à vos sources…" />}
          {judge.isError && <Alert tone="error">{errorMessage(judge.error)}</Alert>}
        </div>
      </div>
    );

  const faithful = verdicts.length - flagged.length;
  return (
    <div className="judge-court space-y-6">
      <SceneHeader
        eyebrow="Juge de fidélité"
        title={
          flagged.length
            ? `${flagged.length} ligne${flagged.length > 1 ? "s" : ""} à trancher`
            : "Audience levée : tout est fidèle"
        }
        actions={
          <Button variant="secondary" busy={judge.isPending} onClick={() => judge.mutate()}>
            Rejuger
          </Button>
        }
      >
        <span className="flex flex-wrap items-center gap-3">
          <AiBadge kind={judge.data.providerKind} />
          <VoteButtons key={judge.data.revision} role="juge-fidelite" kind={judge.data.providerKind} />
        </span>
      </SceneHeader>
      {judge.stale && (
        <Alert tone="info">
          Votre CV a changé depuis ce verdict : rejugez pour confirmer vos corrections.
        </Alert>
      )}

      <div className="flex flex-wrap items-center gap-8 rounded-[2rem] border border-line bg-surface px-8 py-6">
        <Balance
          faithful={faithful + Object.keys(decisions).length}
          flagged={flagged.length - Object.keys(decisions).length}
        />
        <div className="min-w-56 flex-1 space-y-2">
          <p className="text-4xl font-extrabold">
            {faithful}/{verdicts.length}{" "}
            <span className="text-lg font-semibold text-ink-muted">lignes fidèles</span>
          </p>
          <p className="text-sm text-ink-muted">
            {done
              ? "Toutes les lignes signalées sont tranchées."
              : "Flèches ← → pour passer d'un dossier à l'autre."}
          </p>
        </div>
      </div>

      {current && line && (
        <article
          key={current.path}
          className="case-file relative space-y-5 rounded-[2rem] border border-line bg-surface p-6 lg:p-8"
        >
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-extrabold tracking-[0.1em] text-ink-subtle uppercase">
              Dossier {index + 1} sur {verdicts.length} · {line.section}
            </p>
            <span
              key={decisions[current.path] ?? current.verdict}
              className={`verdict-stamp rounded-lg border-[3px] px-3 py-1 text-sm font-black tracking-[0.12em] uppercase ${decisions[current.path] === "corrigee" ? "border-accent text-accent-text" : decisions[current.path] === "gardee" ? "border-proved text-proved" : VERDICT[current.verdict].stamp}`}
            >
              {decisions[current.path] === "corrigee"
                ? "Corrigée"
                : decisions[current.path] === "gardee"
                  ? "Maintenue"
                  : VERDICT[current.verdict].label}
            </span>
          </div>

          {/* Comparateur : faites glisser pour révéler, sous votre ligne, ce que disent vos sources. */}
          <div
            className="judge-compare relative overflow-hidden rounded-3xl border border-line"
            style={{ ["--reveal" as string]: `${reveal}%` }}
          >
            <div className="bg-surface-sunken p-6">
              <p className="text-xs font-extrabold text-proved uppercase">
                {current.suggestion ? "Reformulation fidèle proposée" : "Vos sources disent"}
              </p>
              <p className="mt-2 text-xl leading-relaxed font-semibold">
                {current.suggestion ?? sources.map((s) => `« ${s} »`).join(" ")}
              </p>
            </div>
            <div className="judge-top absolute inset-0 bg-surface p-6">
              <p className="text-xs font-extrabold text-flagged uppercase">Votre CV dit</p>
              <p className="mt-2 text-xl leading-relaxed font-semibold">
                {current.verdict !== "fidele" ? (
                  <Diff text={line.text} against={sources.join(" ")} tone="added" />
                ) : (
                  line.text
                )}
              </p>
            </div>
            <span aria-hidden="true" className="judge-handle" />
          </div>
          <label className="flex items-center gap-3 text-sm text-ink-muted">
            <span className="shrink-0">Votre CV</span>
            <input
              type="range"
              min={0}
              max={100}
              value={reveal}
              onChange={(e) => setReveal(Number(e.target.value))}
              className="flex-1 accent-[var(--accent)]"
              aria-label="Comparer votre ligne et la version fidèle"
            />
            <span className="shrink-0">{current.suggestion ? "Version fidèle" : "Sources"}</span>
          </label>

          <p className="flex gap-3 rounded-2xl bg-surface-sunken p-4 text-sm">
            <span aria-hidden="true" className="text-lg">
              ⚖
            </span>
            <span>
              <b>Avis du juge.</b> {current.explanation}
            </span>
          </p>

          {current.verdict !== "fidele" && !decisions[current.path] && (
            <div className="flex flex-wrap gap-3">
              {current.suggestion && (
                <Button busy={correct.isPending} onClick={() => apply(current.suggestion!)}>
                  Appliquer la version fidèle
                </Button>
              )}
              <Button variant="secondary" onClick={() => setEditing(!editing)}>
                Corriger moi-même
              </Button>
              <Button variant="ghost" onClick={() => decide("gardee")}>
                C'est exact, je maintiens
              </Button>
            </div>
          )}
          {editing && (
            <div className="space-y-2">
              <label htmlFor="juge-correction" className="label">
                Votre correction
              </label>
              <textarea
                id="juge-correction"
                className="input min-h-20"
                maxLength={500}
                value={text}
                onChange={(e) => setText(e.target.value)}
              />
              <Button busy={correct.isPending} disabled={!text.trim()} onClick={() => apply(text)}>
                Poser dans mon CV
              </Button>
            </div>
          )}
          {correct.isError && <Alert tone="error">{errorMessage(correct.error)}</Alert>}
        </article>
      )}

      <nav aria-label="Dossiers" className="flex flex-wrap gap-2">
        {verdicts.map((v, i) => {
          const d = decisions[v.path];
          const color = d
            ? "bg-accent"
            : v.verdict === "fidele"
              ? "bg-proved"
              : v.verdict === "nuance"
                ? "bg-flagged"
                : "bg-removed";
          return (
            <button
              key={v.path}
              type="button"
              onClick={() => setIndex(i)}
              aria-label={`Dossier ${i + 1} : ${d ? (d === "corrigee" ? "corrigée" : "maintenue") : VERDICT[v.verdict].label}`}
              aria-current={i === index ? "true" : undefined}
              className={`h-3 rounded-full transition-all ${color} ${i === index ? "w-12" : "w-6 opacity-70 hover:opacity-100"}`}
            />
          );
        })}
      </nav>
    </div>
  );
}
