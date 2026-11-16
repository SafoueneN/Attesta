import { useState } from "react";
import { Button } from "./ui";

/**
 * Codes de récupération (ADR 0039), affichés une seule fois : le compte n'a pas d'e-mail, ces codes sont le
 * seul moyen de choisir un nouveau mot de passe. Copie, téléchargement et confirmation explicite.
 */
export function RecoveryCodesView({
  codes,
  username,
  onDone,
}: {
  codes: string[];
  username?: string;
  onDone: () => void;
}) {
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = [
    `Attesta : codes de récupération${username ? ` du compte « ${username} »` : ""}`,
    "Chaque code ne sert qu'une fois, pour choisir un nouveau mot de passe.",
    "",
    ...codes,
  ].join("\n");
  const download = () => {
    const url = URL.createObjectURL(new Blob([text], { type: "text/plain;charset=utf-8" }));
    const a = Object.assign(document.createElement("a"), {
      href: url,
      download: "attesta-codes-recuperation.txt",
    });
    a.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="card space-y-4 ring-2 ring-accent">
      <h2 className="text-lg font-bold">Vos codes de récupération</h2>
      <p className="text-sm text-ink-muted">
        Votre compte n'utilise pas d'adresse e-mail. Si vous oubliez votre mot de passe, l'un de ces codes
        vous permettra d'en choisir un nouveau. Chaque code ne sert qu'une fois. Ils ne seront plus affichés :
        gardez-les en lieu sûr (gestionnaire de mots de passe, fichier, papier).
      </p>
      <p className="text-sm font-semibold">
        Sans votre mot de passe ni l'un de ces codes, votre compte et ses données ne pourront pas être
        récupérés, même par l'équipe d'Attesta.
      </p>
      <ol className="grid grid-cols-2 gap-2 font-mono text-base sm:grid-cols-4">
        {codes.map((c) => (
          <li key={c} className="rounded-xl bg-surface-sunken px-3 py-2 text-center tracking-wider">
            {c}
          </li>
        ))}
      </ol>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          onClick={() =>
            void navigator.clipboard?.writeText(text).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 2000);
            })
          }
        >
          {copied ? "Copiés ✓" : "Copier"}
        </Button>
        <Button variant="secondary" onClick={download}>
          Télécharger (.txt)
        </Button>
      </div>
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          className="mt-1 size-5 accent-accent-text"
          checked={saved}
          onChange={(e) => setSaved(e.target.checked)}
        />
        <span>
          J'ai mis mes codes en lieu sûr et je comprends qu'ils sont mon seul recours si j'oublie mon mot de
          passe.
        </span>
      </label>
      <Button disabled={!saved} onClick={onDone}>
        Continuer
      </Button>
    </div>
  );
}
