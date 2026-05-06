import dotenv from 'dotenv';

dotenv.config();

/**
 * Génère l'embedding via Mistral
 */
async function getMistralEmbedding(text) {
  const apiKey = process.env.MISTRAL_API_KEY;
  if (!apiKey) throw new Error('MISTRAL_API_KEY non configuré');

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
    const error = await response.json();
    throw new Error(`Mistral ${response.status}: ${error.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error('Format de réponse Mistral incorrect');
  }

  return data.data[0].embedding;
}

/**
 * Génère l'embedding via HuggingFace (Inference API)
 * Modèle: sentence-transformers/all-MiniLM-L6-v2 (384 dimensions)
 */
async function getHuggingFaceEmbedding(text) {
  const token = process.env.HUGGINGFACE_TOKEN;
  if (!token) throw new Error('HUGGINGFACE_TOKEN non configuré');

  const response = await fetch(
    'https://api-inference.huggingface.co/models/sentence-transformers/all-MiniLM-L6-v2',
    {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: text,
        options: {
          use_cache: false,
        },
      }),
    }
  );

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`HuggingFace ${response.status}: ${error}`);
  }

  const data = await response.json();
  
  // HF retourne un array d'embeddings
  if (Array.isArray(data) && Array.isArray(data[0])) {
    return data[0];
  }
  
  throw new Error('Format de réponse HuggingFace incorrect');
}

/**
 * Génère l'embedding via Jina AI (gratuit, 768 dimensions)
 * URL: https://jina.ai/embeddings
 */
async function getJinaEmbedding(text) {
  const response = await fetch('https://api.jina.ai/v1/embeddings', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'jina-embeddings-v2-base-en',
      input: [text],
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Jina ${response.status}: ${error}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error('Format de réponse Jina incorrect');
  }

  return data.data[0].embedding;
}

/**
 * Génère l'embedding via OpenAI (si configuré)
 * Modèle: text-embedding-3-small (1536 dimensions)
 */
async function getOpenAIEmbedding(text) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error('OPENAI_API_KEY non configuré');

  const response = await fetch('https://api.openai.com/v1/embeddings', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'text-embedding-3-small',
      input: text,
    }),
  });

  if (!response.ok) {
    const error = await response.json();
    throw new Error(`OpenAI ${response.status}: ${error.error?.message || JSON.stringify(error)}`);
  }

  const data = await response.json();
  if (!data.data?.[0]?.embedding) {
    throw new Error('Format de réponse OpenAI incorrect');
  }

  return data.data[0].embedding;
}

/**
 * Essaie plusieurs providers avec fallback
 * Ordre de priorité : Mistral → HuggingFace → Jina
 */
async function getEmbedding(text, provider = 'auto') {
  if (!text || text.trim().length === 0) {
    throw new Error('Le texte à embedder ne peut pas être vide');
  }

  const providers = [];

  if (provider === 'auto' || provider === 'mistral') {
    providers.push({
      name: 'Mistral',
      fn: getMistralEmbedding,
      dims: 1024,
    });
  }

  if (provider === 'auto' || provider === 'huggingface') {
    providers.push({
      name: 'HuggingFace',
      fn: getHuggingFaceEmbedding,
      dims: 384,
    });
  }

  if (provider === 'auto' || provider === 'jina') {
    providers.push({
      name: 'Jina',
      fn: getJinaEmbedding,
      dims: 768,
    });
  }

  if (provider === 'openai') {
    providers.push({
      name: 'OpenAI',
      fn: getOpenAIEmbedding,
      dims: 1536,
    });
  }

  // Si provider spécifique, tenter seulement celui-ci
  if (provider !== 'auto' && !providers.length) {
    throw new Error(`Provider '${provider}' non supporté ou non configuré`);
  }

  let lastError = null;

  for (const p of providers) {
    try {
      console.log(`  ├─ Tentative ${p.name} (${p.dims}d)...`);
      const embedding = await p.fn(text);
      console.log(`  └─ ✅ ${p.name} réussi`);
      return embedding;
    } catch (error) {
      lastError = error;
      console.log(`  ├─ ❌ ${p.name}: ${error.message}`);
    }
  }

  throw lastError || new Error('Aucun provider d\'embedding disponible');
}

/**
 * Découpe un texte en chunks de MOTS (pas de tokens)
 * 
 * Note: 1 token ≈ 0.75 mots en moyenne
 * Donc maxWords=300 correspond à environ 400 tokens
 * 
 * @param {string} text - Texte à découper
 * @param {number} maxWords - Nombre maximum de mots par chunk (défaut: 50 mots)
 * @returns {Array<string>} - Array de chunks
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
 * Insère les chunks dans Pinecone
 */
async function upsertChunks(chunks, provider = 'auto') {
  const apiKey = process.env.PINECONE_API_KEY;
  const indexHost = process.env.PINECONE_INDEX_HOST;

  if (!apiKey || !indexHost) {
    throw new Error('PINECONE_API_KEY ou PINECONE_INDEX_HOST non configurés');
  }

  if (!chunks || chunks.length === 0) {
    throw new Error('Aucun chunk à upserter');
  }

  try {
    console.log(`\n📊 Génération des embeddings pour ${chunks.length} chunks...`);
    const vectors = [];

    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const embedding = await getEmbedding(chunk, provider);

      vectors.push({
        id: `chunk-${i}`,
        values: embedding,
        metadata: {
          text: chunk,
          chunk_index: i,
          created_at: new Date().toISOString(),
        },
      });

      console.log(`  ✓ ${i + 1}/${chunks.length} embeddings générés`);
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
 * Test complet
 */
async function testEmbedding() {
  console.log('\n📚 PHASE 6: Embedder un document avec fallback providers');
  console.log('='.repeat(80));

  const testText = `L'intelligence artificielle est un domaine en rapide évolution. Les modèles d'IA 
  comme les transformers ont révolutionné le traitement du langage naturel. Les embeddings permettent 
  de représenter le texte sous forme de vecteurs numériques, ce qui facilite les opérations de recherche 
  sémantique et de classification. Pinecone est une base de données vectorielle cloud qui permet de stocker 
  et rechercher efficacement ces vecteurs à grande échelle.`;

  try {
    // Étape 1 : Découper
    console.log('\n📄 ÉTAPE 1 : Découpage du texte');
    console.log('─'.repeat(80));
    const chunks = simpleChunk(testText, 30);
    console.log(`✅ Texte découpé en ${chunks.length} chunks`);

    // Étape 2 : Tester avec fallback
    console.log('\n📊 ÉTAPE 2 : Génération des embeddings (avec fallback)');
    console.log('─'.repeat(80));
    console.log('Tentative des providers dans l\'ordre...\n');
    
    const embedding = await getEmbedding(chunks[0], 'auto');
    console.log(`\n✅ Embedding généré avec succès`);
    console.log(`   Dimension: ${embedding.length}`);
    console.log(`   Premiers 5 éléments: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);

    // Étape 3 : Upserter (seulement le premier chunk)
    console.log('\n📤 ÉTAPE 3 : Upsert dans Pinecone');
    console.log('─'.repeat(80));
    const upsertResult = await upsertChunks([chunks[0]], 'auto');
    console.log(`✅ ${upsertResult.upsertedCount} vecteur upsertés`);

    console.log('\n' + '='.repeat(80));
    console.log('✅ Test Phase 6 avec fallback réussi !');
  } catch (error) {
    console.error(`\n❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécuter le test si c'est le fichier principal
if (import.meta.url === `file://${process.argv[1]}`) {
  testEmbedding();
}

export { getEmbedding, simpleChunk, upsertChunks, getMistralEmbedding, getHuggingFaceEmbedding, getJinaEmbedding, getOpenAIEmbedding };
