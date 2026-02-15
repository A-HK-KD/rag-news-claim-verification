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
import { 
  routeClaim, 
  getStrategyConfig, 
  getStrategyMetadata, 
  VerificationStrategy 
} from './claim-router.js';
import { runVerificationAgent, formatAgentSteps } from '../agents/verification-agent.js';
import { 
  assessEvidenceSufficiency, 
  getAssessmentSummary 
} from './evidence-assessment.js';
import { 
  critiqueVerification, 
  shouldRegenerateVerification,
  getCritiqueSummary,
  applyCritiqueSuggestions
} from '../agents/critique-agent.js';

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
 * Complete Verification Pipeline with Agentic Workflow
 * 
 * Flow: Analyze → Route → Retrieve → Verify → Critique → Return
 */
export async function verifyClaimWithPipeline(claim, options = {}) {
  const startTime = Date.now();
  const { 
    context = '', 
    useWebSearch = true, 
    useVectorSearch = true,
    forceStrategy = null,
    enableCritique = true
  } = options;

  console.log('\n' + '='.repeat(80));
  console.log('🔍 VERIFICATION PIPELINE STARTED');
  console.log('='.repeat(80));
  console.log(`Claim: "${claim}"`);

  try {
    // STEP 1: Analyze Claim
    console.log('\n📋 STEP 1: Analyzing claim...');
    const analysis = await analyzeClaim(claim);
    console.log(`   Type: ${analysis.type}`);
    console.log(`   Temporality: ${analysis.temporality}`);
    console.log(`   Complexity: ${analysis.complexity}`);
    console.log(`   Entities: ${analysis.entities.join(', ')}`);
    console.log(`   Keywords: ${analysis.keywords.join(', ')}`);

    // STEP 2: Route to Strategy
    console.log('\n🛤️  STEP 2: Routing to verification strategy...');
    const strategy = forceStrategy || routeClaim(analysis);
    const strategyConfig = getStrategyConfig(strategy, analysis);
    const strategyMetadata = getStrategyMetadata(strategy, analysis);
    console.log(`   Selected: ${strategyMetadata.strategyName} ${strategyMetadata.icon}`);
    console.log(`   Reason: ${strategyMetadata.explanation}`);

    // STEP 3: Retrieve Evidence (strategy-dependent)
    console.log('\n🔎 STEP 3: Retrieving evidence...');
    let evidence = [];
    let agentSteps = null;

    if (strategy === VerificationStrategy.AGENTIC) {
      // Use agentic workflow
      const agentResult = await runVerificationAgent(claim, analysis);
      evidence = agentResult.evidence;
      agentSteps = formatAgentSteps(agentResult.steps);
      
      console.log(`   Agent used ${agentResult.toolCalls} tools in ${agentResult.duration}s`);
      console.log(`   Collected ${evidence.length} sources`);
    } else {
      // Use traditional hybrid/simple retrieval
      evidence = await retrieveEvidence(claim, analysis, {
        useWebSearch: strategyConfig.useWebSearch,
        useVectorSearch: strategyConfig.useVectorSearch,
        maxSources: strategyConfig.maxSources
      });
      console.log(`   Collected ${evidence.length} sources`);
    }

    // STEP 4: Assess Evidence Sufficiency
    console.log('\n📊 STEP 4: Assessing evidence sufficiency...');
    const sufficiencyAssessment = assessEvidenceSufficiency(evidence, analysis);
    console.log(`   ${getAssessmentSummary(sufficiencyAssessment)}`);

    if (!sufficiencyAssessment.isSufficient) {
      console.log('   ⚠️  Evidence may be insufficient, but proceeding with verification');
    }

    // STEP 5: Verify with Evidence
    console.log('\n🧠 STEP 5: Generating verdict...');
    let verdict = await verifyWithEvidence(claim, evidence);
    console.log(`   Verdict: ${verdict.verdict} (confidence: ${verdict.confidence})`);

    // STEP 6: Self-Critique (if enabled)
    let critique = null;
    if (enableCritique) {
      console.log('\n🔍 STEP 6: Running self-critique...');
      critique = await critiqueVerification(claim, verdict, evidence);
      console.log(`   ${getCritiqueSummary(critique)}`);

      // Regenerate if critical issues found
      if (shouldRegenerateVerification(critique)) {
        console.log('   🔄 Critical issues found, applying fixes...');
        verdict = applyCritiqueSuggestions(verdict, critique);
        console.log(`   Updated verdict: ${verdict.verdict} (confidence: ${verdict.confidence})`);
      }
    }

    // Calculate total processing time
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    
    console.log('\n' + '='.repeat(80));
    console.log(`✅ VERIFICATION COMPLETE in ${processingTime}s`);
    console.log('='.repeat(80) + '\n');

    // Return comprehensive result
    return {
      ...verdict,
      claimAnalysis: analysis,
      strategy: strategyMetadata,
      evidenceSufficiency: {
        isSufficient: sufficiencyAssessment.isSufficient,
        score: sufficiencyAssessment.score,
        summary: getAssessmentSummary(sufficiencyAssessment)
      },
      critique: critique ? {
        isValid: critique.isValid,
        confidence: critique.confidence,
        summary: getCritiqueSummary(critique),
        issues: critique.issues
      } : null,
      agentSteps: agentSteps,
      processingTime: `${processingTime}s`,
      timestamp: new Date().toISOString()
    };

  } catch (error) {
    console.error('\n❌ Pipeline Error:', error.message);
    throw error;
  }
}

/**
 * Analyze the claim to extract key information using LangChain
 */
async function analyzeClaim(claim) {
  try {
    const model = getLLMMini();
    const structuredLLM = model.withStructuredOutput(ClaimAnalysisSchema);
    const chain = claimAnalysisPrompt.pipe(structuredLLM);
    const result = await chain.invoke({ claim });
    return result;
  } catch (error) {
    console.error('   ⚠️  Error analyzing claim:', error.message);
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
    const structuredLLM = model.withStructuredOutput(VerdictSchema);
    const chain = verificationPrompt.pipe(structuredLLM);
    
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
    console.error('   ⚠️  Error verifying claim:', error.message);
    throw new Error(`Verification failed: ${error.message}`);
  }
}

/**
 * Hybrid evidence retrieval combining vector DB and web search
 */
async function retrieveEvidence(claim, analysis, options = {}) {
  const { 
    useWebSearch = true, 
    useVectorSearch = true, 
    maxSources = 8 
  } = options;
  
  const evidence = [];
  
  // 1. Search vector database (knowledge base)
  if (useVectorSearch && isPineconeAvailable()) {
    try {
      console.log('   📊 Searching vector database...');
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
      const webResults = await searchWeb(claim, analysis.entities, {
        temporality: analysis.temporality,
        maxResults: 5
      });
      
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
    console.log('   ⚠️  No evidence found');
    return [];
  }
  
  // Deduplicate and sort by relevance
  return deduplicateEvidence(evidence).slice(0, maxSources);
}

/**
 * Deduplicate evidence and sort by relevance
 */
function deduplicateEvidence(evidence) {
  const seen = new Set();
  const unique = [];
  
  for (const item of evidence) {
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
  
  return unique;
}

/**
 * Backward compatibility: Keep original verifyClaim function
 * This ensures existing code continues to work
 */
export async function verifyClaim(claim, options = {}) {
  // Use the new pipeline but without critique for faster response
  return verifyClaimWithPipeline(claim, {
    ...options,
    enableCritique: false // Disable critique for backward compatibility
  });
}
