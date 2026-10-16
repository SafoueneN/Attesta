/**
 * Libellés de l'interface. Seul le français est livré (décision Q4) ; une autre
 * langue s'ajoute avec une entrée de même forme.
 */
export const fr = {
  appName: "Attesta",
  tagline: "Le CV qui dit vrai",
  skipLink: "Aller au contenu",
  themeToggle: "Thème sombre",
  stepOf: (n: number, total: number) => `Étape ${n} sur ${total}`,
  steps: ["Profil", "Expériences et formations", "Offre visée", "Aperçu et corrections", "Export PDF"],
  previous: "Étape précédente",
  next: "Continuer",
  errorSummaryTitle: "Corrigez les points suivants pour continuer",
  errorTitlePrefix: "Erreur : ",
  optional: "(facultatif)",
  clearData: "Effacer mes données",
  dataCleared: "Vos données ont été effacées.",
  privacyNote:
    "Sans compte, vos informations restent dans une session temporaire : elles sont effacées après 2 h d'inactivité, et au plus tard 24 h après votre arrivée. Le PDF est généré à la demande et n'est pas conservé.",
} as const;

export type Messages = typeof fr;
