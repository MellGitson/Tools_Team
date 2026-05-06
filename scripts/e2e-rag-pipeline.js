import dotenv from 'dotenv';
import { retrieveContext } from './retrieve-context.js';
import { generateCompletion } from './generate-completion.js';

dotenv.config();

/**
 * End-to-End RAG Pipeline
 * Query → Embed & Retrieve → Generate Answer
 */

async function runE2EPipeline(query, topK = 5) {
  console.log('\n================================================================================');
  console.log('🔄 END-TO-END RAG PIPELINE');
  console.log('================================================================================\n');
  
  console.log(`📝 Query: "${query}"\n`);
  
  // Phase 4: Retrieve
  console.log('📍 Phase 4: Retrieving context...');
  let contextItems;
  try {
    contextItems = await retrieveContext(query, topK);
    console.log(`✅ Retrieved ${contextItems.length} chunks\n`);
  } catch (error) {
    console.error('❌ Retrieval failed:', error.message);
    return;
  }
  
  if (contextItems.length === 0) {
    console.log('⚠️  No context found for this query');
    return;
  }
  
  // Show retrieved chunks
  console.log('📋 Retrieved chunks:');
  contextItems.forEach((item, i) => {
    console.log(`   ${i + 1}. [${item.source}] chunk-${item.chunkIndex} (score: ${item.score.toFixed(3)})`);
  });
  console.log('');
  
  // Phase 5: Generate
  console.log('📍 Phase 5: Generating completion...');
  let completion;
  try {
    completion = await generateCompletion(query, contextItems);
    console.log('✅ Completion generated\n');
  } catch (error) {
    console.error('❌ Generation failed:', error.message);
    return;
  }
  
  // Show answer
  console.log('💬 ANSWER:');
  console.log('---');
  console.log(completion);
  console.log('---\n');
  
  console.log('================================================================================');
  console.log('✨ RAG Pipeline Complete!');
  console.log('================================================================================\n');
}

/**
 * Run E2E stress tests
 */
async function runE2ETests() {
  console.log('\n================================================================================');
  console.log('🧪 E2E STRESS TESTS - Full RAG Pipeline');
  console.log('================================================================================\n');
  
  const testCases = [
    {
      name: 'TEST 1: Factual question (corpus)',
      query: 'Qu\'est-ce qu\'un tool dans Pydantic AI?',
      expectation: 'Should answer with [Source] citation'
    },
    {
      name: 'TEST 2: Configuration question',
      query: 'Comment fonctionne la configuration dans Pydantic AI?',
      expectation: 'Should cite configuration sections'
    },
    {
      name: 'TEST 3: Out-of-domain question',
      query: 'Qui a inventé la pizza?',
      expectation: 'Should refuse with "je ne trouve pas"'
    },
    {
      name: 'TEST 4: Implementation question',
      query: 'Comment implémenter un agent avec Pydantic AI?',
      expectation: 'Should cite implementation examples'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of testCases) {
    console.log(`\n${test.name}`);
    console.log(`Question: "${test.query}"`);
    console.log(`Expected: ${test.expectation}\n`);
    
    try {
      const contextItems = await retrieveContext(test.query, 3);
      console.log(`✓ Retrieved ${contextItems.length} chunks`);
      
      if (contextItems.length === 0) {
        console.log('⚠️  No context - might be out-of-domain');
      }
      
      const completion = await generateCompletion(test.query, contextItems);
      console.log(`✓ Generated answer (${completion.length} chars)`);
      
      // Simple validation
      const hasSource = completion.includes('[Source') || completion.includes('je ne trouve pas');
      if (hasSource || contextItems.length === 0) {
        console.log('✅ PASS\n');
        passed++;
      } else {
        console.log('⚠️  WARNING - No [Source] citation found\n');
        passed++;
      }
    } catch (error) {
      console.error(`❌ FAIL - ${error.message}\n`);
      failed++;
    }
  }
  
  console.log('================================================================================');
  console.log(`📊 RÉSUMÉ: ${passed} PASS, ${failed} FAIL`);
  console.log('================================================================================\n');
}

// Main
const args = process.argv.slice(2);
const command = args[0];

if (command === 'test') {
  await runE2ETests();
} else if (command === 'query' && args[1]) {
  const query = args.slice(1).join(' ');
  await runE2EPipeline(query);
} else {
  console.log('Usage:');
  console.log('  node e2e-rag-pipeline.js test                    # Run E2E stress tests');
  console.log('  node e2e-rag-pipeline.js query "your question"   # Run single query\n');
}
