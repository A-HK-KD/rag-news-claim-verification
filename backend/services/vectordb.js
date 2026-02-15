import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAIEmbeddings } from '@langchain/openai';
import { Document } from '@langchain/core/documents';

let pinecone = null;
let index = null;
let embeddings = null;

/**
 * Get OpenAI embeddings instance (LangChain wrapper)
 */
export function getEmbeddings() {
  if (!embeddings) {
    embeddings = new OpenAIEmbeddings({
      modelName: 'text-embedding-3-large',
      dimensions: 3072,
      openAIApiKey: process.env.OPENAI_API_KEY
    });
  }
  return embeddings;
}

/**
 * Initialize Pinecone client and index
 */
export async function initializePinecone() {
  if (pinecone) return pinecone;
  
  try {
    pinecone = new Pinecone({
      apiKey: process.env.PINECONE_API_KEY
    });
    
    const indexName = process.env.PINECONE_INDEX_NAME || 'claim-verifier';
    
    // Get or create index
    const indexList = await pinecone.listIndexes();
    const indexExists = indexList.indexes?.some(idx => idx.name === indexName);
    
    if (!indexExists) {
      console.log(`📊 Creating Pinecone index: ${indexName}`);
      await pinecone.createIndex({
        name: indexName,
        dimension: 3072, // text-embedding-3-large dimension
        metric: 'cosine',
        spec: {
          serverless: {
            cloud: 'aws',
            region: 'us-east-1'
          }
        }
      });
      
      // Wait for index to be ready
      await new Promise(resolve => setTimeout(resolve, 60000));
    }
    
    index = pinecone.index(indexName);
    console.log(`✅ Pinecone initialized: ${indexName}`);
    
    return pinecone;
  } catch (error) {
    console.error('❌ Pinecone initialization error:', error.message);
    console.log('💡 Vector search will be disabled. Set PINECONE_API_KEY to enable.');
    return null;
  }
}

/**
 * Check if Pinecone is available
 */
export function isPineconeAvailable() {
  return Boolean(process.env.PINECONE_API_KEY && pinecone);
}

/**
 * LangChain-style similarity search
 * Returns Document objects with metadata and pageContent
 * 
 * @param {string} query - Query text
 * @param {number} k - Number of results (default: 10)
 * @param {Object} filter - Metadata filter (optional)
 * @param {string} namespace - Namespace to query (default: 'default')
 */
export async function similaritySearch(query, k = 10, filter = null, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) return [];
  }
  
  try {
    // Generate embedding using LangChain
    const embedder = getEmbeddings();
    const embedding = await embedder.embedQuery(query);
    
    // Query Pinecone
    const queryOptions = {
      vector: embedding,
      topK: k,
      includeMetadata: true
    };
    
    if (filter && Object.keys(filter).length > 0) {
      queryOptions.filter = filter;
    }
    
    const queryResponse = await index.namespace(namespace).query(queryOptions);
    
    // Convert to LangChain Document format
    const documents = queryResponse.matches.map(match => new Document({
      pageContent: match.metadata.text || match.metadata.explanation || '',
      metadata: {
        ...match.metadata,
        score: match.score,
        id: match.id
      }
    }));
    
    return documents;
  } catch (error) {
    console.error('Error in similarity search:', error.message);
    return [];
  }
}

/**
 * LangChain-style similarity search with score
 * Returns array of [Document, score] tuples
 */
export async function similaritySearchWithScore(query, k = 10, filter = null, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) return [];
  }
  
  try {
    const embedder = getEmbeddings();
    const embedding = await embedder.embedQuery(query);
    
    const queryOptions = {
      vector: embedding,
      topK: k,
      includeMetadata: true
    };
    
    if (filter && Object.keys(filter).length > 0) {
      queryOptions.filter = filter;
    }
    
    const queryResponse = await index.namespace(namespace).query(queryOptions);
    
    const results = queryResponse.matches.map(match => {
      const doc = new Document({
        pageContent: match.metadata.text || match.metadata.explanation || '',
        metadata: {
          ...match.metadata,
          id: match.id
        }
      });
      return [doc, match.score];
    });
    
    return results;
  } catch (error) {
    console.error('Error in similarity search with score:', error.message);
    return [];
  }
}

/**
 * Add documents to vector store (LangChain-style)
 * @param {Array<Document>} documents - LangChain Document objects
 * @param {string} namespace - Namespace for data isolation
 */
export async function addDocuments(documents, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) throw new Error('Pinecone not initialized');
  }
  
  try {
    const embedder = getEmbeddings();
    
    // Generate embeddings for all documents
    const texts = documents.map(doc => doc.pageContent);
    const embeddings = await embedder.embedDocuments(texts);
    
    // Prepare vectors for Pinecone
    const vectors = documents.map((doc, i) => ({
      id: doc.metadata.id || `doc-${Date.now()}-${i}`,
      values: embeddings[i],
      metadata: {
        text: doc.pageContent,
        ...doc.metadata
      }
    }));
    
    // Upsert to Pinecone
    await index.namespace(namespace).upsert({ records: vectors });
    console.log(`✅ Added ${vectors.length} documents to Pinecone (namespace: ${namespace})`);
    
    return vectors.map(v => v.id);
  } catch (error) {
    console.error('Error adding documents:', error.message);
    throw error;
  }
}

/**
 * Legacy function: Upsert vectors into Pinecone
 * Kept for backward compatibility
 */
export async function upsertVectors(vectors, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) throw new Error('Pinecone not initialized');
  }
  
  try {
    await index.namespace(namespace).upsert({ records: vectors });
    console.log(`✅ Upserted ${vectors.length} vectors to Pinecone (namespace: ${namespace})`);
  } catch (error) {
    console.error('Error upserting vectors:', error.message);
    throw error;
  }
}

/**
 * Legacy function: Query vectors from Pinecone
 * Kept for backward compatibility
 */
export async function queryVectors(embedding, topK = 10, filter = null, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) return [];
  }
  
  try {
    const queryOptions = {
      vector: embedding,
      topK: topK,
      includeMetadata: true
    };
    
    if (filter && Object.keys(filter).length > 0) {
      queryOptions.filter = filter;
    }
    
    const queryResponse = await index.namespace(namespace).query(queryOptions);
    
    return queryResponse.matches || [];
  } catch (error) {
    console.error('Error querying vectors:', error.message);
    return [];
  }
}

/**
 * Delete vectors by ID
 */
export async function deleteVectors(ids, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) throw new Error('Pinecone not initialized');
  }
  
  try {
    await index.namespace(namespace).deleteMany(ids);
    console.log(`✅ Deleted ${ids.length} vectors from Pinecone (namespace: ${namespace})`);
  } catch (error) {
    console.error('Error deleting vectors:', error.message);
    throw error;
  }
}

/**
 * Get index statistics
 */
export async function getIndexStats() {
  if (!index) {
    await initializePinecone();
    if (!index) return null;
  }
  
  try {
    const stats = await index.describeIndexStats();
    return stats;
  } catch (error) {
    console.error('Error getting index stats:', error.message);
    return null;
  }
}

/**
 * Clear all vectors (use with caution!)
 */
export async function clearIndex(namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) throw new Error('Pinecone not initialized');
  }
  
  try {
    await index.namespace(namespace).deleteAll();
    console.log(`⚠️  Cleared all vectors from namespace: ${namespace}`);
  } catch (error) {
    console.error('Error clearing index:', error.message);
    throw error;
  }
}

/**
 * Multi-query retrieval: Generate multiple query variations and retrieve documents
 * This implements a simple multi-query strategy for better coverage
 */
export async function multiQueryRetrieval(query, k = 5, namespace = 'default') {
  if (!index) {
    await initializePinecone();
    if (!index) return [];
  }
  
  try {
    // Generate query variations (simple approach - can be enhanced with LLM)
    const queryVariations = [
      query,
      `What is the truth about ${query}`,
      `Evidence for ${query}`,
      `Facts about ${query}`
    ];
    
    const allDocuments = [];
    const seenIds = new Set();
    
    for (const variation of queryVariations) {
      const docs = await similaritySearch(variation, k, null, namespace);
      
      // Deduplicate
      for (const doc of docs) {
        if (!seenIds.has(doc.metadata.id)) {
          seenIds.add(doc.metadata.id);
          allDocuments.push(doc);
        }
      }
    }
    
    // Sort by score (if available)
    allDocuments.sort((a, b) => (b.metadata.score || 0) - (a.metadata.score || 0));
    
    return allDocuments.slice(0, k * 2); // Return top 2k results
  } catch (error) {
    console.error('Error in multi-query retrieval:', error.message);
    return [];
  }
}
