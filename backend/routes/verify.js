import express from 'express';
import { verifyClaimWithPipeline } from '../services/verification-pipeline.js';
import { verifyClaim } from '../services/rag.js';

const router = express.Router();

/**
 * POST /api/verify
 * Main verification endpoint with agentic workflow support
 * 
 * Body parameters:
 * - claim (required): The claim to verify
 * - context (optional): Additional context for the claim
 * - useWebSearch (optional, default: true): Enable web search
 * - useVectorSearch (optional, default: true): Enable knowledge base search
 * - useAgenticPipeline (optional, default: true): Use full agentic pipeline with routing
 * - forceStrategy (optional): Force specific strategy ('simple', 'hybrid', or 'agentic')
 * - enableCritique (optional, default: true): Enable self-critique validation
 */
router.post('/verify', async (req, res) => {
  try {
    const { 
      claim, 
      context = '', 
      useWebSearch = true,
      useVectorSearch = true,
      useAgenticPipeline = true,
      forceStrategy = null,
      enableCritique = true
    } = req.body;

    if (!claim) {
      return res.status(400).json({ 
        error: 'Claim is required' 
      });
    }

    console.log(`\nVerifying claim: "${claim}"`);
    console.log(`Pipeline mode: ${useAgenticPipeline ? 'Agentic' : 'Legacy'}`);

    let result;

    if (useAgenticPipeline) {
      // Use new agentic pipeline with routing, critique, and all features
      result = await verifyClaimWithPipeline(claim, {
        context,
        useWebSearch,
        useVectorSearch,
        forceStrategy,
        enableCritique
      });
    } else {
      // Use legacy pipeline for backward compatibility
      result = await verifyClaim(claim, { context, useWebSearch, useVectorSearch });
    }

    res.json(result);

  } catch (error) {
    console.error('Verification error:', error.message);
    console.error(error.stack);
    res.status(500).json({ 
      error: 'Verification failed', 
      details: error.message 
    });
  }
});

/**
 * GET /api/verify/health
 * Health check endpoint
 */
router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'verification-api',
    features: {
      agenticWorkflow: true,
      selfCritique: true,
      intelligentRouting: true,
      evidenceAssessment: true
    },
    timestamp: new Date().toISOString()
  });
});

export default router;
