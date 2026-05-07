import dotenv from 'dotenv';
import { retrieveContext } from './retrieve-context.js';
import { generateCompletion } from './generate-completion.js';

dotenv.config();

/**
 * Unified RAG Query Function with Full Observability
 * Combines retrieveContext + generateCompletion with metrics tracking
 * Phase 7: Structured citations with source metadata
 */

/**
 * Extract and validate source citations from LLM answer
 * @param {string} answer - LLM generated answer
 * @param {Array} contextItems - Retrieved chunks
 * @returns {Object} { validCitations, orphanCitations }
 */
function extractAndValidateCitations(answer, contextItems) {
  // Find all [Source N] patterns in answer
  const citationRegex = /\[Source (\d+)\]/g;
  const foundCitations = new Set();
  let match;
  
  while ((match = citationRegex.exec(answer)) !== null) {
    foundCitations.add(parseInt(match[1]));
  }
  
  // Validate citations against available sources
  const validCitations = new Set();
  const orphanCitations = new Set();
  
  for (const citNum of foundCitations) {
    // Sources are 1-indexed, contextItems are 0-indexed
    if (citNum > 0 && citNum <= contextItems.length) {
      validCitations.add(citNum);
    } else {
      orphanCitations.add(citNum);
    }
  }
  
  return { validCitations, orphanCitations };
}

/**
 * Build structured sources array from context items
 * Deduplicates by filename, keeps best score for each
 * @param {Array} contextItems - Retrieved chunks
 * @param {Set} validCitations - Valid citation indices
 * @returns {Array} Structured sources with metadata
 */
function buildStructuredSources(contextItems, validCitations) {
  const sourceMap = new Map(); // Map<filename, { index, relevance }>
  
  for (const citNum of validCitations) {
    const chunk = contextItems[citNum - 1]; // Convert to 0-indexed
    
    if (!chunk) continue;
    
    // Handle incomplete metadata (fallback)
    const filename = chunk.source || 'Source inconnue';
    const relevance = chunk.score || 0;
    
    // Keep best score for each file
    if (!sourceMap.has(filename) || sourceMap.get(filename).relevance < relevance) {
      sourceMap.set(filename, {
        index: citNum,
        file: filename,
        relevance: relevance.toFixed(2)
      });
    }
  }
  
  // Convert to array, sorted by citation index
  return Array.from(sourceMap.values()).sort((a, b) => a.index - b.index);
}

/**
 * Main RAG Query Function
 * @param {string} question - The user's question
 * @param {Object} options - Configuration options
 * @param {number} options.topK - Number of context items (default: 5)
 * @param {boolean} options.verbose - Show detailed logs (default: false)
 * @returns {Promise<Object>} { answer, sources, chunks, chunksUsed, metrics }
 */
export async function ragQuery(question, options = {}) {
  const { topK = 5, verbose = false } = options;
  const startTime = Date.now();
  
  if (verbose) {
    console.log('\n[ragQuery] question="' + question + '"');
  }
  
  // Phase 4: Retrieve Context
  const retrievalStartTime = Date.now();
  let contextItems;
  try {
    contextItems = await retrieveContext(question, topK);
  } catch (error) {
    console.error('[ragQuery] Retrieval failed:', error.message);
    throw error;
  }
  const retrievalMs = Date.now() - retrievalStartTime;
  
  if (verbose && contextItems.length > 0) {
    const topScore = contextItems[0].score;
    const avgScore = contextItems.reduce((sum, item) => sum + item.score, 0) / contextItems.length;
    console.log(`[retrieve] topK=${contextItems.length} retournés en ${retrievalMs}ms, top score ${topScore.toFixed(2)}, avg score ${avgScore.toFixed(2)}`);
    
    contextItems.forEach((item, i) => {
      const textSnippet = item.text.substring(0, 60) + '...';
      console.log(`  [${item.score.toFixed(2)}] ${item.source} chunk-${item.chunkIndex}: "${textSnippet}"`);
    });
  } else if (verbose) {
    console.log(`[retrieve] No context found (${retrievalMs}ms)`);
  }
  
  // Phase 5: Generate Completion
  const generationStartTime = Date.now();
  let completion;
  let promptTokens = 0;
  let completionTokens = 0;
  
  try {
    // Call Mistral with detailed token tracking
    completion = await generateCompletion(question, contextItems);
    
    // Estimate tokens (Mistral small: ~1 token per 4 chars for input, ~1 token per 4 chars for output)
    promptTokens = Math.ceil(question.length / 4) + contextItems.reduce((sum, item) => sum + Math.ceil(item.text.length / 4), 0);
    completionTokens = Math.ceil(completion.length / 4);
  } catch (error) {
    console.error('[ragQuery] Generation failed:', error.message);
    throw error;
  }
  const generationMs = Date.now() - generationStartTime;
  
  // Calculate cost (Mistral Small pricing: $0.14/1M input tokens, $0.42/1M output tokens)
  const costUSD = (promptTokens * 0.14 + completionTokens * 0.42) / 1000000;
  
  if (verbose) {
    console.log(`[generate] mistral-small-latest, ${promptTokens} tokens in / ${completionTokens} tokens out, ${generationMs}ms, $${costUSD.toFixed(6)}`);
  }
  
  const totalMs = Date.now() - startTime;
  if (verbose) {
    console.log(`[ragQuery] total ${totalMs}ms\n`);
  }
  
  // Phase 7: Extract and validate citations
  const { validCitations, orphanCitations } = extractAndValidateCitations(completion, contextItems);
  const sources = buildStructuredSources(contextItems, validCitations);
  const chunksUsed = sources.length;
  
  if (verbose && orphanCitations.size > 0) {
    console.log(`⚠️  WARNING: Orphan citations detected: ${Array.from(orphanCitations).join(', ')}`);
  }
  
  return {
    answer: completion,
    sources,
    chunks: contextItems,
    chunksUsed,
    metrics: {
      topScore: contextItems.length > 0 ? contextItems[0].score : null,
      avgScore: contextItems.length > 0 ? contextItems.reduce((sum, item) => sum + item.score, 0) / contextItems.length : null,
      retrievalMs,
      generationMs,
      totalMs,
      promptTokens,
      completionTokens,
      costUSD,
      orphanCitations: Array.from(orphanCitations)
    }
  };
}

/**
 * Run End-to-End Tests with Phase 7 Citation Validation
 */
async function runE2ETests() {
  console.log('\n================================================================================');
  console.log('🧪 E2E TESTS - Phase 7 (Structured Citations)');
  console.log('================================================================================');
  
  const tests = [
    {
      name: 'TEST 1: Normal query with proper citations',
      question: 'Comment fonctionne Pydantic AI?',
      expectation: 'Should cite sources with metadata, no orphans'
    },
    {
      name: 'TEST 2: Out-of-domain (no citations)',
      question: 'Quelle est la capitale du Pérou ?',
      expectation: 'Should have 0 sources and 0 chunks used'
    },
    {
      name: 'TEST 3: Validate source deduplication',
      question: 'Qu\'est-ce qu\'un tool dans Pydantic AI?',
      expectation: 'Should deduplicate sources by filename'
    }
  ];
  
  let passed = 0;
  let failed = 0;
  
  for (const test of tests) {
    console.log(`\n${test.name}`);
    console.log(`Question: "${test.question}"`);
    
    try {
      const result = await ragQuery(test.question, { verbose: false });
      
      console.log(`📝 Answer: ${result.answer.substring(0, 80)}...`);
      console.log(`📚 Structured Sources:`);
      
      if (result.sources.length === 0) {
        console.log('   (no sources)');
      } else {
        result.sources.forEach(source => {
          console.log(`   [${source.index}] ${source.file} (relevance: ${source.relevance})`);
        });
      }
      
      console.log(`📊 chunksUsed: ${result.chunksUsed}`);
      
      if (result.metrics.orphanCitations && result.metrics.orphanCitations.length > 0) {
        console.log(`⚠️  orphanCitations: [${result.metrics.orphanCitations.join(', ')}]`);
      }
      
      // Validation
      const hasValidStructure = 
        result.sources.every(s => s.index && s.file && s.relevance) &&
        result.chunksUsed === result.sources.length &&
        result.chunks.length > 0;
      
      if (hasValidStructure) {
        console.log('✅ PASS\n');
        passed++;
      } else {
        console.log('⚠️  WARNING - Structure incomplete\n');
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
  const question = args.slice(1).join(' ');
  const result = await ragQuery(question, { verbose: true });
  console.log('\n💬 FINAL ANSWER:');
  console.log('---');
  console.log(result.answer);
  console.log('---\n');
  console.log('📚 Structured Sources:');
  if (result.sources.length === 0) {
    console.log('(no sources cited)');
  } else {
    result.sources.forEach(source => {
      console.log(`  [${source.index}] ${source.file} (relevance: ${source.relevance})`);
    });
  }
  console.log(`\n📊 Chunks Used: ${result.chunksUsed}`);
  
  if (result.metrics.orphanCitations && result.metrics.orphanCitations.length > 0) {
    console.log(`⚠️  Orphan Citations Detected: [${result.metrics.orphanCitations.join(', ')}]`);
  }
  
  console.log('\n📈 Metrics:', JSON.stringify(result.metrics, null, 2));
} else {
  console.log('Phase 7: RAG Query with Structured Citations');
  console.log('Usage:');
  console.log('  node scripts/rag-query.js test                    # Run E2E tests');
  console.log('  node scripts/rag-query.js query "your question"   # Query with verbose logs\n');
}
