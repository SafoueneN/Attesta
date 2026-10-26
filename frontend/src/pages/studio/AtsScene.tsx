import type { AtsAdvice, AtsProposal } from "@attesta/shared-schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { cv } from "../../api/endpoints";
import { useToast } from "../../components/toasts";
import { Alert, Button, errorMessage } from "../../components/ui";
import { entryOf, Highlighted, useCorrect } from "../assistants/GenerationAssistants";
import { AiBadge, cvLines, useAssistantRun, VoteButtons } from "../assistants/shared";
import { SceneHeader, useStudio } from "./Studio";

/*
 * La conseillère ATS, mise en scène comme un scanner : le CV passe sous un laser, les mots-clés repérés
 * s'allument, une jauge mesure ce qu'un logiciel de recrutement voit. Les mots-clés que le profil prouve se
 * glissent sur le CV : le fait est recopié tel quel, avec sa source, après validation.
 */

/** Jauge en demi-cercle : avant (trait fin) et maintenant (trait plein). */
function Gauge({ value, before }: { value: number; before: number | null }) {
  const arc = (pct: number) => {
    const a = Math.PI * (1 - pct / 100);
    return `M20 110 A90 90 0 0 1 ${110 + 90 * Math.cos(a)} ${110 - 90 * Math.sin(a)}`;
  };
  return (
    <svg
      viewBox="0 0 220 130"
      className="w-60"
      role="img"
      aria-label={`Lisibilité : ${value} %${before !== null ? `, contre ${before} % avant` : ""}`}
    >
      <path
        d="M20 110 A90 90 0 0 1 200 110"
        fill="none"
        strokeWidth="16"
        strokeLinecap="round"
        className="stroke-surface-sunken"
      />
      {before !== null && before !== value && (
        <path
          d={arc(Math.max(before, 1))}
          fill="none"
          strokeWidth="16"
          strokeLinecap="round"
          className="stroke-line-strong"
        />
      )}
      {value > 0 && (
        <path
          d={arc(value)}
          fill="none"
          strokeWidth="16"
          strokeLinecap="round"
          className="gauge-arc stroke-accent"
        />
      )}
      <text x="110" y="100" textAnchor="middle" className="fill-ink text-[34px] font-extrabold">
        {value} %
      </text>
      <text x="110" y="124" textAnchor="middle" className="fill-ink-subtle text-[11px] font-semibold">
        vu par le logiciel
      </text>
    </svg>
  );
}

export function AtsScene() {
  const { generation, variant, setFocus } = useStudio();
  const toast = useToast();
  const advice = useAssistantRun<AtsAdvice>(generation.id, "conseils-ats", () => cv.ats(generation.id));
  const correct = useCorrect(generation);
  const [proposal, setProposal] = useState<AtsProposal | null>(null);
  const [before, setBefore] = useState<number | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const overview = useQuery({ queryKey: ["ats-overview", generation.revision], queryFn: cv.atsOverview });
  const apply = useMutation({
    mutationFn: ({ term, entry }: { term: string; entry?: string }) =>
      cv.atsApply(generation.id, term, entry),
    onSuccess: (p) => {
      setProposal(p);
      setFocus(null);
    },
  });
  const keywords = advice.data?.keywords ?? [];
  const pct = (n: number) => (keywords.length ? Math.round((n / keywords.length) * 100) : 0);
  const placed = keywords.filter((k) => k.status === "place");
  const toPlace = keywords.filter((k) => k.status === "a_placer");
  const absent = keywords.filter((k) => k.status === "absent");
  const lines = cvLines(generation);
  const groups = lines.reduce<{ entry?: string; section: string; lines: typeof lines }[]>((acc, l) => {
    const entry = entryOf(l.path);
    const last = acc[acc.length - 1];
    if (last && last.entry === entry && last.section === l.section) last.lines.push(l);
    else acc.push({ entry, section: l.section, lines: [l] });
    return acc;
  }, []);
  const confirm = () => {
    if (!proposal) return;
    setBefore((b) => b ?? pct(placed.length));
    correct.mutate(
      { additions: [{ entry: proposal.entry, text: proposal.text, sources: proposal.sources }] },
      {
        onSuccess: () => {
          toast.success(`« ${proposal.term} » est maintenant visible dans votre CV.`);
          setProposal(null);
          advice.mutate();
        },
      },
    );
  };

  return (
    <div className="space-y-6">
      <SceneHeader
        eyebrow="Conseillère ATS"
        title="Votre CV, vu par un robot recruteur"
        actions={
          <Button busy={advice.isPending} onClick={() => advice.mutate()}>
            {advice.data ? "Rescanner" : "Lancer le scan"}
          </Button>
        }
      >
        Les mots-clés que vous possédez déjà se glissent sur la rubrique qui les prouve. Ceux qui manquent à
        votre profil restent hors du CV.
        {advice.data && (
          <span className="mt-2 flex flex-wrap items-center gap-3">
            <AiBadge kind={advice.data.providerKind} />
            <VoteButtons role="conseils-ats" kind={advice.data.providerKind} />
          </span>
        )}
      </SceneHeader>

      <div className="grid gap-6 @2xl:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)]">
        <div
          className={`scanner relative overflow-hidden rounded-[1.75rem] ${advice.isPending ? "is-scanning" : ""}`}
        >
          <article className="studio-paper min-h-[28rem] space-y-3">
            {groups.map((g) => (
              <section
                key={g.section + g.lines[0]!.path}
                onDragOver={(e) => {
                  if (!g.entry || !dragging) return;
                  e.preventDefault();
                  setOver(g.entry);
                }}
                onDragLeave={() => setOver(null)}
                onDrop={(e) => {
                  e.preventDefault();
                  setOver(null);
                  const term = e.dataTransfer.getData("text/plain");
                  if (term && g.entry) apply.mutate({ term, entry: g.entry });
                }}
                className={`rounded-xl p-2 transition-all ${dragging && g.entry ? "drop-ready" : ""} ${over === g.entry ? "drop-over" : ""}`}
              >
                <h3 className="border-b border-[#d7dcd8] pb-0.5 text-[0.65rem] font-extrabold tracking-[0.08em] text-[#536657] uppercase">
                  {g.section}
                  {dragging && g.entry && (
                    <span className="ml-2 font-bold text-[#3a6620] normal-case">· déposer ici</span>
                  )}
                </h3>
                <ul className="mt-1.5 list-disc space-y-1 pl-4 text-[0.82rem] leading-relaxed">
                  {g.lines.map((l) => (
                    <li key={l.path}>
                      <Highlighted text={l.text} terms={placed.map((k) => k.term)} />
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
          <span aria-hidden="true" className="scan-laser" />
        </div>

        <div className="space-y-5">
          <div className="grid place-items-center rounded-[1.75rem] border border-line bg-surface p-5">
            <Gauge value={pct(placed.length)} before={before} />
            {toPlace.length > 0 && (
              <p className="text-center text-sm text-ink-muted">
                Jusqu'à <b className="text-proved">{pct(placed.length + toPlace.length)} %</b> en plaçant ce
                que vous prouvez déjà.
              </p>
            )}
          </div>

          {proposal && (
            <div
              className="proposal-pop space-y-3 rounded-[1.5rem] border-2 border-accent bg-accent-soft p-5"
              role="dialog"
              aria-label="Ajout proposé"
            >
              <p className="text-sm font-bold">
                « {proposal.term} » dans « {proposal.entryLabel} »
              </p>
              <p className="rounded-xl bg-surface p-3 text-sm">« {proposal.text} »</p>
              <p className="text-xs text-ink-muted">Recopié tel quel de votre profil, avec sa source.</p>
              <div className="flex gap-2">
                <Button busy={correct.isPending} onClick={confirm}>
                  Poser dans mon CV
                </Button>
                <Button variant="ghost" onClick={() => setProposal(null)}>
                  Annuler
                </Button>
              </div>
              {correct.isError && <Alert tone="error">{errorMessage(correct.error)}</Alert>}
            </div>
          )}
          {apply.isError && <Alert tone="warning">{errorMessage(apply.error)}</Alert>}

          {advice.data && (
            <>
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold tracking-[0.08em] text-flagged uppercase">
                  À faire apparaître · glissez sur le CV
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {toPlace.map((k) => (
                    <li key={k.term}>
                      <button
                        type="button"
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData("text/plain", k.term);
                          setDragging(k.term);
                        }}
                        onDragEnd={() => setDragging(null)}
                        onClick={() => apply.mutate({ term: k.term })}
                        title={`${k.advice} (cliquer pour placer automatiquement)`}
                        className="kw-chip cursor-grab bg-flagged-soft text-flagged active:cursor-grabbing"
                      >
                        <span aria-hidden="true">⠿</span> {k.term}
                      </button>
                    </li>
                  ))}
                  {toPlace.length === 0 && <li className="text-sm text-ink-subtle">Rien à placer.</li>}
                </ul>
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold tracking-[0.08em] text-proved uppercase">
                  Déjà repérés
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {placed.map((k) => (
                    <li key={k.term} className="kw-chip bg-proved-soft text-proved" title={k.advice}>
                      ✓ {k.term}
                    </li>
                  ))}
                </ul>
              </section>
              <section className="space-y-2">
                <h3 className="text-xs font-extrabold tracking-[0.08em] text-ink-subtle uppercase">
                  Absents de votre profil · ne pas ajouter
                </h3>
                <ul className="flex flex-wrap gap-2">
                  {absent.map((k) => (
                    <li
                      key={k.term}
                      className="kw-chip border border-dashed border-line text-ink-subtle"
                      title={k.advice}
                    >
                      {k.term}
                    </li>
                  ))}
                  {absent.length === 0 && <li className="text-sm text-ink-subtle">Aucun.</li>}
                </ul>
              </section>
            </>
          )}

          <section className="rounded-[1.5rem] border border-line bg-surface p-5">
            <h3 className="text-sm font-bold">Check-up du PDF</h3>
            <ul className="checkup mt-3 space-y-2 text-sm">
              {[
                [
                  variant === "ats",
                  variant === "ats"
                    ? "Une colonne : lue par tous les logiciels"
                    : "Deux colonnes : préférez « Sobre » pour un dépôt en ligne",
                ],
                [true, "Rubriques aux intitulés standards"],
                [true, "Dates homogènes MM/AAAA"],
                [true, "Texte sélectionnable, sans image ni tableau"],
              ].map(([ok, label], i) => (
                <li
                  key={String(label)}
                  className="flex items-center gap-2"
                  style={{ animationDelay: `${i * 120}ms` }}
                >
                  <span
                    className={`grid size-5 place-items-center rounded-full text-[0.7rem] font-black ${ok ? "bg-proved text-on-accent" : "bg-flagged text-on-accent"}`}
                  >
                    {ok ? "✓" : "!"}
                  </span>
                  {label}
                </li>
              ))}
            </ul>
          </section>

          {overview.data && overview.data.length > 1 && (
            <section className="rounded-[1.5rem] border border-line bg-surface p-5">
              <h3 className="text-sm font-bold">Vos autres CV</h3>
              <ul className="mt-3 space-y-2">
                {overview.data.map((o) => {
                  const p = o.total ? Math.round((o.placed / o.total) * 100) : 0;
                  return (
                    <li key={o.generationId} className="flex items-center gap-3 text-xs">
                      <Link
                        to={`/studio/${o.generationId}/ats`}
                        className={`w-40 truncate ${o.generationId === generation.id ? "font-bold" : "link"}`}
                      >
                        {o.offerTitle}
                      </Link>
                      <span className="h-1.5 flex-1 rounded-full bg-surface-sunken">
                        <span
                          className="grow-bar block h-1.5 rounded-full bg-accent"
                          style={{ width: `${p}%` }}
                        />
                      </span>
                      <span className="w-9 text-right font-bold">{p} %</span>
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
