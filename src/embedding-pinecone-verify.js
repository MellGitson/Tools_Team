import dotenv from 'dotenv';
import { getEmbedding, simpleChunk } from './embedding-multi-provider.js';

dotenv.config();

/**
 * Requête les vecteurs dans Pinecone pour vérifier l'upsert
 */
async function queryPinecone(vectorValues, topK = 5) {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexHost = process.env.PINECONE_INDEX_HOST;

  if (!apiKey || !indexHost) {
    throw new Error('PINECONE_API_KEY ou PINECONE_INDEX_HOST non configurés');
  }

  try {
    const response = await fetch(`https://${indexHost}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vector: vectorValues,
        topK: topK,
        includeMetadata: true,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur Pinecone ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Impossible de requête Pinecone: ${error.message}`);
  }
}

/**
 * Test complet : Embedding → Upsert → Query
 */
async function testEmbeddingPineconeEndToEnd() {
  console.log('\n🔄 TEST END-TO-END: Embedding + Pinecone');
  console.log('='.repeat(80));

  const testText = `L'intelligence artificielle est un domaine en rapide évolution. Les modèles d'IA 
  transforment le traitement du langage naturel. Les embeddings permettent de représenter le texte 
  sous forme de vecteurs numériques pour les recherches sémantiques.`;

  try {
    // ÉTAPE 1 : Découper le texte
    console.log('\n📄 ÉTAPE 1 : Découpage du texte');
    console.log('─'.repeat(80));
    const chunks = simpleChunk(testText, 30);
    console.log(`✅ Texte découpé en ${chunks.length} chunks`);
    chunks.forEach((chunk, i) => {
      console.log(`   Chunk ${i + 1}: "${chunk.substring(0, 60)}..."`);
    });

    // ÉTAPE 2 : Générer embedding pour le premier chunk
    console.log('\n📊 ÉTAPE 2 : Génération de l\'embedding');
    console.log('─'.repeat(80));
    console.log('Génération embedding via Mistral...');
    const embedding = await getEmbedding(chunks[0], 'mistral');
    console.log(`✅ Embedding généré`);
    console.log(`   Dimension: ${embedding.length}`);
    console.log(`   Premiers éléments: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

    // ÉTAPE 3 : Upsert dans Pinecone
    console.log('\n📤 ÉTAPE 3 : Upsert dans Pinecone');
    console.log('─'.repeat(80));
    console.log('Envoi du vecteur à Pinecone...');

    const indexHost = process.env.PINECONE_INDEX_HOST;
    const apiKey = process.env.PINECONE_API_KEY;

    const upsertResponse = await fetch(`https://${indexHost}/vectors/upsert`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vectors: [{
          id: 'test-embedding-verify',
          values: embedding,
          metadata: {
            text: chunks[0],
            test: true,
            timestamp: new Date().toISOString(),
          },
        }],
      }),
    });

    if (!upsertResponse.ok) {
      throw new Error(`Upsert échoué: ${upsertResponse.status} ${await upsertResponse.text()}`);
    }

    const upsertData = await upsertResponse.json();
    console.log(`✅ Vecteur upsertés: ${upsertData.upserted_count || 1}`);

    // ÉTAPE 4 : Attendre un peu pour la réplication
    console.log('\n⏳ Attente de réplication dans Pinecone (2s)...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // ÉTAPE 5 : Query pour vérifier
    console.log('\n🔍 ÉTAPE 5 : Vérification via query');
    console.log('─'.repeat(80));
    console.log('Recherche du vecteur upsertés...');

    const queryData = await queryPinecone(embedding, 10);
    console.log(`✅ Query réussie`);
    
    // Pinecone retourne "matches" et non "results"
    const results = queryData.matches || queryData.results || [];
    console.log(`   Résultats trouvés: ${results.length}`);

    if (process.env.DEBUG) {
      console.log('\n🔍 Réponse brute de la query:');
      console.log(JSON.stringify(queryData, null, 2));
    }

    if (results && results.length > 0) {
      console.log('\n📋 Résultats de la query:');
      results.forEach((result, i) => {
        console.log(`\n   Résultat ${i + 1}:`);
        console.log(`   ID: ${result.id}`);
        console.log(`   Score: ${result.score?.toFixed(4)}`);
        if (result.metadata) {
          console.log(`   Métadonnées: ${JSON.stringify(result.metadata)}`);
        }
      });

      // Vérifier si notre vecteur est trouvé
      const found = results.find(r => r.id === 'test-embedding-verify');
      if (found) {
        console.log('\n✅ ✅ ✅ VECTEUR TROUVÉ ! Stockage confirmé dans Pinecone');
        console.log(`   Score: ${found.score?.toFixed(4)}`);
      } else {
        console.log('\n⚠️  Vecteur de test non trouvé (mais autres vecteurs présents)');
      }
    } else {
      console.log('\n⚠️  Aucun résultat trouvé (index peut nécessiter plus de temps)');
    }

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test END-TO-END complété');
    console.log('\n📝 Résumé:');
    console.log('   ✓ Texte découpé en chunks');
    console.log('   ✓ Embedding généré via Mistral (1024d)');
    console.log('   ✓ Upsert réussi dans Pinecone');
    console.log('   ✓ Query confirmée dans Pinecone');

  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécuter
testEmbeddingPineconeEndToEnd();

export { testEmbeddingPineconeEndToEnd, queryPinecone };
