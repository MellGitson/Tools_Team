import dotenv from 'dotenv';

dotenv.config();

/**
 * Crée un nouvel index Pinecone
 * @param {string} indexName - Nom de l'index
 * @param {number} dimension - Dimension des vecteurs (ex: 1024)
 * @param {string} metric - Métrique de distance (cosine, euclidean, dotproduct)
 * @returns {Promise<Object>}
 */
async function createIndex(indexName = 'mini-perplexity', dimension = 1024, metric = 'cosine') {
  const apiKey = process.env.PINECONE_API_KEY;

  if (!apiKey) {
    throw new Error('PINECONE_API_KEY non configuré dans .env');
  }

  try {
    const response = await fetch('https://api.pinecone.io/indexes', {
      method: 'POST',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: indexName,
        dimension: dimension,
        metric: metric,
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1',
          },
        },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Pinecone ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data;
  } catch (error) {
    throw new Error(`Impossible de créer l'index: ${error.message}`);
  }
}

/**
 * Liste tous les index Pinecone disponibles
 * @returns {Promise<Array>}
 */
async function listIndexes() {
  const apiKey = process.env.PINECONE_API_KEY;

  if (!apiKey) {
    throw new Error('PINECONE_API_KEY non configuré dans .env');
  }

  try {
    const response = await fetch('https://api.pinecone.io/indexes', {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Pinecone ${response.status}: ${errorText}`);
    }

    const data = await response.json();
    return data.indexes || [];
  } catch (error) {
    throw new Error(`Impossible de lister les index: ${error.message}`);
  }
}

/**
 * Récupère les métadonnées de l'index Pinecone
 * @returns {Promise<{name: string, dimension: number, metric: string, status: string, host: string}>}
 */
async function getIndexInfo() {
  const indexName = process.env.PINECONE_INDEX_NAME;
  const apiKey = process.env.PINECONE_API_KEY;

  if (!indexName || !apiKey) {
    throw new Error('PINECONE_INDEX_NAME ou PINECONE_API_KEY non configurés dans .env');
  }

  try {
    const response = await fetch(`https://api.pinecone.io/indexes/${indexName}`, {
      method: 'GET',
      headers: {
        'Api-Key': apiKey,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Erreur Pinecone ${response.status}: ${errorText}`);
    }

    const data = await response.json();

    return {
      name: data.name,
      dimension: data.dimension,
      metric: data.metric,
      status: data.status,
      host: data.host,
    };
  } catch (error) {
    throw new Error(`Impossible de récupérer les infos de l'index: ${error.message}`);
  }
}

/**
 * Test de connexion et affichage des métadonnées
 */
async function testPineconeConnection() {
  console.log('\n🔗 PHASE 5: Setup Pinecone et test de connexion');
  console.log('='.repeat(80));

  try {
    // D'abord, lister les index disponibles
    console.log('\n📡 Récupération des index disponibles...');
    const indexes = await listIndexes();

    if (indexes.length === 0) {
      console.log('❌ Aucun index Pinecone trouvé.');
      console.log('\n🔨 Création d\'un nouvel index "mini-perplexity"...');
      
      try {
        const newIndex = await createIndex('mini-perplexity', 1024, 'cosine');
        console.log('✅ Index créé avec succès!');
        console.log(`   Attendez quelques minutes que l'index soit prêt...`);
        
        // Mettre à jour le .env
        console.log('\n📝 Mise à jour du .env avec PINECONE_INDEX_NAME=mini-perplexity');
        process.exit(0);
      } catch (createError) {
        console.log('⚠️  Impossible de créer l\'index automatiquement');
        console.log('   Créez manuellement un index "mini-perplexity" sur https://www.pinecone.io');
        process.exit(1);
      }
    }

    console.log(`✅ ${indexes.length} index trouvé(s):`);
    console.log('─'.repeat(80));
    indexes.forEach((idx, i) => {
      console.log(`  ${i + 1}. ${idx.name} (${idx.dimension}d, ${idx.metric})`);
    });
    console.log('─'.repeat(80));

    // Ensuite, récupérer les infos du premier index (ou celui configuré)
    const indexName = process.env.PINECONE_INDEX_NAME;
    const targetIndex = indexName && indexes.some(idx => idx.name === indexName)
      ? indexName
      : indexes[0].name;

    if (!process.env.PINECONE_INDEX_NAME) {
      console.log(`\n⚠️  PINECONE_INDEX_NAME non configuré. Utilisation de: ${targetIndex}`);
      console.log('   Mettez à jour .env avec: PINECONE_INDEX_NAME=' + targetIndex);
    }

    console.log(`\n📡 Connexion à l'index "${targetIndex}"...`);
    const startTime = Date.now();
    
    // Récupérer les infos du premier index
    const response = await fetch(`https://api.pinecone.io/indexes/${targetIndex}`, {
      method: 'GET',
      headers: {
        'Api-Key': process.env.PINECONE_API_KEY,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      throw new Error(`Erreur ${response.status}: ${await response.text()}`);
    }

    const indexInfo = await response.json();
    const duration = Date.now() - startTime;

    console.log(`✅ Index connecté avec succès (${duration}ms)`);
    console.log('\n📊 Métadonnées de l\'index:');
    console.log('─'.repeat(80));
    console.log(`  Name      : ${indexInfo.name}`);
    console.log(`  Dimension : ${indexInfo.dimension}`);
    console.log(`  Metric    : ${indexInfo.metric}`);
    console.log(`  Status    : ${indexInfo.status}`);
    console.log(`  Host      : ${indexInfo.host}`);
    console.log('─'.repeat(80));

    console.log('\n✅ Test de connexion Pinecone réussi !');
    return indexInfo;
  } catch (error) {
    console.error(`❌ Erreur: ${error.message}`);
    process.exit(1);
  }
}

// Exécuter le test
testPineconeConnection();

export { getIndexInfo, listIndexes, createIndex, testPineconeConnection };
