/**
 * Format de date unique du CV : MM/AAAA, ou AAAA si le mois est inconnu. Le jour
 * est volontairement omis, car les ATS lisent mieux un format homogène.
 */
export function formatPartialDate(date: string): string {
  const [year, month] = date.split("-");
  return month ? `${month}/${year}` : (year ?? "");
}

/** Période affichée : « 03/2021 – 12/2023 », « 03/2021 – aujourd'hui » ou « 2019 ». */
export function formatPeriod(start: string | undefined, end: string | undefined, present: string): string {
  if (start && end) {
    const from = formatPartialDate(start);
    const to = formatPartialDate(end);
    return from === to ? from : `${from} – ${to}`;
  }
  if (start) return `${formatPartialDate(start)} – ${present}`;
  if (end) return formatPartialDate(end);
  return "";
}
