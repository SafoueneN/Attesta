import type { FaithfulnessIssue, Profile } from "@attesta/shared-schemas";
import type { z } from "zod";

/** Libellé lisible d'un pointeur de fait, pour la vue de traçabilité (repris du monolithe). */
export function describePointer(profile: Profile, pointer: string): string {
  const [, section, a, field, b] = pointer.split("/");
  const n = Number(a) + 1;
  const m = Number(b) + 1;
  switch (section) {
    case "basics":
      return a === "label" ? "Profil – titre professionnel" : "Profil – résumé";
    case "work": {
      const job = profile.work[Number(a)]?.position ?? "";
      if (field === "highlights") return `Expérience ${n} (${job}) – réalisation ${m}`;
      if (field === "summary") return `Expérience ${n} (${job}) – description`;
      return `Expérience ${n} – intitulé du poste`;
    }
    case "projects":
      return field === "highlights" ? `Projet ${n} – réalisation ${m}` : `Projet ${n}`;
    case "skills":
      return `Compétence : ${profile.skills[Number(a)]?.name ?? n}`;
    default:
      return pointer;
  }
}

/**
 * Libellé d'un élément du profil qu'une pièce justificative peut appuyer (ADR 0027). Même règle que le
 * service `profiles` : une pièce ne justifie un élément que si ce libellé n'a pas changé depuis son dépôt.
 */
export function evidenceAnchor(profile: Profile, target: string): string | undefined {
  const [, section, a] = target.split("/");
  const i = Number(a);
  const join = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(" – ");
  switch (section) {
    case "work": {
      const w = profile.work[i];
      return w && join(w.position, w.name);
    }
    case "education": {
      const e = profile.education[i];
      return e && join([e.studyType, e.area].filter(Boolean).join(" "), e.institution);
    }
    case "certificates": {
      const c = profile.certificates[i];
      return c && join(c.name, c.issuer);
    }
    case "languages":
      return profile.languages[i]?.language;
    default:
      return undefined;
  }
}

/**
 * Une ligne du CV est justifiée si l'un de ses faits appartient à un élément appuyé par une pièce dont
 * l'ancrage correspond encore à cet élément dans l'instantané du profil utilisé pour la génération.
 */
export function isJustified(
  profile: Profile,
  sources: string[],
  evidence: { target: string; anchor: string }[],
): boolean {
  return sources.some((source) =>
    evidence.some(
      (e) =>
        (source === e.target || source.startsWith(`${e.target}/`)) &&
        evidenceAnchor(profile, e.target) === e.anchor,
    ),
  );
}

/** Texte du fait désigné par un pointeur, pour l'afficher à côté de la ligne qui le cite. */
export function factText(profile: Profile, pointer: string): string | undefined {
  let node: unknown = profile;
  for (const token of pointer.split("/").slice(1)) {
    if (node === null || typeof node !== "object") return undefined;
    node = (node as Record<string, unknown>)[token];
  }
  if (typeof node === "string") return node;
  if (node && typeof node === "object" && "name" in node) {
    const skill = node as { name: string; keywords?: string[] };
    return skill.keywords?.length ? `${skill.name} : ${skill.keywords.join(", ")}` : skill.name;
  }
  return undefined;
}

/** Raison d'un écart, en français, pour le candidat. */
export function describeIssue(issue: z.infer<typeof FaithfulnessIssue>): string {
  switch (issue.kind) {
    case "number":
      return `le chiffre « ${issue.value} » ne figure pas dans la source`;
    case "date":
      return `l'année « ${issue.value} » ne figure pas dans la source`;
    case "entity":
      return `« ${issue.value} » ne figure ni dans la source ni dans vos compétences`;
    case "skill":
      return `« ${issue.value} » est demandé par l'offre mais absent de votre profil`;
    case "unresolved-source":
      return "la source citée n'existe pas dans votre profil";
    case "foreign-source":
      return "la source citée appartient à une autre expérience";
  }
}

const dateFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeStyle: "short" });
const dayFormat = new Intl.DateTimeFormat("fr-FR", { dateStyle: "long" });
export const formatDateTime = (iso: string) => dateFormat.format(new Date(iso));
export const formatDay = (iso: string) => dayFormat.format(new Date(iso));
export const percent = (v: number) => `${Math.round(v * 100)} %`;
