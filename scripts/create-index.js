/**
 * PHASE 2-3: Script d'indexation avec chunking intelligent
 * 
 * Fonctionnalités:
 * - Chunking configurable (taille, overlap)
 * - Chargement du corpus
 * - Batch processing
 * - Gestion des erreurs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION
// ============================================================================

export const CONFIG = {
  chunkSize: 400,           // Nombre de MOTS par chunk
  overlap: 50,              // Nombre de MOTS de recouvrement
  batchSize: 50,            // Taille des batches pour l'embedding
  embedConcurrency: 5,      // Nombre concurrent d'embeddings
  corporaDir: path.join(__dirname, '../corpus'),
  outputDir: path.join(__dirname, '../data')
};

// ============================================================================
// PHASE 2: CHUNKING AVEC PARAMETRES CONFIGURABLES
// ============================================================================

/**
 * Découpe un texte en chunks avec recouvrement (overlap)
 * 
 * @param {string} text - Texte à découper
 * @param {number} chunkSize - Nombre max de mots par chunk
 * @param {number} overlap - Nombre de mots de recouvrement entre chunks
 * @returns {Array<string>} - Array de chunks
 * 
 * @throws {Error} Si overlap >= chunkSize (boucle infinie)
 * 
 * @example
 * const chunks = chunkWithOverlap("mot1 mot2 mot3...", 300, 50);
 * // Returns: ["mot1 mot2... mot50", "mot1-overlap mot51... mot350", ...]
 */
export function chunkWithOverlap(text, chunkSize = CONFIG.chunkSize, overlap = CONFIG.overlap) {
  // ✅ Validation
  if (!text || text.trim().length === 0) {
    throw new Error('Le texte à chunker ne peut pas être vide');
  }

  if (chunkSize <= 0) {
    throw new Error(`chunkSize doit être > 0, reçu: ${chunkSize}`);
  }

  if (overlap < 0) {
    throw new Error(`overlap doit être >= 0, reçu: ${overlap}`);
  }

  // ✅ Vérification overlap >= chunkSize (détection boucle infinie)
  if (overlap >= chunkSize) {
    throw new Error(
      `overlap (${overlap}) doit être < chunkSize (${chunkSize}). ` +
      `Sinon risque de boucle infinie!`
    );
  }

  // Découper en mots
  const words = text.split(/\s+/).filter(w => w.length > 0);

  if (words.length <= chunkSize) {
    // ✅ Cas 1: Texte court → retourner un seul chunk
    return [text];
  }

  const chunks = [];
  let i = 0;

  while (i < words.length) {
    // Extraire chunk de chunkSize mots
    const end = Math.min(i + chunkSize, words.length);
    const chunk = words.slice(i, end).join(' ');
    chunks.push(chunk);

    // Avancer de (chunkSize - overlap) pour avoir du recouvrement
    i += chunkSize - overlap;

    // ✅ Cas 3: Sécurité - détection de boucle
    if (i === chunks.length && overlap > 0) {
      throw new Error('Erreur interne: détection potentielle de boucle');
    }
  }

  return chunks;
}

// ============================================================================
// PHASE 3: CHARGEMENT DU CORPUS
// ============================================================================

/**
 * Charge tous les fichiers .txt d'un répertoire
 * 
 * @param {string} dir - Répertoire contenant les fichiers .txt
 * @returns {Promise<Array>} - [{ filename, text }, ...]
 * 
 * @example
 * const corpus = await loadCorpus('./corpus');
 * // Returns: [
 * //   { filename: 'article-01.txt', text: '...' },
 * //   { filename: 'article-02.txt', text: '...' }
 * // ]
 */
export async function loadCorpus(dir = CONFIG.corporaDir) {
  try {
    // Vérifier que le répertoire existe
    if (!fs.existsSync(dir)) {
      throw new Error(`Répertoire introuvable: ${dir}`);
    }

    // Lister les fichiers .txt
    const files = fs
      .readdirSync(dir)
      .filter(file => file.endsWith('.txt'))
      .sort();

    if (files.length === 0) {
      console.warn(`⚠️  Aucun fichier .txt trouvé dans ${dir}`);
      return [];
    }

    // Charger chaque fichier
    const corpus = files.map(file => ({
      filename: file,
      text: fs.readFileSync(path.join(dir, file), 'utf-8'),
      size_bytes: fs.statSync(path.join(dir, file)).size
    }));

    return corpus;
  } catch (error) {
    throw new Error(`Erreur lors du chargement du corpus: ${error.message}`);
  }
}

/**
 * Traite le corpus complet: chargement + chunking
 * 
 * @returns {Promise<Array>} - [{ filename, chunks: [...] }, ...]
 */
export async function processCorpus() {
  const corpus = await loadCorpus();

  return corpus.map(doc => ({
    filename: doc.filename,
    size_bytes: doc.size_bytes,
    words: doc.text.split(/\s+/).length,
    chunks: chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap),
    chunkCount: chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap).length
  }));
}

// ============================================================================
// TESTS & VALIDATION
// ============================================================================

/**
 * Tests unitaires pour chunkWithOverlap
 */
export async function runTests() {
  console.log('\n🧪 TESTS UNITAIRES - chunkWithOverlap');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  // Test 1: Texte court (< chunkSize)
  console.log('\n✅ Test 1: Texte court (doit retourner 1 chunk)');
  try {
    const shortText = 'mot1 mot2 mot3 mot4 mot5';
    const result = chunkWithOverlap(shortText, 100, 10);
    
    if (result.length === 1 && result[0] === shortText) {
      console.log('   ✓ PASS: 1 chunk retourné correctement');
      passed++;
    } else {
      console.log('   ✗ FAIL: Résultat incorrect');
      failed++;
    }
  } catch (error) {
    console.log(`   ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 2: Texte long (> chunkSize) sans overlap
  console.log('\n✅ Test 2: Texte long sans overlap');
  try {
    const longText = Array(500).fill(0).map((_, i) => `mot${i}`).join(' ');
    const result = chunkWithOverlap(longText, 100, 0);
    
    if (result.length === 5) {
      console.log(`   ✓ PASS: ${result.length} chunks retournés (attendu: 5)`);
      passed++;
    } else {
      console.log(`   ✗ FAIL: ${result.length} chunks (attendu: 5)`);
      failed++;
    }
  } catch (error) {
    console.log(`   ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 3: Texte avec overlap
  console.log('\n✅ Test 3: Texte avec overlap');
  try {
    const text = Array(300).fill(0).map((_, i) => `mot${i}`).join(' ');
    const result = chunkWithOverlap(text, 100, 20);
    
    // Avec overlap=20: pas de chevauchement exact sauf en théorie
    if (result.length > 2) {
      console.log(`   ✓ PASS: ${result.length} chunks avec overlap`);
      console.log(`      Chunk 1: ${result[0].split(/\s+/).length} mots`);
      console.log(`      Chunk 2: ${result[1].split(/\s+/).length} mots`);
      passed++;
    } else {
      console.log(`   ✗ FAIL: Nombre de chunks incorrect`);
      failed++;
    }
  } catch (error) {
    console.log(`   ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 4: Détection overlap >= chunkSize (CRITIQUE)
  console.log('\n✅ Test 4: Détection overlap >= chunkSize (sécurité)');
  try {
    chunkWithOverlap('mot1 mot2 mot3', 100, 100); // overlap == chunkSize
    console.log('   ✗ FAIL: Erreur non levée!');
    failed++;
  } catch (error) {
    if (error.message.includes('overlap') && error.message.includes('chunkSize')) {
      console.log('   ✓ PASS: Erreur correctement levée');
      passed++;
    } else {
      console.log(`   ✗ FAIL: Mauvais message: ${error.message}`);
      failed++;
    }
  }

  // Test 5: Texte vide
  console.log('\n✅ Test 5: Texte vide (gestion erreur)');
  try {
    chunkWithOverlap('', 100, 10);
    console.log('   ✗ FAIL: Erreur non levée!');
    failed++;
  } catch (error) {
    if (error.message.includes('vide')) {
      console.log('   ✓ PASS: Erreur correctement levée');
      passed++;
    } else {
      console.log(`   ✗ FAIL: Mauvais message: ${error.message}`);
      failed++;
    }
  }

  // Résumé
  console.log('\n' + '='.repeat(80));
  console.log(`📊 RÉSULTATS: ${passed} passés, ${failed} échoués`);
  console.log('='.repeat(80) + '\n');

  return { passed, failed, total: passed + failed };
}

// ============================================================================
// MAIN - Exécution si lancé directement
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  console.log('\n🚀 PHASE 2-3: Script d\'indexation');
  console.log('Configuration:');
  console.log(`  - chunkSize: ${CONFIG.chunkSize} mots`);
  console.log(`  - overlap: ${CONFIG.overlap} mots`);
  console.log(`  - corporaDir: ${CONFIG.corporaDir}`);

  // Lancer les tests
  const results = await runTests();

  // Charger le corpus si disponible
  console.log('\n📁 Chargement du corpus...');
  try {
    const processed = await processCorpus();
    
    if (processed.length === 0) {
      console.log('⚠️  Aucun fichier dans corpus/');
    } else {
      console.log(`✅ ${processed.length} fichier(s) chargé(s):\n`);
      processed.forEach(doc => {
        console.log(`  📄 ${doc.filename}`);
        console.log(`     - Taille: ${doc.size_bytes} bytes`);
        console.log(`     - Mots: ${doc.words}`);
        console.log(`     - Chunks: ${doc.chunkCount}`);
      });
    }
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
  }
}
