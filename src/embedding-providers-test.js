import dotenv from 'dotenv';
import { getEmbedding, simpleChunk } from './embedding-multi-provider.js';

dotenv.config();

/**
 * Test avec tous les providers disponibles
 */
async function testAllProviders() {
  console.log('\n🔀 TEST MULTI-PROVIDER EMBEDDING');
  console.log('='.repeat(80));

  const testText = 'L\'intelligence artificielle révolutionne le traitement du langage naturel.';

  const providers = ['mistral', 'huggingface', 'jina'];

  for (const provider of providers) {
    console.log(`\n🧪 Test: ${provider.toUpperCase()}`);
    console.log('─'.repeat(80));

    try {
      const startTime = Date.now();
      const embedding = await getEmbedding(testText, provider);
      const duration = Date.now() - startTime;

      console.log(`✅ ${provider} réussi en ${duration}ms`);
      console.log(`   Dimensions: ${embedding.length}`);
      console.log(`   Premiers 5 éléments: [${embedding.slice(0, 5).map(v => v.toFixed(4)).join(', ')}]`);
    } catch (error) {
      console.log(`❌ ${provider} échoué: ${error.message}`);
    }
  }

  console.log('\n' + '='.repeat(80));
  console.log('✅ Test multi-provider terminé');
}

// Exécuter
testAllProviders();
