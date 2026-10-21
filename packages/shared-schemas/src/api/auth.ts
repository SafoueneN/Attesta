import { z } from "zod";

/** Rôles d'un utilisateur (ADR 0024) ; l'invité est le parcours anonyme (ADR 0014, point 7). */
export const Role = z.enum(["candidate", "admin", "guest"]);
export type Role = z.infer<typeof Role>;

export const LoginToken = z.string().regex(/^[A-Za-z0-9_-]{20,100}$/, "Ce lien n'est pas valide.");

/** Demande d'un lien de connexion : la politique de confidentialité doit être acceptée. */
export const LoginLinkRequest = z.object({
  email: z
    .email("Saisissez une adresse e-mail valide.")
    .max(254, "254 caractères au plus")
    .transform((e) => e.toLowerCase()),
  policyAccepted: z.literal(true, "Acceptez la politique de confidentialité pour continuer."),
});
export type LoginLinkRequest = z.input<typeof LoginLinkRequest>;

/** Aperçu d'un lien avant sa consommation : l'adresse est masquée (« l***@example.org »). */
export const LoginLinkPreview = z.object({ maskedEmail: z.string() });

export const SessionCreate = z.object({ token: LoginToken });

export const SessionUser = z.object({
  id: z.string(),
  role: Role,
  /** Absente pour un invité. */
  email: z.string().optional(),
});
export type SessionUser = z.infer<typeof SessionUser>;

/** Jeton d'accès (15 min, en mémoire côté navigateur) ; le refresh token part en cookie HttpOnly. */
export const SessionResponse = z.object({
  accessToken: z.string(),
  expiresIn: z.number().int().positive(),
  user: SessionUser,
});
export type SessionResponse = z.infer<typeof SessionResponse>;

export const ConsentPurpose = z.enum(["service", "veille", "promo"]);

export const Consent = z.object({
  purpose: ConsentPurpose,
  granted: z.boolean(),
  policyVersion: z.string(),
  at: z.string(),
});

export const Me = z.object({
  id: z.string(),
  email: z.string(),
  role: Role,
  createdAt: z.string(),
  consents: z.array(Consent),
});
export type Me = z.infer<typeof Me>;

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
  email: z.string(),
  status: z.enum(["active", "deleting"]),
});
export type UserContact = z.infer<typeof UserContact>;

export const AuthAdminStats = z.object({
  users: z.number().int(),
  admins: z.number().int(),
  newUsers30d: z.number().int(),
  logins7d: z.number().int(),
  deletionsPending: z.number().int(),
  outboxFailed: z.number().int(),
});
