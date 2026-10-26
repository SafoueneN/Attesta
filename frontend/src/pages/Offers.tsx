import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState, type FormEvent } from "react";
import { Link, NavLink, useNavigate } from "react-router";
import { jobs, profiles } from "../api/endpoints";
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

/** Compétences du profil (noms et mots-clés), pour repérer celles qu'une annonce cite. */
function useProfileSkills() {
  const stored = useQuery({ queryKey: ["profil"], queryFn: profiles.current, retry: false });
  return useMemo(() => {
    const terms = new Set<string>();
    for (const skill of stored.data?.profile.skills ?? [])
      for (const t of [skill.name, ...skill.keywords]) if (t && t.trim().length >= 2) terms.add(t.trim());
    return [...terms];
  }, [stored.data]);
}

const escape = (t: string) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
/** Compétences du profil citées telles quelles dans le texte (mot entier, sans tenir compte de la casse). */
function citedSkills(skills: string[], text: string) {
  return skills.filter((s) =>
    new RegExp(`(^|[^\\p{L}\\p{N}])${escape(s)}($|[^\\p{L}\\p{N}])`, "iu").test(text),
  );
}

function OffersNav() {
  const cls = ({ isActive }: { isActive: boolean }) =>
    `rounded-full px-4 py-2 text-sm font-semibold transition-colors duration-300 ${isActive ? "bg-accent text-on-accent" : "text-ink-muted hover:text-ink"}`;
  return (
    <nav
      aria-label="Offres"
      className="mb-6 inline-flex gap-1 rounded-full border border-line bg-surface p-1"
    >
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
      {list.isPending && <Loading variant="cards" />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data?.length === 0 && (
        <EmptyState
          illustration="search"
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
        {list.data?.map((o, i) => (
          <li
            key={o.id}
            className="card animate-enter transition-colors duration-300 hover:border-accent"
            style={{ animationDelay: `${i * 60}ms` }}
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <h2 className="flex items-center gap-3 text-lg font-semibold">
                  <span
                    aria-hidden="true"
                    className="icon-bounce grid size-9 shrink-0 place-items-center rounded-xl bg-accent-soft text-sm"
                  >
                    ▤
                  </span>
                  {o.title}
                </h2>
                <p className="text-sm text-ink-muted">
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
              <div className="mt-4 animate-enter space-y-3 border-t border-line pt-4">
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
                  <p className="text-sm text-ink-subtle">Analyse faite sans IA (mode démonstration).</p>
                )}
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

const PAGE = 30;
const COUNTRY_NAMES: Record<string, string> = {
  DE: "Allemagne",
  FR: "France",
  CA: "Canada",
  TN: "Tunisie",
};

export function CollectedOffers() {
  useDocumentTitle("Offres collectées");
  const navigate = useNavigate();
  const { setOfferId } = useDraft();
  const [q, setQ] = useState("");
  const [country, setCountry] = useState("");
  const [filters, setFilters] = useState<{ q?: string; country?: string }>({});
  // Catalogue complet, par pages de 30 (« Voir plus ») ; la base est synchronisée en continu (ADR 0034).
  const list = useInfiniteQuery({
    queryKey: ["postings", filters],
    queryFn: ({ pageParam }) => jobs.postings({ ...filters, offset: pageParam, limit: PAGE }),
    initialPageParam: 0,
    getNextPageParam: (last, all) => (last.length === PAGE ? all.length * PAGE : undefined),
  });
  const overview = useQuery({ queryKey: ["catalogue"], queryFn: jobs.overview, refetchInterval: 60_000 });
  const skills = useProfileSkills();
  const shown = list.data?.pages.flat() ?? [];
  const pick = (code: string) => {
    setCountry(code);
    setFilters({ q: q.trim() || undefined, country: code || undefined });
  };
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
      {overview.data && (
        <section aria-label="Catalogue des offres" className="mb-6 space-y-3">
          <div className="flex flex-wrap gap-2">
            {[{ country: "", count: overview.data.total }, ...overview.data.countries].map((c) => (
              <button
                key={c.country || "tous"}
                type="button"
                aria-pressed={country === c.country}
                onClick={() => pick(c.country)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition-colors ${country === c.country ? "bg-accent text-on-accent" : "border border-line text-ink-muted hover:text-ink"}`}
              >
                {c.country ? COUNTRY_NAMES[c.country] : "Toutes les régions"}{" "}
                <span className="tabular-nums opacity-80">{c.count.toLocaleString("fr-FR")}</span>
              </button>
            ))}
          </div>
          <p className="text-sm text-ink-muted">
            {overview.data.syncing
              ? "Synchronisation en cours : de nouvelles offres arrivent."
              : overview.data.lastSyncAt
                ? `Base synchronisée automatiquement toutes les 6 heures · dernière mise à jour le ${formatDateTime(overview.data.lastSyncAt)}.`
                : "Première synchronisation en attente."}
          </p>
        </section>
      )}
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
            <option value="CA">Canada</option>
            <option value="TN">Tunisie</option>
          </select>
        </div>
        <Button type="submit">Rechercher</Button>
      </form>
      {adopt.isError && <Alert tone="error">{errorMessage(adopt.error)}</Alert>}
      {list.isPending && <Loading variant="cards" />}
      {list.isError && <QueryError error={list.error} retry={() => void list.refetch()} />}
      {list.data && shown.length === 0 && (
        <EmptyState illustration="search" title="Aucune offre pour cette recherche">
          La base est synchronisée toutes les 6 heures dans les quatre pays. Essayez d'autres mots-clés ou un
          autre pays, ou collez directement une annonce dans le parcours.
        </EmptyState>
      )}
      <ul className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {shown.map((p, i) => {
          const cited = citedSkills(skills, `${p.title} ${p.excerpt}`);
          return (
            <li
              key={p.id}
              className="card tilt flex animate-enter flex-col gap-2"
              style={{ animationDelay: `${Math.min(i, 12) * 50}ms` }}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="rounded-full bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-muted">
                  {p.source}
                </span>
                <span className="text-xs text-ink-subtle">{formatDay(p.postedAt)}</span>
              </div>
              <h2 className="font-semibold">{p.title}</h2>
              <p className="text-sm text-ink-muted">
                {[p.company, p.city, p.country].filter(Boolean).join(" · ")} · publiée le{" "}
                {formatDay(p.postedAt)}
              </p>
              <p className="line-clamp-3 text-sm">{p.excerpt}</p>
              {/* Compétences du profil que l'annonce cite : indication, pas une note. */}
              {skills.length > 0 && (
                <div className="rounded-2xl bg-surface-sunken p-3">
                  <p className="text-xs font-semibold text-ink-muted">
                    {cited.length === 0
                      ? "Aucune de vos compétences n'est citée telle quelle."
                      : `${cited.length} de vos compétences citée${cited.length > 1 ? "s" : ""} dans l'annonce`}
                  </p>
                  {cited.length > 0 && (
                    <ul className="mt-2 flex flex-wrap gap-1.5">
                      {cited.slice(0, 8).map((c) => (
                        <li
                          key={c}
                          className="animate-pop rounded-full bg-proved-soft px-2 py-0.5 text-xs font-bold text-proved"
                        >
                          ✓ {c}
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
              {(p.salaryMinEur || p.salaryMaxEur) && (
                <p className="text-sm font-medium">
                  Salaire publié : {p.salaryMinEur?.toLocaleString("fr-FR")} € brut/an
                </p>
              )}
              <p className="text-xs text-ink-subtle">
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
                  className="rounded-full px-4 py-2 text-sm font-semibold text-accent-text hover:bg-accent-soft"
                >
                  Voir l'annonce<span className="sr-only"> (nouvel onglet)</span>
                </a>
              </div>
            </li>
          );
        })}
      </ul>
      {list.hasNextPage && (
        <div className="mt-8 flex justify-center">
          <Button
            variant="secondary"
            busy={list.isFetchingNextPage}
            onClick={() => void list.fetchNextPage()}
          >
            Voir plus d'offres
          </Button>
        </div>
      )}
    </div>
  );
}
