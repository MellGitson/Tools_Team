/**
 * PHASE 3: Vérification et création de l'index Pinecone
 */

import { Pinecone } from '@pinecone-database/pinecone';
import('dotenv').then(({ default: dotenv }) => {
  dotenv.config();
}).then(async () => {
  try {
    const apiKey = process.env.PINECONE_API_KEY;
    if (!apiKey) {
      throw new Error('PINECONE_API_KEY not found in .env');
    }

    const pinecone = new Pinecone({ apiKey });
    const indexName = process.env.PINECONE_INDEX || 'mini-perplexity-groupe-1';

    console.log('\n📍 Vérification index Pinecone');
    console.log('='.repeat(80));
    console.log(`   Index name: ${indexName}`);

    try {
      const indexStats = await pinecone.index(indexName).describeIndexStats();
      console.log(`\n✅ Index EXISTS!`);
      console.log(`   • Namespaces: ${Object.keys(indexStats.namespaces || {}).join(', ') || '(default)'}`);
      console.log(`   • Total vectors: ${indexStats.totalRecordCount}`);
      console.log(`   • Dimension: 1024 (mistral-embed)`);
    } catch (error) {
      if (error.code === 404 || error.message.includes('404')) {
        console.log(`\n❌ Index NOT FOUND (404)`);
        console.log('\n💡 Solution: Créez l\'index avec cette commande:');
        console.log(`
   curl -X POST https://api.pinecone.io/indexes \\
     -H "Api-Key: $PINECONE_API_KEY" \\
     -H "Content-Type: application/json" \\
     -d '{
       "name": "${indexName}",
       "dimension": 1024,
       "metric": "cosine",
       "spec": {
         "serverless": {
           "cloud": "aws",
           "region": "us-east-1"
         }
       }
     }'
`);
        console.log('   Ou via dashboard: https://app.pinecone.io');
      } else {
        throw error;
      }
    }

  } catch (error) {
    console.error('\n❌ ERREUR:');
    console.error(error.message);
  }

  console.log('\n' + '='.repeat(80) + '\n');
});
