import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import verifyRouter from './routes/verify.js';
import { initializePinecone } from './services/vectordb.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api', verifyRouter);

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Initialize Pinecone and start server
async function startServer() {
  // Initialize Pinecone vector database
  console.log('🔧 Initializing services...');
  await initializePinecone().catch(err => {
    console.warn('⚠️  Pinecone initialization failed, continuing without vector DB');
  });
  
  app.listen(PORT, () => {
    console.log(`🚀 Server running on http://localhost:${PORT}`);
    console.log(`📊 API available at http://localhost:${PORT}/api/verify`);
  });
}

startServer();
