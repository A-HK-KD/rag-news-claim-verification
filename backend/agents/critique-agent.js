import { ChatOpenAI } from '@langchain/openai';
import { z } from 'zod';

/**
 * Self-Critique Agent
 * Validates verification results for quality, consistency, and hallucinations
 */

// Schema for critique result
const CritiqueSchema = z.object({
  isValid: z.boolean().describe('Whether the verification result is valid and high quality'),
  confidence: z.number().min(0).max(1).describe('Confidence in the critique (0-1)'),
  issues: z.array(z.object({
    type: z.enum(['citation_missing', 'citation_invalid', 'reasoning_incoherent', 'confidence_miscalibrated', 'verdict_unsupported', 'hallucination', 'other']),
    severity: z.enum(['critical', 'major', 'minor']),
    description: z.string()
  })).describe('List of issues found'),
  suggestions: z.array(z.string()).describe('Suggestions for improvement'),
  overallAssessment: z.string().describe('Overall assessment of the verification quality')
});

let critiqueLLM = null;

/**
 * Get or create ChatOpenAI instance for critique
 */
function getCritiqueLLM() {
  if (!critiqueLLM) {
    critiqueLLM = new ChatOpenAI({
      modelName: 'gpt-4o-mini', // Use mini for cost-effective critique
      temperature: 0.1, // Low temperature for consistent critique
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }
  return critiqueLLM;
}

/**
 * Critique a verification result
 * @param {string} claim - The original claim
 * @param {Object} verdict - The verification result
 * @param {Array} evidence - The evidence used
 * @returns {Object} Critique with validation results
 */
export async function critiqueVerification(claim, verdict, evidence) {
  try {
    console.log('🔍 Running self-critique on verification result...');
    
    const llm = getCritiqueLLM();
    const structuredLLM = llm.withStructuredOutput(CritiqueSchema);

    const critiquePrompt = `You are a quality assurance agent validating fact-checking results.

**Original Claim:**
"${claim}"

**Verification Result:**
- Verdict: ${verdict.verdict}
- Confidence: ${verdict.confidence}
- Reasoning: ${verdict.reasoning}
- Citations: ${JSON.stringify(verdict.citations, null, 2)}

**Evidence Provided:**
${formatEvidenceForCritique(evidence)}

**Your Task:**
Validate the verification result by checking for:

1. **Citation Validity:**
   - Are all citations properly referenced?
   - Do citation indices match actual evidence?
   - Are URLs valid and sources real?
   - Check for hallucinated sources (sources not in evidence)

2. **Reasoning Quality:**
   - Is the reasoning coherent and logical?
   - Does it follow from the evidence provided?
   - Are there logical fallacies or contradictions?

3. **Verdict Support:**
   - Is the verdict (${verdict.verdict}) supported by the evidence?
   - Is there sufficient evidence for this verdict?
   - Should it be NOT_ENOUGH_EVIDENCE instead?

4. **Confidence Calibration:**
   - Is the confidence score (${verdict.confidence}) appropriate?
   - Too high? (weak evidence but high confidence)
   - Too low? (strong evidence but low confidence)

5. **Hallucination Detection:**
   - Are any facts claimed without evidence?
   - Are sources fabricated?
   - Are quotes or numbers accurate?

**Severity Levels:**
- CRITICAL: Makes the verdict completely unreliable (e.g., hallucinated sources, wrong verdict)
- MAJOR: Significantly impacts quality (e.g., confidence miscalibrated, weak reasoning)
- MINOR: Small issues that don't affect core validity

Provide a thorough critique.`;

    const critique = await structuredLLM.invoke(critiquePrompt);
    
    // Log critique results
    if (critique.isValid) {
      console.log('   ✅ Verification passed critique');
    } else {
      console.log('   ❌ Verification failed critique:');
      critique.issues.forEach(issue => {
        console.log(`      - [${issue.severity.toUpperCase()}] ${issue.type}: ${issue.description}`);
      });
    }

    return critique;
  } catch (error) {
    console.error('Error in critique agent:', error.message);
    // If critique fails, default to valid (don't block the pipeline)
    return {
      isValid: true,
      confidence: 0.5,
      issues: [],
      suggestions: ['Critique agent failed - proceeding with original result'],
      overallAssessment: 'Unable to perform critique due to error'
    };
  }
}

/**
 * Format evidence for critique prompt
 */
function formatEvidenceForCritique(evidence) {
  if (!evidence || evidence.length === 0) {
    return 'No evidence provided';
  }

  return evidence.map((e, idx) => `
[${idx + 1}] ${e.title || 'Untitled'}
    URL: ${e.url || 'No URL'}
    Snippet: ${e.snippet || 'No snippet'}
    Credibility: ${e.credibility || 'Unknown'}
    Source: ${e.source || 'Unknown'}
  `.trim()).join('\n\n');
}

/**
 * Check if critique indicates need for regeneration
 * @param {Object} critique - Critique result
 * @returns {boolean} True if verification should be regenerated
 */
export function shouldRegenerateVerification(critique) {
  if (!critique || critique.isValid) {
    return false;
  }

  // Regenerate if there are critical issues
  const hasCriticalIssues = critique.issues.some(issue => 
    issue.severity === 'critical'
  );

  return hasCriticalIssues;
}

/**
 * Get a summary of critique issues
 * @param {Object} critique - Critique result
 * @returns {string} Human-readable summary
 */
export function getCritiqueSummary(critique) {
  if (critique.isValid) {
    return `✅ Valid (confidence: ${(critique.confidence * 100).toFixed(0)}%)`;
  }

  const criticalCount = critique.issues.filter(i => i.severity === 'critical').length;
  const majorCount = critique.issues.filter(i => i.severity === 'major').length;
  const minorCount = critique.issues.filter(i => i.severity === 'minor').length;

  const parts = [];
  if (criticalCount > 0) parts.push(`${criticalCount} critical`);
  if (majorCount > 0) parts.push(`${majorCount} major`);
  if (minorCount > 0) parts.push(`${minorCount} minor`);

  return `❌ Issues: ${parts.join(', ')} | ${critique.overallAssessment}`;
}

/**
 * Apply critique suggestions to improve verdict
 * @param {Object} verdict - Original verdict
 * @param {Object} critique - Critique with suggestions
 * @returns {Object} Improved verdict (if applicable)
 */
export function applyCritiqueSuggestions(verdict, critique) {
  if (critique.isValid) {
    return verdict;
  }

  const improvedVerdict = { ...verdict };

  // Apply automatic fixes for common issues
  critique.issues.forEach(issue => {
    if (issue.type === 'confidence_miscalibrated' && issue.severity === 'critical') {
      // Adjust confidence
      if (issue.description.includes('too high')) {
        improvedVerdict.confidence = Math.max(0.3, verdict.confidence - 0.2);
      } else if (issue.description.includes('too low')) {
        improvedVerdict.confidence = Math.min(0.9, verdict.confidence + 0.2);
      }
    }

    if (issue.type === 'verdict_unsupported' && issue.severity === 'critical') {
      // Change verdict to NOT_ENOUGH_EVIDENCE if unsupported
      improvedVerdict.verdict = 'NOT_ENOUGH_EVIDENCE';
      improvedVerdict.reasoning += ' [Note: Verdict adjusted due to insufficient evidence support]';
    }

    if (issue.type === 'hallucination' && issue.severity === 'critical') {
      // Remove invalid citations
      improvedVerdict.citations = verdict.citations?.filter(c => 
        !issue.description.includes(c.title)
      ) || [];
    }
  });

  return improvedVerdict;
}
