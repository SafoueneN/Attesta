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
  accountLink: "Mon compte et ma veille",
  privacyLink: "Confidentialité",
  account: {
    title: "Mon compte",
    loginTitle: "Connexion",
    linkSentTitle: "Vérifiez votre messagerie",
    confirmTitle: "Confirmer ma veille emploi",
    confirmedTitle: "Veille confirmée",
    confirmed:
      "Votre veille emploi est active. Vous recevrez un e-mail les jours où de nouvelles offres correspondent à votre profil, jamais d'e-mail vide.",
    unsubscribeTitle: "Me désabonner",
    unsubscribedTitle: "Désabonnement confirmé",
    unsubscribed: "Vous ne recevrez plus de rapport de veille. Votre compte et votre profil sont conservés.",
    noDraft:
      "Aucun CV complet dans cette session : remplissez d'abord les étapes 1 à 3, dans ce même navigateur.",
    profileSaved: (version: number) =>
      `Profil enregistré (version ${version}). Votre veille utilisera cette version.`,
    profileFirst: "Enregistrez d'abord votre profil : la veille compare les offres à celui-ci.",
    unknownCity:
      "Ville introuvable dans ce pays. Indiquez une ville de plus de 15 000 habitants (par exemple la plus proche).",
    confirmSent:
      "Un e-mail de confirmation vient de vous être envoyé : la veille démarrera quand vous aurez cliqué sur son lien.",
    subscriptionUpdated: "Vos critères de veille sont mis à jour.",
    deleteConfirm: "Cochez la case pour confirmer la suppression définitive de votre compte.",
  },
} as const;

export type Messages = typeof fr;
