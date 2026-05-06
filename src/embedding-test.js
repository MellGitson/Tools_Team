import dotenv from 'dotenv';

dotenv.config();

/**
 * Découpe un texte en chunks de mots
 * @param {string} text - Le texte à découper
 * @param {number} maxWords - Nombre maximum de mots par chunk (défaut: 50)
 * @returns {string[]} - Array de chunks
 */
function simpleChunk(text, maxWords = 50) {
  if (!text || text.trim().length === 0) {
    return [];
  }

  const words = text.split(/\s+/).filter(w => w.length > 0);
  const chunks = [];

  for (let i = 0; i < words.length; i += maxWords) {
    const chunk = words.slice(i, i + maxWords).join(' ');
    chunks.push(chunk);
  }

  return chunks;
}

/**
 * Mock embedding pour tests sans limites API
 */
function getMockEmbedding(text) {
  // Générer un embedding pseudo-aléatoire basé sur le texte
  const seed = text.split('').reduce((a, b) => a + b.charCodeAt(0), 0);
  const embedding = Array(1024).fill(0).map((_, i) => {
    return Math.sin((seed + i) * 0.001) * 0.3 + Math.cos((seed - i) * 0.002) * 0.2;
  });
  return embedding;
}

/**
 * Test complet de la Phase 6 avec mock
 */
async function testEmbeddingMock() {
  console.log('\n📚 PHASE 6: Embedder un document (MODE DÉMONSTRATION)');
  console.log('='.repeat(80));

  const testText = `L'intelligence artificielle est un domaine en rapide évolution. Les modèles d'IA 
  comme les transformers ont révolutionné le traitement du langage naturel. Les embeddings permettent 
  de représenter le texte sous forme de vecteurs numériques, ce qui facilite les opérations de recherche 
  sémantique et de classification. Pinecone est une base de données vectorielle cloud qui permet de stocker 
  et rechercher efficacement ces vecteurs à grande échelle. Mistral AI fournit des modèles d'embedding 
  de haute qualité qui peuvent être utilisés pour générer des représentations vectorielles.`;

  try {
    // Étape 1 : Découper le texte
    console.log('\n📄 ÉTAPE 1 : Découpage du texte');
    console.log('─'.repeat(80));
    const chunks = simpleChunk(testText, 30);
    console.log(`✅ Texte découpé en ${chunks.length} chunks:`);
    chunks.forEach((chunk, i) => {
      console.log(`\n  Chunk ${i + 1} (${chunk.split(/\s+/).length} mots):`);
      console.log(`  "${chunk.substring(0, 70)}${chunk.length > 70 ? '...' : ''}"`);
    });

    // Étape 2 : Générer des embeddings (mock)
    console.log('\n\n📊 ÉTAPE 2 : Génération des embeddings (MOCK - sans appel API)');
    console.log('─'.repeat(80));
    const vectors = [];
    
    for (let i = 0; i < chunks.length; i++) {
      const embedding = getMockEmbedding(chunks[i]);
      vectors.push({
        id: `chunk-${i}`,
        values: embedding,
        metadata: {
          text: chunks[i],
          chunk_index: i,
          created_at: new Date().toISOString(),
        },
      });
      console.log(`✅ Embedding généré pour chunk ${i + 1}:`);
      console.log(`   Dimension: 1024`);
      console.log(`   Premiers 5 éléments: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    }

    // Étape 3 : Structure des vecteurs
    console.log('\n\n📤 ÉTAPE 3 : Structure prête pour Pinecone upsert');
    console.log('─'.repeat(80));
    console.log(`✅ ${vectors.length} vecteurs prêts à être upsertés:\n`);
    
    vectors.forEach((vec, i) => {
      console.log(`  Vecteur ${i + 1}:`);
      console.log(`    ID: ${vec.id}`);
      console.log(`    Dimension: ${vec.values.length}`);
      console.log(`    Texte: "${vec.metadata.text.substring(0, 50)}..."`);
      console.log(`    Métadonnées: chunk_index=${vec.metadata.chunk_index}`);
      console.log();
    });

    // Étape 4 : Format JSON pour Pinecone
    console.log('📋 Format JSON pour Pinecone:\n');
    console.log(`POST {PINECONE_INDEX_HOST}/vectors/upsert`);
    console.log('Headers:');
    console.log('  Api-Key: {PINECONE_API_KEY}');
    console.log('  Content-Type: application/json\n');
    console.log('Body:');
    console.log(JSON.stringify({
      vectors: vectors.slice(0, 1), // Montrer seulement le premier pour la lisibilité
    }, null, 2).split('\n').slice(0, 20).join('\n'));
    console.log('  ... (et 2 autres vecteurs)');

    console.log('\n' + '='.repeat(80));
    console.log('✅ Démonstration Phase 6 réussie !');
    console.log('\n📝 Résumé:');
    console.log(`   ✓ Texte découpé en ${chunks.length} chunks`);
    console.log(`   ✓ ${vectors.length} embeddings générés (1024 dimensions)`);
    console.log(`   ✓ Structure prête pour Pinecone upsert`);
    console.log(`   ✓ Chaque vecteur inclut ID, values et métadonnées`);

  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécuter le test mock
testEmbeddingMock();

export { testEmbeddingMock };
