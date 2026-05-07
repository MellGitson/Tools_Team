/**
 * PHASE 8: Évaluation et baseline mesurée
 *
 * Objectif: faire tourner les 10 questions de Phase 1 et construire un tableau
 * d'évaluation chiffré (eval-table.md) qui sert de référence pour comparer toute
 * optimisation future (Phase 11, J5, ajustements chunk_size / topK / threshold / modèle).
 *
 * Pour chaque question on capture:
 *  - Top-1 score (similarité du meilleur chunk)
 *  - Avg top-3 score (qualité globale du contexte injecté)
 *  - Tokens in / out
 *  - Coût USD
 *  - Pertinence (1-5) — heuristique sur top-1 (à reviewer humainement)
 *  - Fidélité (1-5) — heuristique citation + refus correct (à reviewer humainement)
 *  - Notes — résumé court
 *
 * Agrégats en fin de tableau: moyennes pertinence/fidélité, coût total, latence moyenne.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ragQuery } from './rag-query.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const QUESTIONS_FILE = path.join(ROOT, 'data', 'questions-test.txt');
const OUTPUT_FILE = path.join(ROOT, 'eval-table.md');

// ============================================================================
// PARSE QUESTIONS
// ============================================================================

function parseQuestions(filepath) {
  const raw = fs.readFileSync(filepath, 'utf-8');
  const lines = raw.split('\n');

  const questions = [];
  let category = 'happy';

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/Happy Paths/i.test(line)) category = 'happy';
    else if (/Tordus|Ambig/i.test(line)) category = 'ambiguous';
    else if (/Adversariales/i.test(line)) category = 'adversarial';

    const m = line.match(/^\s*(\d+)\.\s+(.+\?)\s*$/);
    if (m) {
      const num = parseInt(m[1], 10);
      const text = m[2].trim();
      const next = (lines[i + 1] || '').trim();
      const expected = next.startsWith('Réponse attendue')
        ? next.replace(/^Réponse attendue\s*:\s*/i, '')
        : '';
      questions.push({ num, text, expected, category });
    }
  }

  return questions;
}

// ============================================================================
// HEURISTIQUES (proxy pour notes humaines, à reviewer)
// ============================================================================

function scorePertinence(category, topScore, chunkCount) {
  // Adversarial: on VEUT que le retrieval échoue (chunks hors sujet ou peu nombreux)
  if (category === 'adversarial') {
    if (chunkCount === 0) return 5;
    if (topScore < 0.55) return 5;
    if (topScore < 0.65) return 4;
    if (topScore < 0.75) return 2;
    return 1; // Faux positif: chunks à fort score sur question hors corpus
  }
  // Happy / ambiguous: on veut un top-1 élevé
  if (chunkCount === 0) return 1;
  if (topScore >= 0.80) return 5;
  if (topScore >= 0.70) return 4;
  if (topScore >= 0.60) return 3;
  if (topScore >= 0.50) return 2;
  return 1;
}

function scoreFidelite(category, answer, chunkCount) {
  const lower = (answer || '').toLowerCase();
  const refusalPattern = /je ne trouve pas cette information/i;
  const hasCitation = /\[source\s*\d+\]/i.test(answer || '');

  if (category === 'adversarial') {
    if (refusalPattern.test(answer)) return 5; // Refus attendu = fidèle
    if (chunkCount === 0 && lower.length < 200) return 4;
    return 2; // A inventé / utilisé connaissances générales
  }

  // Happy / ambiguous: on veut une réponse citée et ancrée
  if (refusalPattern.test(answer) && chunkCount > 0) return 2; // Refus injuste
  if (hasCitation) return 5;
  if (chunkCount > 0 && lower.length > 40) return 3; // Réponse mais pas citée
  return 2;
}

function buildNote(category, chunkCount, topScore, answer) {
  const refusal = /je ne trouve pas cette information/i.test(answer || '');
  const cited = /\[source\s*\d+\]/i.test(answer || '');

  if (category === 'adversarial') {
    if (refusal) return 'Refus correct (hors corpus)';
    if (chunkCount === 0) return 'Aucun chunk au-dessus du seuil';
    return `⚠ Chunks récupérés (top=${topScore.toFixed(2)}) — risque hallucination`;
  }
  if (chunkCount === 0) return '⚠ Aucun chunk pertinent';
  if (refusal) return '⚠ Refus alors que chunks présents';
  if (cited) return 'Réponse propre, sources citées';
  return 'Réponse sans citation explicite';
}

// ============================================================================
// FORMAT TABLE
// ============================================================================

function fmtScore(v) {
  return v == null ? '—' : v.toFixed(2);
}
function fmtCost(v) {
  return v == null ? '—' : `$${v.toFixed(4)}`;
}

function buildMarkdown(rows, aggregates, meta) {
  const lines = [];
  lines.push('# Phase 8 — Tableau d\'évaluation et baseline mesurée');
  lines.push('');
  lines.push(`**Date:** ${meta.timestamp}`);
  lines.push(`**Modèle:** ${meta.model}`);
  lines.push(`**Embeddings:** ${meta.embedModel} (${meta.dimension}d)`);
  lines.push(`**topK:** ${meta.topK} | **threshold:** ${meta.threshold} | **temperature:** ${meta.temperature}`);
  lines.push(`**Corpus:** \`${meta.corpus}\` (namespace: \`${meta.namespace}\`)`);
  lines.push('');
  lines.push('## Résultats par question');
  lines.push('');
  lines.push('| # | Question | Top-1 score | Avg top-3 score | Tokens (in/out) | Coût ($) | Pertinence (1-5) | Fidélité (1-5) | Notes |');
  lines.push('|---|----------|-------------|-----------------|-----------------|----------|------------------|----------------|-------|');

  for (const r of rows) {
    const q = r.question.length > 80 ? r.question.slice(0, 77) + '…' : r.question;
    lines.push(
      `| ${r.num} | ${q} | ${fmtScore(r.topScore)} | ${fmtScore(r.avgTop3)} | ${r.promptTokens} / ${r.completionTokens} | ${fmtCost(r.costUSD)} | ${r.pertinence} | ${r.fidelite} | ${r.note} |`
    );
  }

  lines.push('');
  lines.push('## Agrégats');
  lines.push('');
  lines.push('| Métrique | Valeur |');
  lines.push('|----------|--------|');
  lines.push(`| Moyenne pertinence | ${aggregates.avgPertinence.toFixed(2)} / 5 |`);
  lines.push(`| Moyenne fidélité | ${aggregates.avgFidelite.toFixed(2)} / 5 |`);
  lines.push(`| Coût total (10 requêtes) | $${aggregates.totalCost.toFixed(4)} |`);
  lines.push(`| Latence moyenne / requête | ${aggregates.avgLatencyMs.toFixed(0)} ms |`);
  lines.push(`| Top-1 moyen (happy + ambiguous) | ${aggregates.avgTopInDomain.toFixed(2)} |`);
  lines.push(`| Top-1 moyen (adversarial) | ${aggregates.avgTopAdversarial.toFixed(2)} |`);

  lines.push('');
  lines.push('## Légende');
  lines.push('');
  lines.push('- **Top-1 score**: similarité cosinus du meilleur chunk retourné par Pinecone. Plus c\'est haut, plus le retrieval a trouvé un chunk vraiment proche de la question.');
  lines.push('- **Avg top-3 score**: moyenne des scores des 3 meilleurs chunks. Donne une idée de la qualité globale du contexte injecté.');
  lines.push('- **Pertinence (1-5)** *(heuristique)*: les chunks récupérés étaient-ils liés à la question ? — calculée depuis top-1, à confirmer humainement.');
  lines.push('- **Fidélité (1-5)** *(heuristique)*: la réponse reflète-t-elle fidèlement les sources, ou le modèle a-t-il brodé ? — calculée depuis présence de `[Source N]` et refus corrects, à confirmer humainement.');
  lines.push('');
  lines.push('## Comment lire cette baseline');
  lines.push('');
  lines.push('Si une réponse est mauvaise, diagnostiquer d\'abord le retrieval en isolation: appeler `retrieveContext` sur la question et inspecter les chunks. Si les chunks sont déjà hors sujet, le problème est en amont (chunking ou indexation). S\'ils sont bons mais la réponse délire, c\'est le prompt.');
  lines.push('');
  lines.push('Cette baseline est la référence: à chaque optimisation future (chunk_size, topK, threshold, modèle), comparer les nouveaux chiffres à cette table.');
  lines.push('');

  return lines.join('\n');
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log('\n================================================================================');
  console.log('🧪 PHASE 8 — Évaluation et baseline mesurée');
  console.log('================================================================================\n');

  const questions = parseQuestions(QUESTIONS_FILE);
  console.log(`✓ ${questions.length} questions chargées depuis ${path.relative(ROOT, QUESTIONS_FILE)}\n`);

  if (questions.length === 0) {
    console.error('❌ Aucune question parsée — vérifier le format du fichier');
    process.exit(1);
  }

  const rows = [];
  const TOP_K = 5;

  for (const q of questions) {
    console.log(`\n─── [${q.num}/${questions.length}] (${q.category}) ${q.text}`);
    let row;
    try {
      const result = await ragQuery(q.text, { topK: TOP_K, verbose: false });
      const chunks = result.chunks || [];
      const top3 = chunks.slice(0, 3);
      const avgTop3 = top3.length > 0 ? top3.reduce((s, c) => s + c.score, 0) / top3.length : null;

      const pertinence = scorePertinence(q.category, result.metrics.topScore || 0, chunks.length);
      const fidelite = scoreFidelite(q.category, result.answer, chunks.length);
      const note = buildNote(q.category, chunks.length, result.metrics.topScore || 0, result.answer);

      row = {
        num: q.num,
        question: q.text,
        category: q.category,
        topScore: result.metrics.topScore,
        avgTop3,
        promptTokens: result.metrics.promptTokens,
        completionTokens: result.metrics.completionTokens,
        costUSD: result.metrics.costUSD,
        latencyMs: result.metrics.totalMs,
        pertinence,
        fidelite,
        note,
        answer: result.answer,
      };

      console.log(`   top-1=${fmtScore(row.topScore)} avg-top3=${fmtScore(row.avgTop3)} tok=${row.promptTokens}/${row.completionTokens} cost=${fmtCost(row.costUSD)} latency=${row.latencyMs}ms`);
      console.log(`   pertinence=${row.pertinence} fidélité=${row.fidelite} — ${row.note}`);
    } catch (err) {
      console.error(`   ❌ Erreur: ${err.message}`);
      row = {
        num: q.num,
        question: q.text,
        category: q.category,
        topScore: null,
        avgTop3: null,
        promptTokens: 0,
        completionTokens: 0,
        costUSD: 0,
        latencyMs: 0,
        pertinence: 1,
        fidelite: 1,
        note: `❌ ${err.message.slice(0, 60)}`,
        answer: '',
      };
    }
    rows.push(row);
  }

  // Agrégats
  const valid = rows.filter((r) => r.topScore != null);
  const inDomain = valid.filter((r) => r.category !== 'adversarial');
  const adv = valid.filter((r) => r.category === 'adversarial');

  const aggregates = {
    avgPertinence: rows.reduce((s, r) => s + r.pertinence, 0) / rows.length,
    avgFidelite: rows.reduce((s, r) => s + r.fidelite, 0) / rows.length,
    totalCost: rows.reduce((s, r) => s + (r.costUSD || 0), 0),
    avgLatencyMs: rows.reduce((s, r) => s + (r.latencyMs || 0), 0) / rows.length,
    avgTopInDomain: inDomain.length > 0 ? inDomain.reduce((s, r) => s + r.topScore, 0) / inDomain.length : 0,
    avgTopAdversarial: adv.length > 0 ? adv.reduce((s, r) => s + r.topScore, 0) / adv.length : 0,
  };

  const meta = {
    timestamp: new Date().toISOString(),
    model: 'mistral-small-latest',
    embedModel: 'mistral-embed',
    dimension: 1024,
    topK: TOP_K,
    threshold: 0.5,
    temperature: 0.1,
    corpus: process.env.PINECONE_INDEX_NAME || 'mini-perplexity',
    namespace: process.env.PINECONE_NAMESPACE || 'pydantic-ai',
  };

  const md = buildMarkdown(rows, aggregates, meta);
  fs.writeFileSync(OUTPUT_FILE, md, 'utf-8');

  console.log('\n================================================================================');
  console.log('📊 AGRÉGATS');
  console.log('================================================================================');
  console.log(`  Moyenne pertinence      : ${aggregates.avgPertinence.toFixed(2)} / 5`);
  console.log(`  Moyenne fidélité        : ${aggregates.avgFidelite.toFixed(2)} / 5`);
  console.log(`  Coût total              : $${aggregates.totalCost.toFixed(4)}`);
  console.log(`  Latence moyenne         : ${aggregates.avgLatencyMs.toFixed(0)} ms`);
  console.log(`  Top-1 moyen in-domain   : ${aggregates.avgTopInDomain.toFixed(2)}`);
  console.log(`  Top-1 moyen adversarial : ${aggregates.avgTopAdversarial.toFixed(2)}`);
  console.log(`\n✅ Tableau écrit dans ${path.relative(ROOT, OUTPUT_FILE)}\n`);
}

main().catch((err) => {
  console.error('❌ Phase 8 evaluation failed:', err);
  process.exit(1);
});
