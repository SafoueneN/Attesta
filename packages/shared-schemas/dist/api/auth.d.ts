import { z } from "zod";
/** Rôles d'un utilisateur (ADR 0024) ; l'invité est le parcours anonyme (ADR 0014, point 7). */
export declare const Role: z.ZodEnum<{
    candidate: "candidate";
    admin: "admin";
    guest: "guest";
}>;
export type Role = z.infer<typeof Role>;
export declare const LoginToken: z.ZodString;
/** Demande d'un lien de connexion : la politique de confidentialité doit être acceptée. */
export declare const LoginLinkRequest: z.ZodObject<{
    email: z.ZodPipe<z.ZodEmail, z.ZodTransform<string, string>>;
    policyAccepted: z.ZodLiteral<true>;
}, z.core.$strip>;
export type LoginLinkRequest = z.input<typeof LoginLinkRequest>;
/** Aperçu d'un lien avant sa consommation : l'adresse est masquée (« l***@example.org »). */
export declare const LoginLinkPreview: z.ZodObject<{
    maskedEmail: z.ZodString;
}, z.core.$strip>;
export declare const SessionCreate: z.ZodObject<{
    token: z.ZodString;
}, z.core.$strip>;
export declare const SessionUser: z.ZodObject<{
    id: z.ZodString;
    role: z.ZodEnum<{
        candidate: "candidate";
        admin: "admin";
        guest: "guest";
    }>;
    email: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type SessionUser = z.infer<typeof SessionUser>;
/** Jeton d'accès (15 min, en mémoire côté navigateur) ; le refresh token part en cookie HttpOnly. */
export declare const SessionResponse: z.ZodObject<{
    accessToken: z.ZodString;
    expiresIn: z.ZodNumber;
    user: z.ZodObject<{
        id: z.ZodString;
        role: z.ZodEnum<{
            candidate: "candidate";
            admin: "admin";
            guest: "guest";
        }>;
        email: z.ZodOptional<z.ZodString>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type SessionResponse = z.infer<typeof SessionResponse>;
export declare const ConsentPurpose: z.ZodEnum<{
    service: "service";
    veille: "veille";
    promo: "promo";
}>;
export declare const Consent: z.ZodObject<{
    purpose: z.ZodEnum<{
        service: "service";
        veille: "veille";
        promo: "promo";
    }>;
    granted: z.ZodBoolean;
    policyVersion: z.ZodString;
    at: z.ZodString;
}, z.core.$strip>;
export declare const Me: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    role: z.ZodEnum<{
        candidate: "candidate";
        admin: "admin";
        guest: "guest";
    }>;
    createdAt: z.ZodString;
    consents: z.ZodArray<z.ZodObject<{
        purpose: z.ZodEnum<{
            service: "service";
            veille: "veille";
            promo: "promo";
        }>;
        granted: z.ZodBoolean;
        policyVersion: z.ZodString;
        at: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type Me = z.infer<typeof Me>;
/** Seul le consentement aux communications est modifiable ici (la veille est gérée par job-watch). */
export declare const ConsentUpdate: z.ZodObject<{
    purpose: z.ZodLiteral<"promo">;
    granted: z.ZodBoolean;
}, z.core.$strip>;
export declare const AccountDeletion: z.ZodObject<{
    confirm: z.ZodLiteral<true>;
}, z.core.$strip>;
export declare const ServiceTokenRequest: z.ZodObject<{
    service: z.ZodString;
    secret: z.ZodString;
    audience: z.ZodString;
    scope: z.ZodString;
}, z.core.$strip>;
export declare const ServiceTokenResponse: z.ZodObject<{
    accessToken: z.ZodString;
    expiresIn: z.ZodNumber;
}, z.core.$strip>;
/** Coordonnées d'un compte, pour un service autorisé (`users:contact`) : envoi de la veille. */
export declare const UserContact: z.ZodObject<{
    id: z.ZodString;
    email: z.ZodString;
    status: z.ZodEnum<{
        active: "active";
        deleting: "deleting";
    }>;
}, z.core.$strip>;
export type UserContact = z.infer<typeof UserContact>;
export declare const AuthAdminStats: z.ZodObject<{
    users: z.ZodNumber;
    admins: z.ZodNumber;
    newUsers30d: z.ZodNumber;
    logins7d: z.ZodNumber;
    deletionsPending: z.ZodNumber;
    outboxFailed: z.ZodNumber;
}, z.core.$strip>;
