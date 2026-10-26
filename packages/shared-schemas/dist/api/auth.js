import { z } from "zod";
/** Rôles d'un utilisateur (ADR 0024) ; l'invité est le parcours anonyme (ADR 0014, point 7). */
export const Role = z.enum(["candidate", "admin", "guest"]);
export const LoginToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Ce lien n'est pas valide.");
/** Demande d'un lien de connexion : la politique de confidentialité doit être acceptée. */
export const LoginLinkRequest = z.object({
    email: z
        .email("Saisissez une adresse e-mail valide.")
        .max(254, "254 caractères au plus")
        .transform((e) => e.toLowerCase()),
    policyAccepted: z.literal(true, "Acceptez la politique de confidentialité pour continuer."),
});
/** Aperçu d'un lien avant sa consommation : l'adresse est masquée (« l***@example.org »). */
export const LoginLinkPreview = z.object({ maskedEmail: z.string() });
export const SessionCreate = z.object({ token: LoginToken });
/**
 * Comptes par identifiant et mot de passe (ADR 0030) : aucun e-mail n'est demandé pour créer un compte.
 * L'adresse e-mail n'est saisie que dans la veille, pour recevoir les rapports.
 */
export const Username = z
    .string()
    .trim()
    .toLowerCase()
    .min(3, "3 caractères au moins")
    .max(30, "30 caractères au plus")
    .regex(/^[a-z0-9][a-z0-9._-]*$/, "Lettres sans accent, chiffres, point, tiret ou tiret bas.");
export const Password = z.string().min(10, "10 caractères au moins").max(128, "128 caractères au plus");
export const AccountCreate = z.object({
    username: Username,
    password: Password,
    policyAccepted: z.literal(true, "Acceptez la politique de confidentialité pour continuer."),
});
/** Connexion : aucune règle de format sur le mot de passe saisi, seulement des bornes. */
export const PasswordLogin = z.object({
    username: z.string().trim().toLowerCase().min(1, "Saisissez votre identifiant.").max(30),
    password: z.string().min(1, "Saisissez votre mot de passe.").max(128),
});
/** Mot de passe oublié (ADR 0039) : identifiant, un code de récupération inutilisé, nouveau mot de passe. */
export const PasswordReset = z.object({
    username: z.string().trim().toLowerCase().min(1, "Saisissez votre identifiant.").max(30),
    code: z.string().trim().min(8, "Saisissez un code de récupération.").max(20),
    password: Password,
});
export const PasswordChange = z.object({
    current: z.string().min(1, "Saisissez votre mot de passe actuel.").max(128),
    password: Password,
});
/** Codes de récupération en clair, remis une seule fois. */
export const RecoveryCodes = z.object({ codes: z.array(z.string()) });
export const SessionUser = z.object({
    id: z.string(),
    role: Role,
    /** Absente pour un invité. */
    email: z.string().optional(),
    /** Identifiant de connexion (ADR 0030) ; absent pour un invité et pour un ancien compte par lien. */
    username: z.string().optional(),
});
/** Jeton d'accès (15 min, en mémoire côté navigateur) ; le refresh token part en cookie HttpOnly. */
export const SessionResponse = z.object({
    accessToken: z.string(),
    expiresIn: z.number().int().positive(),
    user: SessionUser,
    /** Codes de récupération, remis une seule fois à la création du compte (ADR 0039). */
    recoveryCodes: z.array(z.string()).optional(),
});
export const ConsentPurpose = z.enum(["service", "veille", "promo"]);
export const Consent = z.object({
    purpose: ConsentPurpose,
    granted: z.boolean(),
    policyVersion: z.string(),
    at: z.string(),
});
export const Me = z.object({
    id: z.string(),
    /** Adresse d'un ancien compte par lien de connexion ; null pour un compte par identifiant (ADR 0030). */
    email: z.string().nullable(),
    username: z.string().nullable(),
    /** Codes de récupération encore utilisables ; null pour un ancien compte par e-mail (ADR 0039). */
    recoveryCodesLeft: z.number().int().nullable(),
    role: Role,
    createdAt: z.string(),
    consents: z.array(Consent),
});
/** Seul le consentement aux communications est modifiable ici (la veille est gérée par job-watch). */
export const ConsentUpdate = z.object({ purpose: z.literal("promo"), granted: z.boolean() });
export const AccountDeletion = z.object({
    confirm: z.literal(true, "Cochez la case pour confirmer la suppression définitive de votre compte."),
});
export const ServiceTokenRequest = z.object({
    service: z.string().regex(/^[a-z-]{2,30}$/),
    secret: z.string().min(32),
    audience: z.string().regex(/^[a-z-]{2,30}$/),
    scope: z.string().regex(/^[a-z]+:[a-z]+$/),
});
export const ServiceTokenResponse = z.object({ accessToken: z.string(), expiresIn: z.number().int() });
/** Coordonnées d'un compte, pour un service autorisé (`users:contact`) : envoi de la veille. */
export const UserContact = z.object({
    id: z.string(),
    /** Null pour un compte par identifiant : la veille envoie alors à l'adresse saisie dans la veille. */
    email: z.string().nullable(),
    status: z.enum(["active", "deleting"]),
});
export const AuthAdminStats = z.object({
    users: z.number().int(),
    admins: z.number().int(),
    newUsers30d: z.number().int(),
    logins7d: z.number().int(),
    deletionsPending: z.number().int(),
    outboxFailed: z.number().int(),
});
