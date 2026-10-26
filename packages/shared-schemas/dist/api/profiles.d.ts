import { z } from "zod";
export declare const ProfileSave: z.ZodObject<{
    profile: z.ZodObject<{
        basics: z.ZodObject<{
            name: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodEmail>;
            phone: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
            summary: z.ZodOptional<z.ZodString>;
            location: z.ZodOptional<z.ZodObject<{
                city: z.ZodOptional<z.ZodString>;
                region: z.ZodOptional<z.ZodString>;
                countryCode: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            profiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
                network: z.ZodString;
                url: z.ZodURL;
            }, z.core.$strip>>>;
            birthDate: z.ZodOptional<z.ZodISODate>;
            nationality: z.ZodOptional<z.ZodString>;
            workPermit: z.ZodOptional<z.ZodString>;
            drivingLicence: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        work: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            position: z.ZodString;
            url: z.ZodOptional<z.ZodURL>;
            location: z.ZodOptional<z.ZodString>;
            startDate: z.ZodString;
            endDate: z.ZodOptional<z.ZodString>;
            summary: z.ZodOptional<z.ZodString>;
            highlights: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        education: z.ZodDefault<z.ZodArray<z.ZodObject<{
            institution: z.ZodString;
            area: z.ZodOptional<z.ZodString>;
            studyType: z.ZodOptional<z.ZodString>;
            startDate: z.ZodOptional<z.ZodString>;
            endDate: z.ZodOptional<z.ZodString>;
            score: z.ZodOptional<z.ZodString>;
            courses: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        skills: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            level: z.ZodOptional<z.ZodString>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        languages: z.ZodDefault<z.ZodArray<z.ZodObject<{
            language: z.ZodString;
            fluency: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        projects: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            highlights: z.ZodDefault<z.ZodArray<z.ZodString>>;
            startDate: z.ZodOptional<z.ZodString>;
            endDate: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
        }, z.core.$strip>>>;
        certificates: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            issuer: z.ZodOptional<z.ZodString>;
            date: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export declare const StoredProfile: z.ZodObject<{
    version: z.ZodNumber;
    createdAt: z.ZodString;
    schemaVersion: z.ZodString;
    profile: z.ZodObject<{
        basics: z.ZodObject<{
            name: z.ZodString;
            label: z.ZodOptional<z.ZodString>;
            email: z.ZodOptional<z.ZodEmail>;
            phone: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
            summary: z.ZodOptional<z.ZodString>;
            location: z.ZodOptional<z.ZodObject<{
                city: z.ZodOptional<z.ZodString>;
                region: z.ZodOptional<z.ZodString>;
                countryCode: z.ZodOptional<z.ZodString>;
            }, z.core.$strip>>;
            profiles: z.ZodDefault<z.ZodArray<z.ZodObject<{
                network: z.ZodString;
                url: z.ZodURL;
            }, z.core.$strip>>>;
            birthDate: z.ZodOptional<z.ZodISODate>;
            nationality: z.ZodOptional<z.ZodString>;
            workPermit: z.ZodOptional<z.ZodString>;
            drivingLicence: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>;
        work: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            position: z.ZodString;
            url: z.ZodOptional<z.ZodURL>;
            location: z.ZodOptional<z.ZodString>;
            startDate: z.ZodString;
            endDate: z.ZodOptional<z.ZodString>;
            summary: z.ZodOptional<z.ZodString>;
            highlights: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        education: z.ZodDefault<z.ZodArray<z.ZodObject<{
            institution: z.ZodString;
            area: z.ZodOptional<z.ZodString>;
            studyType: z.ZodOptional<z.ZodString>;
            startDate: z.ZodOptional<z.ZodString>;
            endDate: z.ZodOptional<z.ZodString>;
            score: z.ZodOptional<z.ZodString>;
            courses: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        skills: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            level: z.ZodOptional<z.ZodString>;
            keywords: z.ZodDefault<z.ZodArray<z.ZodString>>;
        }, z.core.$strip>>>;
        languages: z.ZodDefault<z.ZodArray<z.ZodObject<{
            language: z.ZodString;
            fluency: z.ZodOptional<z.ZodString>;
        }, z.core.$strip>>>;
        projects: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            description: z.ZodOptional<z.ZodString>;
            highlights: z.ZodDefault<z.ZodArray<z.ZodString>>;
            startDate: z.ZodOptional<z.ZodString>;
            endDate: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
        }, z.core.$strip>>>;
        certificates: z.ZodDefault<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            issuer: z.ZodOptional<z.ZodString>;
            date: z.ZodOptional<z.ZodString>;
            url: z.ZodOptional<z.ZodURL>;
        }, z.core.$strip>>>;
    }, z.core.$strip>;
}, z.core.$strip>;
export type StoredProfile = z.infer<typeof StoredProfile>;
export declare const ProfileVersionSummary: z.ZodObject<{
    version: z.ZodNumber;
    createdAt: z.ZodString;
    label: z.ZodString;
}, z.core.$strip>;
/**
 * Profil extrait d'un CV PDF : brouillon à relire, jamais enregistré tel quel. Champs nullables : le
 * candidat complète dans le formulaire, qui applique ensuite le contrat strict `Profile`.
 */
export declare const ImportedProfile: z.ZodObject<{
    basics: z.ZodObject<{
        name: z.ZodNullable<z.ZodString>;
        label: z.ZodNullable<z.ZodString>;
        email: z.ZodNullable<z.ZodString>;
        phone: z.ZodNullable<z.ZodString>;
        city: z.ZodNullable<z.ZodString>;
        countryCode: z.ZodNullable<z.ZodString>;
        url: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>;
    work: z.ZodArray<z.ZodObject<{
        name: z.ZodNullable<z.ZodString>;
        position: z.ZodNullable<z.ZodString>;
        location: z.ZodNullable<z.ZodString>;
        startDate: z.ZodNullable<z.ZodString>;
        endDate: z.ZodNullable<z.ZodString>;
        summary: z.ZodNullable<z.ZodString>;
        highlights: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    education: z.ZodArray<z.ZodObject<{
        institution: z.ZodNullable<z.ZodString>;
        studyType: z.ZodNullable<z.ZodString>;
        area: z.ZodNullable<z.ZodString>;
        startDate: z.ZodNullable<z.ZodString>;
        endDate: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    skills: z.ZodArray<z.ZodObject<{
        name: z.ZodString;
        keywords: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    languages: z.ZodArray<z.ZodObject<{
        language: z.ZodString;
        fluency: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ImportedProfile = z.infer<typeof ImportedProfile>;
export declare const EVIDENCE_MAX_BYTES: number;
export declare const EVIDENCE_MAX_COUNT = 20;
export declare const EVIDENCE_MIME: readonly ["application/pdf", "image/png", "image/jpeg"];
/** Élément du profil qu'une pièce peut appuyer : une expérience, une formation, un certificat, une langue. */
export declare const EvidenceTarget: z.ZodString;
export declare const EvidenceKind: z.ZodEnum<{
    diplome: "diplome";
    attestation_employeur: "attestation_employeur";
    certificat: "certificat";
    recommandation: "recommandation";
    autre: "autre";
}>;
export type EvidenceKind = z.infer<typeof EvidenceKind>;
/** Champs du formulaire de dépôt (le fichier voyage à côté, en multipart). */
export declare const EvidenceUpload: z.ZodObject<{
    target: z.ZodString;
    kind: z.ZodEnum<{
        diplome: "diplome";
        attestation_employeur: "attestation_employeur";
        certificat: "certificat";
        recommandation: "recommandation";
        autre: "autre";
    }>;
    label: z.ZodString;
}, z.core.$strip>;
/** Pièce jointe par le candidat : métadonnées seulement (le fichier se télécharge à part). */
export declare const Evidence: z.ZodObject<{
    id: z.ZodString;
    target: z.ZodString;
    kind: z.ZodEnum<{
        diplome: "diplome";
        attestation_employeur: "attestation_employeur";
        certificat: "certificat";
        recommandation: "recommandation";
        autre: "autre";
    }>;
    label: z.ZodString;
    fileName: z.ZodString;
    mimeType: z.ZodEnum<{
        "application/pdf": "application/pdf";
        "image/png": "image/png";
        "image/jpeg": "image/jpeg";
    }>;
    sizeBytes: z.ZodNumber;
    anchor: z.ZodString;
    current: z.ZodBoolean;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type Evidence = z.infer<typeof Evidence>;
export declare const ImportResult: z.ZodObject<{
    profile: z.ZodObject<{
        basics: z.ZodObject<{
            name: z.ZodNullable<z.ZodString>;
            label: z.ZodNullable<z.ZodString>;
            email: z.ZodNullable<z.ZodString>;
            phone: z.ZodNullable<z.ZodString>;
            city: z.ZodNullable<z.ZodString>;
            countryCode: z.ZodNullable<z.ZodString>;
            url: z.ZodNullable<z.ZodString>;
            summary: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>;
        work: z.ZodArray<z.ZodObject<{
            name: z.ZodNullable<z.ZodString>;
            position: z.ZodNullable<z.ZodString>;
            location: z.ZodNullable<z.ZodString>;
            startDate: z.ZodNullable<z.ZodString>;
            endDate: z.ZodNullable<z.ZodString>;
            summary: z.ZodNullable<z.ZodString>;
            highlights: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        education: z.ZodArray<z.ZodObject<{
            institution: z.ZodNullable<z.ZodString>;
            studyType: z.ZodNullable<z.ZodString>;
            area: z.ZodNullable<z.ZodString>;
            startDate: z.ZodNullable<z.ZodString>;
            endDate: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
        skills: z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            keywords: z.ZodArray<z.ZodString>;
        }, z.core.$strip>>;
        languages: z.ZodArray<z.ZodObject<{
            language: z.ZodString;
            fluency: z.ZodNullable<z.ZodString>;
        }, z.core.$strip>>;
    }, z.core.$strip>;
    dropped: z.ZodNumber;
    method: z.ZodDefault<z.ZodEnum<{
        ia: "ia";
        regles: "regles";
    }>>;
}, z.core.$strip>;
export type ImportResult = z.infer<typeof ImportResult>;
/** Photo du CV (ADR 0036) : stockée chiffrée à part du profil, jamais envoyée à l'IA. */
export declare const PHOTO_MAX_BYTES: number;
export declare const ProfilePhoto: z.ZodObject<{
    mimeType: z.ZodEnum<{
        "image/png": "image/png";
        "image/jpeg": "image/jpeg";
    }>;
    sizeBytes: z.ZodNumber;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type ProfilePhoto = z.infer<typeof ProfilePhoto>;
