#!/usr/bin/env node

/**
 * Create a proper Pinecone index for the project
 * Run: node scripts/create-pinecone-index.js
 */

import { Pinecone } from '@pinecone-database/pinecone';
import 'dotenv/config.js';

const apiKey = process.env.PINECONE_API_KEY;
const indexName = process.env.PINECONE_INDEX_NAME || 'mini-perplexity';

if (!apiKey) {
  console.error('❌ PINECONE_API_KEY not found in .env');
  process.exit(1);
}

async function createIndex() {
  const pc = new Pinecone({ apiKey });

  console.log('🔍 Checking if index exists...');
  
  try {
    const existingIndex = await pc.describeIndex(indexName);
    console.log(`✅ Index "${indexName}" already exists`);
    console.log(`   Dimension: ${existingIndex.dimension}`);
    console.log(`   Metric: ${existingIndex.metric}`);
    console.log(`   Host: ${existingIndex.host}`);
    
    // Update .env if needed
    console.log(`\n📝 Make sure your .env has:`);
    console.log(`   PINECONE_INDEX_NAME=${indexName}`);
    console.log(`   PINECONE_INDEX_HOST=${existingIndex.host}`);
    
    return;
  } catch (error) {
    if (!error.message?.includes('404') && !error.message?.includes('not found')) {
      throw error;
    }
    console.log(`⏳ Index does not exist, creating...`);
  }

  try {
    console.log(`\n📊 Creating index "${indexName}"...`);
    console.log(`   Dimension: 1024 (mistral-embed)`);
    console.log(`   Metric: cosine`);
    console.log(`   Type: serverless`);

    const response = await pc.createIndex({
      name: indexName,
      dimension: 1024,
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1',
        },
      },
    });

    console.log(`\n✅ Index created successfully!`);
    console.log(`   Response:`, response);

    // Wait a bit for index to be ready
    console.log(`\n⏳ Waiting for index to be ready (30 seconds)...`);
    await new Promise(resolve => setTimeout(resolve, 5000));

    // Get the host
    const indexDesc = await pc.describeIndex(indexName);
    console.log(`\n📍 Index ready! Host: ${indexDesc.host}`);

    console.log(`\n📝 Update your .env with:`);
    console.log(`   PINECONE_INDEX_NAME=${indexName}`);
    console.log(`   PINECONE_INDEX_HOST=${indexDesc.host}`);

  } catch (error) {
    console.error(`\n❌ Error creating index:`, error.message);
    process.exit(1);
  }
}

createIndex();
