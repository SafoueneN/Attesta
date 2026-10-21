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
import { describeIssue, formatDateTime } from "../lib/describe";

export function LetterList() {
  useDocumentTitle("Mes lettres");
  const list = useQuery({ queryKey: ["lettres"], queryFn: letters.list });
  return (
    <div>
      <PageHeader
        title="Lettres de motivation"
        lead="Chaque lettre est rédigée à partir d'un CV vérifié ; aucun paragraphe non prouvé n'est gardé."
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
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {l.company ? `${l.company} · ` : ""}modifiée le {formatDateTime(l.updatedAt)}
            </p>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUS: Record<Letter["paragraphs"][number]["status"], [string, "success" | "warning" | "info"]> = {
  supported: ["Prouvé par votre CV", "success"],
  unsupported: ["Non prouvé", "warning"],
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
          {letter.removed} paragraphe(s) rédigé(s) mais non prouvé(s) par votre CV ont été retiré(s).
        </Alert>
      )}
      {dirty && <Alert tone="warning">Enregistrez vos modifications avant de télécharger le PDF.</Alert>}
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
                <ul className="mt-1 list-disc pl-5 text-sm text-amber-900 dark:text-amber-200">
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
