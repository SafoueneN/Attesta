/**
 * Informations légales affichées par les mentions légales, les CGU et la politique de confidentialité.
 * L'adresse de contact est fournie au build (VITE_CONTACT_EMAIL, obligatoire dans l'image : frontend/Dockerfile).
 */
export const LEGAL = {
  publisher: "Safouene Saassouki",
  contactEmail: (import.meta.env.VITE_CONTACT_EMAIL as string | undefined) ?? "",
  /** Hébergeur du service et de l'IA (Vertex AI, région UE) : infra/terraform, région europe-west9 (Paris). */
  host: {
    name: "Google Cloud EMEA Limited",
    address: "70 Sir John Rogerson's Quay, Dublin 2, Irlande",
    region: "région europe-west9 (Paris, France)",
  },
  /** Version des CGU et de la politique de confidentialité ; celle de la politique est journalisée (auth, job-watch). */
  version: "30 octobre 2026",
};
