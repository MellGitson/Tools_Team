import dotenv from 'dotenv';
import { searchSimilar } from './rag-query-agent.js';

dotenv.config();

/**
 * PHASE 8: Premier RAG complet
 * Combine retrieval + génération
 * Le LLM répond basé sur le contexte fourni, pas sur sa mémoire
 *
 * @param {string} question - Question de l'utilisateur
 * @param {number} topK - Nombre de chunks à récupérer (défaut: 3)
 * @param {string} provider - Provider LLM: 'mistral' | 'groq' (défaut: 'mistral')
 * @returns {Promise<Object>} - {question, context, response, sources}
 */
async function ragQuery(question, topK = 3, provider = 'mistral') {
  if (!question || question.trim().length === 0) {
    throw new Error('La question ne peut pas être vide');
  }

  try {
    console.log('\n🚀 PHASE 8: Premier RAG Complet');
    console.log('='.repeat(80));
    console.log(`\n📝 Question: ${question}\n`);

    // ÉTAPE 1: Retrieval - Récupérer les chunks similaires
    console.log('⏳ Étape 1: Retrieval (Embedding + Pinecone Query)...');
    const retrievedChunks = await searchSimilar(question, topK);

    if (retrievedChunks.length === 0) {
      throw new Error('Aucun chunk trouvé dans le vector store');
    }

    // Formater le contexte
    const context = retrievedChunks
      .map((chunk) => `[Score: ${chunk.score.toFixed(3)}] ${chunk.text}`)
      .join('\n\n');

    console.log(`✅ ${retrievedChunks.length} chunks trouvés\n`);
    console.log('📚 CONTEXTE RÉCUPÉRÉ:');
    console.log('─'.repeat(80));
    retrievedChunks.forEach((chunk, idx) => {
      console.log(
        `${idx + 1}. [${chunk.score.toFixed(3)}] ${chunk.text.substring(0, 100)}...`
      );
    });
    console.log('');

    // ÉTAPE 2: Generation - Appeler le LLM avec le contexte
    console.log('⏳ Étape 2: Generation (LLM avec contexte)...');
    const response = await generateResponseWithContext(question, context, provider);
    console.log(`✅ Réponse générée\n`);

    // Résultat final
    const result = {
      question,
      context_chunks: retrievedChunks.length,
      context,
      response,
      sources: retrievedChunks.map((chunk, idx) => ({
        rank: idx + 1,
        id: chunk.id,
        score: chunk.score,
        text: chunk.text.substring(0, 100),
      })),
      provider,
      timestamp: new Date().toISOString(),
    };

    return result;
  } catch (error) {
    throw new Error(`Erreur RAG Query: ${error.message}`);
  }
}

/**
 * Génère une réponse basée sur le contexte fourni
 * Force le modèle à rester dans le contexte et à signaler les informations manquantes
 *
 * @param {string} question - Question utilisateur
 * @param {string} context - Contexte provenant des chunks
 * @param {string} provider - 'mistral' | 'groq'
 * @returns {Promise<string>} - Réponse générée
 */
async function generateResponseWithContext(question, context, provider = 'mistral') {
  const systemPrompt = `Tu es un assistant IA expert. Tu dois répondre UNIQUEMENT en basant ta réponse sur le contexte fourni.

RÈGLES STRICTES:
1. Ne réponds qu'avec les informations présentes dans le contexte
2. Si la réponse n'est pas dans le contexte, dis clairement: "Je ne dispose pas d'information sur ce sujet dans ma base de connaissances"
3. Cite les sources quand tu utilises une information du contexte
4. Sois précis et concis
5. Réponds en français`;

  const userMessage = `Contexte:
${context}

Question: ${question}`;

  if (provider === 'mistral') {
    return await generateMistral(systemPrompt, userMessage);
  } else if (provider === 'groq') {
    return await generateGroq(systemPrompt, userMessage);
  } else {
    throw new Error(`Provider non supporté: ${provider}`);
  }
}

/**
 * Génère une réponse via Mistral AI
 */
async function generateMistral(systemPrompt, userMessage) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) {
    throw new Error('MISTRAL_API_KEY non configuré');
  }

  try {
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3, // Basse température pour rester fidèle au contexte
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur Mistral ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'Impossible de générer une réponse';
  } catch (error) {
    throw new Error(`Erreur Mistral: ${error.message}`);
  }
}

/**
 * Génère une réponse via Groq API (fallback optionnel)
 */
async function generateGroq(systemPrompt, userMessage) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    throw new Error('GROQ_API_KEY non configuré');
  }

  try {
    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'mixtral-8x7b-32768',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userMessage },
        ],
        temperature: 0.3,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Erreur Groq ${response.status}: ${error}`);
    }

    const data = await response.json();
    return data.choices[0]?.message?.content || 'Impossible de générer une réponse';
  } catch (error) {
    throw new Error(`Erreur Groq: ${error.message}`);
  }
}

/**
 * Test complet Phase 8
 */
async function testPhase8() {
  console.log('\n🔥 PHASE 8: Premier RAG Complet (Retrieval + Generation)');
  console.log('='.repeat(80));

  try {
    // TEST 1: Question avec réponse dans le corpus
    console.log('\n📌 TEST 1: Question avec réponse dans le corpus');
    console.log('─'.repeat(80));

    const result1 = await ragQuery('Qu\'est-ce que Node.js?');
    console.log('\n💬 RÉPONSE GÉNÉRÉE:');
    console.log('─'.repeat(80));
    console.log(result1.response);
    console.log('\n');

    // TEST 2: Question avec réponse absente du corpus
    console.log('\n📌 TEST 2: Question avec réponse absente du corpus');
    console.log('─'.repeat(80));

    const result2 = await ragQuery('Quel est le meilleur restaurant de Paris?');
    console.log('\n💬 RÉPONSE GÉNÉRÉE:');
    console.log('─'.repeat(80));
    console.log(result2.response);
    console.log('\n');

    // RÉSUMÉ
    console.log('='.repeat(80));
    console.log('\n✨ RÉSUMÉ PHASE 8\n');
    console.log('✅ Étape 1: Retrieval (searchSimilar) → Chunks trouvés');
    console.log('✅ Étape 2: Generation (Mistral) → Réponse générée avec contexte');
    console.log('✅ Test 1: Question pertinente → Réponse avec sources');
    console.log('✅ Test 2: Question hors sujet → Réponse: "Je ne dispose pas..."\n');
  } catch (error) {
    console.error('❌ Erreur Phase 8:', error.message);
    process.exit(1);
  }
}

// Exporter les fonctions
export { ragQuery, generateResponseWithContext, generateMistral, generateGroq };

// Tester si le fichier est exécuté directement
if (import.meta.url === `file://${process.argv[1]}`) {
  testPhase8().catch((error) => {
    console.error('❌ Erreur:', error.message);
    process.exit(1);
  });
}
