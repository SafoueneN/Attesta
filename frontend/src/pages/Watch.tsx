import { SubscriptionInput, WATCH_RADII } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../api/client";
import { jobs, watch } from "../api/endpoints";
import { useToast } from "../components/toasts";
import {
  Alert,
  apiFieldErrors,
  Badge,
  Button,
  ErrorSummary,
  errorMessage,
  Loading,
  PageHeader,
  TextField,
  useDocumentTitle,
} from "../components/ui";
import { formatDay } from "../lib/describe";
import type { FieldError } from "../lib/profileForm";

const STATUS: Record<string, [string, "success" | "warning" | "neutral" | "error"]> = {
  active: ["Active", "success"],
  en_attente: ["En attente de confirmation", "warning"],
  desabonnee: ["Arrêtée", "neutral"],
  suspendue: ["Suspendue (adresse injoignable)", "error"],
};

/** Champ de ville avec suggestions du référentiel (villes de plus de 15 000 habitants). */
function CityField({
  country,
  value,
  onChange,
  errors,
}: {
  country: string;
  value: string;
  onChange: (v: string) => void;
  errors: FieldError[];
}) {
  const listId = useId();
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), 250);
    return () => clearTimeout(t);
  }, [value]);
  const suggestions = useQuery({
    queryKey: ["villes", country, debounced],
    queryFn: () => jobs.cities(country, debounced),
    enabled: debounced.trim().length >= 2,
    staleTime: 60 * 60 * 1000,
  });
  return (
    <>
      <TextField
        id="city"
        label="Ville"
        hint="Une ville de plus de 15 000 habitants ; à défaut, la plus proche."
        list={listId}
        autoComplete="off"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        errors={errors}
      />
      <datalist id={listId}>
        {suggestions.data?.map((c) => (
          <option key={`${c.nom}-${c.lat}`} value={c.nom} />
        ))}
      </datalist>
    </>
  );
}

export function WatchPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["veille"], queryFn: watch.subscription, retry: false });
  const matches = useQuery({ queryKey: ["veille", "offres"], queryFn: watch.matches });
  const [form, setForm] = useState({
    occupations: "",
    country: "DE",
    city: "",
    radiusKm: 25,
    workingTime: "indifferent",
    consent: false,
  });
  const [errors, setErrors] = useState<FieldError[]>([]);
  useDocumentTitle("Veille emploi", errors.length > 0);

  useEffect(() => {
    const s = current.data;
    if (s)
      setForm({
        occupations: s.occupations.join(", "),
        country: s.country,
        city: s.city,
        radiusKm: s.radiusKm,
        workingTime: s.workingTime,
        consent: false,
      });
  }, [current.data]);

  const save = useMutation({
    mutationFn: watch.save,
    onSuccess: (result) => {
      queryClient.setQueryData(["veille"], result.subscription);
      toast.success(
        result.confirmationSent
          ? "Un e-mail de confirmation vient de vous être envoyé : la veille démarrera quand vous aurez cliqué sur son lien."
          : "Vos critères de veille sont mis à jour.",
      );
    },
    onError: (error) => setErrors(apiFieldErrors(error)),
  });
  const stop = useMutation({
    mutationFn: watch.stop,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["veille"] });
      toast.success(
        "Vous ne recevrez plus de rapport de veille. Votre compte et votre profil sont conservés.",
      );
    },
  });

  const submit = (e: FormEvent) => {
    e.preventDefault();
    const input = {
      ...form,
      occupations: form.occupations
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const parsed = SubscriptionInput.safeParse(input);
    const found = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({ field: String(i.path[0]), message: i.message }));
    setErrors(found);
    if (parsed.success) save.mutate(input as SubscriptionInput);
  };

  const s = current.data;
  const missing = current.error instanceof ApiError && current.error.status === 404;
  return (
    <div className="space-y-8">
      <PageHeader
        title="Veille emploi"
        lead="Chaque jour, les nouvelles offres proches de votre profil, classées et accompagnées des compétences à acquérir. Jamais d'e-mail vide."
      />
      {current.isPending && <Loading />}
      {s && (
        <div className="card flex flex-wrap items-center gap-3">
          <span className="font-semibold">État de votre veille :</span>
          <Badge tone={STATUS[s.status]?.[1] ?? "neutral"}>{STATUS[s.status]?.[0] ?? s.status}</Badge>
          {s.status === "en_attente" && (
            <span className="text-sm">Cliquez sur le lien reçu par e-mail (valable 48 heures).</span>
          )}
          {(s.status === "active" || s.status === "en_attente") && (
            <Button
              variant="secondary"
              className="ml-auto"
              busy={stop.isPending}
              onClick={() => stop.mutate()}
            >
              Arrêter la veille
            </Button>
          )}
        </div>
      )}
      {(s || missing) && (
        <form noValidate onSubmit={submit} className="card space-y-5">
          <h2 className="text-lg font-bold">{s ? "Modifier mes critères" : "Créer ma veille"}</h2>
          <ErrorSummary errors={errors} />
          {save.isError && !errors.length && (
            <Alert tone="error">
              {errorMessage(save.error)}{" "}
              {save.error instanceof ApiError && save.error.code === "profil_absent" && (
                <Link to="/cv" className="link">
                  Renseigner mon profil
                </Link>
              )}
            </Alert>
          )}
          <TextField
            id="occupations"
            label="Métiers recherchés"
            hint="Jusqu'à 5, séparés par des virgules : « Développeur back-end, Backend-Entwickler »"
            value={form.occupations}
            onChange={(e) => setForm({ ...form, occupations: e.target.value })}
            errors={errors}
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label htmlFor="country" className="label">
                Pays
              </label>
              <select
                id="country"
                className="input"
                value={form.country}
                onChange={(e) => setForm({ ...form, country: e.target.value })}
              >
                <option value="DE">Allemagne</option>
                <option value="FR">France</option>
              </select>
            </div>
            <CityField
              country={form.country}
              value={form.city}
              onChange={(city) => setForm({ ...form, city })}
              errors={errors}
            />
            <div>
              <label htmlFor="radiusKm" className="label">
                Rayon
              </label>
              <select
                id="radiusKm"
                className="input"
                value={form.radiusKm}
                onChange={(e) => setForm({ ...form, radiusKm: Number(e.target.value) })}
              >
                {WATCH_RADII.map((r) => (
                  <option key={r} value={r}>
                    {r} km
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="workingTime" className="label">
                Temps de travail
              </label>
              <select
                id="workingTime"
                className="input"
                value={form.workingTime}
                onChange={(e) => setForm({ ...form, workingTime: e.target.value })}
              >
                <option value="indifferent">Indifférent</option>
                <option value="plein">Temps plein</option>
                <option value="partiel">Temps partiel</option>
              </select>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <input
              id="consent"
              type="checkbox"
              className="mt-1 size-5 accent-brand-700"
              checked={form.consent}
              onChange={(e) => setForm({ ...form, consent: e.target.checked })}
              aria-invalid={errors.some((e) => e.field === "consent") || undefined}
            />
            <label htmlFor="consent">
              J'accepte de recevoir la veille par e-mail. Je pourrai me désabonner à tout moment, en un clic,
              depuis chaque e-mail.
            </label>
          </div>
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Le classement utilise votre profil enregistré, sans votre nom ni vos coordonnées ni vos
            employeurs.
          </p>
          <Button type="submit" busy={save.isPending}>
            {s ? "Mettre à jour" : "Créer ma veille"}
          </Button>
        </form>
      )}
      <section aria-labelledby="recues">
        <h2 id="recues" className="text-xl font-bold">
          Offres reçues ces 30 derniers jours
        </h2>
        {matches.data?.length === 0 && (
          <p className="mt-2 text-slate-600 dark:text-slate-400">Aucune offre envoyée pour le moment.</p>
        )}
        <ul className="mt-4 space-y-3">
          {matches.data?.map((m) => (
            <li key={`${m.runDate}-${m.rank}-${m.url}`} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-60 flex-1">
                <a href={m.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                  {m.title}
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
                <p className="text-sm text-slate-600 dark:text-slate-400">
                  {[m.company, m.city].filter(Boolean).join(" · ")} · reçue le {formatDay(m.runDate)}
                </p>
                {m.missingSkills.length > 0 && (
                  <p className="mt-1 text-sm">À acquérir : {m.missingSkills.join(", ")}</p>
                )}
              </div>
              {m.rerankScore !== null && <Badge tone="info">Pertinence {m.rerankScore}/100</Badge>}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

/** Lien des e-mails : confirmation (double opt-in) ou désabonnement, sans connexion. */
export function WatchLink({ action }: { action: "confirmer" | "desabonner" }) {
  const { token = "" } = useParams();
  const run = useMutation({
    mutationFn: () => (action === "confirmer" ? watch.confirm(token) : watch.unsubscribe(token)),
  });
  const title = action === "confirmer" ? "Confirmer ma veille emploi" : "Me désabonner";
  useDocumentTitle(
    run.isSuccess ? (action === "confirmer" ? "Veille confirmée" : "Désabonnement confirmé") : title,
  );
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title={title} />
      {run.isSuccess ? (
        <Alert tone="success">
          {action === "confirmer"
            ? "Votre veille emploi est active. Vous recevrez un e-mail les jours où de nouvelles offres correspondent à votre profil, jamais d'e-mail vide."
            : "Vous ne recevrez plus de rapport de veille. Votre compte et votre profil sont conservés."}
        </Alert>
      ) : (
        <div className="card space-y-4">
          <p>
            {action === "confirmer"
              ? "Confirmez que vous souhaitez recevoir chaque jour les nouvelles offres correspondant à votre profil."
              : "Confirmez que vous ne souhaitez plus recevoir les rapports de veille."}
          </p>
          {run.isError && <Alert tone="error">{errorMessage(run.error)}</Alert>}
          <Button busy={run.isPending} onClick={() => run.mutate()}>
            {action === "confirmer" ? "Confirmer ma veille" : "Me désabonner"}
          </Button>
        </div>
      )}
    </div>
  );
}
