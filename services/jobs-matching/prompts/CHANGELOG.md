# Journal des prompts du service jobs-matching

Chaque prompt est versionné dans `prompts/<étape>/vN.md`. Une nouvelle version ne remplace jamais un
fichier existant : on ajoute `vN+1.md` et on met à jour la version déclarée dans `src/analysis.ts`
(ADR 0016, point 8).

## 2026-10-21 : analyse-offre v1 et rerank-offres v1 (extraction du monolithe)

- `analyse-offre/v1` : repris sans changement (2026-10-16). Exigences (`must` / `nice`) et mots-clés
  pondérés, recopiés tels qu'écrits dans l'offre ; consignes injectées dans l'offre ignorées.
- `rerank-offres/v1` : repris sans changement (2026-10-16). Reclassement des 20 meilleures offres et
  compétences manquantes recopiées mot pour mot depuis l'offre ; le code rejette toute compétence absente
  de l'offre ou présente dans le profil.

## 2026-10-23 : explication-correspondance v1 (ADR 0028, rôle 5)

- `explication-correspondance/v1` : compétences demandées par une offre collectée et synthèse ; le code
  décide de ce que le candidat possède (fait du profil à l’appui), de ce qui manque et du score.

## 2026-10-23 : explication de correspondance v2 (ADR 0029)

- `explication-correspondance/v2` : chaque compétence demandée porte sa priorité (`must` exigée, `nice`
  souhaitée) ; le score du code compte double les exigences. Lieu, employeur et contrat écartés par le code.
