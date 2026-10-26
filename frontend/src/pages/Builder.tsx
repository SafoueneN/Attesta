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
  buttonClass,
  Button,
  ErrorSummary,
  errorMessage,
  PageHeader,
  Loading,
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

/** Pastille d'étape : coche si faite, anneau d'accent si en cours, contour neutre sinon. */
const DOT: Record<"done" | "current" | "todo", string> = {
  done: "border-accent bg-accent text-on-accent",
  current: "border-accent bg-surface text-accent-text ring-4 ring-accent/20",
  todo: "border-line-strong bg-surface text-ink-subtle",
};

function Stepper({ step }: { step: number }) {
  return (
    <nav aria-label="Étapes du parcours" className="mb-10">
      <p className="mb-4 text-sm font-semibold text-ink-muted">
        Étape {step} sur {STEPS.length}
      </p>
      <ol className="grid grid-cols-4">
        {STEPS.map((label, i) => {
          const n = i + 1;
          const state = n < step ? "done" : n === step ? "current" : "todo";
          return (
            <li key={label} className="relative flex flex-col items-start">
              {/* Trait vers l'étape suivante, rempli d'accent une fois l'étape franchie. */}
              {n < STEPS.length && (
                <span
                  aria-hidden="true"
                  className="absolute top-4 right-0 left-9 h-0.5 overflow-hidden bg-line"
                >
                  <span
                    className={`block h-full origin-left bg-accent transition-transform duration-500 ease-out-soft ${n < step ? "scale-x-100" : "scale-x-0"}`}
                  />
                </span>
              )}
              <span
                aria-hidden="true"
                className={`relative grid size-8 place-items-center rounded-full border-2 text-sm font-bold transition-colors duration-300 ${DOT[state]}`}
              >
                {state === "done" ? "✓" : n}
              </span>
              {n < step ? (
                <Link
                  to={`/cv/etape/${n}`}
                  className="mt-2 pr-2 text-xs font-medium text-accent-text underline underline-offset-2 sm:text-sm"
                >
                  {label}
                </Link>
              ) : (
                <span
                  aria-current={state === "current" ? "step" : undefined}
                  className={`mt-2 pr-2 text-xs sm:text-sm ${state === "current" ? "font-bold text-ink" : "text-ink-subtle"}`}
                >
                  {label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      {/* Rail et pastille glissante : le Builder reste monté d'une étape à l'autre, la transition se voit. */}
      <div aria-hidden="true" className="relative mt-5 h-1.5 rounded-full bg-line">
        <span
          className="absolute inset-y-0 left-0 rounded-full bg-accent transition-[width] duration-700 ease-spring"
          style={{ width: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
        />
        <span
          className="absolute top-1/2 size-4 -translate-x-1/2 -translate-y-1/2 rounded-full bg-accent shadow-[0_0_0_6px_var(--accent-soft)] transition-[left] duration-700 ease-spring"
          style={{ left: `${((step - 1) / (STEPS.length - 1)) * 100}%` }}
        />
      </div>
    </nav>
  );
}

function StepNav({ step, busy, next = "Continuer" }: { step: number; busy?: boolean; next?: string }) {
  return (
    <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-6">
      {step > 1 ? (
        <Link to={`/cv/etape/${step - 1}`} className={buttonClass("secondary")}>
          <span aria-hidden="true">←</span> Étape précédente
        </Link>
      ) : (
        <span />
      )}
      <Button type="submit" size="lg" busy={busy}>
        {next}
      </Button>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <fieldset className="card animate-enter space-y-5 transition-shadow duration-200 focus-within:shadow-raised">
      <legend className="sr-only">{title}</legend>
      <h2 className="font-display text-xl font-semibold">{title}</h2>
      {children}
    </fieldset>
  );
}

/** Recadre une photo au format d'identité (3:4, 450 × 600) et la compresse en JPEG avant l'envoi. */
async function toIdPhoto(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const ratio = 3 / 4;
  const [sw, sh] =
    bitmap.width / bitmap.height > ratio
      ? [bitmap.height * ratio, bitmap.height]
      : [bitmap.width, bitmap.width / ratio];
  const canvas = document.createElement("canvas");
  canvas.width = 450;
  canvas.height = 600;
  // Recadrage centré, un peu vers le haut : le visage est en général dans le tiers supérieur.
  canvas
    .getContext("2d")!
    .drawImage(bitmap, (bitmap.width - sw) / 2, (bitmap.height - sh) / 3, sw, sh, 0, 0, 450, 600);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("photo"))), "image/jpeg", 0.85),
  );
}

/**
 * Photo du CV (ADR 0036) : comptes seulement, stockée chiffrée à part du profil, jamais envoyée à l'IA ;
 * affichée sur le CV seulement si les usages du pays visé l'admettent.
 */
function PhotoField() {
  const { isAccount } = useSession();
  const queryClient = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const photo = useQuery({
    queryKey: ["photo"],
    queryFn: profiles.photo,
    enabled: isAccount,
    retry: false,
  });
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    if (!photo.data) return setUrl(undefined);
    const next = URL.createObjectURL(photo.data);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [photo.data]);
  const save = useMutation({
    mutationFn: async (file: File) => profiles.setPhoto(await toIdPhoto(file)),
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["photo"] }),
  });
  const remove = useMutation({
    mutationFn: profiles.removePhoto,
    onSuccess: () => queryClient.setQueryData(["photo"], null),
  });
  if (!isAccount)
    return (
      <p className="text-sm text-ink-muted">
        <Link to="/connexion" className="link">
          Créez un compte
        </Link>{" "}
        pour ajouter une photo d'identité (CV allemands et tunisiens).
      </p>
    );
  return (
    <div className="flex flex-wrap items-center gap-4">
      {url ? (
        <img
          src={url}
          alt="Votre photo de CV"
          className="h-24 w-18 rounded-xl object-cover ring-2 ring-accent"
        />
      ) : (
        <span
          aria-hidden="true"
          className="grid h-24 w-18 place-items-center rounded-xl border-2 border-dashed border-line text-2xl text-ink-subtle"
        >
          ☺
        </span>
      )}
      <div className="space-y-2">
        <p className="text-sm font-semibold">Photo d'identité</p>
        <p className="text-xs text-ink-muted">
          JPEG ou PNG, recadrée au format 3:4. Jamais affichée au Canada.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            ref={input}
            type="file"
            accept="image/jpeg,image/png"
            className="sr-only"
            aria-label="Choisir une photo"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) save.mutate(file);
              e.target.value = "";
            }}
          />
          <Button variant="secondary" busy={save.isPending} onClick={() => input.current?.click()}>
            {url ? "Changer la photo" : "Ajouter une photo"}
          </Button>
          {url && (
            <Button variant="ghost" busy={remove.isPending} onClick={() => remove.mutate()}>
              Retirer
            </Button>
          )}
        </div>
        {(save.isError || remove.isError) && (
          <Alert tone="error">{errorMessage(save.error ?? remove.error)}</Alert>
        )}
      </div>
    </div>
  );
}

/** Repères affichés à côté du formulaire sur grand écran : ce qui est fait des données à chaque étape. */
const ASIDE: Record<number, { title: string; points: string[] }> = {
  1: {
    title: "Votre profil est la seule source",
    points: [
      "Rien de ce qui n'y figure ne pourra apparaître dans un CV généré.",
      "À l'import d'un PDF, chaque élément proposé est vérifié dans votre fichier.",
    ],
  },
  2: {
    title: "Vos chiffres, rien que vos chiffres",
    points: [
      "Saisissez vos réalisations avec leurs chiffres réels : ce sont les seuls que le CV pourra citer.",
      "Une ligne par réalisation : chacune devient une source vérifiable.",
    ],
  },
  3: {
    title: "L'offre est une donnée",
    points: [
      "Le texte de l'annonce est analysé, jamais traité comme une consigne.",
      "Les mots-clés absents de votre profil seront signalés, jamais ajoutés.",
    ],
  },
  4: {
    title: "Ce qui va se passer",
    points: [
      "Vos faits sont choisis et reformulés pour l'offre.",
      "Chaque ligne est contrôlée ; une ligne sans source est retirée avant affichage.",
      "Vous relisez tout avant d'exporter.",
    ],
  },
};

function StepAside({ step }: { step: number }) {
  const aside = ASIDE[step];
  if (!aside) return null;
  return (
    <aside aria-label="Repères" className="hidden lg:block">
      <div
        key={step}
        className="sticky top-24 animate-enter rounded-2xl border border-line bg-surface-sunken p-6"
      >
        <p className="eyebrow">Bon à savoir</p>
        <h2 className="mt-2 font-display text-lg font-semibold">{aside.title}</h2>
        <ul className="mt-4 space-y-3 text-sm text-ink-muted">
          {aside.points.map((p) => (
            <li key={p} className="flex gap-2.5">
              <span aria-hidden="true" className="mt-0.5 font-bold text-proved">
                ✓
              </span>
              {p}
            </li>
          ))}
        </ul>
      </div>
    </aside>
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
  // Sens de la transition : on avance (entrée par la droite) ou on revient (entrée par la gauche).
  const previous = useRef(step);
  const direction = step >= previous.current ? "step-forward" : "step-back";
  useEffect(() => {
    previous.current = step;
  }, [step]);
  if (![1, 2, 3, 4].includes(step)) return <Navigate to="/cv/etape/1" replace />;
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        title="Créer un CV ciblé"
        lead="Votre profil est la seule source : rien n'est ajouté, tout est vérifié."
      />
      {/* Formulaire à largeur de lecture ; la colonne de repères occupe l'espace des grands écrans. */}
      <div className="grid gap-10 lg:grid-cols-[minmax(0,48rem)_minmax(16rem,1fr)] xl:gap-16">
        <div className="min-w-0">
          <Stepper step={step} />
          <div key={step} className={direction}>
            {step === 1 && <StepProfile />}
            {step === 2 && <StepParcours />}
            {step === 3 && <StepOffer />}
            {step === 4 && <StepGenerate />}
          </div>
        </div>
        <StepAside step={step} />
      </div>
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
  const [dragging, setDragging] = useState(false);
  const importer = useMutation({
    mutationFn: profiles.importPdf,
    onSuccess: (result) => {
      update((d) => draftFromImported(result.profile, d));
      toast.success(
        `Profil pré-rempli à partir de votre CV${result.method === "regles" ? " (lecture automatique, sans IA)" : ""}. Relisez chaque champ.${result.dropped ? ` ${result.dropped} élément(s) absent(s) de votre PDF ont été écarté(s).` : ""}`,
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
        <p className="text-sm text-ink-muted">
          PDF de 5 Mo au plus. Le texte est extrait, puis chaque élément proposé est vérifié dans votre PDF ;
          rien n'est enregistré sans votre relecture.
        </p>
        {/* `hidden` : hors de l'ordre de tabulation et de l'arbre d'accessibilité ; le bouton ci-dessous,
            seul point d'entrée, ouvre le sélecteur de fichier. */}
        <input
          ref={fileInput}
          type="file"
          accept="application/pdf"
          hidden
          id="cv-pdf"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) importer.mutate(file);
            e.target.value = "";
          }}
        />
        {/* Zone de dépôt : on peut aussi glisser le PDF ; le bouton reste l'accès au clavier. */}
        <div
          className={`dropzone flex flex-col items-center gap-3 rounded-2xl border-2 border-dashed border-line-strong px-6 py-8 text-center ${dragging ? "is-over" : ""}`}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            const file = e.dataTransfer.files[0];
            if (file) importer.mutate(file);
          }}
        >
          <span
            aria-hidden="true"
            className={`grid size-12 place-items-center rounded-2xl bg-accent text-lg font-black text-on-accent transition-transform duration-300 ${dragging ? "-translate-y-1 scale-110" : ""}`}
          >
            ↥
          </span>
          <p className="text-sm text-ink-muted">
            {dragging ? "Déposez votre PDF ici" : "Glissez votre CV PDF ici, ou"}
          </p>
          <Button variant="secondary" busy={importer.isPending} onClick={() => fileInput.current?.click()}>
            Importer mon CV PDF
          </Button>
          {importer.isPending && <span className="text-sm text-ink-muted">Analyse du PDF…</span>}
        </div>
        {importer.isError && (
          <Alert
            tone={importer.error instanceof ApiError && importer.error.status === 503 ? "warning" : "error"}
            announce
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
      <Section title="Selon le pays visé">
        <p className="text-sm text-ink-muted">
          Facultatif. Ces informations ne figurent sur le CV que si les usages du pays l'admettent : date de
          naissance et nationalité en Allemagne et en Tunisie, jamais au Canada. Elles ne sont jamais
          transmises à l'IA.
        </p>
        <PhotoField />
        <div className="grid gap-4 sm:grid-cols-2">
          <TextField label="Date de naissance" optional type="date" {...f("birthDate")} />
          <TextField label="Nationalité" optional autoComplete="country-name" {...f("nationality")} />
          <TextField
            label="Autorisation de travail"
            optional
            hint="Par exemple : Blue Card UE, Résident permanent (Canada)"
            {...f("workPermit")}
          />
          <TextField label="Permis de conduire" optional hint="Par exemple : B" {...f("drivingLicence")} />
        </div>
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
  // Offre envoyée par l'extension « Cibler cette offre » (ADR 0044) : dans le fragment de l'URL, jamais
  // transmis au serveur ; le texte pré-remplit le formulaire, le candidat le relit avant d'enregistrer.
  useEffect(() => {
    const hash = new URLSearchParams(window.location.hash.slice(1));
    const text = hash.get("annonce");
    if (!text) return;
    update((d) => ({ ...d, offer: { rawText: text.slice(0, 20000), sourceUrl: hash.get("source") ?? "" } }));
    history.replaceState(null, "", window.location.pathname + window.location.search);
  }, [update]);
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
        <legend className="float-left font-display text-xl font-semibold">Quelle offre visez-vous ?</legend>
        {/* Choix en tuiles : toute la surface est cliquable, l'option choisie est bordée d'accent. */}
        <div className="clear-both grid gap-3 pt-4 sm:grid-cols-2">
          {(["nouvelle", "existante"] as const).map((m) => (
            <label
              key={m}
              className="flex cursor-pointer items-center gap-3 rounded-xl border-2 border-line p-4 font-medium transition-colors hover:border-line-strong has-checked:border-accent has-checked:bg-accent-soft"
            >
              <input
                type="radio"
                name="mode"
                checked={mode === m}
                onChange={() => setMode(m)}
                className="size-4 accent-accent"
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
          <p className="text-sm text-ink-muted">
            Pas d'offre sous la main ?{" "}
            <Link to="/offres/collectees" className="link">
              Parcourez les offres collectées
            </Link>
            .
          </p>
        </Section>
      ) : (
        <Section title="Offres enregistrées">
          {saved.isPending && <Loading label="Chargement des offres…" />}
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

/**
 * CV en construction pendant la génération (décoratif) : une ligne s'écrit à chaque événement reçu et
 * reçoit son tampon « sourcé » ; une ligne fantôme scintille tant que le flux continue.
 */
function BuildingCv({ lines, running }: { lines: number; running: boolean }) {
  const widths = ["w-11/12", "w-9/12", "w-10/12", "w-8/12", "w-11/12", "w-7/12"];
  return (
    <div aria-hidden="true" className="rounded-2xl border border-line bg-paper p-5 shadow-raised">
      <div className="flex items-center gap-3 border-b border-line pb-3">
        <span className="size-9 rounded-full bg-accent" />
        <div className="space-y-1.5">
          <span className="block h-2.5 w-28 rounded-full bg-line-strong/60" />
          <span className="block h-2 w-20 rounded-full bg-line" />
        </div>
      </div>
      <div className="mt-4 space-y-3">
        {Array.from({ length: Math.min(lines, widths.length) }, (_, i) => (
          <div key={i} className="flex items-center gap-2">
            <span className={`write-in block h-2 rounded-full bg-ink-subtle/50 ${widths[i]}`} />
            <span className="grid size-4 shrink-0 animate-pop place-items-center rounded-full bg-proved text-[0.55rem] font-bold text-surface [animation-delay:600ms]">
              ✓
            </span>
          </div>
        ))}
        {running && <span className="skeleton block h-2 w-10/12" />}
      </div>
    </div>
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
        <h2 className="font-display text-xl font-semibold">Offre visée</h2>
        {offer.data ? (
          <div>
            <p className="text-lg font-semibold">{offer.data.title}</p>
            {offer.data.company && <p className="text-ink-muted">{offer.data.company}</p>}
            {/* Phrase complète pour les lecteurs d'écran ; puces visuelles pour l'œil. */}
            <p className="mt-3 text-sm">
              <span className="font-semibold">Mots-clés repérés : </span>
              <span className="sr-only">
                {offer.data.analysis.keywords
                  .slice(0, 12)
                  .map((k) => k.term)
                  .join(", ") || "aucun"}
              </span>
            </p>
            <ul aria-hidden="true" className="mt-2 flex flex-wrap gap-1.5">
              {offer.data.analysis.keywords.slice(0, 12).map((k, i) => (
                <li
                  key={`${k.term}-${i}`}
                  className="rounded-full border border-line bg-surface-sunken px-2.5 py-0.5 text-xs font-semibold text-ink-muted"
                >
                  {k.term}
                </li>
              ))}
            </ul>
            {offer.data.providerKind === "demo" && (
              <p className="mt-3 text-sm text-ink-muted">Analyse faite sans IA (mode démonstration).</p>
            )}
          </div>
        ) : (
          <Loading label="Chargement de l'offre…" />
        )}
      </div>
      <div className="card space-y-5 border-accent/40">
        <h2 className="font-display text-xl font-semibold">Générer le CV ciblé</h2>
        <p className="text-ink-muted">
          Vos faits sont choisis et reformulés pour cette offre, puis chaque ligne est contrôlée : une ligne
          qui ne renvoie pas à votre profil est retirée avant affichage.
        </p>
        <Button size="lg" onClick={() => void generate()} busy={running}>
          {running ? "Génération en cours…" : "Générer mon CV ciblé"}
        </Button>
        {/* Frise de progression : chaque événement du flux s'ajoute avec sa coche ; un point pulse tant
            que la génération tourne. */}
        {(progress.length > 0 || running) && (
          <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <ol aria-live="polite" className="relative space-y-3 border-l-2 border-line pl-6 text-sm">
              {progress.map((p, i) => (
                <li key={i} className="relative animate-enter">
                  <span
                    aria-hidden="true"
                    className="absolute top-0.5 -left-[2.0625rem] grid size-4 animate-pop place-items-center rounded-full bg-proved text-[0.6rem] font-bold text-surface"
                  >
                    ✓
                  </span>
                  {p}
                </li>
              ))}
              {running && (
                <li aria-hidden="true" className="relative text-ink-subtle">
                  <span className="absolute top-1 -left-[1.9375rem] size-3 animate-ping rounded-full bg-accent/60" />
                  <span className="absolute top-1 -left-[1.9375rem] size-3 rounded-full bg-accent" />…
                </li>
              )}
            </ol>
            <BuildingCv lines={progress.length} running={running} />
          </div>
        )}
        {failure && <Alert tone="error">{failure}</Alert>}
      </div>
      <div className="card space-y-3">
        <h2 className="font-display text-xl font-semibold">Ou exporter sans adaptation</h2>
        <p className="text-ink-muted">Votre CV tel que saisi, sans IA, au format lisible par les ATS.</p>
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
