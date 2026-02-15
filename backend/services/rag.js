import { ChatOpenAI } from '@langchain/openai';
import { searchWeb } from './websearch.js';
import { similaritySearch, isPineconeAvailable } from './vectordb.js';
import {
  claimAnalysisPrompt,
  verificationPrompt,
  formatEvidenceForPrompt,
  ClaimAnalysisSchema,
  VerdictSchema
} from './prompts.js';

let llm = null;
let llmMini = null;

/**
 * Get or create ChatOpenAI instance for main verification (GPT-4o)
 */
function getLLM() {
  if (!llm) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.2,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }
  return llm;
}

/**
 * Get or create ChatOpenAI instance for analysis (GPT-4o-mini)
 */
function getLLMMini() {
  if (!llmMini) {
    if (!process.env.OPENAI_API_KEY) {
      throw new Error('OPENAI_API_KEY environment variable is not set');
    }
    llmMini = new ChatOpenAI({
      modelName: 'gpt-4o-mini',
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }
  return llmMini;
}

/**
 * Main RAG pipeline for claim verification with hybrid search
 */
export async function verifyClaim(claim, options = {}) {
  const { context = '', useWebSearch = true, useVectorSearch = true } = options;

  console.log('🔍 Step 1: Analyzing claim...');
  const analysis = await analyzeClaim(claim);
  console.log(`   └─ Claim type: ${analysis.type}, Entities: ${analysis.entities.join(', ')}`);

  console.log('🔎 Step 2: Retrieving evidence (hybrid search)...');
  const evidence = await retrieveEvidence(claim, analysis, {
    useWebSearch,
    useVectorSearch
  });
  console.log(`   └─ Found ${evidence.length} sources (${evidence.filter(e => e.source === 'vector').length} from vector DB, ${evidence.filter(e => e.source !== 'vector').length} from web)`);

  console.log('🧠 Step 3: Verifying claim with evidence...');
  const verification = await verifyWithEvidence(claim, evidence);

  return verification;
}

/**
 * Analyze the claim to extract key information using LangChain
 */
async function analyzeClaim(claim) {
  try {
    const model = getLLMMini();
    
    // Use LangChain's structured output with Zod schema
    const structuredLLM = model.withStructuredOutput(ClaimAnalysisSchema);
    
    // Create the chain: prompt | model
    const chain = claimAnalysisPrompt.pipe(structuredLLM);
    
    // Invoke the chain
    const result = await chain.invoke({ claim });
    
    return result;
  } catch (error) {
    console.error('Error analyzing claim:', error.message);
    return {
      type: 'fact',
      entities: [],
      isRecent: false,
      keywords: [claim],
      temporality: 'timeless',
      complexity: 'simple'
    };
  }
}

/**
 * Verify claim against retrieved evidence using LangChain with structured output
 */
async function verifyWithEvidence(claim, evidence) {
  const evidenceText = formatEvidenceForPrompt(evidence);

  try {
    const model = getLLM();
    
    // Use LangChain's structured output with Zod schema
    const structuredLLM = model.withStructuredOutput(VerdictSchema);
    
    // Create the chain: prompt | model
    const chain = verificationPrompt.pipe(structuredLLM);
    
    // Invoke the chain
    const result = await chain.invoke({
      claim,
      evidence: evidenceText
    });
    
    // Enhance citations with full details from evidence
    if (result.citations) {
      result.citations = result.citations.map(citation => {
        const evidenceItem = evidence[citation.index - 1];
        return {
          ...citation,
          snippet: evidenceItem?.snippet,
          credibility: evidenceItem?.credibility
        };
      });
    }

    return result;
  } catch (error) {
    console.error('Error verifying claim:', error.message);
    throw new Error(`Verification failed: ${error.message}`);
  }
}

/**
 * Hybrid evidence retrieval combining vector DB and web search
 * Now uses LangChain's similaritySearch
 */
async function retrieveEvidence(claim, analysis, options = {}) {
  const { useWebSearch = true, useVectorSearch = true } = options;
  const evidence = [];
  
  // 1. Search vector database (knowledge base) using LangChain
  if (useVectorSearch && isPineconeAvailable()) {
    try {
      console.log('   📊 Searching vector database...');
      
      // Use LangChain's similaritySearch
      const documents = await similaritySearch(claim, 5, null, 'knowledge-base');
      
      for (const doc of documents) {
        evidence.push({
          title: `Knowledge Base: ${doc.metadata.claim || 'Fact'}`,
          url: doc.metadata.source || 'internal://knowledge-base',
          snippet: doc.metadata.explanation || doc.pageContent,
          credibility: doc.metadata.credibility || 'high',
          source: 'vector',
          score: doc.metadata.score,
          verdict: doc.metadata.verdict
        });
      }
      
      console.log(`      └─ Found ${documents.length} matches`);
    } catch (error) {
      console.error('      └─ Vector search failed:', error.message);
    }
  }
  
  // 2. Search web (Wikipedia, news, etc.)
  if (useWebSearch) {
    try {
      console.log('   🌐 Searching web...');
      const webResults = await searchWeb(claim, analysis.entities);
      
      // Add web results with source tag
      webResults.forEach(result => {
        evidence.push({
          ...result,
          source: result.source || 'web'
        });
      });
      
      console.log(`      └─ Found ${webResults.length} web sources`);
    } catch (error) {
      console.error('      └─ Web search failed:', error.message);
    }
  }
  
  // 3. Fallback to mock if no evidence found
  if (evidence.length === 0) {
    console.log('   ⚠️  No evidence found, using fallback');
    return await getMockEvidence(claim);
  }
  
  // Deduplicate and sort by relevance
  return deduplicateEvidence(evidence);
}

/**
 * Deduplicate evidence and sort by relevance
 */
function deduplicateEvidence(evidence) {
  const seen = new Set();
  const unique = [];
  
  for (const item of evidence) {
    // Create a key based on URL or content similarity
    const key = item.url + '::' + item.snippet.substring(0, 100);
    
    if (!seen.has(key)) {
      seen.add(key);
      unique.push(item);
    }
  }
  
  // Sort: vector results first (higher quality), then by score/credibility
  unique.sort((a, b) => {
    if (a.source === 'vector' && b.source !== 'vector') return -1;
    if (a.source !== 'vector' && b.source === 'vector') return 1;
    
    const scoreA = a.score || (a.credibility === 'high' ? 0.8 : 0.5);
    const scoreB = b.score || (b.credibility === 'high' ? 0.8 : 0.5);
    
    return scoreB - scoreA;
  });
  
  return unique.slice(0, 10); // Top 10 sources
}

/**
 * Mock evidence for testing without web search
 */
async function getMockEvidence(claim) {
  return [
    {
      title: 'Mock Source 1',
      url: 'https://example.com/source1',
      snippet: 'This is mock evidence for testing purposes.',
      credibility: 'medium',
      source: 'mock'
    }
  ];
}
