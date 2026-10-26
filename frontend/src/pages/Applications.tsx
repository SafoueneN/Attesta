import type { ApplicationTracking } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link } from "react-router";
import { cv, letters } from "../api/endpoints";
import { useToast } from "../components/toasts";
import {
  Alert,
  Button,
  EmptyState,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  useDocumentTitle,
} from "../components/ui";
import { formatDay } from "../lib/describe";

/*
 * Suivi des candidatures (ADR 0040), sans IA : une colonne par étape, une carte par CV ciblé. Le candidat
 * note la date d'envoi et une remarque ; une relance est suggérée 10 jours après l'envoi sans nouvelle.
 */

type Status = ApplicationTracking["status"];

const COLUMNS: { status: Status; label: string; tone: string }[] = [
  { status: "a_envoyer", label: "À envoyer", tone: "border-line" },
  { status: "envoyee", label: "Envoyée", tone: "border-accent" },
  { status: "relancee", label: "Relancée", tone: "border-flagged" },
  { status: "entretien", label: "Entretien", tone: "border-proved" },
  { status: "offre", label: "Offre reçue", tone: "border-proved" },
  { status: "refus", label: "Refus", tone: "border-removed" },
];

const today = () => new Date().toISOString().slice(0, 10);

interface Card {
  generationId: string;
  offerTitle: string;
  createdAt: string;
  tracking?: ApplicationTracking;
}

function ApplicationCard({ card }: { card: Card }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const t = card.tracking;
  const [note, setNote] = useState(t?.note ?? "");
  const save = useMutation({
    mutationFn: (body: { status: Status; sentAt: string | null; note: string | null }) =>
      letters.track(card.generationId, body),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["suivi"] }),
    onError: (error) => toast.error(errorMessage(error)),
  });
  const status = t?.status ?? "a_envoyer";
  const move = (next: Status) =>
    save.mutate({
      status: next,
      // L'envoi est daté au premier passage hors de « À envoyer ».
      sentAt: t?.sentAt ?? (next === "a_envoyer" ? null : today()),
      note: note.trim() || null,
    });
  const followUp = t?.followUpOn && t.followUpOn <= today() && status === "envoyee";
  return (
    <li className={`card space-y-2 border-l-4 p-4 ${followUp ? "border-l-flagged" : ""}`}>
      <Link to={`/mes-cv/${card.generationId}`} className="link block font-semibold">
        {card.offerTitle}
      </Link>
      <p className="text-xs text-ink-muted">
        {t?.sentAt ? `Envoyée le ${formatDay(t.sentAt)}` : `CV créé le ${formatDay(card.createdAt)}`}
      </p>
      {followUp && (
        <p className="rounded-xl bg-flagged-soft px-2.5 py-1 text-xs font-bold text-flagged">
          Pas de nouvelle depuis 10 jours : pensez à relancer.
        </p>
      )}
      <label className="block text-xs font-semibold text-ink-muted">
        Étape
        <select
          className="input mt-1 py-1.5 text-sm"
          value={status}
          disabled={save.isPending}
          onChange={(e) => move(e.target.value as Status)}
        >
          {COLUMNS.map((c) => (
            <option key={c.status} value={c.status}>
              {c.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-xs font-semibold text-ink-muted">
        Note
        <input
          className="input mt-1 py-1.5 text-sm"
          value={note}
          maxLength={500}
          placeholder="Contact, date d'entretien…"
          onChange={(e) => setNote(e.target.value)}
          onBlur={() => note !== (t?.note ?? "") && move(status)}
        />
      </label>
    </li>
  );
}

export function Applications() {
  useDocumentTitle("Mes candidatures");
  const generations = useQuery({ queryKey: ["generations"], queryFn: cv.generations });
  const trackings = useQuery({ queryKey: ["suivi"], queryFn: letters.trackings });
  const [hidden, setHidden] = useState(true);

  if (generations.isPending || trackings.isPending) return <Loading />;
  if (generations.isError) return <QueryError error={generations.error} />;
  if (trackings.isError) return <QueryError error={trackings.error} />;

  const byId = new Map(trackings.data.map((t) => [t.generationId, t]));
  const cards: Card[] = generations.data
    .filter((g) => g.status === "ok")
    .map((g) => ({
      generationId: g.id,
      offerTitle: g.offerTitle,
      createdAt: g.createdAt,
      tracking: byId.get(g.id),
    }));
  const columns = COLUMNS.filter(
    (c) => !hidden || c.status !== "refus" || cards.some((x) => x.tracking?.status === "refus"),
  );
  const count = (s: Status) => cards.filter((c) => (c.tracking?.status ?? "a_envoyer") === s).length;
  const late = cards.filter(
    (c) => c.tracking?.status === "envoyee" && c.tracking.followUpOn && c.tracking.followUpOn <= today(),
  ).length;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Mes candidatures"
        lead="Où en est chaque CV ciblé : envoi, relance, entretien, réponse. Changez l'étape d'une carte en un clic."
      />
      {cards.length === 0 && (
        <EmptyState illustration="search" title="Aucune candidature pour l'instant">
          Chaque CV ciblé devient une candidature à suivre.{" "}
          <Link to="/cv" className="link">
            Créez votre premier CV ciblé
          </Link>
          .
        </EmptyState>
      )}
      {late > 0 && (
        <Alert tone="warning">
          {late} candidature{late > 1 ? "s" : ""} sans nouvelle depuis 10 jours : une relance polie augmente
          nettement les chances de réponse.
        </Alert>
      )}
      {cards.length > 0 && (
        <>
          <div className="flex flex-wrap gap-3 text-sm">
            {COLUMNS.map((c) => (
              <span key={c.status} className="rounded-full border border-line px-3 py-1">
                {c.label} <b className="tabular-nums">{count(c.status)}</b>
              </span>
            ))}
            <Button variant="ghost" onClick={() => setHidden((h) => !h)}>
              {hidden ? "Afficher la colonne Refus" : "Masquer la colonne Refus"}
            </Button>
          </div>
          <div className="grid gap-4 overflow-x-auto pb-2 md:grid-cols-3 xl:grid-cols-6">
            {columns.map((col) => (
              <section key={col.status} aria-labelledby={`col-${col.status}`} className="min-w-56 space-y-3">
                <h2 id={`col-${col.status}`} className={`border-b-2 pb-1 text-sm font-extrabold ${col.tone}`}>
                  {col.label} · {count(col.status)}
                </h2>
                <ul className="space-y-3">
                  {cards
                    .filter((c) => (c.tracking?.status ?? "a_envoyer") === col.status)
                    .map((c) => (
                      <ApplicationCard key={c.generationId} card={c} />
                    ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
