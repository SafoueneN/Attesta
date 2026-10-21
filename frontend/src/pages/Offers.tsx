import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { jobs } from "../api/endpoints";
import { useDraft } from "../lib/draftStore";
import { useToast } from "../components/toasts";
import {
  Alert,
  Badge,
  Button,
  EmptyState,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  useDocumentTitle,
} from "../components/ui";
import { formatDateTime, formatDay } from "../lib/describe";

function OffersNav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `-mb-px border-b-2 px-4 py-2 text-sm font-semibold ${isActive ? "border-brand-700 text-brand-800 dark:text-brand-100" : "border-transparent text-slate-600 dark:text-slate-400"}`;
  return (
    <nav aria-label="Offres" className="mb-6 flex gap-2 border-b border-slate-200 dark:border-slate-800">
      <NavLink to="/offres" end className={cls}>
        Mes offres
      </NavLink>
      <NavLink to="/offres/collectees" className={cls}>
        Offres collectées
      </NavLink>
    </nav>
  );
}

/** Offres enregistrées par le candidat, avec leur analyse ; point de départ d'un CV ciblé. */
export function SavedOffers() {
  useDocumentTitle("Mes offres");
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const { setOfferId } = useDraft();
  const toast = useToast();
  const list = useQuery({ queryKey: ["offres"], queryFn: jobs.offers });
  const [open, setOpen] = useState<string | null>(null);
  const detail = useQuery({
    queryKey: ["offre", open],
    queryFn: () => jobs.offer(open!),
    enabled: Boolean(open),
  });
  const remove = useMutation({
    mutationFn: jobs.deleteOffer,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["offres"] });
      toast.success("Offre supprimée.");
    },
  });
  const target = (id: string) => {
    setOfferId(id);
    navigate("/cv/etape/4");
  };

  return (
    <div>
      <PageHeader
        title="Offres"
        lead="Les offres que vous visez, analysées une fois : exigences et mots-clés recopiés tels qu'écrits."
      />
      <OffersNav />
      {list.isPending && <Loading />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState
          title="Aucune offre enregistrée"
          action={
            <Link to="/cv/etape/3" className="link">
              Coller une offre
            </Link>
          }
        >
          Collez une annonce à l'étape 3 du parcours, ou reprenez une offre collectée.
        </EmptyState>
      )}
      <ul className="space-y-4">
        {list.data?.map((o) => (
          <li key={o.id} className="card">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold">{o.title}</h2>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {o.company ? `${o.company} · ` : ""}enregistrée le {formatDateTime(o.createdAt)} ·{" "}
                  {o.keywords} mots-clés
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button onClick={() => target(o.id)}>Générer un CV ciblé</Button>
                <Button
                  variant="secondary"
                  aria-expanded={open === o.id}
                  onClick={() => setOpen(open === o.id ? null : o.id)}
                >
                  {open === o.id ? "Masquer l'analyse" : "Voir l'analyse"}
                </Button>
                <Button
                  variant="ghost"
                  busy={remove.isPending && remove.variables === o.id}
                  onClick={() => remove.mutate(o.id)}
                >
                  Supprimer
                </Button>
              </div>
            </div>
            {open === o.id && detail.data && (
              <div className="mt-4 space-y-3 border-t border-slate-200 pt-4 dark:border-slate-800">
                {detail.data.analysis.requirements.length > 0 && (
                  <div>
                    <h3 className="font-semibold">Exigences</h3>
                    <ul className="mt-1 list-disc pl-5 text-sm">
                      {detail.data.analysis.requirements.map((r, i) => (
                        <li key={i}>
                          {r.text}{" "}
                          <Badge tone={r.priority === "must" ? "warning" : "neutral"}>
                            {r.priority === "must" ? "indispensable" : "apprécié"}
                          </Badge>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
                <div>
                  <h3 className="font-semibold">Mots-clés</h3>
                  <p className="mt-1 flex flex-wrap gap-1">
                    {detail.data.analysis.keywords.map((k) => (
                      <Badge key={k.term} tone="info">
                        {k.term}
                      </Badge>
                    ))}
                  </p>
                </div>
                {detail.data.providerKind === "demo" && (
                  <p className="text-sm text-slate-500">Analyse faite sans IA (mode démonstration).</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/** Offres collectées auprès de sources publiques (Bundesagentur für Arbeit, Adzuna). */
export function CollectedOffers() {
  useDocumentTitle("Offres collectées");
  const navigate = useNavigate();
  const { setOfferId } = useDraft();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [filters, setFilters] = useState<{ q?: string; country?: string }>({});
  const list = useQuery({ queryKey: ["postings", filters], queryFn: () => jobs.postings(filters) });
  const adopt = useMutation({
    mutationFn: jobs.fromPosting,
    onSuccess: (offer) => {
      setOfferId(offer.id);
      navigate("/cv/etape/4");
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setFilters({ q: q.trim() || undefined, country: country || undefined });
  };

  return (
    <div>
      <PageHeader
        title="Offres"
        lead="Offres récentes collectées par la veille auprès de sources publiques autorisées."
      />
      <OffersNav />
      <form onSubmit={submit} role="search" className="card mb-6 flex flex-wrap items-end gap-4">
        <div className="min-w-60 flex-1">
          <label htmlFor="recherche" className="label">
            Mots-clés
          </label>
          <input
            id="recherche"
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Node.js, comptable…"
          />
        </div>
        <div>
          <label htmlFor="pays" className="label">
            Pays
          </label>
          <select id="pays" className="input" value={country} onChange={(e) => setCountry(e.target.value)}>
            <option value="">Tous</option>
            <option value="DE">Allemagne</option>
            <option value="FR">France</option>
          </select>
        </div>
        <Button type="submit">Rechercher</Button>
      </form>
      {adopt.isError && <Alert tone="error">{errorMessage(adopt.error)}</Alert>}
      {list.isPending && <Loading />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState title="Aucune offre collectée">
          Les offres arrivent avec l'exécution quotidienne de la veille. Créez une veille, ou collez
          directement une annonce dans le parcours.
        </EmptyState>
      )}
      <ul className="grid gap-4 md:grid-cols-2">
        {list.data?.map((p) => (
          <li key={p.id} className="card flex flex-col gap-2">
            <h2 className="font-semibold">{p.title}</h2>
            <p className="text-sm text-slate-600 dark:text-slate-400">
              {[p.company, p.city, p.country].filter(Boolean).join(" · ")} · publiée le{" "}
              {formatDay(p.postedAt)}
            </p>
            <p className="line-clamp-3 text-sm">{p.excerpt}</p>
            {(p.salaryMinEur || p.salaryMaxEur) && (
              <p className="text-sm font-medium">
                Salaire publié : {p.salaryMinEur?.toLocaleString("fr-FR")} € brut/an
              </p>
            )}
            <p className="text-xs text-slate-500">
              Source : {p.source}
              {p.attribution && (
                <>
                  {" · "}
                  <a href={p.attribution.url} className="link" rel="noreferrer" target="_blank">
                    {p.attribution.text}
                  </a>
                </>
              )}
            </p>
            <div className="mt-auto flex flex-wrap gap-2 pt-2">
              <Button busy={adopt.isPending && adopt.variables === p.id} onClick={() => adopt.mutate(p.id)}>
                Cibler cette offre
              </Button>
              <a
                href={p.url}
                target="_blank"
                rel="noreferrer"
                className="rounded-lg px-4 py-2 text-sm font-semibold text-brand-700 hover:bg-brand-50 dark:text-brand-100 dark:hover:bg-slate-800"
              >
                Voir l'annonce<span className="sr-only"> (nouvel onglet)</span>
              </a>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
