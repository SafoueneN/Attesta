import type { CvLine, Generation, Letter, TailoredCv } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams } from "react-router";
import { ApiError } from "../api/client";
import { cv, letters } from "../api/endpoints";
import { useSession } from "../auth/session";
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
  ScoreBadge,
  Spinner,
  useDocumentTitle,
} from "../components/ui";
import { describeIssue, describePointer, factText, formatDateTime } from "../lib/describe";

export function GenerationList() {
  useDocumentTitle("Mes CV");
  const list = useQuery({ queryKey: ["generations"], queryFn: cv.generations });
  return (
    <div>
      <PageHeader
        title="Mes CV ciblés"
        lead="Chaque génération garde l'instantané du profil et de l'offre utilisés."
        actions={
          <Link
            to="/cv"
            className="rounded-lg bg-brand-700 px-4 py-2 text-sm font-semibold text-white hover:bg-brand-800"
          >
            Nouveau CV ciblé
          </Link>
        }
      />
      {list.isPending && <Loading />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState
          title="Aucun CV ciblé pour le moment"
          action={
            <Link to="/cv" className="link">
              Créer mon premier CV ciblé
            </Link>
          }
        >
          Renseignez votre profil, collez une offre : Attesta adapte votre CV sans rien inventer.
        </EmptyState>
      )}
      {list.data && list.data.length > 0 && (
        <ul className="grid gap-4 md:grid-cols-2">
          {list.data.map((g) => (
            <li key={g.id} className="card flex flex-col gap-2">
              <Link to={`/mes-cv/${g.id}`} className="text-lg font-semibold hover:underline">
                {g.offerTitle}
              </Link>
              <p className="text-sm text-slate-600 dark:text-slate-400">{formatDateTime(g.createdAt)}</p>
              <div className="flex flex-wrap gap-2">
                {g.status === "ok" ? (
                  <ScoreBadge score={g.score} />
                ) : (
                  <Badge tone="warning">Sans reformulation</Badge>
                )}
                {g.providerKind === "demo" && <Badge tone="neutral">Démonstration</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface ReviewLine {
  path: string;
  line: CvLine;
  section: string;
}

/** Lignes rédigées du CV, dans l'ordre du document (même parcours que le contrôle du serveur). */
function reviewLines(c: TailoredCv, g: Generation): ReviewLine[] {
  const entryTitle = (section: "work" | "projects", ref: string) => {
    const i = Number(ref.split("/")[2]);
    return section === "work" ? g.profile.work[i]?.position : g.profile.projects[i]?.name;
  };
  return [
    ...(c.headline ? [{ path: "/headline", line: c.headline, section: "Titre" }] : []),
    ...c.summary.map((line, i) => ({ path: `/summary/${i}`, line, section: "Accroche" })),
    ...c.work.flatMap((e, i) =>
      e.highlights.map((line, j) => ({
        path: `/work/${i}/highlights/${j}`,
        line,
        section: entryTitle("work", e.ref) ?? "Expérience",
      })),
    ),
    ...c.projects.flatMap((e, i) =>
      e.highlights.map((line, j) => ({
        path: `/projects/${i}/highlights/${j}`,
        line,
        section: entryTitle("projects", e.ref) ?? "Projet",
      })),
    ),
  ];
}

function Preview({ generation, variant }: { generation: Generation; variant: "ats" | "design" }) {
  const preview = useQuery({
    queryKey: ["apercu", generation.id, generation.revision, variant],
    queryFn: () => letters.previewCv({ generationId: generation.id, variant }),
  });
  if (preview.isPending) return <Loading label="Préparation de l'aperçu…" />;
  if (preview.isError) return <QueryError error={preview.error} />;
  return (
    <iframe
      title="Aperçu du CV, identique au PDF"
      srcDoc={preview.data}
      sandbox=""
      className="h-[70vh] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700"
    />
  );
}

function Review({ generation }: { generation: Generation }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const lines = useMemo(() => reviewLines(generation.cv!, generation), [generation]);
  const [texts, setTexts] = useState<Record<string, string>>({});
  const [removed, setRemoved] = useState<Set<string>>(new Set());
  useEffect(() => {
    setTexts({});
    setRemoved(new Set());
  }, [generation.revision]);
  const issuesByPath = new Map(generation.report?.lines.map((l) => [l.path, l.issues]) ?? []);
  const changed = Object.entries(texts).filter(
    ([path, t]) => lines.find((l) => l.path === path)?.line.text !== t,
  );
  const save = useMutation({
    mutationFn: () =>
      cv.correct(generation.id, {
        revision: generation.revision,
        lines: [
          ...changed.map(([path, text]) => ({ path, text })),
          ...[...removed].map((path) => ({ path, remove: true })),
        ],
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(["generation", generation.id], updated);
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success("Vos corrections sont enregistrées.");
    },
    onError: (error) => {
      if (error instanceof ApiError && error.code === "version_perimee")
        void queryClient.invalidateQueries({ queryKey: ["generation", generation.id] });
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate();
      }}
      className="space-y-4"
    >
      <p className="text-slate-700 dark:text-slate-300">
        Chaque ligne cite le fait de votre profil qui la prouve. Vous pouvez la reformuler ou la retirer ; une
        ligne modifiée reste à votre décision, et tout écart avec la source est signalé.
      </p>
      <ol className="space-y-4">
        {lines.map(({ path, line, section }, index) => {
          const issues = issuesByPath.get(path) ?? [];
          const edited = generation.edited.includes(path);
          const isRemoved = removed.has(path);
          return (
            <li
              key={path}
              className={`rounded-lg border p-4 ${issues.length ? "border-amber-500" : "border-slate-200 dark:border-slate-700"}`}
            >
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <span className="text-sm font-semibold">{section}</span>
                {edited && <Badge tone="info">Modifiée par vous</Badge>}
                {issues.length > 0 && <Badge tone="warning">Écart avec la source</Badge>}
              </div>
              <label htmlFor={`ligne-${index}`} className="sr-only">
                Ligne {index + 1}
              </label>
              <textarea
                id={`ligne-${index}`}
                className="input min-h-16"
                maxLength={500}
                disabled={isRemoved}
                value={texts[path] ?? line.text}
                onChange={(e) => setTexts((t) => ({ ...t, [path]: e.target.value }))}
              />
              <details className="mt-2 text-sm">
                <summary className="cursor-pointer text-brand-700 dark:text-brand-100">
                  Source{line.sources.length > 1 ? "s" : ""} de la ligne
                </summary>
                <ul className="mt-2 space-y-1">
                  {line.sources.map((s) => (
                    <li key={s}>
                      <span className="font-medium">{describePointer(generation.profile, s)}</span> : «{" "}
                      {factText(generation.profile, s) ?? "?"} »
                    </li>
                  ))}
                </ul>
              </details>
              {issues.length > 0 && (
                <ul className="mt-2 list-disc pl-5 text-sm text-amber-900 dark:text-amber-200">
                  {issues.map((i, k) => (
                    <li key={k}>{describeIssue(i)}</li>
                  ))}
                </ul>
              )}
              <label className="mt-2 flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-red-700"
                  checked={isRemoved}
                  onChange={(e) =>
                    setRemoved((r) => {
                      const next = new Set(r);
                      if (e.target.checked) next.add(path);
                      else next.delete(path);
                      return next;
                    })
                  }
                />
                Retirer cette ligne du CV
              </label>
            </li>
          );
        })}
      </ol>
      {save.isError && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      <Button type="submit" busy={save.isPending} disabled={!changed.length && !removed.size}>
        Enregistrer mes corrections
      </Button>
    </form>
  );
}

function LetterLauncher({ generationId }: { generationId: string }) {
  const navigate = useNavigate();
  const [tone, setTone] = useState<Letter["tone"]>("sobre");
  const create = useMutation({
    mutationFn: () => letters.create(generationId, tone),
    onSuccess: (letter) => navigate(`/lettres/${letter.id}`),
  });
  return (
    <div className="space-y-3">
      <label htmlFor="ton" className="label">
        Ton de la lettre
      </label>
      <select
        id="ton"
        className="input max-w-xs"
        value={tone}
        onChange={(e) => setTone(e.target.value as Letter["tone"])}
      >
        <option value="sobre">Sobre</option>
        <option value="chaleureux">Chaleureux</option>
        <option value="dynamique">Dynamique</option>
      </select>
      <Button busy={create.isPending} onClick={() => create.mutate()}>
        Rédiger la lettre de motivation
      </Button>
      {create.isError && <Alert tone="error">{errorMessage(create.error)}</Alert>}
    </div>
  );
}

export function GenerationDetail() {
  const { id = "" } = useParams();
  const { isAccount } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const query = useQuery({ queryKey: ["generation", id], queryFn: () => cv.generation(id) });
  const [variant, setVariant] = useState<"ats" | "design">("ats");
  const [tab, setTab] = useState<"apercu" | "relecture" | "ecarts">("apercu");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const exportPdf = useMutation({
    mutationFn: (generationId?: string) => letters.exportCv({ generationId, variant }),
  });
  const remove = useMutation({
    mutationFn: () => cv.remove(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["generations"] });
      toast.success("Génération supprimée.");
      navigate("/mes-cv");
    },
  });
  useDocumentTitle(query.data ? `CV pour ${query.data.offerTitle}` : "CV ciblé");

  if (query.isPending) return <Loading />;
  if (query.isError) return <QueryError error={query.error} retry={() => void query.refetch()} />;
  const g = query.data;
  const ok = g.status === "ok" && g.cv;

  return (
    <div className="space-y-6">
      <PageHeader
        title={g.offerTitle}
        lead={`Généré le ${formatDateTime(g.createdAt)} à partir de la version ${g.profileVersion ?? "?"} de votre profil.`}
        actions={
          <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
            Supprimer
          </Button>
        }
      />
      <div className="flex flex-wrap gap-2">
        {ok ? (
          <ScoreBadge score={g.report?.score ?? null} />
        ) : (
          <Badge tone="warning">Sans reformulation</Badge>
        )}
        {g.removed.length > 0 && <Badge tone="neutral">{g.removed.length} ligne(s) écartée(s)</Badge>}
        {g.providerKind === "demo" && <Badge tone="neutral">Démonstration : faits recopiés, sans IA</Badge>}
      </div>
      {!ok && (
        <Alert tone="warning" title="Reformulation indisponible">
          {g.message} Vous pouvez exporter votre CV tel que saisi, ou relancer une génération plus tard.
        </Alert>
      )}
      {ok && g.cv!.missingKeywords.length > 0 && (
        <Alert tone="info" title="Mots-clés de l'offre absents de votre profil">
          <p>Signalés, jamais ajoutés : {g.cv!.missingKeywords.join(", ")}.</p>
          <p className="mt-1">
            Si vous les maîtrisez vraiment, ajoutez-les à votre profil avec une réalisation qui le prouve.
          </p>
        </Alert>
      )}

      <section className="card space-y-4" aria-labelledby="export">
        <h2 id="export" className="text-lg font-bold">
          Exporter
        </h2>
        <fieldset className="flex flex-wrap gap-6">
          <legend className="sr-only">Mise en page</legend>
          {(["ats", "design"] as const).map((v) => (
            <label key={v} className="flex items-center gap-2">
              <input
                type="radio"
                name="variante"
                className="size-4 accent-brand-700"
                checked={variant === v}
                onChange={() => setVariant(v)}
              />
              {v === "ats" ? "Sobre (lu par tous les ATS)" : "Soignée (deux colonnes de couleur)"}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap gap-3">
          {ok && (
            <Button busy={exportPdf.isPending} onClick={() => exportPdf.mutate(g.id)}>
              Télécharger le CV ciblé (PDF)
            </Button>
          )}
          <Button variant="secondary" busy={exportPdf.isPending} onClick={() => exportPdf.mutate(undefined)}>
            CV non adapté (PDF)
          </Button>
        </div>
        {exportPdf.isError && <Alert tone="error">{errorMessage(exportPdf.error)}</Alert>}
      </section>

      {ok && (
        <>
          <div
            role="tablist"
            aria-label="Vues du CV"
            className="flex gap-2 border-b border-slate-200 dark:border-slate-800"
          >
            {(
              [
                ["apercu", "Aperçu"],
                ["relecture", "Relecture ligne par ligne"],
                ["ecarts", `Lignes écartées (${g.removed.length})`],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                role="tab"
                id={`onglet-${key}`}
                aria-selected={tab === key}
                aria-controls={`panneau-${key}`}
                onClick={() => setTab(key)}
                className={`-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${tab === key ? "border-brand-700 text-brand-800 dark:text-brand-100" : "border-transparent text-slate-600 dark:text-slate-400"}`}
              >
                {label}
              </button>
            ))}
          </div>
          <div role="tabpanel" id={`panneau-${tab}`} aria-labelledby={`onglet-${tab}`}>
            {tab === "apercu" && <Preview generation={g} variant={variant} />}
            {tab === "relecture" && <Review generation={g} />}
            {tab === "ecarts" &&
              (g.removed.length === 0 ? (
                <p>Aucune ligne écartée : tout ce qui a été rédigé renvoie à votre profil.</p>
              ) : (
                <ul className="space-y-3">
                  {g.removed.map((r) => (
                    <li key={r.path} className="rounded-lg border border-red-300 p-4 dark:border-red-800">
                      <p className="line-through">{r.text}</p>
                      <ul className="mt-2 list-disc pl-5 text-sm text-red-800 dark:text-red-300">
                        {r.issues.map((i, k) => (
                          <li key={k}>{describeIssue(i)}</li>
                        ))}
                      </ul>
                    </li>
                  ))}
                </ul>
              ))}
          </div>
          <section className="card space-y-3" aria-labelledby="lettre">
            <h2 id="lettre" className="text-lg font-bold">
              Lettre de motivation
            </h2>
            {isAccount ? (
              <>
                <p className="text-slate-700 dark:text-slate-300">
                  Rédigée à partir des seules lignes vérifiées de ce CV ; chaque paragraphe est contrôlé à son
                  tour.
                </p>
                <LetterLauncher generationId={g.id} />
              </>
            ) : (
              <p>
                <Link to="/connexion" className="link">
                  Connectez-vous
                </Link>{" "}
                pour rédiger une lettre de motivation à partir de ce CV.
              </p>
            )}
          </section>
        </>
      )}
      {exportPdf.isPending && <Spinner label="Création du PDF…" />}
      <ConfirmDialog
        open={confirmDelete}
        title="Supprimer cette génération ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onConfirm={() => remove.mutate()}
        onClose={() => setConfirmDelete(false)}
      >
        Le CV ciblé et sa relecture seront effacés. Votre profil et l'offre sont conservés.
      </ConfirmDialog>
    </div>
  );
}
