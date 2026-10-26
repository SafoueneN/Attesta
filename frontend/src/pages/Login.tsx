import { AccountCreate, PasswordLogin, PasswordReset } from "@attesta/shared-schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { auth } from "../api/endpoints";
import { useSession } from "../auth/session";
import { RecoveryCodesView } from "../components/RecoveryCodes";
import {
  Alert,
  apiFieldErrors,
  Button,
  ErrorSummary,
  errorMessage,
  Loading,
  PageHeader,
  TextField,
  useDocumentTitle,
} from "../components/ui";
import type { FieldError } from "../lib/profileForm";

type Mode = "connexion" | "creation" | "oubli";

/**
 * Connexion et création de compte par identifiant et mot de passe (ADR 0030) : aucun e-mail n'est demandé
 * ni envoyé. L'adresse où recevoir les rapports se saisit ensuite, dans la veille emploi.
 */
export function Login() {
  const { isAccount, signIn } = useSession();
  const navigate = useNavigate();
  const [mode, setMode] = useState<Mode>("connexion");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [visible, setVisible] = useState(false);
  const [policy, setPolicy] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const [code, setCode] = useState("");
  /** Codes de récupération remis à la création du compte, affichés avant d'entrer (ADR 0039). */
  const [codes, setCodes] = useState<string[]>();
  const creating = mode === "creation";
  const forgot = mode === "oubli";
  const newPassword = creating || forgot;
  const submitAccount = useMutation({
    mutationFn: () =>
      creating
        ? auth.createAccount({ username: username.trim(), password, policyAccepted: true })
        : forgot
          ? auth.resetPassword({ username: username.trim(), code, password })
          : auth.passwordLogin({ username: username.trim(), password }),
    onSuccess: (session) => {
      if (session.recoveryCodes?.length) setCodes(session.recoveryCodes);
      signIn(session);
    },
    onError: (error) => setErrors(apiFieldErrors(error, (c) => (c === "policyAccepted" ? "policy" : c))),
  });
  useDocumentTitle(
    creating ? "Créer un compte" : forgot ? "Mot de passe oublié" : "Connexion",
    errors.length > 0,
  );

  // Compte créé : les codes de récupération d'abord, puis l'accueil.
  if (isAccount && codes)
    return (
      <div className="mx-auto max-w-2xl">
        <PageHeader title="Votre compte est créé" />
        <RecoveryCodesView
          codes={codes}
          username={username.trim()}
          onDone={() => navigate("/compte?bienvenue", { replace: true })}
        />
      </div>
    );
  if (isAccount) return <Navigate to={creating ? "/compte?bienvenue" : "/compte"} replace />;

  const switchTo = (next: Mode) => {
    setMode(next);
    setErrors([]);
    setConfirm("");
    setCode("");
    submitAccount.reset();
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = creating
      ? AccountCreate.safeParse({ username, password, policyAccepted: policy })
      : forgot
        ? PasswordReset.safeParse({ username, code, password })
        : PasswordLogin.safeParse({ username, password });
    const found: FieldError[] = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({
          field: i.path[0] === "policyAccepted" ? "policy" : String(i.path[0]),
          message:
            i.path[0] === "policyAccepted"
              ? "Acceptez la politique de confidentialité pour continuer."
              : i.message,
        }));
    if (newPassword && password && confirm !== password)
      found.push({ field: "confirm", message: "Les deux mots de passe ne sont pas identiques." });
    setErrors(found);
    if (!found.length) submitAccount.mutate();
  };

  return (
    <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <div className="mx-auto w-full max-w-xl">
        <PageHeader
          title={creating ? "Créer un compte" : forgot ? "Mot de passe oublié" : "Connexion"}
          lead={
            creating
              ? "Un identifiant et un mot de passe suffisent : aucune adresse e-mail n'est demandée pour créer votre compte."
              : forgot
                ? "Saisissez votre identifiant, l'un de vos codes de récupération (remis à la création du compte) et un nouveau mot de passe."
                : "Connectez-vous avec votre identifiant et votre mot de passe."
          }
        />
        <div role="tablist" aria-label="Connexion ou création de compte" className="mb-5 flex gap-2">
          {(
            [
              ["connexion", "Se connecter"],
              ["creation", "Créer un compte"],
            ] as const
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={mode === value}
              onClick={() => switchTo(value)}
              className={`rounded-full px-5 py-2.5 text-sm font-bold transition-colors ${mode === value ? "bg-accent text-on-accent" : "border border-line text-ink-muted hover:text-ink"}`}
            >
              {label}
            </button>
          ))}
        </div>
        <ErrorSummary errors={errors} />
        {submitAccount.isError && !apiFieldErrors(submitAccount.error).length && (
          <div className="mb-4">
            <Alert tone="error">{errorMessage(submitAccount.error)}</Alert>
          </div>
        )}
        <form noValidate onSubmit={submit} className="card space-y-5">
          <TextField
            id="username"
            label="Identifiant"
            hint={creating ? "3 à 30 caractères : lettres sans accent, chiffres, point, tiret." : undefined}
            autoComplete="username"
            autoCapitalize="none"
            spellCheck={false}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            errors={errors}
          />
          {forgot && (
            <TextField
              id="code"
              label="Code de récupération"
              hint="Par exemple : K7QM-4XRT. Chaque code ne sert qu'une fois."
              autoComplete="one-time-code"
              autoCapitalize="characters"
              spellCheck={false}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              errors={errors}
            />
          )}
          <div className="space-y-2">
            <TextField
              id="password"
              label={forgot ? "Nouveau mot de passe" : "Mot de passe"}
              hint={
                newPassword
                  ? "10 caractères au moins. Une phrase facile à retenir convient très bien."
                  : undefined
              }
              type={visible ? "text" : "password"}
              autoComplete={newPassword ? "new-password" : "current-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              errors={errors}
            />
            <label className="flex items-center gap-2 text-sm text-ink-muted">
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
                className="size-4 accent-accent-text"
              />
              Afficher le mot de passe
            </label>
          </div>
          {newPassword && (
            <TextField
              id="confirm"
              label="Confirmer le mot de passe"
              type={visible ? "text" : "password"}
              autoComplete="new-password"
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              errors={errors}
            />
          )}
          {creating && (
            <>
              <div>
                <div className="flex items-start gap-3">
                  <input
                    id="policy"
                    type="checkbox"
                    checked={policy}
                    onChange={(e) => setPolicy(e.target.checked)}
                    aria-invalid={errors.some((e) => e.field === "policy") || undefined}
                    aria-describedby={errors.some((e) => e.field === "policy") ? "policy-erreur" : undefined}
                    className="mt-1 size-5 accent-accent-text"
                  />
                  <label htmlFor="policy">
                    J'accepte la{" "}
                    <Link to="/confidentialite" className="link">
                      politique de confidentialité
                    </Link>
                    .
                  </label>
                </div>
                {errors.some((e) => e.field === "policy") && (
                  <p id="policy-erreur" className="mt-1 text-sm font-medium text-removed">
                    Acceptez la politique de confidentialité pour continuer.
                  </p>
                )}
              </div>
            </>
          )}
          <Button type="submit" busy={submitAccount.isPending}>
            {creating ? "Créer mon compte" : forgot ? "Changer mon mot de passe" : "Me connecter"}
          </Button>
          {mode === "connexion" && (
            <button type="button" className="link block text-sm" onClick={() => switchTo("oubli")}>
              Mot de passe oublié ?
            </button>
          )}
          {forgot && (
            <button type="button" className="link block text-sm" onClick={() => switchTo("connexion")}>
              Retour à la connexion
            </button>
          )}
        </form>
        <p className="mt-4 text-sm text-ink-muted">
          {creating ? "Déjà un compte ? " : "Pas encore de compte ? "}
          <button
            type="button"
            className="link"
            onClick={() => switchTo(creating ? "connexion" : "creation")}
          >
            {creating ? "Se connecter" : "Créer un compte"}
          </button>
        </p>
      </div>
      <LoginVisual />
    </div>
  );
}

/**
 * Visuel de la page de connexion (grand écran) : les trois temps du parcours, animés en cascade.
 * Décoratif : le texte de la page explique déjà le fonctionnement.
 */
function LoginVisual() {
  const steps = [
    ["1", "Vous choisissez un identifiant et un mot de passe"],
    ["2", "Vous créez vos CV ciblés, sans donner d'e-mail"],
    ["✉", "Vous choisissez l'adresse qui reçoit vos rapports de veille"],
  ];
  return (
    <div
      aria-hidden="true"
      className="grain spotlight relative hidden overflow-hidden rounded-[2.5rem] border border-line bg-surface-sunken p-10 lg:block"
    >
      <span className="aurora aurora-a top-[-6rem] right-[-4rem] size-[18rem]" />
      <p className="relative text-title font-semibold">Votre compte, votre adresse de réception.</p>
      <ol className="relative mt-8 space-y-4">
        {steps.map(([icon, text], i) => (
          <li
            key={text}
            className="flex animate-enter items-center gap-4 rounded-2xl border border-line bg-surface p-4 shadow-raised"
            style={{ animationDelay: `${300 + i * 220}ms` }}
          >
            <span className="grid size-11 shrink-0 animate-pop place-items-center rounded-full bg-accent text-lg font-bold text-on-accent">
              {icon}
            </span>
            <span className="font-medium">{text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

/**
 * Le lien de l'e-mail ouvre cette page de confirmation : un antivirus qui visite les liens ne connecte
 * personne, et l'adresse masquée évite d'être connecté au compte d'un tiers à son insu.
 */
export function LoginConfirm() {
  const { token = "" } = useParams();
  const { signIn } = useSession();
  const navigate = useNavigate();
  const preview = useQuery({
    queryKey: ["lien", token],
    queryFn: () => auth.previewLink(token),
    retry: false,
  });
  const open = useMutation({
    mutationFn: () => auth.openSession(token),
    onSuccess: (session) => {
      signIn(session);
      navigate("/compte", { replace: true });
    },
  });
  useDocumentTitle("Confirmer la connexion");

  if (preview.isPending) return <Loading />;
  if (preview.isError) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Lien expiré" />
        <Alert tone="error">{errorMessage(preview.error)}</Alert>
        <Link to="/connexion" className="link mt-4 inline-block">
          Demander un nouveau lien
        </Link>
      </div>
    );
  }
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Confirmer la connexion" />
      <div className="card space-y-4">
        <p>
          Vous allez vous connecter au compte <strong>{preview.data.maskedEmail}</strong>. Si ce n'est pas
          votre adresse, fermez cette page.
        </p>
        {open.isError && <Alert tone="error">{errorMessage(open.error)}</Alert>}
        <Button busy={open.isPending} onClick={() => open.mutate()}>
          Me connecter
        </Button>
      </div>
    </div>
  );
}
