/**
 * Claim Router
 * Routes claims to appropriate verification strategies based on analysis
 */

/**
 * Verification strategies available
 */
export const VerificationStrategy = {
  SIMPLE: 'simple',      // Direct KB lookup for straightforward claims
  HYBRID: 'hybrid',      // KB + Web search (current default)
  AGENTIC: 'agentic'     // Full agentic workflow with iterative evidence gathering
};

/**
 * Route a claim to the appropriate verification strategy
 * @param {Object} claimAnalysis - Analysis of the claim
 * @returns {string} Strategy name (SIMPLE, HYBRID, or AGENTIC)
 */
export function routeClaim(claimAnalysis) {
  const { 
    type, 
    temporality, 
    complexity, 
    entities = [],
    keywords = [],
    isRecent 
  } = claimAnalysis;

  console.log('🛤️  Routing claim...');
  console.log(`   Type: ${type}, Temporality: ${temporality}, Complexity: ${complexity}`);

  // AGENTIC STRATEGY - Use for complex, ambiguous, or high-stakes claims
  const needsAgenticVerification = (
    // Complex claims with multiple entities or aspects
    complexity === 'complex' ||
    
    // Many entities (more than 3, not just 3)
    entities.length > 3 ||
    
    // Current/breaking news that needs thorough investigation
    (temporality === 'current' && isRecent) ||
    
    // Statistical or numerical claims that need careful verification
    type === 'statistical' ||
    type === 'numerical' ||
    
    // Controversial topics that benefit from multi-source verification
    keywords.some(kw => 
      ['controversial', 'disputed', 'alleged', 'reportedly', 'claims'].includes(kw.toLowerCase())
    )
  );

  if (needsAgenticVerification) {
    console.log('   └─ Routed to: AGENTIC (complex/thorough investigation needed)');
    return VerificationStrategy.AGENTIC;
  }

  // SIMPLE STRATEGY - Use for straightforward historical facts
  const canUseSimpleVerification = (
    // Simple, timeless facts likely in knowledge base
    (temporality === 'timeless' || temporality === 'historical') &&
    complexity === 'simple' &&
    entities.length <= 1 &&
    
    // Factual claims (not opinions or predictions)
    ['fact', 'historical', 'biographical', 'scientific'].includes(type)
  );

  if (canUseSimpleVerification) {
    console.log('   └─ Routed to: SIMPLE (KB lookup sufficient)');
    return VerificationStrategy.SIMPLE;
  }

  // HYBRID STRATEGY - Default for most claims
  console.log('   └─ Routed to: HYBRID (KB + web search)');
  return VerificationStrategy.HYBRID;
}

/**
 * Get strategy configuration with parameters
 * @param {string} strategy - Strategy name
 * @param {Object} claimAnalysis - Claim analysis
 * @returns {Object} Strategy configuration
 */
export function getStrategyConfig(strategy, claimAnalysis = {}) {
  const configs = {
    [VerificationStrategy.SIMPLE]: {
      name: 'Simple',
      description: 'Quick knowledge base lookup',
      useVectorSearch: true,
      useWebSearch: false,
      useAgent: false,
      maxSources: 3,
      timeoutMs: 5000,
      icon: '⚡'
    },
    
    [VerificationStrategy.HYBRID]: {
      name: 'Hybrid',
      description: 'Knowledge base + web search',
      useVectorSearch: true,
      useWebSearch: true,
      useAgent: false,
      maxSources: 8,
      timeoutMs: 10000,
      icon: '🔄'
    },
    
    [VerificationStrategy.AGENTIC]: {
      name: 'Agentic',
      description: 'Iterative multi-source investigation',
      useVectorSearch: true,
      useWebSearch: true,
      useAgent: true,
      maxSources: 10,
      maxIterations: 5,
      timeoutMs: 30000,
      icon: '🤖'
    }
  };

  const config = configs[strategy] || configs[VerificationStrategy.HYBRID];

  // Adjust config based on claim analysis
  if (claimAnalysis.temporality === 'current') {
    config.prioritizeWebSearch = true;
  }

  if (claimAnalysis.temporality === 'historical' || claimAnalysis.temporality === 'timeless') {
    config.prioritizeKnowledgeBase = true;
  }

  return config;
}

/**
 * Determine if a claim should use agentic verification
 * @param {Object} claimAnalysis - Analysis of the claim
 * @returns {boolean}
 */
export function shouldUseAgenticVerification(claimAnalysis) {
  return routeClaim(claimAnalysis) === VerificationStrategy.AGENTIC;
}

/**
 * Get human-readable explanation for routing decision
 * @param {string} strategy - Chosen strategy
 * @param {Object} claimAnalysis - Claim analysis
 * @returns {string} Explanation
 */
export function getRoutingExplanation(strategy, claimAnalysis) {
  const { type, temporality, complexity, entities } = claimAnalysis;

  const reasons = [];

  if (strategy === VerificationStrategy.AGENTIC) {
    if (complexity === 'complex') {
      reasons.push('claim is complex');
    }
    if (entities.length >= 3) {
      reasons.push(`involves ${entities.length} entities`);
    }
    if (temporality === 'current') {
      reasons.push('requires current information');
    }
    if (['statistical', 'numerical'].includes(type)) {
      reasons.push('involves numerical/statistical data');
    }

    return `Using agentic verification because ${reasons.join(', ')}. Agent will iteratively gather and evaluate evidence.`;
  }

  if (strategy === VerificationStrategy.SIMPLE) {
    return `Using simple verification because claim is ${complexity} and ${temporality}. Knowledge base lookup should suffice.`;
  }

  // HYBRID
  return `Using hybrid verification (KB + web search) for balanced coverage.`;
}

/**
 * Get strategy metadata for API response
 * @param {string} strategy - Strategy name
 * @param {Object} claimAnalysis - Claim analysis
 * @returns {Object} Metadata
 */
export function getStrategyMetadata(strategy, claimAnalysis) {
  const config = getStrategyConfig(strategy, claimAnalysis);
  
  return {
    strategy: strategy,
    strategyName: config.name,
    strategyDescription: config.description,
    icon: config.icon,
    explanation: getRoutingExplanation(strategy, claimAnalysis),
    estimatedTime: config.timeoutMs / 1000 + 's'
  };
}
