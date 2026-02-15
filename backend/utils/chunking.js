/**
 * Text chunking strategies for embedding using LangChain
 */

import { RecursiveCharacterTextSplitter } from '@langchain/textsplitters';
import { Document } from '@langchain/core/documents';

/**
 * Create a LangChain RecursiveCharacterTextSplitter with default settings
 * This is the recommended chunking strategy for RAG applications
 */
export function createTextSplitter(chunkSize = 500, chunkOverlap = 80) {
  return new RecursiveCharacterTextSplitter({
    chunkSize,
    chunkOverlap,
    separators: ['\n\n', '\n', '. ', '! ', '? ', '; ', ', ', ' ', ''],
    keepSeparator: false,
    lengthFunction: (text) => text.length,
  });
}

/**
 * Split text into chunks using RecursiveCharacterTextSplitter (LangChain)
 * This is the primary chunking method
 */
export async function splitTextIntoChunks(text, chunkSize = 500, chunkOverlap = 80) {
  const splitter = createTextSplitter(chunkSize, chunkOverlap);
  const chunks = await splitter.splitText(text);
  return chunks;
}

/**
 * Split documents into chunks (LangChain-style)
 * Takes Document objects and returns chunked Document objects
 */
export async function splitDocuments(documents, chunkSize = 500, chunkOverlap = 80) {
  const splitter = createTextSplitter(chunkSize, chunkOverlap);
  return await splitter.splitDocuments(documents);
}

/**
 * Legacy function: Split text into chunks by sentence boundaries
 * Kept for backward compatibility
 */
export function chunkBySentences(text, maxChunkSize = 500, overlap = 50) {
  // Split by sentence endings
  const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
  const chunks = [];
  let currentChunk = '';
  
  for (const sentence of sentences) {
    if ((currentChunk + sentence).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      // Add overlap from end of previous chunk
      const words = currentChunk.split(' ');
      currentChunk = words.slice(-Math.floor(overlap / 5)).join(' ') + ' ' + sentence;
    } else {
      currentChunk += sentence;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Legacy function: Split text into chunks by paragraphs
 * Kept for backward compatibility
 */
export function chunkByParagraphs(text, maxChunkSize = 1000) {
  const paragraphs = text.split(/\n\n+/);
  const chunks = [];
  let currentChunk = '';
  
  for (const paragraph of paragraphs) {
    if ((currentChunk + paragraph).length > maxChunkSize && currentChunk.length > 0) {
      chunks.push(currentChunk.trim());
      currentChunk = paragraph;
    } else {
      currentChunk += (currentChunk ? '\n\n' : '') + paragraph;
    }
  }
  
  if (currentChunk.trim().length > 0) {
    chunks.push(currentChunk.trim());
  }
  
  return chunks;
}

/**
 * Legacy function: Split text into fixed-size chunks with overlap
 * Kept for backward compatibility
 */
export function chunkByTokens(text, chunkSize = 500, overlap = 50) {
  const words = text.split(/\s+/);
  const chunks = [];
  
  for (let i = 0; i < words.length; i += chunkSize - overlap) {
    const chunk = words.slice(i, i + chunkSize).join(' ');
    if (chunk.trim().length > 0) {
      chunks.push(chunk.trim());
    }
  }
  
  return chunks;
}

/**
 * Smart chunking that tries to preserve semantic boundaries
 * Now uses LangChain's RecursiveCharacterTextSplitter by default
 */
export async function smartChunk(text, maxChunkSize = 500, overlap = 80) {
  return await splitTextIntoChunks(text, maxChunkSize, overlap);
}

/**
 * Prepare document for embedding with metadata
 * Now uses LangChain's RecursiveCharacterTextSplitter
 * Returns LangChain Document objects
 */
export async function prepareDocument(text, metadata = {}) {
  const chunks = await smartChunk(text);
  
  return chunks.map((chunk, index) => new Document({
    pageContent: chunk,
    metadata: {
      ...metadata,
      chunkIndex: index,
      totalChunks: chunks.length,
      length: chunk.length
    }
  }));
}

/**
 * Legacy function (synchronous version)
 * Kept for backward compatibility with existing code
 */
export function prepareDocumentSync(text, metadata = {}) {
  const chunks = chunkBySentences(text);
  
  return chunks.map((chunk, index) => ({
    text: chunk,
    metadata: {
      ...metadata,
      chunkIndex: index,
      totalChunks: chunks.length,
      length: chunk.length
    }
  }));
}
