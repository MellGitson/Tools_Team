import dotenv from 'dotenv';
import { getEmbedding } from './embedding-multi-provider.js';

dotenv.config();

/**
 * PHASE 9: Outil rag_search pour l'agent hybride
 * Interroge le vector store Pinecone
 *
 * @param {string} query - Requête de recherche sémantique
 * @param {number} topK - Nombre de résultats (défaut: 3)
 * @returns {Promise<Array>} - [{score, text}] les chunks les plus proches
 */
async function rag_search(query, topK = 3) {
  if (!query || query.trim().length === 0) {
    throw new Error('La requête ne peut pas être vide');
  }

  try {
    // ÉTAPE 1: Embed la requête
    const queryEmbedding = await getEmbedding(query, 'mistral');

    // ÉTAPE 2: Query Pinecone
    const apiKey = process.env.PINECONE_API_KEY;
    const indexHost = process.env.PINECONE_INDEX_HOST;

    if (!apiKey || !indexHost) {
      throw new Error('PINECONE_API_KEY ou PINECONE_INDEX_HOST non configurés');
    }

    const response = await fetch(`https://${indexHost}/query`, {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        vector: queryEmbedding,
        topK: topK,
        includeMetadata: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Erreur Pinecone ${response.status}: ${await response.text()}`);
    }

    const data = await response.json();
    const matches = data.matches || [];

    // ÉTAPE 3: Formater les résultats
    return matches.map((match) => ({
      score: match.score.toFixed(3),
      text: match.metadata?.text || '',
      id: match.id,
    }));
  } catch (error) {
    throw new Error(`Erreur rag_search: ${error.message}`);
  }
}

/**
 * Définition de l'outil pour le LLM (format OpenAI)
 */
const ragToolDefinition = {
  type: 'function',
  function: {
    name: 'rag_search',
    description:
      'Recherche des informations dans la base de documents internes indexée dans Pinecone. Utiliser pour des questions sur le contenu du corpus privé, la documentation interne, ou quand web_search ne retourne pas de résultats pertinents.',
    parameters: {
      type: 'object',
      properties: {
        query: {
          type: 'string',
          description: 'La requête de recherche sémantique',
        },
      },
      required: ['query'],
    },
  },
};

export { rag_search, ragToolDefinition };
