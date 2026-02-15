import express from 'express';
import { verifyClaim } from '../services/rag.js';

const router = express.Router();

router.post('/verify', async (req, res) => {
  try {
    const { claim, context = '', useWebSearch = true } = req.body;

    if (!claim) {
      return res.status(400).json({ 
        error: 'Claim is required' 
      });
    }

    console.log(`\nVerifying claim: "${claim}"`);
    const startTime = Date.now();

    const result = await verifyClaim(claim, { context, useWebSearch });

    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`Verification completed in ${processingTime}s`);

    res.json({
      ...result,
      processingTime: `${processingTime}s`
    });

  } catch (error) {
    console.error('Verification error:', error.message);
    res.status(500).json({ 
      error: 'Verification failed', 
      details: error.message 
    });
  }
});

export default router;
