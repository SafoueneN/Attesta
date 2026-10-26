import type { Profile } from "@attesta/shared-schemas";
import type { CvLang } from "./labels.js";
import type { CvView } from "./view.js";

/*
 * Usages du CV selon le pays visé (ADR 0036). Ce que le candidat a saisi n'est jamais modifié : on choisit
 * seulement ce qui figure dans le document exporté.
 * - Allemagne (Lebenslauf) : photo, date de naissance, nationalité ; lieu, date et nom en signature.
 * - France : photo facultative ; ni âge ni nationalité (usage), permis de conduire courant.
 * - Canada : ni photo, ni âge, ni nationalité (lois sur les droits de la personne) ; l'autorisation de
 *   travail est utile.
 * - Tunisie : photo, date de naissance, nationalité et permis, comme le veut l'usage local.
 */
export type CvNorms = "DE" | "FR" | "CA" | "TN";

interface NormRules {
  photo: boolean;
  birthDate: boolean;
  nationality: boolean;
  workPermit: boolean;
  drivingLicence: boolean;
  signature: boolean;
}

export const NORMS: Record<CvNorms, NormRules> = {
  DE: {
    photo: true,
    birthDate: true,
    nationality: true,
    workPermit: true,
    drivingLicence: true,
    signature: true,
  },
  FR: {
    photo: true,
    birthDate: false,
    nationality: false,
    workPermit: true,
    drivingLicence: true,
    signature: false,
  },
  CA: {
    photo: false,
    birthDate: false,
    nationality: false,
    workPermit: true,
    drivingLicence: true,
    signature: false,
  },
  TN: {
    photo: true,
    birthDate: true,
    nationality: true,
    workPermit: false,
    drivingLicence: true,
    signature: false,
  },
};

const PERSONAL_LABELS = {
  fr: {
    birthDate: "Né(e) le",
    nationality: "Nationalité",
    workPermit: "Autorisation de travail",
    drivingLicence: "Permis",
  },
  en: {
    birthDate: "Date of birth",
    nationality: "Nationality",
    workPermit: "Work authorization",
    drivingLicence: "Driving licence",
  },
  de: {
    birthDate: "Geburtsdatum",
    nationality: "Staatsangehörigkeit",
    workPermit: "Arbeitserlaubnis",
    drivingLicence: "Führerschein",
  },
} as const;

/** 1990-04-12 → « 12/04/1990 » (fr), « 12.04.1990 » (de), « 1990-04-12 » (en, sans ambiguïté). */
const formatBirthDate = (iso: string, lang: CvLang) => {
  const [y, m, d] = iso.split("-");
  if (lang === "en") return iso;
  return lang === "de" ? `${d}.${m}.${y}` : `${d}/${m}/${y}`;
};

/** Lignes « informations personnelles » retenues pour ce pays, dans la langue du CV. */
export function personalLines(basics: Profile["basics"], norms: CvNorms, lang: CvLang): string[] {
  const rules = NORMS[norms];
  const labels = PERSONAL_LABELS[lang];
  return [
    rules.birthDate && basics.birthDate && `${labels.birthDate} ${formatBirthDate(basics.birthDate, lang)}`,
    rules.nationality && basics.nationality && `${labels.nationality} : ${basics.nationality}`,
    rules.workPermit && basics.workPermit && `${labels.workPermit} : ${basics.workPermit}`,
    rules.drivingLicence && basics.drivingLicence && `${labels.drivingLicence} ${basics.drivingLicence}`,
  ].filter((l): l is string => Boolean(l));
}

/** Signature du Lebenslauf : « Berlin, 24.10.2026 » puis le nom. */
export function signatureLine(
  basics: Profile["basics"],
  norms: CvNorms,
  today = new Date(),
): string | undefined {
  if (!NORMS[norms].signature) return undefined;
  const date = `${String(today.getDate()).padStart(2, "0")}.${String(today.getMonth() + 1).padStart(2, "0")}.${today.getFullYear()}`;
  return [basics.location?.city, date].filter(Boolean).join(", ");
}

/**
 * Applique les usages du pays à un CV : photo (si le pays l'admet et qu'elle existe), informations
 * personnelles retenues, signature. Les rubriques et les lignes sourcées ne changent pas.
 */
export function applyNorms(
  view: CvView,
  basics: Profile["basics"],
  norms: CvNorms,
  photo?: { mimeType: string; bytes: Uint8Array },
): CvView {
  return {
    ...view,
    photo:
      NORMS[norms].photo && photo
        ? `data:${photo.mimeType};base64,${Buffer.from(photo.bytes).toString("base64")}`
        : undefined,
    personal: personalLines(basics, norms, view.lang),
    signature: signatureLine(basics, norms),
  };
}
