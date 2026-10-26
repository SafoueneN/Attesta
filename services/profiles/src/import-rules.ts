import type { ImportedProfile } from "@attesta/shared-schemas";

/*
 * Import de CV sans IA (ADR 0038) : extraction par règles du texte d'un PDF, quand aucun modèle n'est
 * configuré ou qu'il est indisponible. Moins fine que l'extraction par Claude, elle ne devine rien : chaque
 * valeur est recopiée du texte, puis passe le même contrôle (`groundExtraction`) et la relecture du candidat.
 */

type Section = "summary" | "work" | "education" | "skills" | "languages" | "other";

/** Titres de rubrique (ligne seule), en français, anglais et allemand. */
const HEADINGS: [Section, RegExp][] = [
  [
    "work",
    /^(exp[ée]riences?( professionnelles?)?|parcours( professionnel)?|work experience|experience|employment( history)?|berufserfahrung|berufliche erfahrung|praxiserfahrung)$/i,
  ],
  [
    "education",
    /^(formations?|[ée]tudes|dipl[ôo]mes?|education|academic background|ausbildung|bildungsweg|studium)$/i,
  ],
  [
    "skills",
    /^(comp[ée]tences( techniques)?|savoir[- ]faire|outils|skills|technical skills|kenntnisse|f[äa]higkeiten|it[- ]kenntnisse)$/i,
  ],
  ["languages", /^(langues|languages|sprachen|sprachkenntnisse)$/i],
  ["summary", /^(profil|r[ée]sum[ée]|[àa] propos|summary|profile|about me|über mich|kurzprofil)$/i],
  [
    "other",
    /^(centres? d'int[ée]r[êe]ts?|loisirs|hobbies|interests|interessen|r[ée]f[ée]rences|references|certifications?|projets?|projects?)$/i,
  ],
];

const MONTHS: Record<string, string> = {
  jan: "01",
  janv: "01",
  janvier: "01",
  january: "01",
  januar: "01",
  feb: "02",
  fev: "02",
  fevr: "02",
  fevrier: "02",
  february: "02",
  februar: "02",
  mar: "03",
  mars: "03",
  march: "03",
  marz: "03",
  apr: "04",
  avr: "04",
  avril: "04",
  april: "04",
  may: "05",
  mai: "05",
  jun: "06",
  juin: "06",
  june: "06",
  juni: "06",
  jul: "07",
  juil: "07",
  juillet: "07",
  july: "07",
  juli: "07",
  aug: "08",
  aou: "08",
  aout: "08",
  august: "08",
  sep: "09",
  sept: "09",
  septembre: "09",
  september: "09",
  oct: "10",
  octobre: "10",
  october: "10",
  oktober: "10",
  nov: "11",
  novembre: "11",
  november: "11",
  dec: "12",
  decembre: "12",
  december: "12",
  dez: "12",
  dezember: "12",
};

const plain = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/** « 03/2021 », « mars 2021 », « 2021-03 », « 2021 » → « 2021-03 » ou « 2021 ». */
function partialDate(raw: string): string | null {
  // Point d'abréviation retiré (« sept. »), pas celui d'une date allemande (« 10.2015 »).
  const t = plain(raw)
    .replace(/([a-z])\./g, "$1")
    .trim();
  let m = /^(\d{1,2})[/.-](\d{4})$/.exec(t);
  if (m) return `${m[2]}-${m[1]!.padStart(2, "0")}`;
  m = /^(\d{4})[/.-](\d{1,2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]!.padStart(2, "0")}`;
  m = /^([a-z]+)\s+(\d{4})$/.exec(t);
  if (m && MONTHS[m[1]!]) return `${m[2]}-${MONTHS[m[1]!]}`;
  m = /^(\d{4})$/.exec(t);
  return m ? m[1]! : null;
}

const DATE = String.raw`(?:\d{1,2}[/.-]\d{4}|\d{4}[/.-]\d{1,2}|[A-Za-zÀ-ÿ]{3,9}\.?\s+\d{4}|\d{4})`;
const NOW = String.raw`(?:aujourd'hui|aujourd’hui|pr[ée]sent|present|now|current|actuel(?:lement)?|en cours|heute|bis heute|laufend)`;
const RANGE = new RegExp(`(${DATE})\\s*(?:-|–|—|à|au|to|bis)\\s*(${DATE}|${NOW})`, "i");

/** Plage de dates d'une ligne d'en-tête d'entrée, et le reste de la ligne. */
function datesOf(line: string): { start: string; end: string | null; rest: string } | undefined {
  for (let from = 0; from < line.length;) {
    const range = RANGE.exec(line.slice(from));
    if (!range) return undefined;
    const start = partialDate(range[1]!);
    if (!start) {
      // « Acme 2016 – 2018 » : « Acme 2016 » ressemble à « mois année » ; on reprend au mot suivant.
      from += range.index + (range[1]!.search(/\s/) + 1 || range[0].length);
      continue;
    }
    const end = new RegExp(NOW, "i").test(range[2]!) ? null : partialDate(range[2]!);
    return {
      start,
      end,
      rest: trimSeparators(line.replace(range[0], "")),
    };
  }
  return undefined;
}

/** Séparateurs retirés aux deux bouts, en temps linéaire (une ligne de PDF peut être très longue). */
function trimSeparators(text: string): string {
  const isSep = (c: string) => /[\s|,·•–—-]/.test(c);
  let start = 0;
  let end = text.length;
  while (start < end && isSep(text[start]!)) start++;
  while (end > start && isSep(text[end - 1]!)) end--;
  return text.slice(start, end);
}

const BULLET = /^\s*[•●▪◦·*‣–-]\s+/;
const isBullet = (line: string) => BULLET.test(line);

/**
 * « Poste  Entreprise · Ville », « Poste – Entreprise », « Poste chez Entreprise » → morceaux dans l'ordre :
 * poste (ou diplôme), employeur (ou établissement), lieu.
 */
function splitTitle(text: string): string[] {
  const parts = text
    .split(/\s{2,}|\s+[·•|]\s+|\s+(?:–|—|-|@|chez|bei|at)\s+|,\s+/i)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.length ? parts : [text];
}

interface Entry {
  head: string;
  start: string | null;
  end: string | null;
  lines: string[];
}

/**
 * Entrées datées d'une rubrique : une ligne avec une plage de dates ouvre une entrée. `single` (formations) :
 * une ligne qui se termine par une année ouvre aussi une entrée (« Master Management  IESEG  2014 »).
 */
function entries(lines: string[], single = false): Entry[] {
  const out: Entry[] = [];
  for (const line of lines) {
    const dates = datesOf(line);
    if (dates) {
      out.push({ head: dates.rest, start: dates.start, end: dates.end, lines: [] });
      continue;
    }
    // Année seule, n'importe où dans la ligne : ce qui l'entoure devient le titre (« … Informatique 2018 INSA »).
    const year = single ? /^(.*?)\s*\b((?:19|20)\d{2})\b\s*(.*)$/.exec(line) : null;
    if (year && (year[1] || year[3]) && !isBullet(line)) {
      const head = [year[1], year[3]].map((p) => p?.replace(/^[\s,–—-]+|[\s,–—-]+$/g, "")).filter(Boolean);
      out.push({ head: head.join("  "), start: null, end: year[2]!, lines: [] });
      continue;
    }
    const current = out.at(-1);
    if (!current) continue;
    // Une ligne sans dates juste après l'en-tête complète le titre si celui-ci est vide ou court.
    if (!current.head && !isBullet(line)) current.head = line;
    else current.lines.push(line);
  }
  return out;
}

export function rulesProfile(text: string): ImportedProfile {
  const lines = text
    .split(/\r?\n/)
    // Deux espaces ou plus séparent des colonnes (« Master  IESEG  2014 ») : gardés pour splitTitle.
    .map((l) =>
      l
        .replace(/\s{2,}/g, "  ")
        .replace(/\s/g, " ")
        .trim(),
    )
    .filter(Boolean);

  const email = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(text)?.[0] ?? null;
  // Téléphone : 9 à 13 chiffres groupés (« 06 12 34 56 78 », « +49 30 1234567 »), dans l'en-tête seulement.
  const phoneOf = (l: string) => /(?:\+\d{1,3}[\s.]?)?\(?\d\)?(?:[\s.-]?\d){8,12}/.exec(l)?.[0]?.trim();
  const url = /https?:\/\/[^\s,]+|(?:www\.|linkedin\.com\/)[^\s,]+/i.exec(text)?.[0] ?? null;

  // Découpage en rubriques ; ce qui précède la première rubrique est l'en-tête (nom, titre, coordonnées).
  const bySection: Record<Section, string[]> = {
    summary: [],
    work: [],
    education: [],
    skills: [],
    languages: [],
    other: [],
  };
  const isHeading = (line: string) =>
    line.length <= 40 && HEADINGS.find(([, re]) => re.test(line.replace(/[:：]$/, "").trim()));
  const isContact = (l: string) => /@|https?:|www\.|linkedin|\+?\d[\d\s.-]{7,}/i.test(l);
  const isName = (l: string) => /^[\p{L}'’ -]{3,60}$/u.test(l) && l.split(" ").length <= 5;
  const firstHeading = lines.findIndex((l) => isHeading(l));
  const top = firstHeading === -1 ? lines.length : firstHeading;
  // Bloc d'identité : avant la première rubrique ; sinon autour de la ligne de coordonnées. Certains PDF (CV
  // en colonnes, CV exportés par Attesta) placent nom, titre et coordonnées à la fin du flux de texte.
  let identity = lines.slice(0, top).map((_, i) => i);
  if (!identity.some((i) => isName(lines[i]!) && !isContact(lines[i]!))) {
    const contact = lines.findIndex((l, i) => i >= top && /[\w.+-]+@[\w-]+\.[\w-]/.test(l) && !isHeading(l));
    if (contact !== -1) {
      let from = contact;
      while (from > top && contact - from < 2 && !isHeading(lines[from - 1]!) && !isContact(lines[from - 1]!))
        from--;
      let to = contact + 1;
      while (to < lines.length && to - contact < 3 && isContact(lines[to]!) && !isHeading(lines[to]!)) to++;
      identity = [...identity, ...Array.from({ length: to - from }, (_, k) => from + k)];
    }
  }
  const inIdentity = new Set(identity);

  const header: string[] = [];
  let current: Section | undefined;
  for (const [i, line] of lines.entries()) {
    if (inIdentity.has(i)) {
      header.push(line);
      continue;
    }
    const heading = isHeading(line);
    if (heading) {
      current = heading[0];
      continue;
    }
    if (current) bySection[current].push(line);
  }

  const phone = header.map(phoneOf).find(Boolean) ?? null;
  // Ville : « Lyon, FR » ou « Lyon, France » parmi les coordonnées (séparateur final « · » toléré).
  const place = header
    .flatMap((l) => l.split(/\s+[·•|]\s+/))
    .map((part) =>
      /^([\p{L}' -]{2,40}),\s*([A-Z]{2}|[\p{L} ]{4,20})$/u.exec(part.replace(/\s*[·•|]\s*$/, "").trim()),
    )
    .find(Boolean);
  const headerText = header.filter((l) => !isContact(l));
  const name = headerText.find(isName) ?? null;
  const label = headerText.find((l) => l !== name && l.length <= 80 && !/\d{4}/.test(l)) ?? null;

  const work = entries(bySection.work).map((e) => {
    const [first, second, third] = splitTitle(e.head);
    return {
      position: first || null,
      name: second ?? null,
      location: third ?? null,
      startDate: e.start ?? e.end ?? "",
      endDate: e.start ? e.end : null,
      summary: null,
      highlights: e.lines.map((l) => l.replace(BULLET, "").trim()).filter((l) => l.length >= 3),
    };
  });

  const education = entries(bySection.education, true).map((e) => {
    const parts = splitTitle(e.head);
    const school = [...parts, ...e.lines].find((l) =>
      /(universit|[ée]cole|school|hochschule|lyc[ée]e|institut|college|iut|insa|polytech|ieseg|hec|essec)/i.test(
        l,
      ),
    );
    // Diplôme, puis spécialité : les morceaux qui ne sont pas l'établissement, dans l'ordre.
    const [degree, area] = parts.filter((p) => p !== school);
    return {
      institution: school ?? parts.at(-1) ?? null,
      studyType: degree ?? null,
      area: area ?? null,
      startDate: e.start,
      endDate: e.end,
    };
  });

  const skills = bySection.skills.flatMap((l) => {
    const item = l.replace(BULLET, "").trim();
    const at = item.indexOf(":");
    if (at > 0)
      return [
        {
          name: item.slice(0, at).trim(),
          keywords: item
            .slice(at + 1)
            .split(/[,;•|]/)
            .map((k) => k.trim())
            .filter(Boolean),
        },
      ];
    return item
      .split(/[,;•|]/)
      .map((k) => k.trim())
      .filter((k) => k.length >= 2 && k.length <= 60)
      .map((k) => ({ name: k, keywords: [] }));
  });

  const languages = bySection.languages.flatMap((l) =>
    l
      .replace(BULLET, "")
      .split(/[,;•|]/)
      .map((part) => {
        const m = /^([\p{L}]+)\s*(?:[:(–-]\s*([^)]+)\)?)?$/u.exec(part.trim());
        return m ? { language: m[1]!, fluency: m[2]?.trim() || null } : undefined;
      })
      .filter((x): x is { language: string; fluency: string | null } => Boolean(x)),
  );

  const summary = bySection.summary.join(" ").trim() || null;

  return {
    basics: {
      name,
      label,
      email,
      phone,
      city: place?.[1]?.trim() ?? null,
      countryCode: place?.[2] && /^[A-Z]{2}$/.test(place[2]) ? place[2] : null,
      url,
      summary,
    },
    work,
    education,
    skills: skills.slice(0, 30),
    languages: languages.slice(0, 10),
  };
}
