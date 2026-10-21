import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router";
import { session } from "../api/client";
import { auth, profiles } from "../api/endpoints";
import { useSession } from "../auth/session";
import { useToast } from "../components/toasts";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  useDocumentTitle,
} from "../components/ui";
import { formatDateTime } from "../lib/describe";
import { useDraft } from "../lib/draftStore";

const PURPOSES: Record<string, string> = {
  service: "Utilisation du service",
  veille: "Veille emploi par e-mail",
  promo: "Nouvelles d'Attesta",
};

export function Account() {
  useDocumentTitle("Mon compte");
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
        lead={`Connecté avec ${me.data.email}, depuis le ${formatDateTime(me.data.createdAt)}.`}
      />
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
          <p className="text-slate-600 dark:text-slate-400">Aucun profil enregistré.</p>
        )}
        <Button variant="secondary" onClick={() => navigate("/cv/etape/1")}>
          Modifier mon profil
        </Button>
      </section>
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
            className="size-5 accent-brand-700"
            checked={promoGranted}
            disabled={promo.isPending}
            onChange={(e) => promo.mutate(e.target.checked)}
          />
          Recevoir les nouvelles d'Attesta (au plus une fois par mois)
        </label>
      </section>
      <section className="card space-y-3">
        <h2 className="text-lg font-bold">Mes données</h2>
        <p className="text-slate-700 dark:text-slate-300">
          Export de toutes vos données, réunies depuis chaque service d'Attesta, dans un fichier JSON (RGPD,
          articles 15 et 20).
        </p>
        <Button variant="secondary" busy={exportData.isPending} onClick={() => exportData.mutate()}>
          Télécharger mes données
        </Button>
        {exportData.isError && <Alert tone="error">{errorMessage(exportData.error)}</Alert>}
      </section>
      <section className="card space-y-3 border-red-300 dark:border-red-900">
        <h2 className="text-lg font-bold text-red-800 dark:text-red-300">Supprimer mon compte</h2>
        <p className="text-slate-700 dark:text-slate-300">
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
            className="mt-1 size-5 accent-red-700"
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
