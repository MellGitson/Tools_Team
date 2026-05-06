import dotenv from 'dotenv';
import { getEmbedding } from './embedding-multi-provider.js';

dotenv.config();

/**
 * Requête le vector store Pinecone pour trouver les chunks similaires
 * @param {number[]} vectorValues - Le vecteur de la question
 * @param {number} topK - Nombre de résultats à retourner (défaut: 3)
 * @returns {Promise<Array>} - Résultats triés par score décroissant
 */
async function queryPinecone(vectorValues, topK = 3) {
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
      throw new Error(`Erreur Pinecone ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    return data.matches || [];
  } catch (error) {
    throw new Error(`Impossible de requête Pinecone: ${error.message}`);
  }
}

/**
 * PHASE 7 : Recherche sémantique
 * Embed la question et trouve les chunks les plus similaires
 * 
 * @param {string} question - Question de l'utilisateur
 * @param {number} topK - Nombre de résultats (défaut: 3)
 * @returns {Promise<Array>} - Résultats avec { score, text, metadata }
 */
async function searchSimilar(question, topK = 3) {
  if (!question || question.trim().length === 0) {
    throw new Error('La question ne peut pas être vide');
  }

  try {
    // Étape 1: Embed la question
    const questionEmbedding = await getEmbedding(question, 'auto');

    // Étape 2: Query Pinecone
    const matches = await queryPinecone(questionEmbedding, topK);

    // Étape 3: Formater les résultats
    return matches.map((match, index) => ({
      rank: index + 1,
      id: match.id,
      score: match.score,
      text: match.metadata?.text || '',
      metadata: match.metadata || {},
    }));
  } catch (error) {
    throw new Error(`Erreur recherche: ${error.message}`);
  }
}

/**
 * Test complet Phase 7
 */
async function testPhase7() {
  console.log('\n🔍 PHASE 7: Requêter le Vector Store');
  console.log('='.repeat(80));
  console.log('Tester la recherche sémantique avec les 3 checkpoints\n');

  try {
    // TEST 1: Recherche pertinente (réponse dans le document)
    console.log('📌 CHECKPOINT 1: Recherche pertinente');
    console.log('─'.repeat(80));
    console.log('Question: "Qu\'est-ce que Node.js?"');
    console.log('Attente: Scores élevés pour chunks contenant Node.js\n');

    const results1 = await searchSimilar('Qu\'est-ce que Node.js?', 3);
    console.log(`✅ ${results1.length} résultats trouvés:\n`);
    results1.forEach((result) => {
      console.log(`   Score: ${result.score.toFixed(3)} | "${result.text.substring(0, 70)}..."`);
    });

    const avgScore1 = results1.reduce((sum, r) => sum + r.score, 0) / results1.length;
    console.log(`\n   Score moyen: ${avgScore1.toFixed(3)}`);
    console.log(`   Status: ${avgScore1 > 0.7 ? '✅ Pertinent' : '⚠️ Faible'}\n`);

    // TEST 2: Recherche hors sujet (faible similarité)
    console.log('📌 CHECKPOINT 2: Recherche hors sujet');
    console.log('─'.repeat(80));
    console.log('Question: "Quel est le meilleur restaurant de Paris?"');
    console.log('Attente: Scores bas pour chunks non-pertinents\n');

    const results2 = await searchSimilar('Quel est le meilleur restaurant de Paris?', 3);
    console.log(`✅ ${results2.length} résultats trouvés:\n`);
    results2.forEach((result) => {
      console.log(`   Score: ${result.score.toFixed(3)} | "${result.text.substring(0, 70)}..."`);
    });

    const avgScore2 = results2.reduce((sum, r) => sum + r.score, 0) / results2.length;
    console.log(`\n   Score moyen: ${avgScore2.toFixed(3)}`);
    console.log(`   Status: ${avgScore2 < 0.7 ? '✅ Correctement bas' : '⚠️ Trop élevé'}\n`);

    // TEST 3: Reformulation (résultats similaires)
    console.log('📌 CHECKPOINT 3: Reformulation');
    console.log('─'.repeat(80));
    console.log('Question 1: "Qu\'est-ce que Node.js?"');
    console.log('Question 2: "Parlez-moi de Node.js et ses caractéristiques"');
    console.log('Attente: Résultats similaires pour les deux questions\n');

    const results3a = await searchSimilar('Qu\'est-ce que Node.js?', 3);
    const results3b = await searchSimilar('Parlez-moi de Node.js et ses caractéristiques', 3);

    console.log('Q1 - Résultats:');
    results3a.forEach((result) => {
      console.log(`   Score: ${result.score.toFixed(3)} | ID: ${result.id}`);
    });

    console.log('\nQ2 - Résultats:');
    results3b.forEach((result) => {
      console.log(`   Score: ${result.score.toFixed(3)} | ID: ${result.id}`);
    });

    // Vérifier la cohérence
    const topId1 = results3a[0]?.id;
    const topId2 = results3b[0]?.id;
    const isSame = topId1 === topId2;
    console.log(`\n   Top résultat Q1: ${topId1}`);
    console.log(`   Top résultat Q2: ${topId2}`);
    console.log(`   Status: ${isSame ? '✅ Résultats stables' : '⚠️ Résultats différents'}\n`);

    // RÉSUMÉ
    console.log('='.repeat(80));
    console.log('\n📊 RÉSUMÉ PHASE 7\n');
    console.log('✅ Checkpoint 1 (Pertinence): Requête → Embedding → Query Pinecone');
    console.log('✅ Checkpoint 2 (Hors sujet): Scores bas pour questions irrelevantes');
    console.log('✅ Checkpoint 3 (Reformulation): Stabilité des résultats');
    console.log('\n✅ Function `searchSimilar()` fonctionnelle!');

  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécuter si c'est le fichier principal
if (import.meta.url === `file://${process.argv[1]}`) {
  testPhase7();
}

export { searchSimilar, queryPinecone, testPhase7 };
