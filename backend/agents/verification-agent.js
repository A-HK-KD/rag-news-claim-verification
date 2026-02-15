import { ChatOpenAI } from '@langchain/openai';
import { getVerificationTools } from './tools.js';

/**
 * Manual Agent Implementation
 * Since langchain/agents is not available, we implement a simple agent loop
 */

/**
 * Run the verification agent on a claim
 * Uses a manual loop to call tools iteratively
 */
export async function runVerificationAgent(claim, claimAnalysis) {
  try {
    console.log('\n🤖 Starting Agentic Verification...');
    console.log(`   Claim: "${claim}"`);
    console.log(`   Type: ${claimAnalysis.type}, Temporality: ${claimAnalysis.temporality}`);
    
    const startTime = Date.now();
    const tools = getVerificationTools();
    const maxIterations = 5;
    const steps = [];
    const allEvidence = [];

    // Initialize LLM for agent decisions
    const llm = new ChatOpenAI({
      modelName: 'gpt-4o',
      temperature: 0.3,
      openAIApiKey: process.env.OPENAI_API_KEY
    });

    // Build strategy based on claim analysis
    const strategy = buildSearchStrategy(claimAnalysis);
    console.log(`   Strategy: ${strategy.description}`);

    // Execute search strategy
    for (let i = 0; i < strategy.toolSequence.length && i < maxIterations; i++) {
      const toolName = strategy.toolSequence[i];
      const tool = tools.find(t => t.name === toolName);
      
      if (!tool) continue;

      try {
        console.log(`\n   🔧 Step ${i + 1}: Using ${toolName}...`);
        
        // Prepare tool input based on claim
        const toolInput = prepareToolInput(toolName, claim, claimAnalysis);
        
        // Execute tool
        const observation = await tool.func(toolInput);
        
        // Parse observation
        const parsedObservation = JSON.parse(observation);
        
        steps.push({
          action: { tool: toolName, toolInput },
          observation
        });

        // Collect evidence
        if (parsedObservation.success && parsedObservation.results) {
          parsedObservation.results.forEach(result => {
            allEvidence.push({
              title: result.title,
              url: result.source_url,
              snippet: result.snippet,
              credibility: result.credibility || 'medium',
              source: parsedObservation.source_type || 'agent',
              verdict: result.verdict,
              score: result.relevance_score
            });
          });
          
          console.log(`      ✅ Found ${parsedObservation.num_results} results`);
        } else {
          console.log(`      ⚠️ No results from ${toolName}`);
        }

        // Early stop if we have enough evidence
        if (allEvidence.length >= 5) {
          console.log('      ℹ️ Sufficient evidence collected, stopping search');
          break;
        }

      } catch (error) {
        console.error(`      ❌ Error using ${toolName}:`, error.message);
      }
    }
    
    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`\n✅ Agent completed in ${duration}s`);
    console.log(`   Tools used: ${steps.length} times`);
    console.log(`   Evidence collected: ${allEvidence.length} sources`);

    return {
      output: `Collected ${allEvidence.length} sources using ${steps.length} tool calls`,
      evidence: allEvidence,
      steps,
      toolCalls: steps.length,
      duration
    };
  } catch (error) {
    console.error('Error running verification agent:', error.message);
    throw error;
  }
}

/**
 * Build search strategy based on claim analysis
 */
function buildSearchStrategy(claimAnalysis) {
  const { temporality, complexity, type } = claimAnalysis;
  
  // Default strategy: KB first, then appropriate web search
  let toolSequence = ['search_knowledge_base'];
  let description = 'Check knowledge base';

  // Add web search based on temporality
  if (temporality === 'current' || temporality === 'recent') {
    toolSequence.push('search_web_current');
    description += ', then search current web sources';
  } else if (temporality === 'historical' || temporality === 'timeless') {
    toolSequence.push('search_web_historical');
    description += ', then search historical sources';
  } else {
    // For unknown temporality, try both
    toolSequence.push('search_web_current', 'search_web_historical');
    description += ', then search web (current and historical)';
  }

  // For complex claims, ensure we check all sources
  if (complexity === 'complex') {
    // Add any missing tools
    if (!toolSequence.includes('search_web_current')) {
      toolSequence.push('search_web_current');
    }
    if (!toolSequence.includes('search_web_historical')) {
      toolSequence.push('search_web_historical');
    }
  }

  return { toolSequence, description };
}

/**
 * Prepare tool input based on tool name and claim
 */
function prepareToolInput(toolName, claim, claimAnalysis) {
  const { entities = [], keywords = [] } = claimAnalysis;

  switch (toolName) {
    case 'search_knowledge_base':
      return { query: claim, limit: 5 };
    
    case 'search_web_current':
      return { query: claim, entities };
    
    case 'search_web_historical':
      return { query: claim, entities };
    
    default:
      return { query: claim };
  }
}

/**
 * Format agent steps for display
 */
export function formatAgentSteps(steps) {
  if (!steps || steps.length === 0) {
    return [];
  }

  return steps.map((step, idx) => {
    const action = step.action;
    const observation = step.observation;
    
    let parsedObservation;
    try {
      parsedObservation = typeof observation === 'string' 
        ? JSON.parse(observation)
        : observation;
    } catch {
      parsedObservation = { raw: observation };
    }

    return {
      step: idx + 1,
      tool: action.tool,
      input: action.toolInput,
      success: parsedObservation.success,
      numResults: parsedObservation.num_results || 0,
      sourceType: parsedObservation.source_type
    };
  });
}
