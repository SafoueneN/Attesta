import { normalize } from "@attesta/llm";

/**
 * Rapport 2 : écarts de compétences classés par priorité.
 *
 * Formule (décision Q16, **hypothèse à valider** avec des candidats) :
 *   priorité = 0,5 × fréquence + 0,3 × écart de salaire normalisé − 0,2 × effort
 * - fréquence : part des offres retenues qui demandent la compétence ;
 * - écart de salaire : médiane des offres qui la demandent, rapportée à celle des
 *   autres, ramené à [0, 1] (un écart de +30 % ou plus vaut 1). Nul si moins de
 *   3 offres de chaque côté publient un salaire : « données insuffisantes » ;
 * - effort : 0,25 si un mot de la compétence figure déjà dans le profil (outil
 *   voisin), 0,5 sinon. Approximation grossière, signalée comme telle.
 *
 * Un salaire est « associé à » une compétence, jamais « causé par » elle. Aucune
 * variable protégée (âge, genre, origine) n'entre dans le calcul : le profil n'en
 * contient pas.
 */
export const PRIORITY_WEIGHTS = { frequency: 0.5, salary: 0.3, effort: 0.2 } as const;
export const MIN_SALARY_SAMPLE = 3;
const FULL_GAP = 0.3;

export interface GapPosting {
  missingSkills: string[];
  salaryMinEur: number | null;
  salaryMaxEur: number | null;
}

export interface SkillGap {
  skill: string;
  /** Offres retenues qui demandent la compétence. */
  count: number;
  frequency: number;
  salary:
    | { status: "ok"; medianWith: number; medianWithout: number; rangeWith: [number, number]; sample: number }
    | { status: "insuffisant"; sample: number };
  effort: 0.25 | 0.5;
  priority: number;
}

const midpoint = (p: GapPosting) =>
  p.salaryMinEur !== null && p.salaryMaxEur !== null
    ? (p.salaryMinEur + p.salaryMaxEur) / 2
    : (p.salaryMinEur ?? p.salaryMaxEur);

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

const words = (text: string) =>
  normalize(text)
    .trim()
    .split(" ")
    .filter((w) => w.length >= 3);

export function skillGaps(postings: GapPosting[], profileSkills: string[], limit = 5): SkillGap[] {
  if (postings.length === 0) return [];
  const known = new Set(profileSkills.flatMap(words));
  const bySkill = new Map<string, { label: string; postings: Set<GapPosting> }>();
  for (const posting of postings) {
    for (const skill of posting.missingSkills) {
      const key = normalize(skill);
      const entry = bySkill.get(key) ?? { label: skill, postings: new Set() };
      entry.postings.add(posting);
      bySkill.set(key, entry);
    }
  }

  return [...bySkill.values()]
    .map(({ label, postings: withSkill }): SkillGap => {
      const frequency = withSkill.size / postings.length;
      const paid = (list: GapPosting[]) =>
        list
          .map((p) => ({ p, mid: midpoint(p) }))
          .filter((x): x is { p: GapPosting; mid: number } => x.mid !== null);
      const paidWith = paid([...withSkill]);
      const paidWithout = paid(postings.filter((p) => !withSkill.has(p)));
      const sample = paidWith.length + paidWithout.length;
      let salary: SkillGap["salary"] = { status: "insuffisant", sample };
      let gapScore = 0;
      if (paidWith.length >= MIN_SALARY_SAMPLE && paidWithout.length >= MIN_SALARY_SAMPLE) {
        const medianWith = median(paidWith.map((x) => x.mid));
        const medianWithout = median(paidWithout.map((x) => x.mid));
        const low = median(paidWith.map((x) => x.p.salaryMinEur ?? x.mid));
        const high = median(paidWith.map((x) => x.p.salaryMaxEur ?? x.mid));
        salary = { status: "ok", medianWith, medianWithout, rangeWith: [low, high], sample };
        gapScore = Math.max(0, Math.min(1, (medianWith - medianWithout) / medianWithout / FULL_GAP));
      }
      const effort = words(label).some((w) => known.has(w)) ? 0.25 : 0.5;
      const priority =
        PRIORITY_WEIGHTS.frequency * frequency +
        PRIORITY_WEIGHTS.salary * gapScore -
        PRIORITY_WEIGHTS.effort * effort;
      return { skill: label, count: withSkill.size, frequency, salary, effort, priority };
    })
    .sort((a, b) => b.priority - a.priority || b.count - a.count || a.skill.localeCompare(b.skill))
    .slice(0, limit);
}
