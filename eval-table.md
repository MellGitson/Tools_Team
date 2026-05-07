# Phase 8 — Tableau d'évaluation et baseline mesurée

**Date:** 2026-05-07T07:49:26.322Z
**Modèle:** mistral-small-latest
**Embeddings:** mistral-embed (1024d)
**topK:** 5 | **threshold:** 0.5 | **temperature:** 0.1
**Corpus:** `mini-perplexity` (namespace: `default`)

## Résultats par question

| # | Question | Top-1 score | Avg top-3 score | Tokens (in/out) | Coût ($) | Pertinence (1-5) | Fidélité (1-5) | Notes |
|---|----------|-------------|-----------------|-----------------|----------|------------------|----------------|-------|
| 1 | Comment définir un outil dans Pydantic AI ? | — | — | 11 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 2 | Quelle est la différence entre Agent et RunContext ? | — | — | 13 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 3 | Comment streamer une réponse avec Pydantic AI ? | — | — | 12 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 4 | Quels sont les modèles LLM supportés par Pydantic AI ? | — | — | 14 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 5 | Comment valider les réponses avec Pydantic AI ? | — | — | 12 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 6 | Comment intégrer Pydantic AI avec FastAPI ? | — | — | 11 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 7 | Comment gérer les erreurs dans Pydantic AI ? | — | — | 11 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 8 | Comment optimiser les performances d'un agent Pydantic AI ? | — | — | 15 / 16 | $0.0000 | 1 | 2 | ⚠ Aucun chunk pertinent |
| 9 | Quel est le prix exact du dernier modèle GPT-5 d'OpenAI ? | — | — | 15 / 16 | $0.0000 | 5 | 5 | Refus correct (hors corpus) |
| 10 | Comment exporter un agent Pydantic AI en tant que service WebAssembly ? | — | — | 18 / 16 | $0.0000 | 5 | 5 | Refus correct (hors corpus) |

## Agrégats

| Métrique | Valeur |
|----------|--------|
| Moyenne pertinence | 1.80 / 5 |
| Moyenne fidélité | 2.60 / 5 |
| Coût total (10 requêtes) | $0.0001 |
| Latence moyenne / requête | 1062 ms |
| Top-1 moyen (happy + ambiguous) | 0.00 |
| Top-1 moyen (adversarial) | 0.00 |

## Légende

- **Top-1 score**: similarité cosinus du meilleur chunk retourné par Pinecone. Plus c'est haut, plus le retrieval a trouvé un chunk vraiment proche de la question.
- **Avg top-3 score**: moyenne des scores des 3 meilleurs chunks. Donne une idée de la qualité globale du contexte injecté.
- **Pertinence (1-5)** *(heuristique)*: les chunks récupérés étaient-ils liés à la question ? — calculée depuis top-1, à confirmer humainement.
- **Fidélité (1-5)** *(heuristique)*: la réponse reflète-t-elle fidèlement les sources, ou le modèle a-t-il brodé ? — calculée depuis présence de `[Source N]` et refus corrects, à confirmer humainement.

## Comment lire cette baseline

Si une réponse est mauvaise, diagnostiquer d'abord le retrieval en isolation: appeler `retrieveContext` sur la question et inspecter les chunks. Si les chunks sont déjà hors sujet, le problème est en amont (chunking ou indexation). S'ils sont bons mais la réponse délire, c'est le prompt.

Cette baseline est la référence: à chaque optimisation future (chunk_size, topK, threshold, modèle), comparer les nouveaux chiffres à cette table.
