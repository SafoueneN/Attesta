import { z } from "zod";
export declare const ProfileQuestion: z.ZodObject<{
    id: z.ZodString;
    target: z.ZodString;
    question: z.ZodString;
    why: z.ZodString;
}, z.core.$strip>;
export type ProfileQuestion = z.infer<typeof ProfileQuestion>;
export declare const ProfileInterview: z.ZodObject<{
    questions: z.ZodArray<z.ZodObject<{
        id: z.ZodString;
        target: z.ZodString;
        question: z.ZodString;
        why: z.ZodString;
    }, z.core.$strip>>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
/** Sujet facultatif : une compétence acquise grâce au plan de progression, à faire entrer au profil. */
export declare const ProfileInterviewRequest: z.ZodObject<{
    topic: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export type ProfileInterview = z.infer<typeof ProfileInterview>;
export declare const ProfileAnswer: z.ZodObject<{
    target: z.ZodString;
    question: z.ZodString;
    answer: z.ZodString;
}, z.core.$strip>;
/** Réalisation proposée à partir de la réponse : elle n'entre au profil qu'après validation du candidat. */
export declare const FactProposal: z.ZodObject<{
    target: z.ZodString;
    text: z.ZodString;
}, z.core.$strip>;
export declare const FactProposals: z.ZodObject<{
    proposals: z.ZodArray<z.ZodObject<{
        target: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>;
    dropped: z.ZodNumber;
    followUp: z.ZodNullable<z.ZodString>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type FactProposals = z.infer<typeof FactProposals>;
export declare const JudgeVerdict: z.ZodObject<{
    path: z.ZodString;
    verdict: z.ZodEnum<{
        fidele: "fidele";
        nuance: "nuance";
        infidele: "infidele";
    }>;
    explanation: z.ZodString;
    suggestion: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const FidelityJudgement: z.ZodObject<{
    verdicts: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        verdict: z.ZodEnum<{
            fidele: "fidele";
            nuance: "nuance";
            infidele: "infidele";
        }>;
        explanation: z.ZodString;
        suggestion: z.ZodNullable<z.ZodString>;
    }, z.core.$strip>>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type FidelityJudgement = z.infer<typeof FidelityJudgement>;
export declare const InterviewQuestion: z.ZodObject<{
    question: z.ZodString;
    intent: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
    tip: z.ZodString;
}, z.core.$strip>;
export declare const InterviewPrep: z.ZodObject<{
    questions: z.ZodArray<z.ZodObject<{
        question: z.ZodString;
        intent: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        tip: z.ZodString;
    }, z.core.$strip>>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
/** Niveau de l'entretien : RH (motivation), manager (situations), technique (métier). */
export declare const InterviewLevel: z.ZodEnum<{
    rh: "rh";
    manager: "manager";
    technique: "technique";
}>;
export declare const InterviewPrepRequest: z.ZodObject<{
    level: z.ZodDefault<z.ZodEnum<{
        rh: "rh";
        manager: "manager";
        technique: "technique";
    }>>;
}, z.core.$strip>;
export type InterviewPrep = z.infer<typeof InterviewPrep>;
export declare const InterviewAnswer: z.ZodObject<{
    question: z.ZodString;
    answer: z.ZodString;
}, z.core.$strip>;
export declare const InterviewFeedback: z.ZodObject<{
    star: z.ZodObject<{
        situation: z.ZodBoolean;
        task: z.ZodBoolean;
        action: z.ZodBoolean;
        result: z.ZodBoolean;
    }, z.core.$strip>;
    strengths: z.ZodArray<z.ZodString>;
    improvements: z.ZodArray<z.ZodString>;
    facts: z.ZodArray<z.ZodObject<{
        pointer: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>;
    highlights: z.ZodArray<z.ZodObject<{
        part: z.ZodEnum<{
            situation: "situation";
            task: "task";
            action: "action";
            result: "result";
        }>;
        excerpt: z.ZodString;
    }, z.core.$strip>>;
    followUp: z.ZodNullable<z.ZodString>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type InterviewFeedback = z.infer<typeof InterviewFeedback>;
export declare const LearningItem: z.ZodObject<{
    skill: z.ZodString;
    why: z.ZodString;
    steps: z.ZodArray<z.ZodString>;
    project: z.ZodString;
    weeks: z.ZodNumber;
    resources: z.ZodArray<z.ZodObject<{
        title: z.ZodString;
        url: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
export declare const LearningPlan: z.ZodObject<{
    items: z.ZodArray<z.ZodObject<{
        skill: z.ZodString;
        why: z.ZodString;
        steps: z.ZodArray<z.ZodString>;
        project: z.ZodString;
        weeks: z.ZodNumber;
        resources: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type LearningPlan = z.infer<typeof LearningPlan>;
/** Plan sur tous les CV du candidat : compétences les plus demandées d'abord. */
export declare const LearningOverview: z.ZodObject<{
    skills: z.ZodArray<z.ZodObject<{
        skill: z.ZodString;
        offers: z.ZodNumber;
        offerTitles: z.ZodArray<z.ZodString>;
    }, z.core.$strip>>;
    items: z.ZodArray<z.ZodObject<{
        skill: z.ZodString;
        why: z.ZodString;
        steps: z.ZodArray<z.ZodString>;
        project: z.ZodString;
        weeks: z.ZodNumber;
        resources: z.ZodArray<z.ZodObject<{
            title: z.ZodString;
            url: z.ZodString;
        }, z.core.$strip>>;
    }, z.core.$strip>>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type LearningOverview = z.infer<typeof LearningOverview>;
/** Le profil est celui du candidat qui demande l'explication : sa propre donnée, déjà affichée. */
export declare const MatchExplainRequest: z.ZodObject<{
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
export declare const MatchExplanation: z.ZodObject<{
    score: z.ZodNumber;
    matched: z.ZodArray<z.ZodObject<{
        skill: z.ZodString;
        evidence: z.ZodString;
    }, z.core.$strip>>;
    missing: z.ZodArray<z.ZodString>;
    missingMust: z.ZodArray<z.ZodString>;
    summary: z.ZodString;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type MatchExplanation = z.infer<typeof MatchExplanation>;
/** Scores calculés par le code seul (sans IA), pour toute une liste d'offres. */
export declare const MatchScoresRequest: z.ZodObject<{
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
    ids: z.ZodArray<z.ZodUUID>;
}, z.core.$strip>;
export declare const MatchScores: z.ZodArray<z.ZodObject<{
    id: z.ZodUUID;
    score: z.ZodNumber;
    matched: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>>;
export type MatchScores = z.infer<typeof MatchScores>;
export declare const TranslationLang: z.ZodEnum<{
    de: "de";
    en: "en";
}>;
export declare const TranslateRequest: z.ZodObject<{
    lang: z.ZodEnum<{
        de: "de";
        en: "en";
    }>;
}, z.core.$strip>;
export declare const CvTranslation: z.ZodObject<{
    lang: z.ZodEnum<{
        de: "de";
        en: "en";
    }>;
    lines: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        source: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>;
    rejected: z.ZodNumber;
    rejectedPaths: z.ZodArray<z.ZodString>;
    edited: z.ZodArray<z.ZodString>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type CvTranslation = z.infer<typeof CvTranslation>;
/** Lignes traduites modifiées par le candidat : mêmes chiffres et mêmes noms propres exigés. */
export declare const TranslationEdit: z.ZodObject<{
    lines: z.ZodArray<z.ZodObject<{
        path: z.ZodString;
        text: z.ZodString;
    }, z.core.$strip>>;
}, z.core.$strip>;
/** Lettre traduite : paragraphes écartés si leurs chiffres changent. */
export declare const LetterTranslation: z.ZodObject<{
    lang: z.ZodEnum<{
        de: "de";
        en: "en";
    }>;
    greeting: z.ZodString;
    paragraphs: z.ZodArray<z.ZodString>;
    closing: z.ZodString;
    rejected: z.ZodNumber;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type LetterTranslation = z.infer<typeof LetterTranslation>;
export declare const ApplicationTone: z.ZodEnum<{
    sobre: "sobre";
    chaleureux: "chaleureux";
    dynamique: "dynamique";
}>;
export declare const ApplicationLength: z.ZodEnum<{
    court: "court";
    moyen: "moyen";
    long: "long";
}>;
export declare const ApplicationAnswerRequest: z.ZodObject<{
    generationId: z.ZodUUID;
    question: z.ZodString;
    tone: z.ZodDefault<z.ZodEnum<{
        sobre: "sobre";
        chaleureux: "chaleureux";
        dynamique: "dynamique";
    }>>;
    length: z.ZodDefault<z.ZodEnum<{
        court: "court";
        moyen: "moyen";
        long: "long";
    }>>;
}, z.core.$strip>;
export declare const ApplicationMessageKind: z.ZodEnum<{
    relance: "relance";
    linkedin: "linkedin";
    remerciement: "remerciement";
}>;
export declare const ApplicationMessageRequest: z.ZodObject<{
    generationId: z.ZodUUID;
    kind: z.ZodEnum<{
        relance: "relance";
        linkedin: "linkedin";
        remerciement: "remerciement";
    }>;
    tone: z.ZodDefault<z.ZodEnum<{
        sobre: "sobre";
        chaleureux: "chaleureux";
        dynamique: "dynamique";
    }>>;
}, z.core.$strip>;
/** Paragraphe du texte : ses sources (faits du profil) quand il porte des faits, aucune pour une formule. */
export declare const ApplicationParagraph: z.ZodObject<{
    text: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
    sourceLabels: z.ZodArray<z.ZodString>;
    status: z.ZodEnum<{
        supported: "supported";
        unsupported: "unsupported";
        formule: "formule";
    }>;
}, z.core.$strip>;
export declare const ApplicationText: z.ZodObject<{
    id: z.ZodNullable<z.ZodUUID>;
    text: z.ZodString;
    paragraphs: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        sourceLabels: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            supported: "supported";
            unsupported: "unsupported";
            formule: "formule";
        }>;
    }, z.core.$strip>>;
    removed: z.ZodNumber;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type ApplicationText = z.infer<typeof ApplicationText>;
/** Texte modifié par le candidat, recontrôlé paragraphe par paragraphe. */
export declare const ApplicationCheckRequest: z.ZodObject<{
    generationId: z.ZodUUID;
    text: z.ZodString;
}, z.core.$strip>;
export declare const ApplicationCheck: z.ZodObject<{
    paragraphs: z.ZodArray<z.ZodObject<{
        text: z.ZodString;
        sources: z.ZodArray<z.ZodString>;
        sourceLabels: z.ZodArray<z.ZodString>;
        status: z.ZodEnum<{
            supported: "supported";
            unsupported: "unsupported";
            formule: "formule";
        }>;
    }, z.core.$strip>>;
}, z.core.$strip>;
export type ApplicationCheck = z.infer<typeof ApplicationCheck>;
export declare const ApplicationKind: z.ZodEnum<{
    relance: "relance";
    linkedin: "linkedin";
    remerciement: "remerciement";
    formulaire: "formulaire";
}>;
export declare const ApplicationHistoryItem: z.ZodObject<{
    id: z.ZodUUID;
    generationId: z.ZodUUID;
    kind: z.ZodEnum<{
        relance: "relance";
        linkedin: "linkedin";
        remerciement: "remerciement";
        formulaire: "formulaire";
    }>;
    question: z.ZodNullable<z.ZodString>;
    text: z.ZodString;
    createdAt: z.ZodString;
}, z.core.$strip>;
export type ApplicationHistoryItem = z.infer<typeof ApplicationHistoryItem>;
/** Suivi d'une candidature : où en est-elle, et quand relancer. */
export declare const ApplicationStatus: z.ZodEnum<{
    refus: "refus";
    a_envoyer: "a_envoyer";
    envoyee: "envoyee";
    relancee: "relancee";
    entretien: "entretien";
    offre: "offre";
}>;
export declare const ApplicationTrackingInput: z.ZodObject<{
    status: z.ZodEnum<{
        refus: "refus";
        a_envoyer: "a_envoyer";
        envoyee: "envoyee";
        relancee: "relancee";
        entretien: "entretien";
        offre: "offre";
    }>;
    sentAt: z.ZodNullable<z.ZodISODate>;
    note: z.ZodNullable<z.ZodString>;
}, z.core.$strip>;
export declare const ApplicationTracking: z.ZodObject<{
    status: z.ZodEnum<{
        refus: "refus";
        a_envoyer: "a_envoyer";
        envoyee: "envoyee";
        relancee: "relancee";
        entretien: "entretien";
        offre: "offre";
    }>;
    sentAt: z.ZodNullable<z.ZodISODate>;
    note: z.ZodNullable<z.ZodString>;
    generationId: z.ZodUUID;
    offerTitle: z.ZodString;
    followUpOn: z.ZodNullable<z.ZodString>;
    updatedAt: z.ZodString;
}, z.core.$strip>;
export type ApplicationTracking = z.infer<typeof ApplicationTracking>;
export declare const AtsKeyword: z.ZodObject<{
    term: z.ZodString;
    status: z.ZodEnum<{
        place: "place";
        a_placer: "a_placer";
        absent: "absent";
    }>;
    where: z.ZodNullable<z.ZodString>;
    advice: z.ZodString;
}, z.core.$strip>;
export declare const AtsAdvice: z.ZodObject<{
    keywords: z.ZodArray<z.ZodObject<{
        term: z.ZodString;
        status: z.ZodEnum<{
            place: "place";
            a_placer: "a_placer";
            absent: "absent";
        }>;
        where: z.ZodNullable<z.ZodString>;
        advice: z.ZodString;
    }, z.core.$strip>>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type AtsAdvice = z.infer<typeof AtsAdvice>;
/**
 * Conseil appliqué : le fait du profil qui contient le mot-clé, recopié tel quel, à ajouter à l'entrée du
 * CV qui le porte. Le candidat valide ; l'ajout passe ensuite par les corrections (`additions`).
 */
export declare const AtsApplyRequest: z.ZodObject<{
    term: z.ZodString;
    entry: z.ZodOptional<z.ZodString>;
}, z.core.$strip>;
export declare const AtsProposal: z.ZodObject<{
    term: z.ZodString;
    entry: z.ZodString;
    entryLabel: z.ZodString;
    text: z.ZodString;
    sources: z.ZodArray<z.ZodString>;
}, z.core.$strip>;
export type AtsProposal = z.infer<typeof AtsProposal>;
/** Couverture des mots-clés de chaque CV (calcul du code, sans IA), pour comparer les offres. */
export declare const AtsOverview: z.ZodArray<z.ZodObject<{
    generationId: z.ZodUUID;
    offerTitle: z.ZodString;
    placed: z.ZodNumber;
    possible: z.ZodNumber;
    total: z.ZodNumber;
}, z.core.$strip>>;
export type AtsOverview = z.infer<typeof AtsOverview>;
/** Résultats conservés d'un CV, par clé « rôle » ou « rôle:variante » (langue, niveau). */
export declare const AssistantResults: z.ZodRecord<z.ZodString, z.ZodObject<{
    payload: z.ZodUnknown;
    updatedAt: z.ZodString;
}, z.core.$strip>>;
export type AssistantResults = z.infer<typeof AssistantResults>;
/** Avis anonyme sur une réponse : ni identifiant ni contenu, seulement le rôle et le sens. */
export declare const AssistantVote: z.ZodObject<{
    role: z.ZodString;
    vote: z.ZodUnion<readonly [z.ZodLiteral<1>, z.ZodLiteral<-1>]>;
    providerKind: z.ZodEnum<{
        ia: "ia";
        demo: "demo";
    }>;
}, z.core.$strip>;
export type AssistantVote = z.infer<typeof AssistantVote>;
