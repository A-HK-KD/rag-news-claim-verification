/**
 * Evidence Sufficiency Assessment
 * Evaluates if gathered evidence is sufficient for making a verification decision
 */

/**
 * Assess if evidence is sufficient for verification
 * @param {Array} evidence - Array of evidence objects
 * @param {Object} claimAnalysis - Analysis of the claim
 * @returns {Object} Assessment with score, isSufficient, and missing aspects
 */
export function assessEvidenceSufficiency(evidence, claimAnalysis = {}) {
  const assessment = {
    isSufficient: false,
    score: 0,
    quantity: 0,
    quality: 0,
    relevance: 0,
    credibility: 0,
    missingAspects: [],
    recommendation: ''
  };

  // 1. Quantity Assessment (target: 3+ sources)
  const numSources = evidence.length;
  assessment.quantity = Math.min(numSources / 3, 1); // Normalize to 0-1
  
  if (numSources === 0) {
    assessment.missingAspects.push('No evidence sources found');
    assessment.recommendation = 'NOT_ENOUGH_EVIDENCE - No sources available';
    return assessment;
  }
  
  if (numSources < 3) {
    assessment.missingAspects.push(`Only ${numSources} source(s) found, recommend 3+`);
  }

  // 2. Quality Assessment (based on credibility)
  const credibilityScores = {
    'high': 1.0,
    'medium': 0.7,
    'low': 0.4,
    'very_low': 0.2
  };
  
  const avgCredibility = evidence.reduce((sum, e) => {
    const score = credibilityScores[e.credibility?.toLowerCase()] || 0.5;
    return sum + score;
  }, 0) / evidence.length;
  
  assessment.credibility = avgCredibility;
  
  const highCredSources = evidence.filter(e => 
    ['high', 'very_high'].includes(e.credibility?.toLowerCase())
  ).length;
  
  if (highCredSources === 0) {
    assessment.missingAspects.push('No high-credibility sources found');
  }

  // 3. Relevance Assessment (based on snippets)
  const avgSnippetLength = evidence.reduce((sum, e) => 
    sum + (e.snippet?.length || 0), 0
  ) / evidence.length;
  
  // Longer snippets generally indicate more relevant/detailed evidence
  assessment.relevance = Math.min(avgSnippetLength / 200, 1); // Normalize to 0-1
  
  if (avgSnippetLength < 50) {
    assessment.missingAspects.push('Evidence snippets are too brief/vague');
  }

  // 4. Source Diversity (different source types)
  const sourceTypes = new Set(evidence.map(e => e.source).filter(Boolean));
  const diversityScore = Math.min(sourceTypes.size / 2, 1); // Target: 2+ source types
  
  if (sourceTypes.size === 1) {
    assessment.missingAspects.push('Evidence from only one source type - consider diversifying');
  }

  // 5. Coverage Assessment (for complex claims)
  const isComplexClaim = claimAnalysis.complexity === 'complex';
  let coverageScore = 1.0;
  
  if (isComplexClaim) {
    const entities = claimAnalysis.entities || [];
    const keywords = claimAnalysis.keywords || [];
    
    if (entities.length > 0) {
      // Check if evidence mentions key entities
      const mentionedEntities = entities.filter(entity => 
        evidence.some(e => 
          e.snippet?.toLowerCase().includes(entity.toLowerCase()) ||
          e.title?.toLowerCase().includes(entity.toLowerCase())
        )
      );
      
      coverageScore = mentionedEntities.length / entities.length;
      
      if (coverageScore < 0.5) {
        assessment.missingAspects.push('Evidence does not cover all key entities in the claim');
      }
    }
  }

  // 6. Temporal Alignment (for time-sensitive claims)
  if (claimAnalysis.temporality === 'current' || claimAnalysis.temporality === 'recent') {
    const webSources = evidence.filter(e => e.source === 'web' || e.source === 'web_current');
    if (webSources.length === 0) {
      assessment.missingAspects.push('No recent web sources for time-sensitive claim');
    }
  }

  // Calculate overall quality score
  assessment.quality = (
    assessment.credibility * 0.4 +  // 40% weight on credibility
    assessment.relevance * 0.3 +     // 30% weight on relevance
    diversityScore * 0.15 +          // 15% weight on diversity
    coverageScore * 0.15             // 15% weight on coverage
  );

  // Calculate final score
  assessment.score = (
    assessment.quantity * 0.3 +  // 30% weight
    assessment.quality * 0.7     // 70% weight
  );

  // Determine sufficiency
  const MIN_SOURCES = 2; // Minimum acceptable
  const MIN_SCORE = 0.6; // Minimum quality score
  
  assessment.isSufficient = (
    numSources >= MIN_SOURCES &&
    assessment.score >= MIN_SCORE &&
    assessment.quality >= MIN_SCORE
  );

  // Generate recommendation
  if (assessment.isSufficient) {
    assessment.recommendation = 'SUFFICIENT - Proceed with verification';
  } else if (numSources < MIN_SOURCES) {
    assessment.recommendation = 'INSUFFICIENT - Need more sources';
  } else if (assessment.quality < MIN_SCORE) {
    assessment.recommendation = 'INSUFFICIENT - Evidence quality too low';
  } else {
    assessment.recommendation = 'MARGINAL - Verification possible but uncertain';
  }

  return assessment;
}

/**
 * Simple check if evidence is sufficient
 * @param {Array} evidence - Array of evidence objects
 * @returns {boolean}
 */
export function isEvidenceSufficient(evidence) {
  const assessment = assessEvidenceSufficiency(evidence);
  return assessment.isSufficient;
}

/**
 * Get a human-readable summary of evidence assessment
 * @param {Object} assessment - Assessment object from assessEvidenceSufficiency
 * @returns {string}
 */
export function getAssessmentSummary(assessment) {
  const parts = [
    `Sources: ${Math.round(assessment.quantity * 3)}/3 (${(assessment.quantity * 100).toFixed(0)}%)`,
    `Quality: ${(assessment.quality * 100).toFixed(0)}%`,
    `Overall: ${(assessment.score * 100).toFixed(0)}%`,
    assessment.recommendation
  ];
  
  if (assessment.missingAspects.length > 0) {
    parts.push(`\nIssues: ${assessment.missingAspects.join('; ')}`);
  }
  
  return parts.join(' | ');
}
