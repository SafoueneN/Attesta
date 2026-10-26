import { SubscriptionInput, WATCH_RADII } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router";
import { ApiError } from "../api/client";
import { auth, jobs, profiles, watch } from "../api/endpoints";
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

/**
 * Aperçu du rapport quotidien, mis à jour pendant la saisie (adresse, métiers, ville). Décoratif : il
 * illustre ce qui arrivera, sans données réelles ; les vraies offres sont listées plus bas.
 */
function MailPreview({ to, occupations, city }: { to: string; occupations: string; city: string }) {
  const job = occupations.split(/[\n,;]/)[0]?.trim() || "Votre métier";
  const place = city.trim() || "votre ville";
  return (
    <aside aria-label="Aperçu de l'e-mail quotidien" className="lg:sticky lg:top-24">
      <p className="eyebrow mb-3">Aperçu de l'e-mail</p>
      <div aria-hidden="true" className="card tilt overflow-hidden p-0">
        <div className="flex items-center gap-2 border-b border-line bg-surface-sunken px-4 py-2.5">
          <span className="size-2.5 rounded-full bg-removed/70" />
          <span className="size-2.5 rounded-full bg-flagged/70" />
          <span className="size-2.5 rounded-full bg-proved/70" />
        </div>
        <div className="space-y-1 border-b border-line px-5 py-4 text-sm">
          <p>
            <span className="text-ink-muted">De :</span> Attesta
          </p>
          <p className="truncate">
            <span className="text-ink-muted">À :</span> <span className="font-semibold">{to}</span>
          </p>
          <p className="font-semibold">Attesta – 3 nouvelles offres</p>
        </div>
        <div className="space-y-3 px-5 py-4">
          {[0, 1, 2].map((i) => (
            <div
              key={`${job}-${i}`}
              className="animate-enter rounded-xl border border-line p-3"
              style={{ animationDelay: `${i * 90}ms` }}
            >
              <p className="text-sm font-semibold">
                {job}
                {i ? ` (${["H/F", "m/w/d"][i - 1]})` : ""}
              </p>
              <p className="text-xs text-ink-muted">{place}</p>
            </div>
          ))}
          <div className="flex flex-wrap gap-2 pt-1">
            {["offres.pdf", "points-a-ameliorer.pdf"].map((f) => (
              <span
                key={f}
                className="rounded-lg bg-removed-soft px-2 py-1 text-[0.7rem] font-bold text-removed"
              >
                PDF · {f}
              </span>
            ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

export function WatchPage() {
  const toast = useToast();
  const queryClient = useQueryClient();
  const current = useQuery({ queryKey: ["veille"], queryFn: watch.subscription, retry: false });
  const matches = useQuery({ queryKey: ["veille", "offres"], queryFn: watch.matches });
  // Mêmes clés que les pages Compte et Parcours : aucune requête de plus si elles sont déjà en cache.
  const me = useQuery({ queryKey: ["moi"], queryFn: auth.me });
  const profile = useQuery({ queryKey: ["profil"], queryFn: profiles.current, retry: false });
  const [form, setForm] = useState({
    occupations: "",
    country: "DE",
    city: "",
    radiusKm: 25,
    workingTime: "indifferent",
    email: "",
    consent: false,
  });
  const [emailTouched, setEmailTouched] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  useDocumentTitle("Veille emploi", errors.length > 0);

  useEffect(() => {
    const s = current.data;
    if (s)
      setForm((f) => ({
        ...f,
        occupations: s.occupations.join(", "),
        country: s.country,
        city: s.city,
        radiusKm: s.radiusKm,
        workingTime: s.workingTime,
        consent: false,
      }));
  }, [current.data]);

  // Adresse de réception proposée : celle de la veille, sinon l'e-mail du profil, sinon celle du compte.
  // Compte par identifiant (ADR 0030) : pas d'adresse de compte, celle de la veille est obligatoire.
  const accountEmail = me.data?.email ?? undefined;
  const suggestedEmail = current.data?.email ?? profile.data?.profile.basics.email ?? accountEmail ?? "";
  useEffect(() => {
    if (!emailTouched) setForm((f) => ({ ...f, email: suggestedEmail }));
  }, [suggestedEmail, emailTouched]);

  const save = useMutation({
    mutationFn: watch.save,
    onSuccess: (result) => {
      queryClient.setQueryData(["veille"], result.subscription);
      setEmailTouched(false);
      const to = result.subscription.email ?? accountEmail;
      const sentTo = to ? ` à ${to}` : "";
      // Veille active tout de suite (ADR 0030) : le premier rapport part au prochain passage.
      toast.success(`Votre veille est active : les rapports seront envoyés${sentTo}.`);
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
      // Champ vidé : la veille suit l'adresse du compte.
      email: form.email.trim() || undefined,
      occupations: form.occupations
        .split(/[\n,;]/)
        .map((s) => s.trim())
        .filter(Boolean),
    };
    const parsed = SubscriptionInput.safeParse(input);
    const found = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({ field: String(i.path[0]), message: i.message }));
    if (!input.email && !accountEmail && !found.some((e) => e.field === "email"))
      found.push({
        field: "email",
        message: "Indiquez l'adresse e-mail où recevoir vos rapports de veille.",
      });
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
        <div className="card flex animate-enter flex-wrap items-center gap-3">
          {/* Point vivant : pulse quand la veille tourne, fixe sinon (décoratif, l'état est écrit). */}
          <span
            aria-hidden="true"
            className={`live-dot ${s.status === "active" ? "text-proved" : s.status === "en_attente" ? "text-flagged" : "text-ink-subtle [animation:none]"}`}
          />
          <span className="font-semibold">État de votre veille :</span>
          <Badge tone={STATUS[s.status]?.[1] ?? "neutral"}>{STATUS[s.status]?.[0] ?? s.status}</Badge>
          {s.status === "en_attente" && (
            <span className="text-sm">Cliquez sur le lien reçu par e-mail (valable 48 heures).</span>
          )}
          {(s.email ?? accountEmail) && (
            <span className="basis-full text-sm text-ink-muted">
              Adresse de réception : <span className="font-semibold text-ink">{s.email ?? accountEmail}</span>
            </span>
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
        <div className="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(18rem,26rem)]">
          <form noValidate onSubmit={submit} className="card animate-enter space-y-5">
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
                  <option value="CA">Canada</option>
                  <option value="TN">Tunisie</option>
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
            <TextField
              id="email"
              label="Adresse de réception des rapports"
              type="email"
              autoComplete="email"
              hint="Proposée depuis votre profil, modifiable. C'est aussi là que partent vos rappels. Les rapports y partent directement, sans confirmation."
              value={form.email}
              onChange={(e) => {
                setEmailTouched(true);
                setForm({ ...form, email: e.target.value });
              }}
              errors={errors}
            />
            <div className="flex items-start gap-3">
              <input
                id="consent"
                type="checkbox"
                className="mt-1 size-5 accent-accent-text"
                checked={form.consent}
                onChange={(e) => setForm({ ...form, consent: e.target.checked })}
                aria-invalid={errors.some((e) => e.field === "consent") || undefined}
              />
              <label htmlFor="consent">
                J'accepte de recevoir la veille par e-mail. Je pourrai me désabonner à tout moment, en un
                clic, depuis chaque e-mail.
              </label>
            </div>
            <p className="text-sm text-ink-muted">
              Le classement utilise votre profil enregistré, sans votre nom ni vos coordonnées ni vos
              employeurs.
            </p>
            <Button type="submit" busy={save.isPending}>
              {s ? "Mettre à jour" : "Créer ma veille"}
            </Button>
          </form>
          <MailPreview
            to={form.email.trim() || accountEmail || "votre adresse"}
            occupations={form.occupations}
            city={form.city}
          />
        </div>
      )}
      <section aria-labelledby="recues">
        <h2 id="recues" className="text-xl font-bold">
          Offres reçues ces 30 derniers jours
        </h2>
        {matches.data?.length === 0 && (
          <p className="mt-2 text-ink-muted">Aucune offre envoyée pour le moment.</p>
        )}
        <ul className="mt-4 space-y-3">
          {matches.data?.map((m) => (
            <li key={`${m.runDate}-${m.rank}-${m.url}`} className="card flex flex-wrap items-center gap-3">
              <div className="min-w-60 flex-1">
                <a href={m.url} target="_blank" rel="noreferrer" className="font-semibold hover:underline">
                  {m.title}
                  <span className="sr-only"> (nouvel onglet)</span>
                </a>
                <p className="text-sm text-ink-muted">
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
