# ADR 0002 : Schéma Zod, contrat unique et traçabilité par pointeurs JSON

- Statut : accepté le 2026-10-16 (v1 implémentée dans `packages/schema`, testée)
- Date : 2026-10-16

## Contexte

Le CV doit être prouvable ligne par ligne. Les sorties du LLM doivent être validées par schéma avant d'atteindre le rendu. Le profil doit rester compatible avec le standard JSON Resume.

## Décision

1. **Zod est la source de vérité.** Le JSON Schema en est dérivé (`toJsonSchemas()`) et sert aux sorties structurées du fournisseur LLM. Il n'est jamais écrit à la main.
2. **Profil = JSON Resume** (basics, work, education, skills, languages, projects, certificates) avec des bornes de longueur et des dates partielles `AAAA[-MM[-JJ]]`.
3. **Sources = pointeurs JSON RFC 6901** vers le profil versionné, par exemple `/work/0/highlights/1`. Cela réalise le « sourceRef : section + index du fait » du cahier des charges, en restant compatible JSON Resume (aucun identifiant ajouté au profil). Les pointeurs sont stables parce qu'une génération référence une **version figée** du profil (`profile_version`).
4. **Le modèle n'écrit que du texte libre.** `TailoredCv` ne contient que :
   - des lignes `{ text, sources[≥1] }` (accroche, résumé, puces d'expérience et de projet) ;
   - des **références** (`/work/i`, `/skills/j`, …) pour sélectionner et ordonner.
   Employeur, poste, dates, diplômes et noms de compétences sont **recopiés par le code** depuis le profil. Le modèle ne peut donc pas inventer de date, de diplôme ou de compétence : il n'a aucun champ pour le faire.
5. `missingKeywords` porte les mots-clés de l'offre sans preuve : **signalés, jamais ajoutés**.
6. `findUnresolvedRefs()` vérifie, sans recours au modèle, que chaque pointeur cité existe dans le profil.

## Alternatives écartées

- Identifiants UUID par fait : plus robustes aux réordonnancements, mais ils cassent la compatibilité JSON Resume et alourdissent la saisie. Le gel de version suffit.
- Laisser le modèle produire le CV complet, puis le comparer : la surface d'hallucination est bien plus grande.

## Conséquences

- Un profil modifié crée une nouvelle version, et les traces existantes restent valides.
- La traçabilité de l'interface (survol d'une ligne → source) est un simple `resolvePointer`.
- Limite assumée : un pointeur valide peut tout de même accompagner une reformulation infidèle (« a participé » devenu « a dirigé »). C'est le rôle du contrôle de fidélité (ADR 0003).
