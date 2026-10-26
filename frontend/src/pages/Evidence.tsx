import {
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MAX_COUNT,
  type Evidence,
  type EvidenceKind,
  type Profile,
} from "@attesta/shared-schemas";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState, type FormEvent } from "react";
import { Link } from "react-router";
import { ApiError } from "../api/client";
import { profiles } from "../api/endpoints";
import { useToast } from "../components/toasts";
import {
  Alert,
  Badge,
  Button,
  ConfirmDialog,
  EmptyState,
  errorMessage,
  Loading,
  PageHeader,
  QueryError,
  useDocumentTitle,
} from "../components/ui";
import { evidenceAnchor, formatDateTime } from "../lib/describe";

/*
 * Mes justificatifs (ADR 0027) : le candidat joint des pièces aux éléments de son profil. Une ligne du CV
 * qui s'appuie sur un élément justifié porte alors le badge « Justifiée ». Attesta ne certifie aucune pièce.
 */

export const KIND_LABELS: Record<EvidenceKind, string> = {
  diplome: "Diplôme",
  attestation_employeur: "Attestation d'employeur",
  certificat: "Certificat",
  recommandation: "Recommandation",
  autre: "Autre pièce",
};

type Section = "work" | "education" | "certificates" | "languages";
const SECTIONS: { key: Section; title: string; empty: string; kind: EvidenceKind }[] = [
  {
    key: "work",
    title: "Expériences",
    empty: "Aucune expérience dans votre profil.",
    kind: "attestation_employeur",
  },
  { key: "education", title: "Formations", empty: "Aucune formation dans votre profil.", kind: "diplome" },
  {
    key: "certificates",
    title: "Certificats",
    empty: "Aucun certificat dans votre profil.",
    kind: "certificat",
  },
  { key: "languages", title: "Langues", empty: "Aucune langue dans votre profil.", kind: "certificat" },
];

const LEVELS = [
  {
    mark: "◌",
    tone: "bg-surface-sunken text-ink-muted",
    title: "Déclaré",
    text: "Le fait figure dans votre profil, sur votre parole.",
  },
  {
    mark: "✓",
    tone: "bg-proved-soft text-proved",
    title: "Sourcé",
    text: "La ligne du CV renvoie à ce fait : l'IA n'a rien ajouté.",
  },
  {
    mark: "📎",
    tone: "bg-accent text-on-accent",
    title: "Justifié",
    text: "Vous avez joint une pièce qui appuie ce fait.",
  },
];

const sizeLabel = (bytes: number) =>
  bytes < 1024 * 1024
    ? `${Math.max(1, Math.round(bytes / 1024))} Ko`
    : `${(bytes / 1024 / 1024).toFixed(1).replace(".", ",")} Mo`;

function PieceRow({ piece, onDelete }: { piece: Evidence; onDelete: (p: Evidence) => void }) {
  const toast = useToast();
  return (
    <li className="flex animate-enter flex-wrap items-center gap-3 rounded-2xl border border-line bg-surface-sunken p-3">
      <span
        aria-hidden="true"
        className="grid h-11 w-9 shrink-0 place-items-center rounded-lg bg-removed-soft text-[0.6rem] font-black text-removed"
      >
        {piece.mimeType === "application/pdf" ? "PDF" : "IMG"}
      </span>
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">{piece.label}</p>
        <p className="text-xs text-ink-muted">
          {KIND_LABELS[piece.kind]} · {sizeLabel(piece.sizeBytes)} · ajoutée le{" "}
          {formatDateTime(piece.createdAt)}
        </p>
        {!piece.current && (
          <p className="mt-1 text-xs font-semibold text-flagged">
            L'élément a changé depuis le dépôt (« {piece.anchor} ») : cette pièce ne justifie plus rien.
          </p>
        )}
      </div>
      <Button
        variant="ghost"
        onClick={() => void profiles.evidenceFile(piece).catch((e: unknown) => toast.error(errorMessage(e)))}
      >
        Télécharger
      </Button>
      <Button
        variant="ghost"
        onClick={() => onDelete(piece)}
        aria-label={`Supprimer la pièce ${piece.label}`}
      >
        Supprimer
      </Button>
    </li>
  );
}

/** Formulaire de dépôt d'une pièce pour un élément précis du profil. */
function AddPiece({
  target,
  anchor,
  defaultKind,
  onDone,
}: {
  target: string;
  anchor: string;
  defaultKind: EvidenceKind;
  onDone: () => void;
}) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const id = target.replaceAll("/", "-");
  const [file, setFile] = useState<File | null>(null);
  const [kind, setKind] = useState<EvidenceKind>(defaultKind);
  const [label, setLabel] = useState(`${KIND_LABELS[defaultKind]} – ${anchor}`.slice(0, 120));
  const [error, setError] = useState<string | null>(null);
  const add = useMutation({
    mutationFn: profiles.addEvidence,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["justificatifs"] });
      toast.success("Pièce jointe : les lignes qui s'appuient sur cet élément sont désormais justifiées.");
      onDone();
    },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!file) return setError("Choisissez le fichier à joindre.");
    if (!["application/pdf", "image/png", "image/jpeg"].includes(file.type))
      return setError("Seuls les fichiers PDF, PNG et JPEG sont acceptés.");
    if (file.size > EVIDENCE_MAX_BYTES) return setError("Le fichier dépasse 5 Mo.");
    if (!label.trim()) return setError("Donnez un nom à la pièce.");
    setError(null);
    add.mutate({ file, target, kind, label: label.trim() });
  };
  return (
    <form
      noValidate
      onSubmit={submit}
      className="mt-3 animate-enter space-y-4 rounded-2xl border-2 border-dashed border-line-strong p-4"
    >
      <div>
        <label htmlFor={`${id}-fichier`} className="label">
          Fichier (PDF, PNG ou JPEG, 5 Mo au plus)
        </label>
        <input
          id={`${id}-fichier`}
          type="file"
          accept="application/pdf,image/png,image/jpeg"
          onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          className="block w-full text-sm file:mr-3 file:rounded-full file:border-0 file:bg-accent file:px-4 file:py-2 file:font-semibold file:text-on-accent"
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor={`${id}-nature`} className="label">
            Nature de la pièce
          </label>
          <select
            id={`${id}-nature`}
            className="input"
            value={kind}
            onChange={(e) => setKind(e.target.value as EvidenceKind)}
          >
            {(Object.keys(KIND_LABELS) as EvidenceKind[]).map((k) => (
              <option key={k} value={k}>
                {KIND_LABELS[k]}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor={`${id}-nom`} className="label">
            Nom de la pièce
          </label>
          <input
            id={`${id}-nom`}
            className="input"
            maxLength={120}
            value={label}
            onChange={(e) => setLabel(e.target.value)}
          />
        </div>
      </div>
      {(error || add.isError) && <Alert tone="error">{error ?? errorMessage(add.error)}</Alert>}
      <div className="flex flex-wrap gap-2">
        <Button type="submit" busy={add.isPending}>
          Joindre la pièce
        </Button>
        <Button variant="ghost" onClick={onDone}>
          Annuler
        </Button>
      </div>
    </form>
  );
}

function ProfileItem({
  target,
  anchor,
  pieces,
  defaultKind,
  full,
  onDelete,
}: {
  target: string;
  anchor: string;
  pieces: Evidence[];
  defaultKind: EvidenceKind;
  full: boolean;
  onDelete: (p: Evidence) => void;
}) {
  const [adding, setAdding] = useState(false);
  const justified = pieces.some((p) => p.current);
  return (
    <li className="card spot animate-enter p-5">
      <div className="flex flex-wrap items-center gap-3">
        <p className="min-w-0 flex-1 font-semibold">{anchor}</p>
        {justified ? <Badge tone="success">📎 Justifié</Badge> : <Badge tone="neutral">Déclaré</Badge>}
        {!adding && (
          <Button variant="secondary" disabled={full} onClick={() => setAdding(true)}>
            + Joindre une pièce
          </Button>
        )}
      </div>
      {pieces.length > 0 && (
        <ul className="mt-3 space-y-2">
          {pieces.map((p) => (
            <PieceRow key={p.id} piece={p} onDelete={onDelete} />
          ))}
        </ul>
      )}
      {adding && (
        <AddPiece target={target} anchor={anchor} defaultKind={defaultKind} onDone={() => setAdding(false)} />
      )}
    </li>
  );
}

function itemsOf(profile: Profile, section: Section) {
  return profile[section].map((_, i) => `/${section}/${i}`);
}

export function EvidencePage() {
  useDocumentTitle("Mes justificatifs");
  const queryClient = useQueryClient();
  const toast = useToast();
  const profile = useQuery({ queryKey: ["profil"], queryFn: profiles.current, retry: false });
  const evidence = useQuery({ queryKey: ["justificatifs"], queryFn: profiles.evidence });
  const [toDelete, setToDelete] = useState<Evidence | null>(null);
  const remove = useMutation({
    mutationFn: (id: string) => profiles.removeEvidence(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["justificatifs"] });
      toast.success("Pièce supprimée.");
      setToDelete(null);
    },
  });

  const noProfile = profile.error instanceof ApiError && profile.error.status === 404;
  const pieces = evidence.data ?? [];
  const full = pieces.length >= EVIDENCE_MAX_COUNT;

  return (
    <div className="space-y-8">
      <PageHeader
        title="Mes justificatifs"
        lead="Joignez diplômes, attestations et certificats aux éléments de votre profil : les lignes de vos CV qui s'appuient dessus deviennent « justifiées », et vous pouvez les ajouter en annexe de vos PDF."
      />

      {/* Les trois niveaux de confiance, et la limite honnête de l'exercice. */}
      <section aria-labelledby="niveaux" className="space-y-4">
        <h2 id="niveaux" className="sr-only">
          Les niveaux de confiance
        </h2>
        <ol className="grid gap-4 md:grid-cols-3">
          {LEVELS.map((l, i) => (
            <li
              key={l.title}
              className="card tilt animate-enter p-5"
              style={{ animationDelay: `${i * 80}ms` }}
            >
              <span
                aria-hidden="true"
                className={`icon-bounce grid size-10 place-items-center rounded-full text-lg font-bold ${l.tone}`}
              >
                {l.mark}
              </span>
              <h3 className="mt-4 font-semibold">{l.title}</h3>
              <p className="mt-1 text-sm text-ink-muted">{l.text}</p>
            </li>
          ))}
        </ol>
        <Alert tone="warning" title="Attesta ne certifie pas les pièces">
          Une pièce est fournie par vous. Elle appuie votre déclaration, mais Attesta ne vérifie pas son
          authenticité. Vos fichiers sont chiffrés, ne sont jamais transmis à une IA, et ne sont partagés que
          si vous les ajoutez vous-même en annexe d'un CV.
        </Alert>
      </section>

      {(profile.isPending || evidence.isPending) && <Loading />}
      {evidence.isError && <QueryError error={evidence.error} retry={() => void evidence.refetch()} />}
      {noProfile && (
        <EmptyState
          title="Enregistrez d'abord votre profil"
          action={
            <Link to="/cv" className="link">
              Renseigner mon profil
            </Link>
          }
        >
          Les pièces s'attachent aux expériences, formations, certificats et langues de votre profil.
        </EmptyState>
      )}

      {profile.data && evidence.data && (
        <>
          <div className="card flex flex-wrap items-center gap-4 p-5">
            <p className="font-semibold">
              {pieces.length} pièce{pieces.length > 1 ? "s" : ""} sur {EVIDENCE_MAX_COUNT}
            </p>
            <div
              role="meter"
              aria-label={`Pièces jointes : ${pieces.length} sur ${EVIDENCE_MAX_COUNT}`}
              aria-valuemin={0}
              aria-valuemax={EVIDENCE_MAX_COUNT}
              aria-valuenow={pieces.length}
              className="h-2 min-w-40 flex-1 rounded-full bg-surface-sunken"
            >
              <div
                className="h-2 rounded-full bg-accent transition-[width] duration-700"
                style={{ width: `${(pieces.length / EVIDENCE_MAX_COUNT) * 100}%` }}
              />
            </div>
          </div>

          {SECTIONS.map((section) => {
            const targets = itemsOf(profile.data.profile, section.key);
            return (
              <section key={section.key} aria-labelledby={`section-${section.key}`} className="space-y-3">
                <h2 id={`section-${section.key}`} className="text-xl font-semibold">
                  {section.title}
                </h2>
                {targets.length === 0 ? (
                  <p className="text-ink-muted">{section.empty}</p>
                ) : (
                  <ul className="space-y-3">
                    {targets.map((target) => (
                      <ProfileItem
                        key={target}
                        target={target}
                        anchor={evidenceAnchor(profile.data.profile, target) ?? target}
                        pieces={pieces.filter((p) => p.target === target && p.current)}
                        defaultKind={section.kind}
                        full={full}
                        onDelete={setToDelete}
                      />
                    ))}
                  </ul>
                )}
              </section>
            );
          })}

          {pieces.some((p) => !p.current) && (
            <section aria-labelledby="a-rattacher" className="space-y-3">
              <h2 id="a-rattacher" className="text-xl font-semibold">
                À rattacher de nouveau
              </h2>
              <p className="text-ink-muted">
                L'élément visé par ces pièces a changé dans votre profil. Supprimez-les, puis joignez-les de
                nouveau au bon élément.
              </p>
              <ul className="space-y-2">
                {pieces
                  .filter((p) => !p.current)
                  .map((p) => (
                    <PieceRow key={p.id} piece={p} onDelete={setToDelete} />
                  ))}
              </ul>
            </section>
          )}
        </>
      )}

      <ConfirmDialog
        open={toDelete !== null}
        title="Supprimer cette pièce ?"
        confirmLabel="Supprimer"
        danger
        busy={remove.isPending}
        onConfirm={() => toDelete && remove.mutate(toDelete.id)}
        onClose={() => setToDelete(null)}
      >
        « {toDelete?.label} » sera effacée. Les lignes qui s'appuyaient sur elle redeviendront « sourcées ».
      </ConfirmDialog>
    </div>
  );
}
