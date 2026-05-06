/**
 * PHASE 2: Test complet - Démonstration des fonctionnalités
 * 
 * Cas d'usage:
 * 1. Différentes tailles de chunks
 * 2. Impact de l'overlap sur les résultats
 * 3. Performance avec textes longs
 */

import { chunkWithOverlap, loadCorpus, processCorpus, CONFIG } from './create-index.js';

console.log('\n' + '='.repeat(80));
console.log('PHASE 2 - DÉMONSTRATION COMPLÈTE');
console.log('='.repeat(80));

// ============================================================================
// DÉMO 1: Impact de la taille de chunks
// ============================================================================

console.log('\n📊 DÉMO 1: Impact de la taille de chunks');
console.log('-'.repeat(80));

const testText = Array(1000).fill(0).map((_, i) => `mot${i}`).join(' ');

const sizes = [200, 300, 400, 500];

sizes.forEach(size => {
  try {
    const chunks = chunkWithOverlap(testText, size, 0);
    console.log(`  • Taille ${size} mots → ${chunks.length} chunks`);
    console.log(`    Efficacité: ${((1000 / (size * chunks.length)) * 100).toFixed(1)}%`);
  } catch (error) {
    console.log(`  • Taille ${size}: ❌ ${error.message}`);
  }
});

// ============================================================================
// DÉMO 2: Impact de l'overlap
// ============================================================================

console.log('\n📊 DÉMO 2: Impact de l\'overlap (avec chunkSize=300)');
console.log('-'.repeat(80));

const overlaps = [0, 30, 50, 100];

overlaps.forEach(overlap => {
  try {
    const chunks = chunkWithOverlap(testText, 300, overlap);
    const totalWords = chunks.reduce((sum, c) => sum + c.split(/\s+/).length, 0);
    const redundancy = (((totalWords - 1000) / 1000) * 100).toFixed(1);
    
    console.log(`  • Overlap ${overlap} mots → ${chunks.length} chunks`);
    console.log(`    Mots totaux: ${totalWords} (redondance: +${redundancy}%)`);
  } catch (error) {
    console.log(`  • Overlap ${overlap}: ❌ ${error.message}`);
  }
});

// ============================================================================
// DÉMO 3: Chargement et traitement du corpus
// ============================================================================

console.log('\n📊 DÉMO 3: Traitement complet du corpus');
console.log('-'.repeat(80));

try {
  const processed = await processCorpus();
  
  if (processed.length === 0) {
    console.log('⚠️  Aucun fichier dans corpus/');
  } else {
    let totalChunks = 0;
    let totalWords = 0;
    
    processed.forEach(doc => {
      totalChunks += doc.chunkCount;
      totalWords += doc.words;
      
      console.log(`\n  📄 ${doc.filename}`);
      console.log(`     Mots: ${doc.words}`);
      console.log(`     Chunks: ${doc.chunkCount}`);
      console.log(`     Avg mots/chunk: ${(doc.words / doc.chunkCount).toFixed(0)}`);
    });
    
    console.log('\n  📈 RÉSUMÉ');
    console.log(`     Fichiers: ${processed.length}`);
    console.log(`     Mots totaux: ${totalWords}`);
    console.log(`     Chunks totaux: ${totalChunks}`);
    console.log(`     Mots moyen par chunk: ${(totalWords / totalChunks).toFixed(0)}`);
  }
} catch (error) {
  console.log(`❌ Erreur: ${error.message}`);
}

// ============================================================================
// DÉMO 4: Cas limites et edge cases
// ============================================================================

console.log('\n📊 DÉMO 4: Cas limites (edge cases)');
console.log('-'.repeat(80));

const edgeCases = [
  { name: 'Très court (5 mots)', text: 'mot1 mot2 mot3 mot4 mot5', size: 100, overlap: 10 },
  { name: 'Exact chunkSize', text: Array(50).fill('mot').join(' '), size: 50, overlap: 5 },
  { name: 'Juste au-dessus', text: Array(51).fill('mot').join(' '), size: 50, overlap: 5 },
  { name: 'Espaces multiples', text: 'mot1   mot2    mot3', size: 10, overlap: 1 },
];

edgeCases.forEach(testCase => {
  try {
    const result = chunkWithOverlap(testCase.text, testCase.size, testCase.overlap);
    console.log(`  ✓ ${testCase.name}: ${result.length} chunk(s)`);
  } catch (error) {
    console.log(`  ✗ ${testCase.name}: ${error.message}`);
  }
});

// ============================================================================
// DÉMO 5: Configuration actuelle vs recommandée
// ============================================================================

console.log('\n📊 DÉMO 5: Configuration et recommandations');
console.log('-'.repeat(80));

console.log('\n  ⚙️  Configuration actuelle:');
console.log(`     chunkSize: ${CONFIG.chunkSize} mots (~${Math.round(CONFIG.chunkSize * 1.25)} tokens)`);
console.log(`     overlap: ${CONFIG.overlap} mots (~${Math.round(CONFIG.overlap * 1.25)} tokens)`);
console.log(`     batchSize: ${CONFIG.batchSize} vectors/batch`);
console.log(`     embedConcurrency: ${CONFIG.embedConcurrency} requêtes parallèles`);

console.log('\n  💡 Recommandations pour optimisation:');
console.log('     • Chunks: 300-500 mots pour RAG (équilibre granularité/contexte)');
console.log('     • Overlap: 10-20% du chunk size pour continuité sémantique');
console.log('     • Batch: 20-100 selon limites API (Mistral: 30 recommandé)');
console.log('     • Concurrency: 3-10 selon rate limits (Mistral: 5 max)');

// ============================================================================
// CONCLUSION
// ============================================================================

console.log('\n' + '='.repeat(80));
console.log('✅ PHASE 2 - TESTS COMPLÉTÉS');
console.log('='.repeat(80));
console.log('\nProchaines étapes:');
console.log('  1. ✅ Tester avec corpus réel (fait)');
console.log('  2. ⏳ Phase 3: Implémentation du batch processing');
console.log('  3. ⏳ Phase 4: Intégration avec Pinecone');
console.log('  4. ⏳ Phase 5: API REST wrapper\n');
