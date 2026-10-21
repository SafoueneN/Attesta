import type { GenerationEvent } from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { ApiError } from "../api/client";
import { jobs, letters, profiles } from "../api/endpoints";
import { streamGeneration } from "../api/sse";
import { useSession } from "../auth/session";
import { useToast } from "../components/toasts";
import {
  Alert,
  apiFieldErrors,
  Button,
  ErrorSummary,
  errorMessage,
  PageHeader,
  Spinner,
  TextArea,
  TextField,
  useDocumentTitle,
} from "../components/ui";
import { useDraft } from "../lib/draftStore";
import {
  draftFromImported,
  draftFromProfile,
  emptyEducation,
  emptyWork,
  validateStep,
  validProfile,
  type Draft,
  type FieldError,
} from "../lib/profileForm";

const STEPS = ["Profil", "Expériences et formations", "Offre visée", "Génération"];

function Stepper({ step }: { step: number }) {
  return (
    <nav aria-label="Étapes du parcours" className="mb-8">
      <p className="mb-3 text-sm font-semibold text-slate-600 dark:text-slate-400">
        Étape {step} sur {STEPS.length}
      </p>
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={label}>
              <div
                className={`h-1.5 rounded-full ${state === "todo" ? "bg-slate-200 dark:bg-slate-800" : "bg-brand-600"}`}
                aria-hidden="true"
              />
              {n < step ? (
                <Link
                  to={`/cv/etape/${n}`}
                  className="mt-2 block text-sm text-brand-700 underline dark:text-brand-100"
                >
                  {label}
                </Link>
              ) : (
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className={`mt-2 block text-sm ${state === "current" ? "font-semibold" : "text-slate-500"}`}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepNav({ step, busy, next = "Continuer" }: { step: number; busy?: boolean; next?: string }) {
  return (
    <div className="mt-8 flex flex-wrap justify-between gap-3">
      {step > 1 ? (
        <Link
          to={`/cv/etape/${step - 1}`}
          className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
        >
          Étape précédente
        </Link>
      ) : (
        <span />
      )}
      <Button type="submit" busy={busy}>
        {next}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card space-y-4">
      <legend className="sr-only">{title}</legend>
      <h2 className="text-lg font-bold">{title}</h2>
      {children}
    </fieldset>
  );
}

/** Reprend le profil enregistré si le brouillon est vide (nouvel onglet, autre appareil). */
function useRestoreProfile() {
  const { restored, replace, draft } = useDraft();
  const stored = useQuery({ queryKey: ["profil"], queryFn: profiles.current, retry: false });
  useEffect(() => {
    if (!restored && stored.data) replace(draftFromProfile(stored.data.profile, draft.offer));
  }, [restored, stored.data, replace, draft.offer]);
}

export function Builder() {
  const { step: raw = "1" } = useParams();
  const step = Number(raw);
  useRestoreProfile();
  if (![1, 2, 3, 4].includes(step)) return <Navigate to="/cv/etape/1" replace />;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader
        title="Créer un CV ciblé"
        lead="Votre profil est la seule source : rien n'est ajouté, tout est vérifié."
      />
      <Stepper step={step} />
      {step === 1 && <StepProfile />}
      {step === 2 && <StepParcours />}
      {step === 3 && <StepOffer />}
      {step === 4 && <StepGenerate />}
    </div>
  );
}

/** Étape 1 : identité, titre et résumé, ou import d'un CV PDF. */
function StepProfile() {
  const { draft, update } = useDraft();
  const navigate = useNavigate();
  const toast = useToast();
  const [errors, setErrors] = useState<FieldError[]>([]);
  useDocumentTitle("Étape 1 sur 4 : Profil", errors.length > 0);
  const fileInput = useRef<HTMLInputElement>(null);
  const importer = useMutation({
    mutationFn: profiles.importPdf,
    onSuccess: (result) => {
      update((d) => draftFromImported(result.profile, d));
      toast.success(
        `Profil pré-rempli à partir de votre CV. Relisez chaque champ.${result.dropped ? ` ${result.dropped} élément(s) absent(s) de votre PDF ont été écarté(s).` : ""}`,
      );
    },
  });
  const set = (key: keyof Draft["basics"]) => (e: { target: { value: string } }) =>
    update((d) => ({ ...d, basics: { ...d.basics, [key]: e.target.value } }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = validateStep(draft, 1);
    setErrors(found);
    if (!found.length) navigate("/cv/etape/2");
  };
  const f = (key: keyof Draft["basics"]) => ({
    id: `basics-${key}`,
    value: draft.basics[key],
    onChange: set(key),
    errors,
  });

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <ErrorSummary errors={errors} />
      <Section title="Importer un CV existant">
        <p className="text-sm text-slate-600 dark:text-slate-400">
          PDF de 5 Mo au plus. Le texte est extrait, puis chaque élément proposé est vérifié dans votre PDF ;
          rien n'est enregistré sans votre relecture.
        </p>
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          className="sr-only"
          id="cv-pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importer.mutate(file);
            e.target.value = "";
          }}
        />
        <div className="flex flex-wrap items-center gap-3">
          <Button variant="secondary" busy={importer.isPending} onClick={() => fileInput.current?.click()}>
            Importer mon CV PDF
          </Button>
          {importer.isPending && <span className="text-sm">Analyse du PDF…</span>}
        </div>
        {importer.isError && (
          <Alert
            tone={importer.error instanceof ApiError && importer.error.status === 503 ? "warning" : "error"}
          >
            {errorMessage(importer.error)}
          </Alert>
        )}
      </Section>
      <Section title="Vous">
        <TextField label="Nom et prénom" autoComplete="name" {...f("name")} />
        <TextField
          label="Titre professionnel"
          optional
          hint="Par exemple : Développeuse back-end"
          {...f("label")}
        />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Adresse e-mail" optional type="email" autoComplete="email" {...f("email")} />
          <TextField label="Téléphone" optional type="tel" autoComplete="tel" {...f("phone")} />
          <TextField label="Ville" optional autoComplete="address-level2" {...f("city")} />
          <TextField
            label="Code pays"
            optional
            hint="Deux lettres : FR, DE…"
            maxLength={2}
            {...f("countryCode")}
          />
        </div>
        <TextField label="Site ou portfolio" optional type="url" hint="https://…" {...f("url")} />
        <TextArea label="Résumé" optional rows={4} {...f("summary")} />
      </Section>
      <StepNav step={1} />
    </form>
  );
}

/** Étape 2 : expériences, formations, compétences et langues ; le profil complet est enregistré. */
function StepParcours() {
  const { draft, update } = useDraft();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldError[]>([]);
  useDocumentTitle("Étape 2 sur 4 : Expériences et formations", errors.length > 0);
  const save = useMutation({
    mutationFn: profiles.save,
    onSuccess: (stored) => {
      queryClient.setQueryData(["profil"], stored);
      toast.success(`Profil enregistré (version ${stored.version}).`);
      navigate("/cv/etape/3");
    },
    onError: (error) =>
      setErrors(apiFieldErrors(error, (c) => c.replace(/^profile\./, "").replace(/\./g, "-"))),
  });

  const setWork = (i: number, key: keyof Draft["work"][number]) => (e: { target: { value: string } }) =>
    update((d) => ({ ...d, work: d.work.map((w, j) => (j === i ? { ...w, [key]: e.target.value } : w)) }));
  const setEducation =
    (i: number, key: keyof Draft["education"][number]) => (e: { target: { value: string } }) =>
      update((d) => ({
        ...d,
        education: d.education.map((w, j) => (j === i ? { ...w, [key]: e.target.value } : w)),
      }));

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const found = [
      ...validateStep(draft, 1).map((e) => ({ ...e, message: `Étape 1 : ${e.message}` })),
      ...validateStep(draft, 2),
    ];
    setErrors(found);
    const profile = validProfile(draft);
    if (!found.length && profile) save.mutate(profile);
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <ErrorSummary errors={errors} />
      {save.isError && !errors.length && <Alert tone="error">{errorMessage(save.error)}</Alert>}
      {draft.work.map((w, i) => (
        <Section key={i} title={`Expérience ${i + 1}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={`work-${i}-position`}
              label="Poste"
              value={w.position}
              onChange={setWork(i, "position")}
              errors={errors}
            />
            <TextField
              id={`work-${i}-name`}
              label="Employeur"
              value={w.name}
              onChange={setWork(i, "name")}
              errors={errors}
            />
            <TextField
              id={`work-${i}-startDate`}
              label="Début"
              hint="AAAA-MM, par exemple 2021-03"
              value={w.startDate}
              onChange={setWork(i, "startDate")}
              errors={errors}
            />
            <TextField
              id={`work-${i}-endDate`}
              label="Fin"
              optional
              hint="Vide si en cours"
              value={w.endDate}
              onChange={setWork(i, "endDate")}
              errors={errors}
            />
          </div>
          <TextField
            id={`work-${i}-location`}
            label="Lieu"
            optional
            value={w.location}
            onChange={setWork(i, "location")}
            errors={errors}
          />
          <TextArea
            id={`work-${i}-highlights`}
            label="Réalisations"
            optional
            hint="Une réalisation par ligne, avec vos chiffres réels."
            rows={4}
            value={w.highlights}
            onChange={setWork(i, "highlights")}
            errors={errors}
          />
          {draft.work.length > 1 && (
            <Button
              variant="ghost"
              onClick={() => update((d) => ({ ...d, work: d.work.filter((_, j) => j !== i) }))}
            >
              Retirer l'expérience {i + 1}
            </Button>
          )}
        </Section>
      ))}
      <Button variant="secondary" onClick={() => update((d) => ({ ...d, work: [...d.work, emptyWork()] }))}>
        Ajouter une expérience
      </Button>
      {draft.education.map((e, i) => (
        <Section key={i} title={`Formation ${i + 1}`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <TextField
              id={`education-${i}-institution`}
              label="Établissement"
              value={e.institution}
              onChange={setEducation(i, "institution")}
              errors={errors}
            />
            <TextField
              id={`education-${i}-studyType`}
              label="Diplôme"
              optional
              value={e.studyType}
              onChange={setEducation(i, "studyType")}
              errors={errors}
            />
            <TextField
              id={`education-${i}-area`}
              label="Domaine"
              optional
              value={e.area}
              onChange={setEducation(i, "area")}
              errors={errors}
            />
            <TextField
              id={`education-${i}-endDate`}
              label="Année d'obtention"
              optional
              hint="AAAA"
              value={e.endDate}
              onChange={setEducation(i, "endDate")}
              errors={errors}
            />
          </div>
          {draft.education.length > 1 && (
            <Button
              variant="ghost"
              onClick={() => update((d) => ({ ...d, education: d.education.filter((_, j) => j !== i) }))}
            >
              Retirer la formation {i + 1}
            </Button>
          )}
        </Section>
      ))}
      <Button
        variant="secondary"
        onClick={() => update((d) => ({ ...d, education: [...d.education, emptyEducation()] }))}
      >
        Ajouter une formation
      </Button>
      <Section title="Compétences et langues">
        <TextArea
          id="skills"
          label="Compétences"
          optional
          hint="Une par ligne : « Node.js : Express, PostgreSQL »"
          rows={4}
          value={draft.skills}
          onChange={(e) => update((d) => ({ ...d, skills: e.target.value }))}
          errors={errors}
        />
        <TextArea
          id="languages"
          label="Langues"
          optional
          hint="Une par ligne : « Anglais : C1 »"
          rows={3}
          value={draft.languages}
          onChange={(e) => update((d) => ({ ...d, languages: e.target.value }))}
          errors={errors}
        />
      </Section>
      <StepNav step={2} busy={save.isPending} next="Enregistrer et continuer" />
    </form>
  );
}

/** Étape 3 : offre collée (analysée par le service) ou offre déjà enregistrée. */
function StepOffer() {
  const { draft, update, offerId, setOfferId } = useDraft();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const queryClient = useQueryClient();
  const [errors, setErrors] = useState<FieldError[]>([]);
  useDocumentTitle("Étape 3 sur 4 : Offre visée", errors.length > 0);
  const saved = useQuery({ queryKey: ["offres"], queryFn: jobs.offers });
  const fromUrl = params.get("offre");
  useEffect(() => {
    if (fromUrl) setOfferId(fromUrl);
  }, [fromUrl, setOfferId]);
  const create = useMutation({
    mutationFn: () => jobs.createOffer(draft.offer.rawText.trim(), draft.offer.sourceUrl.trim() || undefined),
    onSuccess: (offer) => {
      void queryClient.invalidateQueries({ queryKey: ["offres"] });
      setOfferId(offer.id);
      navigate("/cv/etape/4");
    },
    onError: (error) => setErrors(apiFieldErrors(error, (c) => `offer-${c}`)),
  });
  const [mode, setMode] = useState<"nouvelle" | "existante">(
    offerId && !draft.offer.rawText ? "existante" : "nouvelle",
  );

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (mode === "existante") {
      if (!offerId)
        return setErrors([{ field: "offer-existing", message: "Choisissez une offre enregistrée." }]);
      return navigate("/cv/etape/4");
    }
    const found = validateStep(draft, 3);
    setErrors(found);
    if (!found.length) create.mutate();
  };

  return (
    <form noValidate onSubmit={submit} className="space-y-6">
      <ErrorSummary errors={errors} />
      {create.isError && !errors.length && <Alert tone="error">{errorMessage(create.error)}</Alert>}
      <fieldset className="card">
        <legend className="text-lg font-bold">Quelle offre visez-vous ?</legend>
        <div className="mt-4 flex flex-wrap gap-6">
          {(["nouvelle", "existante"] as const).map((m) => (
            <label key={m} className="flex items-center gap-2">
              <input
                type="radio"
                name="mode"
                checked={mode === m}
                onChange={() => setMode(m)}
                className="size-4 accent-brand-700"
              />
              {m === "nouvelle" ? "Coller une nouvelle offre" : "Reprendre une offre enregistrée"}
            </label>
          ))}
        </div>
      </fieldset>
      {mode === "nouvelle" ? (
        <Section title="Texte de l'offre">
          <TextArea
            id="offer-rawText"
            label="Annonce complète"
            hint="Collez tout le texte : missions, exigences, conditions. Il est traité comme une donnée, jamais comme une consigne."
            rows={12}
            value={draft.offer.rawText}
            onChange={(e) => update((d) => ({ ...d, offer: { ...d.offer, rawText: e.target.value } }))}
            errors={errors}
          />
          <TextField
            id="offer-sourceUrl"
            label="Lien de l'annonce"
            optional
            type="url"
            value={draft.offer.sourceUrl}
            onChange={(e) => update((d) => ({ ...d, offer: { ...d.offer, sourceUrl: e.target.value } }))}
            errors={errors}
          />
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Pas d'offre sous la main ?{" "}
            <Link to="/offres/collectees" className="link">
              Parcourez les offres collectées
            </Link>
            .
          </p>
        </Section>
      ) : (
        <Section title="Offres enregistrées">
          {saved.isPending && <Spinner label="Chargement des offres…" />}
          {saved.data?.length === 0 && <p>Aucune offre enregistrée pour le moment.</p>}
          {saved.data && saved.data.length > 0 && (
            <div>
              <label htmlFor="offer-existing" className="label">
                Offre
              </label>
              <select
                id="offer-existing"
                className="input"
                value={offerId ?? ""}
                onChange={(e) => setOfferId(e.target.value || null)}
                aria-invalid={errors.some((e) => e.field === "offer-existing") || undefined}
              >
                <option value="">Choisissez une offre</option>
                {saved.data.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.title}
                    {o.company ? ` – ${o.company}` : ""}
                  </option>
                ))}
              </select>
            </div>
          )}
        </Section>
      )}
      <StepNav
        step={3}
        busy={create.isPending}
        next={mode === "nouvelle" ? "Analyser l'offre et continuer" : "Continuer"}
      />
    </form>
  );
}

/** Étape 4 : génération avec progression en direct, ou export sans adaptation. */
function StepGenerate() {
  const { offerId } = useDraft();
  const { isAccount } = useSession();
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<string[]>([]);
  const [running, setRunning] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const abort = useRef<AbortController | null>(null);
  useDocumentTitle("Étape 4 sur 4 : Génération", failure !== null);
  useEffect(() => () => abort.current?.abort(), []);
  const offer = useQuery({
    queryKey: ["offre", offerId],
    queryFn: () => jobs.offer(offerId!),
    enabled: Boolean(offerId),
  });
  const exportPlain = useMutation({ mutationFn: () => letters.exportCv({ variant: "ats" }) });

  if (!offerId) return <Navigate to="/cv/etape/3" replace />;

  const generate = async () => {
    setProgress([]);
    setFailure(null);
    setRunning(true);
    abort.current = new AbortController();
    try {
      let done: Extract<GenerationEvent, { type: "done" }> | undefined;
      await streamGeneration(
        offerId,
        (event) => {
          if (event.type === "progress") setProgress((p) => [...p, event.message]);
          if (event.type === "failure") setFailure(event.message);
          if (event.type === "done") done = event;
        },
        abort.current.signal,
      );
      if (done) {
        void queryClient.invalidateQueries({ queryKey: ["generations"] });
        if (done.status === "degraded")
          toast.info("La reformulation par IA n'a pas abouti : votre CV reste exportable tel quel.");
        navigate(`/mes-cv/${done.generationId}`);
      }
    } catch (error) {
      if ((error as Error).name !== "AbortError") setFailure(errorMessage(error));
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="card space-y-4">
        <h2 className="text-lg font-bold">Offre visée</h2>
        {offer.data ? (
          <div>
            <p className="font-semibold">{offer.data.title}</p>
            {offer.data.company && <p className="text-slate-600 dark:text-slate-400">{offer.data.company}</p>}
            <p className="mt-2 text-sm">
              Mots-clés repérés :{" "}
              {offer.data.analysis.keywords
                .slice(0, 12)
                .map((k) => k.term)
                .join(", ") || "aucun"}
            </p>
            {offer.data.providerKind === "demo" && (
              <p className="mt-2 text-sm text-slate-600 dark:text-slate-400">
                Analyse faite sans IA (mode démonstration).
              </p>
            )}
          </div>
        ) : (
          <Spinner label="Chargement de l'offre…" />
        )}
      </div>
      <div className="card space-y-4">
        <h2 className="text-lg font-bold">Générer le CV ciblé</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Vos faits sont choisis et reformulés pour cette offre, puis chaque ligne est contrôlée : une ligne
          qui ne renvoie pas à votre profil est retirée avant affichage.
        </p>
        <Button onClick={() => void generate()} busy={running}>
          {running ? "Génération en cours…" : "Générer mon CV ciblé"}
        </Button>
        {(progress.length > 0 || running) && (
          <ol aria-live="polite" className="space-y-1 text-sm">
            {progress.map((p, i) => (
              <li key={i} className="flex items-center gap-2">
                <span aria-hidden="true" className="text-brand-700">
                  ✓
                </span>{" "}
                {p}
              </li>
            ))}
          </ol>
        )}
        {failure && <Alert tone="error">{failure}</Alert>}
      </div>
      <div className="card space-y-3">
        <h2 className="text-lg font-bold">Ou exporter sans adaptation</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Votre CV tel que saisi, sans IA, au format lisible par les ATS.
        </p>
        <Button variant="secondary" busy={exportPlain.isPending} onClick={() => exportPlain.mutate()}>
          Télécharger le CV non adapté (PDF)
        </Button>
        {exportPlain.isError && <Alert tone="error">{errorMessage(exportPlain.error)}</Alert>}
      </div>
      {!isAccount && (
        <Alert tone="info" title="Sans compte, vos données sont effacées sous 24 heures">
          <Link to="/connexion" className="link">
            Créez un compte
          </Link>{" "}
          pour garder vos CV, rédiger des lettres de motivation et recevoir la veille emploi.
        </Alert>
      )}
      <div>
        <Link to="/cv/etape/3" className="link">
          Revenir à l'offre
        </Link>
      </div>
    </div>
  );
}
