import type { Letter } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { letters } from "../api/endpoints";
import { useToast } from "../components/toasts";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  useDocumentTitle,
} from "../components/ui";
import { AiBadge, CopyButton, Segmented, Thinking, VoteButtons } from "./assistants/shared";
import { describeIssue, formatDateTime } from "../lib/describe";

export function LetterList() {
  useDocumentTitle("Mes lettres");
  const list = useQuery({ queryKey: ["lettres"], queryFn: letters.list });
  return (
    <div>
      <PageHeader
        title="Lettres de motivation"
        lead="Chaque lettre est rédigée à partir d'un CV vérifié ; aucun paragraphe sans source n'est gardé."
      />
      {list.isPending && <Loading />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState
          title="Aucune lettre pour le moment"
          action={
            <Link to="/mes-cv" className="link">
              Choisir un CV ciblé
            </Link>
          }
        >
          Ouvrez un CV ciblé, puis « Rédiger la lettre de motivation ».
        </EmptyState>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {list.data?.map((l) => (
          <li key={l.id} className="card">
            <Link to={`/lettres/${l.id}`} className="text-lg font-semibold hover:underline">
              {l.offerTitle}
            </Link>
            <p className="text-sm text-ink-muted">
              {l.company ? `${l.company} · ` : ""}modifiée le {formatDateTime(l.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS: Record<Letter["paragraphs"][number]["status"], [string, "success" | "warning" | "info"]> = {
  supported: ["Sourcé dans votre CV", "success"],
  unsupported: ["Sans source", "warning"],
  edited: ["Modifié par vous", "info"],
};

export function LetterEditor() {
  const { id = "" } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["lettre", id], queryFn: () => letters.get(id) });
  const [greeting, setGreeting] = useState("");
  const [closing, setClosing] = useState("");
  const [paragraphs, setParagraphs] = useState<string[]>([]);
  const [confirmDelete, setConfirmDelete] = useState(false);
  useEffect(() => {
    if (!query.data) return;
    setGreeting(query.data.greeting);
    setClosing(query.data.closing);
    setParagraphs(query.data.paragraphs.map((p) => p.text));
  }, [query.data]);
  useDocumentTitle(query.data ? `Lettre pour ${query.data.offerTitle}` : "Lettre");

  const save = useMutation({
    mutationFn: () =>
      letters.update(id, { greeting, closing, paragraphs: paragraphs.map((text) => ({ text })) }),
    onSuccess: (letter) => {
      queryClient.setQueryData(["lettre", id], letter);
      toast.success("Lettre enregistrée et recontrôlée.");
    },
  });
  const pdf = useMutation({ mutationFn: () => letters.pdf(id) });
  // Lettre traduite (ADR 0029) : affichée pour relecture et copie, paragraphes écartés si un chiffre change.
  const [lang, setLang] = useState<"en" | "de">("en");
  const translate = useMutation({ mutationFn: () => letters.translateLetter(id, lang) });
  const remove = useMutation({
    mutationFn: () => letters.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["lettres"] });
      navigate("/lettres");
    },
  });

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} />;
  const letter = query.data;
  const dirty =
    greeting !== letter.greeting ||
    closing !== letter.closing ||
    paragraphs.join("\n") !== letter.paragraphs.map((p) => p.text).join("\n");

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title={`Lettre pour ${letter.offerTitle}`}
        lead={letter.company ? `Destinataire : ${letter.company}` : undefined}
        actions={
          <>
            <Button busy={pdf.isPending} disabled={dirty} onClick={() => pdf.mutate()}>
              Télécharger en PDF
            </Button>
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              Supprimer
            </Button>
          </>
        }
      />
      {letter.providerKind === "demo" && (
        <Alert tone="info">
          Lettre composée sans IA : vos lignes vérifiées sont reprises telles quelles. Personnalisez-la avant
          de l'envoyer.
        </Alert>
      )}
      {letter.removed > 0 && (
        <Alert tone="info">
          {letter.removed} paragraphe(s) rédigé(s) mais sans source dans votre CV ont été retiré(s).
        </Alert>
      )}
      {dirty && <Alert tone="warning">Enregistrez vos modifications avant de télécharger le PDF.</Alert>}
      <section className="card space-y-4" aria-labelledby="traduction-lettre">
        <h2 id="traduction-lettre" className="text-lg font-bold">
          🌍 Traduire la lettre
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <Segmented
            name="langue-lettre"
            legend="Langue"
            value={lang}
            onChange={setLang}
            options={[
              ["en", "Anglais"],
              ["de", "Allemand"],
            ]}
          />
          <Button
            variant="secondary"
            busy={translate.isPending}
            disabled={dirty}
            onClick={() => translate.mutate()}
          >
            Traduire
          </Button>
        </div>
        {translate.isPending && <Thinking label="Traduction paragraphe par paragraphe…" />}
        {translate.isError && <Alert tone="error">{errorMessage(translate.error)}</Alert>}
        {translate.data && (
          <div className="animate-enter space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <AiBadge kind={translate.data.providerKind} />
              {translate.data.rejected > 0 && (
                <Badge tone="warning">
                  {translate.data.rejected} paragraphe(s) écarté(s) : chiffres modifiés
                </Badge>
              )}
              <VoteButtons role="traduction-lettre" kind={translate.data.providerKind} />
            </div>
            <article lang={translate.data.lang} className="paper-sheet space-y-3">
              <p>{translate.data.greeting}</p>
              {translate.data.paragraphs.map((p, i) => (
                <p key={i}>{p}</p>
              ))}
              <p>{translate.data.closing}</p>
            </article>
            <CopyButton
              text={[translate.data.greeting, ...translate.data.paragraphs, translate.data.closing].join(
                "\n\n",
              )}
              label="Copier la lettre traduite"
            />
          </div>
        )}
      </section>
      {pdf.isError && <Alert tone="error">{errorMessage(pdf.error)}</Alert>}
      <form
        className="card space-y-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate();
        }}
      >
        <div>
          <label htmlFor="appel" className="label">
            Formule d'appel
          </label>
          <input
            id="appel"
            className="input"
            value={greeting}
            maxLength={200}
            onChange={(e) => setGreeting(e.target.value)}
          />
        </div>
        {paragraphs.map((text, i) => {
          const checked = letter.paragraphs[i];
          const [label, tone] =
            checked && checked.text === text ? STATUS[checked.status] : ["À recontrôler", "info" as const];
          return (
            <div key={i}>
              <div className="mb-1 flex items-center justify-between gap-2">
                <label htmlFor={`paragraphe-${i}`} className="label mb-0">
                  Paragraphe {i + 1}
                </label>
                <Badge tone={tone}>{label}</Badge>
              </div>
              <textarea
                id={`paragraphe-${i}`}
                className="input min-h-28"
                maxLength={1500}
                value={text}
                onChange={(e) => setParagraphs((list) => list.map((p, j) => (j === i ? e.target.value : p)))}
              />
              {checked && checked.text === text && checked.issues.length > 0 && (
                <ul className="mt-1 list-disc pl-5 text-sm text-flagged">
                  {checked.issues.map((issue, k) => (
                    <li key={k}>{describeIssue(issue)}</li>
                  ))}
                </ul>
              )}
              {paragraphs.length > 1 && (
                <Button
                  variant="ghost"
                  className="mt-1"
                  onClick={() => setParagraphs((list) => list.filter((_, j) => j !== i))}
                >
                  Retirer le paragraphe {i + 1}
                </Button>
              )}
            </div>
          );
        })}
        {paragraphs.length < 8 && (
          <Button variant="secondary" onClick={() => setParagraphs((list) => [...list, ""])}>
            Ajouter un paragraphe
          </Button>
        )}
        <div>
          <label htmlFor="politesse" className="label">
            Formule de politesse
          </label>
          <textarea
            id="politesse"
            className="input"
            maxLength={400}
            value={closing}
            onChange={(e) => setClosing(e.target.value)}
          />
        </div>
        {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
        <Button type="submit" busy={save.isPending} disabled={!dirty || paragraphs.some((p) => !p.trim())}>
          Enregistrer et recontrôler
        </Button>
      </form>
      <Link to={`/mes-cv/${letter.generationId}`} className="link">
        Revenir au CV ciblé
      </Link>
      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette lettre ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      >
        La lettre sera effacée définitivement. Le CV ciblé est conservé.
      </ConfirmDialog>
    </div>
  );
}
