import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { PasswordChange } from "@attesta/shared-schemas";
import { useState, type FormEvent } from "react";
import { Link, useNavigate, useSearchParams } from "react-router";
import { session } from "../api/client";
import { auth, profiles, watch } from "../api/endpoints";
import { useSession } from "../auth/session";
import { RecoveryCodesView } from "../components/RecoveryCodes";
import { useToast } from "../components/toasts";
import {
  Alert,
  apiFieldErrors,
  Badge,
  Button,
  buttonClass,
  ConfirmDialog,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  TextField,
  useDocumentTitle,
} from "../components/ui";
import { formatDateTime } from "../lib/describe";
import type { FieldError } from "../lib/profileForm";
import { useDraft } from "../lib/draftStore";

const PURPOSES: Record<string, string> = {
  service: "Utilisation du service",
  veille: "Veille emploi par e-mail",
  promo: "Nouvelles d'Attesta",
};

/** Rappels par courriel programmés depuis le plan de progression (ADR 0029). */
function Reminders() {
  const queryClient = useQueryClient();
  const list = useQuery({ queryKey: ["rappels"], queryFn: watch.reminders });
  const remove = useMutation({
    mutationFn: watch.removeReminder,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ["rappels"] }),
  });
  const pending = (list.data ?? []).filter((r) => !r.sentAt);
  return (
    <section className="card space-y-3" aria-labelledby="rappels">
      <h2 id="rappels" className="text-lg font-bold">
        Rappels programmés
      </h2>
      {list.isError && <Alert tone="error">{errorMessage(list.error)}</Alert>}
      {pending.length === 0 ? (
        <p className="text-sm text-ink-muted">
          Aucun rappel en attente. Programmez-en depuis le plan de progression ou le suivi d'une candidature.
        </p>
      ) : (
        <ul className="space-y-2">
          {pending.map((r) => (
            <li
              key={r.id}
              className="flex flex-wrap items-center gap-3 rounded-2xl border border-line p-3 text-sm"
            >
              <span aria-hidden="true">{r.kind === "relance" ? "📨" : "📈"}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-semibold">{r.title}</span>
                <span className="text-ink-muted">
                  Le {new Date(`${r.sendOn}T12:00:00`).toLocaleDateString("fr-FR")}
                  {r.link && (
                    <>
                      {" · "}
                      <Link to={r.link} className="link">
                        ouvrir
                      </Link>
                    </>
                  )}
                </span>
              </span>
              <Button
                variant="ghost"
                busy={remove.isPending && remove.variables === r.id}
                onClick={() => remove.mutate(r.id)}
              >
                Supprimer
              </Button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/**
 * Adresse de réception des rapports de veille et des rappels (ADR 0030) : le compte n'a pas d'adresse, elle
 * se saisit dans la veille emploi, active tout de suite.
 */
/**
 * Sécurité d'un compte par identifiant (ADR 0039) : changer de mot de passe (les autres sessions sont
 * révoquées) et renouveler les codes de récupération, seul moyen de retrouver un compte sans e-mail.
 */
function Security({ username, codesLeft }: { username: string; codesLeft: number }) {
  const { signIn } = useSession();
  const toast = useToast();
  const queryClient = useQueryClient();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [codes, setCodes] = useState<string[]>();
  const change = useMutation({
    mutationFn: () => auth.changePassword({ current, password: next }),
    onSuccess: (session) => {
      signIn(session);
      setCurrent("");
      setNext("");
      setConfirm("");
      toast.success("Mot de passe changé. Vos autres sessions ont été fermées.");
    },
    onError: (error) => setErrors(apiFieldErrors(error, (c) => (c === "password" ? "new-password" : c))),
  });
  const regenerate = useMutation({
    mutationFn: auth.newRecoveryCodes,
    onSuccess: (r) => setCodes(r.codes),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = PasswordChange.safeParse({ current, password: next });
    const found: FieldError[] = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({
          field: i.path[0] === "password" ? "new-password" : String(i.path[0]),
          message: i.message,
        }));
    if (next && confirm !== next)
      found.push({ field: "confirm-password", message: "Les deux mots de passe ne sont pas identiques." });
    setErrors(found);
    if (!found.length) change.mutate();
  };
  if (codes)
    return (
      <RecoveryCodesView
        codes={codes}
        username={username}
        onDone={() => {
          setCodes(undefined);
          void queryClient.invalidateQueries({ queryKey: ["moi"] });
        }}
      />
    );
  return (
    <section className="card space-y-5">
      <h2 className="text-lg font-bold">Sécurité</h2>
      <form noValidate onSubmit={submit} className="space-y-4">
        <h3 className="font-semibold">Changer de mot de passe</h3>
        <div className="grid gap-4 sm:grid-cols-3">
          <TextField
            id="current"
            label="Mot de passe actuel"
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            errors={errors}
          />
          <TextField
            id="new-password"
            label="Nouveau mot de passe"
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            errors={errors}
          />
          <TextField
            id="confirm-password"
            label="Confirmer"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            errors={errors}
          />
        </div>
        {change.isError && !apiFieldErrors(change.error).length && (
          <Alert tone="error">{errorMessage(change.error)}</Alert>
        )}
        <Button type="submit" variant="secondary" busy={change.isPending}>
          Changer mon mot de passe
        </Button>
      </form>
      <div className="space-y-2 border-t border-line pt-4">
        <h3 className="font-semibold">Codes de récupération</h3>
        <p className="text-sm text-ink-muted">
          {codesLeft > 0
            ? `${codesLeft} code${codesLeft > 1 ? "s" : ""} inutilisé${codesLeft > 1 ? "s" : ""}. En générer de nouveaux annule les anciens.`
            : "Aucun code disponible : sans code, un mot de passe oublié fait perdre l'accès au compte. Générez-en maintenant."}
        </p>
        <Button
          variant={codesLeft > 2 ? "secondary" : "primary"}
          busy={regenerate.isPending}
          onClick={() => regenerate.mutate()}
        >
          Générer de nouveaux codes
        </Button>
        {regenerate.isError && <Alert tone="error">{errorMessage(regenerate.error)}</Alert>}
      </div>
    </section>
  );
}

function ReportAddress({ welcome }: { welcome: boolean }) {
  const subscription = useQuery({ queryKey: ["veille"], queryFn: watch.subscription, retry: false });
  const s = subscription.data;
  if (subscription.isPending) return null;
  return (
    <section className={`card space-y-3 ${welcome ? "ring-2 ring-accent" : ""}`}>
      <h2 className="text-lg font-bold">
        {welcome ? "Bienvenue ! Où recevoir vos rapports ?" : "Adresse de réception des rapports"}
      </h2>
      {s?.email && s.status !== "desabonnee" ? (
        <p>
          Rapports de veille et rappels envoyés à <strong>{s.email}</strong>{" "}
          <Badge tone={s.status === "active" ? "success" : "neutral"}>
            {s.status === "active" ? "Active" : s.status === "en_attente" ? "En attente" : "Suspendue"}
          </Badge>
        </p>
      ) : (
        <p className="text-ink-muted">
          Votre compte n'utilise pas d'adresse e-mail. Pour recevoir chaque jour les offres qui vous
          correspondent et vos rappels, indiquez l'adresse de votre choix dans la veille emploi : les rapports
          y partent directement.
        </p>
      )}
      <Link to="/veille" className={buttonClass(s?.email ? "secondary" : "primary")}>
        {s?.email ? "Modifier l'adresse ou les critères" : "Ajouter mon adresse de réception"}
      </Link>
    </section>
  );
}

export function Account() {
  useDocumentTitle("Mon compte");
  const [params] = useSearchParams();
  const me = useQuery({ queryKey: ["moi"], queryFn: auth.me });
  const versions = useQuery({ queryKey: ["profil", "versions"], queryFn: profiles.versions });
  const queryClient = useQueryClient();
  const toast = useToast();
  const navigate = useNavigate();
  const { signOut } = useSession();
  const { clear } = useDraft();
  const [confirm, setConfirm] = useState(false);
  const [checked, setChecked] = useState(false);

  const promo = useMutation({
    mutationFn: auth.setPromoConsent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["moi"] });
      toast.success("Votre choix est enregistré.");
    },
  });
  const exportData = useMutation({ mutationFn: auth.exportData });
  const remove = useMutation({
    mutationFn: auth.deleteAccount,
    onSuccess: async (result) => {
      clear();
      session.set(null);
      await signOut();
      toast.success(result.message);
      navigate("/", { replace: true });
    },
  });

  if (me.isPending) return <Loading />;
  if (me.isError) return <QueryError error={me.error} retry={() => void me.refetch()} />;
  const latest = (purpose: string) => [...me.data.consents].reverse().find((c) => c.purpose === purpose);
  const promoGranted = latest("promo")?.granted ?? false;

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <PageHeader
        title="Mon compte"
        lead={`Connecté en tant que « ${me.data.username ?? me.data.email} », depuis le ${formatDateTime(me.data.createdAt)}.`}
      />
      <ReportAddress welcome={params.has("bienvenue")} />
      {me.data.username && (
        <Security username={me.data.username} codesLeft={me.data.recoveryCodesLeft ?? 0} />
      )}
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Profil enregistré</h2>
        {versions.data?.length ? (
          <ul className="space-y-1 text-sm">
            {versions.data.slice(0, 5).map((v) => (
              <li key={v.version}>
                Version {v.version} · {v.label} · {formatDateTime(v.createdAt)}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-ink-muted">Aucun profil enregistré.</p>
        )}
        <Button variant="secondary" onClick={() => navigate("/cv/etape/1")}>
          Modifier mon profil
        </Button>
      </section>
      <Reminders />
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Consentements</h2>
        <ul className="space-y-1 text-sm">
          {me.data.consents.map((c, i) => (
            <li key={i} className="flex flex-wrap gap-2">
              <Badge tone={c.granted ? "success" : "neutral"}>{c.granted ? "Accordé" : "Retiré"}</Badge>
              {PURPOSES[c.purpose]} · politique du {c.policyVersion} · {formatDateTime(c.at)}
            </li>
          ))}
        </ul>
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            className="size-5 accent-accent-text"
            checked={promoGranted}
            disabled={promo.isPending}
            onChange={(e) => promo.mutate(e.target.checked)}
          />
          Recevoir les nouvelles d'Attesta (au plus une fois par mois)
        </label>
      </section>
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Mes données</h2>
        <p className="text-ink-muted">
          Export de toutes vos données, réunies depuis chaque service d'Attesta, dans un fichier JSON (RGPD,
          articles 15 et 20).
        </p>
        <Button variant="secondary" busy={exportData.isPending} onClick={() => exportData.mutate()}>
          Télécharger mes données
        </Button>
        {exportData.isError && <Alert tone="error">{errorMessage(exportData.error)}</Alert>}
      </section>
      <section className="card space-y-3 border-removed/40">
        <h2 className="text-lg font-bold text-removed">Supprimer mon compte</h2>
        <p className="text-ink-muted">
          Suppression définitive de votre compte, de vos profils, CV, lettres, offres et de votre veille, dans
          tous nos services. Cette action est irréversible.
        </p>
        <Button variant="danger" onClick={() => setConfirm(true)}>
          Supprimer mon compte
        </Button>
      </section>
      <ConfirmDialog
        open={confirm}
        title="Supprimer définitivement votre compte ?"
        confirmLabel="Supprimer définitivement"
        danger
        busy={remove.isPending}
        onConfirm={() => checked && remove.mutate()}
        onClose={() => {
          setConfirm(false);
          setChecked(false);
        }}
      >
        <label className="flex items-start gap-3">
          <input
            type="checkbox"
            className="mt-1 size-5 accent-removed"
            checked={checked}
            onChange={(e) => setChecked(e.target.checked)}
          />
          Je comprends que toutes mes données seront effacées et que cette action est irréversible.
        </label>
        {remove.isError && (
          <div className="mt-3">
            <Alert tone="error">{errorMessage(remove.error)}</Alert>
          </div>
        )}
      </ConfirmDialog>
    </div>
  );
}
