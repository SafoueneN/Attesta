/*
 * Contenus commerciaux (ADR 0045), à remplir par le porteur du projet : rien n'est inventé.
 * - Avis : seulement de vrais utilisateurs, avec leur accord écrit ; la section n'apparaît que s'il y en a.
 * - Formules : tant que `plans` est vide, la page « Tarifs » annonce la gratuité du lancement.
 */

export interface Review {
  /** Prénom et initiale, ou anonymat : « Sophie L. », « Candidate en comptabilité ». */
  author: string;
  role: string;
  text: string;
  /** Date de l'accord écrit de l'auteur pour publier son avis (AAAA-MM-JJ). */
  consentDate: string;
}

export const REVIEWS: Review[] = [];

export interface Plan {
  name: string;
  /** Prix affiché tel quel, par exemple « 9 € / mois ». */
  price: string;
  features: string[];
  highlighted?: boolean;
}

export const PLANS: Plan[] = [];

/** Ce que propose Attesta aujourd'hui, gratuitement, pendant le lancement. */
export const FEATURES = [
  "CV ciblé pour chaque offre, chaque ligne reliée à votre profil",
  "Cinq modèles, lisibles par les logiciels de recrutement",
  "Usages de l'Allemagne, de la France, du Canada et de la Tunisie (photo, informations personnelles)",
  "Export PDF et Word, CV en ligne partageable",
  "Lettre de motivation contrôlée",
  "Juge de fidélité, conseillère ATS, traduction, coach d'entretien, plan de progression",
  "Veille emploi quotidienne dans quatre pays",
  "Suivi des candidatures et rappels",
];
