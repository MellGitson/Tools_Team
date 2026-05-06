import dotenv from 'dotenv';

dotenv.config();

/**
 * Génère l'embedding d'un texte via Mistral
 * @param {string} text - Le texte à embedder
 * @returns {Promise<number[]>} - Array de 1024 dimensions
 */
async function getEmbedding(text) {
  const apiKey = process.env.MISTRAL_API_KEY;

  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY non configuré dans .env');
  }

  if (!text || text.trim().length === 0) {
    throw new Error('Le texte à embedder ne peut pas être vide');
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
        input: text,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Mistral ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    if (!data.data || !data.data[0] || !data.data[0].embedding) {
      throw new Error('Format de réponse Mistral incorrect');
    }

    return data.data[0].embedding;
  } catch (error) {
    throw new Error(`Impossible de générer l'embedding: ${error.message}`);
  }
}

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
 * Insère les chunks et leurs embeddings dans Pinecone
 * @param {string[]} chunks - Array de chunks texte
 * @returns {Promise<{upsertedCount: number}>}
 */
async function upsertChunks(chunks) {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexHost = process.env.PINECONE_INDEX_HOST;

  if (!apiKey || !indexHost) {
    throw new Error('PINECONE_API_KEY ou PINECONE_INDEX_HOST non configurés dans .env');
  }

  if (!chunks || chunks.length === 0) {
    throw new Error('Aucun chunk à upserter');
  }

  try {
    // Générer les embeddings pour chaque chunk
    console.log(`\n📊 Génération des embeddings pour ${chunks.length} chunks...`);
    const vectors = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk);

      vectors.push({
        id: `chunk-${i}`,
        values: embedding,
        metadata: {
          text: chunk,
          chunk_index: i,
          created_at: new Date().toISOString(),
        },
      });

      // Afficher la progression
      if ((i + 1) % 5 === 0 || i === chunks.length - 1) {
        console.log(`  ✓ ${i + 1}/${chunks.length} embeddings générés`);
      }
    }

    // Upserter dans Pinecone
    console.log(`\n📤 Upsert des ${vectors.length} vecteurs dans Pinecone...`);
    const response = await fetch(`https://${indexHost}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vectors: vectors,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Pinecone ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      upsertedCount: data.upserted_count || vectors.length,
    };
  } catch (error) {
    throw new Error(`Impossible d'upserter les chunks: ${error.message}`);
  }
}

/**
 * Test complet de la Phase 6
 */
async function testEmbedding() {
  console.log('\n📚 PHASE 6: Embedder un document');
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

    // Étape 2 : Générer un embedding de test
    console.log('\n\n📊 ÉTAPE 2 : Test d\'un embedding unique');
    console.log('─'.repeat(80));
    console.log('Génération d\'un embedding pour le premier chunk...');
    const startTime = Date.now();
    const testEmbedding = await getEmbedding(chunks[0]);
    const duration = Date.now() - startTime;

    console.log(`✅ Embedding généré en ${duration}ms`);
    console.log(`   Dimension: ${testEmbedding.length}`);
    console.log(`   Premiers 5 éléments: [${testEmbedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

    // Étape 3 : Upserter les chunks dans Pinecone (seulement le premier pour économiser l'API)
    console.log('\n\n📤 ÉTAPE 3 : Upsert dans Pinecone');
    console.log('─'.repeat(80));
    console.log('Upsert du premier chunk pour tester...');
    const upsertResult = await upsertChunks([chunks[0]]);
    console.log(`✅ ${upsertResult.upsertedCount} vecteur upsertés avec succès`);

    // Montrer la structure
    console.log('\n📊 Structure du vecteur stocké:');
    console.log('─'.repeat(80));
    console.log(`  ID: chunk-0`);
    console.log(`  Dimension: 1024`);
    console.log(`  Texte: "${chunks[0].substring(0, 60)}..."`);
    console.log(`  Métadonnées: { chunk_index, created_at }`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test Phase 6 réussi !');
  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécuter le test seulement si c'est le fichier principal
if (import.meta.url === `file://${process.argv[1]}`) {
  testEmbedding();
}

export { getEmbedding, simpleChunk, upsertChunks, testEmbedding };
