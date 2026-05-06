/**
 * PHASE 3 DEBUG: Diagnostic du pipeline
 * 
 * Affiche chaque étape en détail pour identifier les problèmes
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { chunkWithOverlap, loadCorpus, CONFIG } from './create-index.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Charger .env
import('dotenv').then(({ default: dotenv }) => {
  dotenv.config();
}).then(async () => {
  try {
    // ÉTAPE 1: Chargement corpus
    console.log('\n📁 ÉTAPE 1: Chargement du corpus');
    console.log('-'.repeat(80));
    const corpus = await loadCorpus();
    console.log(`✅ ${corpus.length} fichier(s):\n`);

    corpus.forEach(doc => {
      console.log(`   • ${doc.filename}: ${doc.text.length} bytes`);
    });

    // ÉTAPE 2: Chunking
    console.log('\n✂️  ÉTAPE 2: Chunking avec details');
    console.log('-'.repeat(80));
    const allChunks = [];

    corpus.forEach(doc => {
      const chunks = chunkWithOverlap(doc.text, CONFIG.chunkSize, CONFIG.overlap);
      console.log(`\n   📄 ${doc.filename}:`);
      console.log(`      • Text length: ${doc.text.length} bytes`);
      console.log(`      • Words: ${doc.text.split(/\s+/).length}`);
      console.log(`      • Chunks created: ${chunks.length}`);

      chunks.forEach((chunk, idx) => {
        const words = chunk.split(/\s+/).length;
        console.log(`        - Chunk ${idx}: ${words} words, ${chunk.substring(0, 50)}...`);

        allChunks.push({
          filename: doc.filename,
          text: chunk,
          chunkIndex: idx,
        });
      });
    });

    console.log(`\n✅ Total: ${allChunks.length} chunks`);

    // ÉTAPE 3: Mock Embedding response
    console.log('\n🤖 ÉTAPE 3: Mock Embedding');
    console.log('-'.repeat(80));

    const mockVectors = allChunks.map((chunk, i) => ({
      id: `${chunk.filename}-chunk-${chunk.chunkIndex}`,
      values: Array(1024).fill(0).map(() => Math.random() * 0.01), // 1024d mock embedding
      metadata: {
        text: chunk.text.substring(0, 100), // Preview
        source: chunk.filename,
        chunkIndex: chunk.chunkIndex,
        wordCount: chunk.text.split(/\s+/).length,
      },
    }));

    console.log(`✅ ${mockVectors.length} mock vecteurs créés\n`);
    
    // Afficher détails premier vecteur
    const first = mockVectors[0];
    console.log(`   📤 Exemple - Premier vecteur:`);
    console.log(`      • ID: ${first.id}`);
    console.log(`      • Values length: ${first.values.length}`);
    console.log(`      • Values preview: [${first.values.slice(0, 5).map(v => v.toFixed(4)).join(', ')}, ...]`);
    console.log(`      • Metadata:`, JSON.stringify(first.metadata, null, 10));

    // ÉTAPE 4: Format Pinecone
    console.log('\n📤 ÉTAPE 4: Format pour Pinecone');
    console.log('-'.repeat(80));

    const formattedBatch = mockVectors.slice(0, 3).map(v => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata,
    }));

    console.log(`✅ Batch formaté (3 vecteurs):`);
    console.log(JSON.stringify(formattedBatch[0], null, 2));

    // ÉTAPE 5: Simulation Pinecone upsert
    console.log('\n📊 ÉTAPE 5: Simulation Pinecone batch');
    console.log('-'.repeat(80));

    const batchSize = CONFIG.batchSize;
    let totalBatches = 0;

    for (let i = 0; i < mockVectors.length; i += batchSize) {
      const batch = mockVectors.slice(i, i + batchSize);
      totalBatches++;
      console.log(`   Batch ${totalBatches}: ${batch.length} vecteurs (${i}-${Math.min(i + batchSize - 1, mockVectors.length - 1)})`);
    }

    console.log(`\n✅ Total: ${totalBatches} batches pour ${mockVectors.length} vecteurs`);

    // RÉSUMÉ
    console.log('\n' + '='.repeat(80));
    console.log('✅ DEBUG COMPLET');
    console.log('='.repeat(80));
    console.log(`
📋 PROBLÈME POTENTIEL IDENTIFIÉ:
   • Vecteurs: ${mockVectors.length}
   • Format: { id, values: [1024], metadata }
   • Batches: ${totalBatches}
   
💡 SI ERREUR "Must pass in at least 1 record":
   1. Vérifier que vectors.length > 0
   2. Vérifier format: Pinecone attend { id, values: [...], metadata }
   3. Vérifier que values a exactement 1024 dimensions
   4. Vérifier que index est bien connecté
   
🔧 SOLUTION POSSIBLE:
   • Vérifier réponse Mistral API - format embedding
   • Vérifier que embedBatch() retourne correctement
   • Ajouter console.log(embeddings[0]) dans embedChunksWithConcurrency
    `);

  } catch (error) {
    console.error('\n❌ ERREUR DEBUG:');
    console.error(error);
  }
});
