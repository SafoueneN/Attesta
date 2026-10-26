import type { CvTranslation } from "@attesta/shared-schemas";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { cv, letters } from "../../api/endpoints";
import { useToast } from "../../components/toasts";
import { Alert, Badge, Button, errorMessage } from "../../components/ui";
import {
  AiBadge,
  CopyButton,
  cvLines,
  Thinking,
  useAssistantResults,
  useAssistantRun,
  VoteButtons,
} from "../assistants/shared";
import { SceneHeader, useStudio } from "./Studio";

/*
 * La traduction, mise en scène comme deux feuilles côte à côte : survoler une ligne allume sa jumelle, la
 * feuille cible se corrige en place (chiffres et noms propres revérifiés), puis le CV traduit s'exporte en PDF.
 */

const LANGS = { en: "Anglais", de: "Allemand" } as const;

export function TranslateScene() {
  const { generation, variant } = useStudio();
  const toast = useToast();
  const [lang, setLang] = useState<"en" | "de">("en");
  const [hover, setHover] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({});
  const [reviewed, setReviewed] = useState(false);
  const results = useAssistantResults(generation.id);
  const translate = useAssistantRun<CvTranslation>(generation.id, `traduction:${lang}`, () =>
    cv.translate(generation.id, lang),
  );
  const data = translate.data;
  useEffect(() => {
    setEdits({});
    setEditing(null);
    setReviewed(false);
  }, [lang, data]);
  const save = useMutation({
    mutationFn: () =>
      cv.editTranslation(
        generation.id,
        lang,
        Object.entries(edits).map(([path, text]) => ({ path, text })),
      ),
    onSuccess: (saved) => {
      results.remember(`traduction:${lang}`, saved);
      toast.success("Traduction enregistrée : chiffres et noms propres revérifiés.");
    },
  });
  const exportPdf = useMutation({
    mutationFn: () => letters.exportCv({ generationId: generation.id, variant, lang }),
  });
  const lines = cvLines(generation);
  const byPath = new Map((data?.lines ?? []).map((l) => [l.path, l.text]));
  const rejected = new Set(data?.rejectedPaths ?? []);
  const pending = Object.keys(edits).length;
  const groups = lines.reduce<{ section: string; lines: (typeof lines)[number][] }[]>((acc, l) => {
    const last = acc[acc.length - 1];
    if (last && last.section === l.section) last.lines.push(l);
    else acc.push({ section: l.section, lines: [l] });
    return acc;
  }, []);
  let n = 0;
  const numbered = new Map(lines.map((l) => [l.path, ++n]));
  const lineProps = (path: string) => ({
    onMouseEnter: () => setHover(path),
    onMouseLeave: () => setHover(null),
    onFocus: () => setHover(path),
    className: `twin-line relative rounded-md py-0.5 pr-1 pl-7 transition-colors ${hover === path ? "is-twin" : ""}`,
  });

  return (
    <div className="space-y-6">
      <SceneHeader
        eyebrow="Traduction fidèle"
        title={
          <span className="flex flex-wrap items-center gap-3">
            Français
            <span
              aria-hidden="true"
              className="lang-swap grid size-10 place-items-center rounded-full bg-accent text-on-accent"
            >
              ⇄
            </span>
            {LANGS[lang]}
          </span>
        }
        actions={
          <>
            <div
              className="flex rounded-full border border-line bg-surface p-1"
              role="group"
              aria-label="Langue cible"
            >
              {(Object.keys(LANGS) as ("en" | "de")[]).map((l) => (
                <button
                  key={l}
                  type="button"
                  aria-pressed={lang === l}
                  onClick={() => setLang(l)}
                  className={`rounded-full px-4 py-1.5 text-sm font-bold transition-colors ${lang === l ? "bg-accent text-on-accent" : "text-ink-muted"}`}
                >
                  {LANGS[l]}
                </button>
              ))}
            </div>
            <Button busy={translate.isPending} onClick={() => translate.mutate()}>
              {data ? "Retraduire" : "Traduire"}
            </Button>
          </>
        }
      >
        Chiffres et noms propres (employeurs, outils, projets) sont vérifiés ligne par ligne. Cliquez une
        ligne traduite pour la corriger.
        {data && (
          <span className="mt-2 flex flex-wrap items-center gap-3">
            <AiBadge kind={data.providerKind} />
            <VoteButtons role="traduction" kind={data.providerKind} />
          </span>
        )}
      </SceneHeader>

      {translate.isPending && <Thinking label="Traduction ligne par ligne, puis vérification…" />}
      {translate.isError && <Alert tone="error">{errorMessage(translate.error)}</Alert>}
      {data?.providerKind === "demo" && (
        <Alert tone="info">Démonstration : traduction mot à mot, sans modèle.</Alert>
      )}

      <div className="sheets grid gap-6 @2xl:grid-cols-2">
        <article className="studio-paper sheet-left" lang="fr" aria-label="CV original">
          <p className="mb-3 text-[0.65rem] font-extrabold tracking-[0.1em] text-[#536657]">
            ORIGINAL · FRANÇAIS
          </p>
          {groups.map((g) => (
            <section key={g.section + g.lines[0]!.path} className="mb-3">
              <h3 className="border-b border-[#d7dcd8] pb-0.5 text-[0.65rem] font-extrabold tracking-[0.08em] text-[#536657] uppercase">
                {g.section}
              </h3>
              <ul className="mt-1.5 space-y-1 text-[0.82rem] leading-relaxed">
                {g.lines.map((l) => (
                  <li key={l.path} {...lineProps(l.path)}>
                    <span aria-hidden="true" className="twin-num">
                      {numbered.get(l.path)}
                    </span>
                    {l.text}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </article>

        <article
          className={`studio-paper sheet-right ${data ? "" : "is-empty"}`}
          lang={lang}
          aria-label={`CV en ${LANGS[lang].toLowerCase()}`}
        >
          <p className="mb-3 text-[0.65rem] font-extrabold tracking-[0.1em] text-[#536657]">
            {LANGS[lang].toUpperCase()} · CLIQUER POUR MODIFIER
          </p>
          {!data ? (
            <p className="grid min-h-60 place-items-center text-center text-sm text-[#536657]">
              La feuille traduite apparaîtra ici.
            </p>
          ) : (
            groups.map((g) => (
              <section key={g.section + g.lines[0]!.path} className="mb-3">
                <h3 className="border-b border-[#d7dcd8] pb-0.5 text-[0.65rem] font-extrabold tracking-[0.08em] text-[#536657] uppercase">
                  {g.section}
                </h3>
                <ul className="mt-1.5 space-y-1 text-[0.82rem] leading-relaxed">
                  {g.lines.map((l) => {
                    const value = edits[l.path] ?? byPath.get(l.path) ?? l.text;
                    return (
                      <li key={l.path} {...lineProps(l.path)}>
                        <span aria-hidden="true" className="twin-num">
                          {numbered.get(l.path)}
                        </span>
                        {editing === l.path ? (
                          <textarea
                            autoFocus
                            aria-label={`Traduction de la ligne ${numbered.get(l.path)}`}
                            className="w-full rounded-md border border-[#c8e33a] bg-[#fbfde9] p-1 text-[0.82rem]"
                            value={value}
                            onChange={(e) => setEdits((m) => ({ ...m, [l.path]: e.target.value }))}
                            onBlur={() => setEditing(null)}
                          />
                        ) : (
                          <button
                            type="button"
                            onClick={() => setEditing(l.path)}
                            className={`w-full text-left ${edits[l.path] ? "underline decoration-[#c8e33a] decoration-2" : ""}`}
                          >
                            {value}
                            {rejected.has(l.path) && !edits[l.path] && (
                              <span className="ml-1 rounded bg-[#fbf0d9] px-1 text-[0.65rem] font-bold text-[#8a4a0a]">
                                original gardé
                              </span>
                            )}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))
          )}
        </article>
      </div>

      {data && (
        <div className="export-dock sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-full border border-line bg-surface/90 p-2 pl-5 shadow-float backdrop-blur-md">
          {pending > 0 ? (
            <>
              <Badge tone="info">
                {pending} modification{pending > 1 ? "s" : ""}
              </Badge>
              <Button busy={save.isPending} onClick={() => save.mutate()}>
                Enregistrer
              </Button>
              <Button variant="ghost" onClick={() => setEdits({})}>
                Annuler
              </Button>
            </>
          ) : (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  className="size-4 accent-accent-text"
                  checked={reviewed}
                  onChange={(e) => setReviewed(e.target.checked)}
                />
                J'ai relu la traduction
              </label>
              <CopyButton text={lines.map((l) => byPath.get(l.path) ?? l.text).join("\n")} label="Copier" />
              <Button busy={exportPdf.isPending} disabled={!reviewed} onClick={() => exportPdf.mutate()}>
                PDF en {LANGS[lang].toLowerCase()}
              </Button>
            </>
          )}
          {(save.isError || exportPdf.isError) && (
            <Alert tone="error">{errorMessage(save.error ?? exportPdf.error)}</Alert>
          )}
        </div>
      )}
    </div>
  );
}
