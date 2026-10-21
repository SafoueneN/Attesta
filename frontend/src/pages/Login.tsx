import { LoginLinkRequest } from "@attesta/shared-schemas";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { auth } from "../api/endpoints";
import { useSession } from "../auth/session";
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

/** Demande d'un lien de connexion (aucun mot de passe). Réponse identique que le compte existe ou non. */
export function Login() {
  const { isAccount } = useSession();
  const [email, setEmail] = useState("");
  const [policy, setPolicy] = useState(false);
  const [errors, setErrors] = useState<FieldError[]>([]);
  const send = useMutation({ mutationFn: (value: string) => auth.requestLink(value) });
  useDocumentTitle(send.isSuccess ? "Vérifiez votre messagerie" : "Connexion", errors.length > 0);

  if (isAccount) return <Navigate to="/compte" replace />;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const parsed = LoginLinkRequest.safeParse({ email: email.trim(), policyAccepted: policy });
    const found = parsed.success
      ? []
      : parsed.error.issues.map((i) => ({
          field: i.path[0] === "policyAccepted" ? "policy" : "email",
          message:
            i.path[0] === "policyAccepted"
              ? "Acceptez la politique de confidentialité pour continuer."
              : i.message,
        }));
    setErrors(found);
    if (!parsed.success) return;
    send.mutate(parsed.data.email, {
      onError: (error) => setErrors(apiFieldErrors(error, (c) => (c === "policyAccepted" ? "policy" : c))),
    });
  };

  if (send.isSuccess) {
    return (
      <div className="mx-auto max-w-xl">
        <PageHeader title="Vérifiez votre messagerie" />
        <Alert tone="success" title="Lien envoyé">
          Si l'adresse est valide, un lien de connexion vient de lui être envoyé. Il est valable 15 minutes et
          ne sert qu'une fois. Pensez à regarder vos courriers indésirables.
        </Alert>
        <Button variant="ghost" className="mt-4" onClick={() => send.reset()}>
          Utiliser une autre adresse
        </Button>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl">
      <PageHeader
        title="Connexion"
        lead="Pas de mot de passe : nous vous envoyons un lien de connexion à usage unique. Un compte est créé à la première connexion."
      />
      <ErrorSummary errors={errors} />
      {send.isError && !apiFieldErrors(send.error).length && (
        <div className="mb-4">
          <Alert tone="error">{errorMessage(send.error)}</Alert>
        </div>
      )}
      <form noValidate onSubmit={submit} className="card space-y-5">
        <TextField
          id="email"
          label="Adresse e-mail"
          type="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          errors={errors}
        />
        <div>
          <div className="flex items-start gap-3">
            <input
              id="policy"
              type="checkbox"
              checked={policy}
              onChange={(e) => setPolicy(e.target.checked)}
              aria-invalid={errors.some((e) => e.field === "policy") || undefined}
              aria-describedby={errors.some((e) => e.field === "policy") ? "policy-erreur" : undefined}
              className="mt-1 size-5 accent-brand-700"
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
            <p id="policy-erreur" className="mt-1 text-sm font-medium text-red-700 dark:text-red-400">
              Acceptez la politique de confidentialité pour continuer.
            </p>
          )}
        </div>
        <Button type="submit" busy={send.isPending}>
          Recevoir mon lien de connexion
        </Button>
      </form>
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
