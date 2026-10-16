import type { CvLine, Profile, TailoredCv } from "@attesta/schema";
import { formatPartialDate, formatPeriod } from "./dates.js";
import { CV_LABELS, type CvLang } from "./labels.js";

/**
 * Modèle de vue du CV, indépendant du gabarit. Chaque ligne garde le pointeur du
 * fait d'origine (`source`), exposé en `data-source` pour la vue de traçabilité.
 */
export interface CvLineView {
  text: string;
  source: string;
}

export interface CvEntryView {
  title: string;
  subtitle?: string;
  period?: string;
  source: string;
  lines: CvLineView[];
}

export type CvSectionId =
  "summary" | "work" | "projects" | "education" | "skills" | "languages" | "certificates";

export interface CvSectionView {
  id: CvSectionId;
  title: string;
  entries: CvEntryView[];
  items: CvLineView[];
}

export interface CvView {
  lang: CvLang;
  name: string;
  headline?: string;
  /** Pointeur(s) de la ligne de titre, pour la vue de traçabilité. */
  headlineSource?: string;
  contact: string[];
  sections: CvSectionView[];
}

const join = (parts: (string | undefined)[], sep: string) => parts.filter(Boolean).join(sep);

/**
 * Construit le CV directement depuis le profil, sans reformulation. C'est le CV
 * de la Phase 1, et aussi celui du mode dégradé quand le LLM est indisponible
 * (docs/adr/0003).
 */
export function viewFromProfile(profile: Profile, lang: CvLang = "fr"): CvView {
  const labels = CV_LABELS[lang];
  const { basics } = profile;

  const section = (id: CvSectionId, parts: Partial<CvSectionView>): CvSectionView => ({
    id,
    title: labels[id],
    entries: [],
    items: [],
    ...parts,
  });

  const sections: CvSectionView[] = [
    section("summary", {
      items: basics.summary ? [{ text: basics.summary, source: "/basics/summary" }] : [],
    }),
    section("work", {
      entries: profile.work.map((w, i) => ({
        title: w.position,
        subtitle: join([w.name, w.location], " · "),
        period: formatPeriod(w.startDate, w.endDate, labels.present),
        source: `/work/${i}`,
        lines: [
          ...(w.summary ? [{ text: w.summary, source: `/work/${i}/summary` }] : []),
          ...w.highlights.map((text, j) => ({ text, source: `/work/${i}/highlights/${j}` })),
        ],
      })),
    }),
    section("projects", {
      entries: profile.projects.map((p, i) => ({
        title: p.name,
        period: formatPeriod(p.startDate, p.endDate, labels.present),
        source: `/projects/${i}`,
        lines: [
          ...(p.description ? [{ text: p.description, source: `/projects/${i}/description` }] : []),
          ...p.highlights.map((text, j) => ({ text, source: `/projects/${i}/highlights/${j}` })),
        ],
      })),
    }),
    section("education", {
      entries: profile.education.map((e, i) => {
        const degree = join([e.studyType, e.area], " – ");
        return {
          title: degree || e.institution,
          subtitle: degree ? e.institution : undefined,
          period: formatPeriod(e.startDate, e.endDate, labels.present),
          source: `/education/${i}`,
          lines: [
            ...(e.score ? [{ text: e.score, source: `/education/${i}/score` }] : []),
            ...(e.courses.length
              ? [{ text: `${labels.courses} : ${e.courses.join(", ")}`, source: `/education/${i}/courses` }]
              : []),
          ],
        };
      }),
    }),
    section("skills", {
      items: profile.skills.map((s, i) => ({
        text: s.keywords.length ? `${s.name} : ${s.keywords.join(", ")}` : s.name,
        source: `/skills/${i}`,
      })),
    }),
    section("languages", {
      items: profile.languages.map((l, i) => ({
        text: join([l.language, l.fluency], " – "),
        source: `/languages/${i}`,
      })),
    }),
    section("certificates", {
      items: profile.certificates.map((c, i) => ({
        text: join([c.name, c.issuer, c.date && formatPartialDate(c.date)], " – "),
        source: `/certificates/${i}`,
      })),
    }),
  ];

  return {
    lang,
    name: basics.name,
    headline: basics.label,
    headlineSource: basics.label ? "/basics/label" : undefined,
    contact: [
      basics.email,
      basics.phone,
      join([basics.location?.city, basics.location?.countryCode], ", "),
      basics.url,
      ...basics.profiles.map((p) => p.url),
    ].filter((c): c is string => Boolean(c)),
    sections: sections.filter((s) => s.entries.length > 0 || s.items.length > 0),
  };
}

/**
 * CV ciblé : structure et faits (postes, employeurs, dates, diplômes) viennent du
 * profil ; seules les lignes rédigées viennent de la génération, avec leurs sources.
 * Une entrée dont toutes les lignes ont été retirées au contrôle de fidélité
 * reprend les faits d'origine : le contrôle n'efface jamais le parcours.
 */
export function viewFromTailored(profile: Profile, cv: TailoredCv, lang: CvLang = "fr"): CvView {
  const base = viewFromProfile(profile, lang);
  const toLines = (lines: CvLine[]) => lines.map((l) => ({ text: l.text, source: l.sources.join(" ") }));
  const reorder = <T extends { source: string }>(items: T[], refs: string[]) =>
    refs
      .map((ref) => items.find((item) => item.source === ref))
      .filter((item): item is T => item !== undefined);

  const sections = base.sections.map((section): CvSectionView => {
    switch (section.id) {
      case "summary":
        return cv.summary.length ? { ...section, items: toLines(cv.summary) } : section;
      case "work":
      case "projects": {
        const generated = cv[section.id];
        const entries = reorder(
          section.entries,
          generated.map((e) => e.ref),
        ).map((entry) => {
          const lines = generated.find((e) => e.ref === entry.source)?.highlights ?? [];
          return lines.length ? { ...entry, lines: toLines(lines) } : entry;
        });
        return { ...section, entries };
      }
      case "skills":
        return { ...section, items: reorder(section.items, cv.skills) };
      default:
        return section;
    }
  });

  return {
    ...base,
    headline: cv.headline?.text ?? base.headline,
    headlineSource: cv.headline ? cv.headline.sources.join(" ") : base.headlineSource,
    sections: sections.filter((s) => s.entries.length > 0 || s.items.length > 0),
  };
}
