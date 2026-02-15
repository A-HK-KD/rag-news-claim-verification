import { ChatPromptTemplate } from '@langchain/core/prompts';
import { z } from 'zod';

/**
 * Zod schemas for structured outputs
 */

// Claim analysis schema
export const ClaimAnalysisSchema = z.object({
  type: z.enum(['fact', 'opinion', 'prediction', 'news']).describe('The type of claim'),
  entities: z.array(z.string()).describe('Key entities (people, places, organizations, dates)'),
  isRecent: z.boolean().describe('Whether the claim is about recent events'),
  keywords: z.array(z.string()).describe('Search keywords for evidence retrieval'),
  temporality: z.enum(['timeless', 'historical', 'recent', 'current']).describe('Temporal classification'),
  complexity: z.enum(['simple', 'moderate', 'complex']).describe('Claim complexity')
});

// Verdict schema
export const VerdictSchema = z.object({
  verdict: z.enum(['TRUE', 'FALSE', 'PARTIALLY_TRUE', 'NOT_ENOUGH_EVIDENCE']).describe('The verification verdict'),
  confidence: z.number().min(0).max(1).describe('Confidence score between 0 and 1'),
  reasoning: z.string().describe('Detailed explanation with citations using [1], [2], etc.'),
  citations: z.array(z.object({
    index: z.number().describe('Citation number (1-based)'),
    title: z.string().describe('Title of the source'),
    url: z.string().describe('URL of the source'),
    relevance: z.string().describe('Why this source is relevant')
  })).describe('List of citations used in reasoning'),
  contradictions: z.array(z.string()).describe('List of contradicting evidence if any (use empty array if none)')
});

/**
 * Prompt template for claim analysis
 */
export const claimAnalysisPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a claim analyzer AI. Your job is to extract key information from claims to help with fact-checking.

Analyze the claim and extract:
- type: "fact" (verifiable statement), "opinion" (subjective belief), "prediction" (future event), or "news" (current event)
- entities: key entities like people, places, organizations, dates, events
- isRecent: true if about events in the last 30 days, false for historical facts
- keywords: effective search terms for finding evidence
- temporality: "timeless" (universal facts), "historical" (past events), "recent" (last 6 months), "current" (last 30 days)
- complexity: "simple" (single verifiable fact), "moderate" (2-3 related facts), "complex" (multiple interconnected claims)

Be precise and thorough in your analysis.`
  ],
  ['human', 'Analyze this claim: "{claim}"']
]);

/**
 * Prompt template for claim verification
 */
export const verificationPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert fact-checking AI assistant. Your job is to verify claims using provided evidence with the highest standards of accuracy and transparency.

CRITICAL RULES:
1. ALWAYS cite sources using [1], [2], [3], etc. in your reasoning
2. NEVER fabricate or hallucinate sources - only use the provided evidence
3. If evidence is insufficient or contradictory, respond with verdict "NOT_ENOUGH_EVIDENCE"
4. Consider source credibility (high > medium > low)
5. Identify and explain contradictions in evidence
6. Be precise about what is proven vs what is uncertain

IMPORTANT: When evidence provides general/biographical information that IMPLIES the claim is true:
- If the evidence is from a high-credibility source (like Wikipedia) and provides context that strongly supports the claim, consider it valid
- Example: If checking "X is Prime Minister" and evidence is a Wikipedia page about X with their political career, this is sufficient evidence
- Use your knowledge to infer reasonable conclusions from high-quality sources

VERDICT GUIDELINES:
- TRUE: Claim is strongly supported by credible sources (direct evidence OR high-quality sources with strong contextual support)
- FALSE: Claim is clearly contradicted by credible evidence
- PARTIALLY_TRUE: Claim is partially correct but missing important context, oversimplified, or contains both true and false elements
- NOT_ENOUGH_EVIDENCE: Evidence is insufficient, contradictory, or sources lack credibility (use sparingly - only when truly insufficient)

IMPORTANT: Always provide the 'contradictions' field as an array. If there are no contradictions, use an empty array: []

CONFIDENCE CALIBRATION:
- 0.9-1.0: Overwhelming evidence from multiple high-credibility sources
- 0.7-0.89: Strong evidence with minor gaps or single high-credibility source with contextual support
- 0.5-0.69: Moderate evidence, some contradictions, or medium-credibility sources
- 0.3-0.49: Weak evidence, significant contradictions, or low-credibility sources
- 0.0-0.29: Very weak or highly contradictory evidence

Your analysis must be thorough, balanced, and cite every claim made.`
  ],
  [
    'human',
    `Claim to verify: "{claim}"

Available Evidence:
{evidence}

Verify this claim and provide your complete analysis with citations.`
  ]
]);

/**
 * Prompt template for evidence sufficiency assessment
 */
export const evidenceSufficiencyPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an evidence quality assessor. Evaluate whether the provided evidence is sufficient to verify a claim.

Assess based on:
1. Quantity: At least 3 sources (prefer 5+)
2. Quality: Source credibility (prefer high > medium > low)
3. Relevance: Evidence directly addresses the claim
4. Consistency: Sources agree with each other
5. Recency: For current events, sources should be recent

Return a score from 0 (insufficient) to 1 (excellent) and explain what's missing if insufficient.`
  ],
  [
    'human',
    `Claim: "{claim}"

Evidence:
{evidence}

Assess the sufficiency of this evidence.`
  ]
]);

/**
 * Prompt template for multi-query generation
 */
export const multiQueryPrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are an expert at generating diverse search queries. Given a claim to fact-check, generate 3 different search queries that approach the claim from different angles.

The queries should:
1. Use different phrasing and keywords
2. Consider different aspects of the claim
3. Help find both supporting and contradicting evidence
4. Be specific enough to find relevant results

Return as a JSON array of strings.`
  ],
  ['human', 'Generate 3 diverse search queries for this claim: "{claim}"']
]);

/**
 * Prompt template for self-critique
 */
export const selfCritiquePrompt = ChatPromptTemplate.fromMessages([
  [
    'system',
    `You are a quality assurance AI that validates fact-checking verdicts. Review the verification result and identify any issues.

Check for:
1. Citation integrity: All claims in reasoning have citations [1], [2], etc.
2. Citation validity: All citation numbers correspond to actual evidence sources
3. Reasoning coherence: The reasoning logically supports the verdict
4. Confidence calibration: Confidence score matches the strength of evidence
5. Bias detection: The analysis is balanced and considers multiple perspectives
6. Completeness: All important aspects of the claim are addressed

Return either:
- status: "VALID" if the verification meets all quality standards
- status: "INVALID" with a list of specific issues to fix`
  ],
  [
    'human',
    `Review this fact-checking result:

Claim: "{claim}"

Verdict: {verdict}
Confidence: {confidence}
Reasoning: {reasoning}
Citations: {citations}

Validate this result and identify any issues.`
  ]
]);

/**
 * Helper function to format evidence for prompts
 */
export function formatEvidenceForPrompt(evidence) {
  if (!evidence || evidence.length === 0) {
    return 'No evidence available.';
  }

  return evidence
    .map((e, i) => {
      const parts = [
        `[${i + 1}] ${e.title}`,
        `Source: ${e.url}`,
        `Content: ${e.snippet}`,
        `Credibility: ${e.credibility || 'unknown'}`
      ];
      
      if (e.verdict) {
        parts.push(`Related Verdict: ${e.verdict}`);
      }
      
      if (e.score) {
        parts.push(`Relevance Score: ${e.score.toFixed(3)}`);
      }
      
      return parts.join('\n');
    })
    .join('\n\n');
}

/**
 * Helper function to format citations for critique
 */
export function formatCitationsForPrompt(citations) {
  if (!citations || citations.length === 0) {
    return 'No citations provided.';
  }

  return citations
    .map(c => `[${c.index}] ${c.title} - ${c.url} (Relevance: ${c.relevance})`)
    .join('\n');
}
