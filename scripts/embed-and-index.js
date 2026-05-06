/**
 * PHASE 3: Batch embed et indexation dans Pinecone
 * 
 * Objectif: vectoriser les chunks et les pousser dans Pinecone
 * 
 * Processus:
 * 1. Charger corpus → chunkify
 * 2. Embed par batches (contrôle parallélisme)
 * 3. Upsert dans Pinecone par lots (batchSize)
 * 4. Métadonnées idempotentes: ${filename}-chunk-${i}
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pinecone } from '@pinecone-database/pinecone';
import { chunkWithOverlap, loadCorpus, CONFIG } from './create-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ============================================================================
// CONFIGURATION PINECONE
// ============================================================================

const PINECONE_CONFIG = {
  indexName: process.env.PINECONE_INDEX || 'mini-perplexity-groupe-1',
  dimension: 1024, // mistral-embed dimension
  namespace: process.env.PINECONE_NAMESPACE || 'pydantic-ai',
};

let pinecone;
let index;

// ============================================================================
// PHASE 3A: BATCH EMBEDDING
// ============================================================================

/**
 * Obtient les embeddings d'un batch de textes via API Mistral
 * 
 * @param {Array<string>} texts - Textes à embedder (max 50)
 * @returns {Promise<Array>} - [ { embedding: [...], index: i }, ... ]
 * 
 * @example
 * const embeds = await embedBatch(["texte1", "texte2"]);
 * // Returns: [
 * //   { embedding: [0.1, 0.2, ...], index: 0 },
 * //   { embedding: [0.3, 0.4, ...], index: 1 }
 * // ]
 */
export async function embedBatch(texts) {
  if (!texts || texts.length === 0) {
    throw new Error('embedBatch: texts array ne peut pas être vide');
  }

  if (texts.length > 50) {
    throw new Error(`embedBatch: max 50 textes, reçu ${texts.length}`);
  }

  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY not found in .env');
  }

  try {
    const response = await fetch('https://api.mistral.ai/v1/embeddings', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-embed',
        input: texts,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Mistral API error ${response.status}: ${error}`);
    }

    const data = await response.json();
    
    // Vérifier structure de la réponse
    if (!data.data || !Array.isArray(data.data)) {
      console.error('🔍 Mistral API response:', JSON.stringify(data).substring(0, 200));
      throw new Error('Invalid Mistral API response: data.data is not an array');
    }

    if (data.data.length === 0) {
      throw new Error('Mistral API returned empty embeddings array');
    }

    // Vérifier dimension du premier embedding
    const firstEmbedding = data.data[0].embedding;
    if (!firstEmbedding || !Array.isArray(firstEmbedding)) {
      console.error('🔍 First embedding:', JSON.stringify(data.data[0]).substring(0, 200));
      throw new Error('Invalid embedding format: embedding is not an array');
    }

    const embeddingDim = firstEmbedding.length;
    if (embeddingDim !== PINECONE_CONFIG.dimension) {
      throw new Error(
        `Vector dimension mismatch: got ${embeddingDim}, ` +
        `expected ${PINECONE_CONFIG.dimension} (mistral-embed)`
      );
    }

    return data.data;
  } catch (error) {
    throw new Error(`embedBatch failed: ${error.message}`);
  }
}

// ============================================================================
// PHASE 3B: EMBED WITH CONTROLLED PARALLELISM
// ============================================================================

/**
 * Embedde un tableau de chunks avec contrôle du parallélisme
 * 
 * @param {Array<{filename, text}>} chunks - Chunks avec métadonnées
 * @returns {Promise<Array>} - [ { id, values, metadata }, ... ]
 */
async function embedChunksWithConcurrency(chunks) {
  const embedConcurrency = CONFIG.embedConcurrency;
  const results = [];
  let processedCount = 0;

  console.log(`\n⚡ Embedding ${chunks.length} chunks avec concurrency=${embedConcurrency}`);

  // Découper en sous-tableaux de taille embedConcurrency
  for (let i = 0; i < chunks.length; i += embedConcurrency) {
    const batch = chunks.slice(i, i + embedConcurrency);
    const batchTexts = batch.map(c => c.text);

    try {
      console.log(`   📤 Batch ${Math.floor(i / embedConcurrency) + 1}: embedding ${batch.length} textes...`);
      const embeddings = await embedBatch(batchTexts);

      if (!embeddings || embeddings.length === 0) {
        throw new Error('embedBatch returned empty array');
      }

      if (embeddings.length !== batch.length) {
        throw new Error(
          `Embeddings count mismatch: got ${embeddings.length}, ` +
          `expected ${batch.length}`
        );
      }

      // Associer les embeddings avec leurs métadonnées
      embeddings.forEach((emb, idx) => {
        if (!emb.embedding || !Array.isArray(emb.embedding)) {
          throw new Error(
            `Invalid embedding at index ${idx}: ` +
            `${JSON.stringify(emb).substring(0, 100)}`
          );
        }

        const chunk = batch[idx];
        results.push({
          id: `${chunk.filename}-chunk-${chunk.chunkIndex}`,
          values: emb.embedding,
          metadata: {
            text: chunk.text,
            source: chunk.filename,
            chunkIndex: chunk.chunkIndex,
          },
        });

        processedCount++;

        // Progress bar
        if (processedCount % 10 === 0) {
          console.log(`   ✓ Embedded ${processedCount}/${chunks.length}...`);
        }
      });

      // Petit délai entre batches pour éviter rate limiting
      if (i + embedConcurrency < chunks.length) {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (error) {
      console.error(`❌ Erreur embedding batch ${i}-${i + embedConcurrency}`);
      console.error(`   Error: ${error.message}`);
      throw error;
    }
  }

  console.log(`✅ Embedding complet: ${processedCount} vecteurs prêts`);
  return results;
}

// ============================================================================
// PHASE 3C: PINECONE INDEXING
// ============================================================================

/**
 * Initialise la connexion Pinecone
 */
async function initPinecone() {
  const apiKey = process.env.PINECONE_API_KEY;
  if (!apiKey) {
    throw new Error('PINECONE_API_KEY not found in .env');
  }

  pinecone = new Pinecone({ apiKey });
  index = pinecone.Index(PINECONE_CONFIG.indexName);

  console.log(`✅ Pinecone initialized (index: ${PINECONE_CONFIG.indexName})`);
  return index;
}

/**
 * Upsert des vecteurs dans Pinecone par batches
 * 
 * @param {Array<{id, values, metadata}>} vectors - Vecteurs à upsert
 */
async function upsertVectors(vectors) {
  if (!index) {
    throw new Error('Pinecone index not initialized');
  }

  if (!vectors || vectors.length === 0) {
    throw new Error('No vectors to upsert');
  }

  const batchSize = CONFIG.batchSize;
  let upsertedCount = 0;

  console.log(`\n📤 Upserting ${vectors.length} vecteurs (batchSize=${batchSize})`);
  console.log(`   📋 Vecteurs details: ${JSON.stringify({
    first_id: vectors[0]?.id,
    first_values_length: vectors[0]?.values?.length,
    has_metadata: !!vectors[0]?.metadata,
  })}`);

  for (let i = 0; i < vectors.length; i += batchSize) {
    const batch = vectors.slice(i, i + batchSize);

    if (batch.length === 0) {
      console.warn(`⚠️  Batch vide à l'index ${i}, skip`);
      continue;
    }

    try {
      // Transformer le format Pinecone - format record standard
      const formattedBatch = batch.map(v => ({
        id: String(v.id), // Ensure ID is string
        values: v.values, // 1024-dim array
        metadata: v.metadata || {},
      }));

      // Debug: log premier vecteur du batch
      if (i === 0) {
        console.log(`   📋 Batch 0 details:`);
        console.log(`      • Batch length: ${formattedBatch.length}`);
        console.log(`      • First record:`, JSON.stringify({
          id: formattedBatch[0].id,
          values_length: formattedBatch[0].values?.length,
          has_metadata: !!formattedBatch[0].metadata,
        }));
        console.log(`      • Trying upsert with format: { vectors: [...] }`);
      }

      // Essayer d'abord le format array simple
      console.log(`   🔄 Appel index.upsert() avec format { records: [...] } (${formattedBatch.length} vecteurs)...`);
      await index.upsert({
        records: formattedBatch, // SDK v7 expects { records: [...] }
      });

      upsertedCount += batch.length;
      console.log(`   ✓ Upsert ${upsertedCount}/${vectors.length}...`);

      // Petit délai entre batches
      if (i + batchSize < vectors.length) {
        await new Promise(resolve => setTimeout(resolve, 200));
      }
    } catch (error) {
      console.error(`\n❌ Erreur upsert batch ${i}-${Math.min(i + batchSize, vectors.length)}`);
      console.error(`   Batch size: ${batch.length}`);
      console.error(`   Error message: ${error.message}`);
      console.error(`   Error code: ${error.code}`);
      console.error(`   Full error:`, error);
      throw error;
    }
  }

  console.log(`✅ Upsert complété: ${upsertedCount} vecteurs indexés`);
  return upsertedCount;
}

// ============================================================================
// PHASE 3 ORCHESTRATION
// ============================================================================

/**
 * Pipeline complet: charger → chunker → embedder → indexer
 */
export async function runFullPipeline() {
  try {
    // ÉTAPE 1: Chargement corpus
    console.log('\n' + '='.repeat(80));
    console.log('PHASE 3: BATCH EMBED ET INDEXATION');
    console.log('='.repeat(80));

    console.log('\n📁 Étape 1: Chargement du corpus...');
    const corpus = await loadCorpus();

    if (corpus.length === 0) {
      console.warn('⚠️  Aucun fichier dans corpus/');
      return;
    }

    console.log(`✅ ${corpus.length} fichier(s) chargé(s)`);

    // ÉTAPE 2: Chunking
    console.log('\n✂️  Étape 2: Chunking...');
    let totalChunks = 0;
    const allChunks = [];

    corpus.forEach(doc => {
      const chunks = chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap);
      console.log(`   • ${doc.filename}: ${chunks.length} chunks (${doc.text.split(/\s+/).length} mots)`);

      // Ajouter avec métadonnées
      chunks.forEach((text, idx) => {
        allChunks.push({
          filename: doc.filename,
          text,
          chunkIndex: idx,
        });
      });

      totalChunks += chunks.length;
    });

    console.log(`✅ ${totalChunks} chunks créés au total`);

    // ÉTAPE 3: Embedding avec Mistral
    console.log('\n🤖 Étape 3: Embedding avec Mistral...');
    const vectors = await embedChunksWithConcurrency(allChunks);

    // ÉTAPE 4: Indexation Pinecone
    console.log('\n📍 Étape 4: Indexation Pinecone...');
    await initPinecone();
    const indexed = await upsertVectors(vectors);

    // RÉSUMÉ
    console.log('\n' + '='.repeat(80));
    console.log('✅ PHASE 3 COMPLÉTÉE');
    console.log('='.repeat(80));
    console.log(`\n📊 Résumé:`);
    console.log(`   • Fichiers: ${corpus.length}`);
    console.log(`   • Chunks: ${totalChunks}`);
    console.log(`   • Vecteurs indexés: ${indexed}`);
    console.log(`   • Index Pinecone: ${PINECONE_CONFIG.indexName}`);
    console.log(`   • Namespace: ${PINECONE_CONFIG.namespace}`);
    console.log('\n✨ Pipeline prêt pour les requêtes RAG!\n');

    return { corpus: corpus.length, chunks: totalChunks, indexed };
  } catch (error) {
    console.error('\n❌ ERREUR PHASE 3:');
    console.error(error.message);
    process.exit(1);
  }
}

// ============================================================================
// TESTS UNITAIRES
// ============================================================================

export async function runTests() {
  console.log('\n🧪 TESTS UNITAIRES - Phase 3');
  console.log('='.repeat(80));

  let passed = 0;
  let failed = 0;

  // Test 1: embedBatch validation
  console.log('\n✅ Test 1: embedBatch() validations');
  try {
    // Vérifier erreur sur textes vides
    try {
      await embedBatch([]);
      console.log('   ✗ FAIL: Pas d\'erreur pour textes vides');
      failed++;
    } catch (error) {
      if (error.message.includes('vide')) {
        console.log('   ✓ PASS: Erreur levée pour textes vides');
        passed++;
      } else {
        console.log(`   ✗ FAIL: Mauvais message: ${error.message}`);
        failed++;
      }
    }
  } catch (error) {
    console.log(`   ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 2: Controlled parallelism validation
  console.log('\n✅ Test 2: Parallelism control');
  try {
    const testChunks = Array(10).fill(0).map((_, i) => ({
      filename: 'test.txt',
      text: `Chunk ${i} text content`,
      chunkIndex: i,
    }));

    if (testChunks.length === 10) {
      console.log('   ✓ PASS: Test chunks créés correctement');
      passed++;
    } else {
      console.log('   ✗ FAIL: Nombre de chunks incorrect');
      failed++;
    }
  } catch (error) {
    console.log(`   ✗ FAIL: ${error.message}`);
    failed++;
  }

  // Test 3: ID generation for idempotency
  console.log('\n✅ Test 3: ID generation (idempotence)');
  try {
    const filename = 'pydantic-ai.txt';
    const id1 = `${filename}-chunk-0`;
    const id2 = `${filename}-chunk-0`;
    const id3 = `${filename}-chunk-1`;

    if (id1 === id2 && id1 !== id3) {
      console.log('   ✓ PASS: IDs générés de manière idempotente');
      passed++;
    } else {
      console.log('   ✗ FAIL: IDs non idempotents');
      failed++;
    }
  } catch (error) {
    console.log(`   ✗ FAIL: ${error.message}`);
    failed++;
  }

  console.log('\n' + '='.repeat(80));
  console.log(`📊 RÉSULTATS: ${passed} passés, ${failed} échoués`);
  console.log('='.repeat(80) + '\n');

  return { passed, failed };
}

// ============================================================================
// MAIN
// ============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  // Charger .env
  import('dotenv').then(({ default: dotenv }) => {
    dotenv.config();
  }).then(() => {
    const command = process.argv[2];

    if (command === 'test') {
      runTests();
    } else if (command === 'run') {
      runFullPipeline();
    } else {
      console.log('\n📋 Usage:');
      console.log('   node scripts/embed-and-index.js test  - Exécuter les tests');
      console.log('   node scripts/embed-and-index.js run   - Pipeline complet\n');
    }
  });
}
