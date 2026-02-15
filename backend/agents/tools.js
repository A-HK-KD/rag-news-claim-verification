import { DynamicStructuredTool } from '@langchain/core/tools';
import { z } from 'zod';
import { similaritySearch, isPineconeAvailable } from '../services/vectordb.js';
import { searchWeb } from '../services/websearch.js';
import { searchTavilyNews, searchTavilyHistorical, isTavilyAvailable } from '../services/tavily-search.js';

/**
 * Tool: Search Knowledge Base (Vector DB)
 * Searches the Pinecone vector database for relevant facts
 */
export const searchKnowledgeBaseTool = new DynamicStructuredTool({
  name: 'search_knowledge_base',
  description: 'Search the internal knowledge base (vector database) for verified facts and historical information. Use this for well-established facts, historical claims, and general knowledge. Returns up to 5 relevant sources with snippets and credibility scores.',
  schema: z.object({
    query: z.string().describe('The search query or claim to look up in the knowledge base'),
    limit: z.number().optional().default(5).describe('Maximum number of results to return (default: 5)')
  }),
  func: async ({ query, limit = 5 }) => {
    try {
      if (!isPineconeAvailable()) {
        return JSON.stringify({
          success: false,
          error: 'Knowledge base not available',
          results: []
        });
      }

      console.log(`🔧 Tool: search_knowledge_base("${query}", limit=${limit})`);
      
      const documents = await similaritySearch(query, limit, null, 'knowledge-base');
      
      const results = documents.map((doc, idx) => ({
        index: idx + 1,
        title: `KB: ${doc.metadata.claim || 'Fact'}`,
        snippet: doc.metadata.explanation || doc.pageContent,
        verdict: doc.metadata.verdict,
        credibility: doc.metadata.credibility || 'high',
        source_url: doc.metadata.source || 'internal://knowledge-base',
        relevance_score: doc.metadata.score
      }));

      return JSON.stringify({
        success: true,
        source_type: 'knowledge_base',
        num_results: results.length,
        results
      });
    } catch (error) {
      console.error('Error in search_knowledge_base tool:', error.message);
      return JSON.stringify({
        success: false,
        error: error.message,
        results: []
      });
    }
  }
});

/**
 * Tool: Search Web for Current Information
 * Uses Tavily API (when available) for recent and current events, falls back to web search
 */
export const searchWebCurrentTool = new DynamicStructuredTool({
  name: 'search_web_current',
  description: 'Search the web for current and recent information (within last 30 days). Use this for breaking news, current events, recent developments, and time-sensitive claims. Prioritizes news sources and authoritative sites. Returns web sources with snippets and URLs.',
  schema: z.object({
    query: z.string().describe('The search query or claim to verify'),
    entities: z.array(z.string()).optional().default([]).describe('Key entities or names to focus the search')
  }),
  func: async ({ query, entities = [] }) => {
    try {
      console.log(`🔧 Tool: search_web_current("${query}", entities=${JSON.stringify(entities)})`);
      
      let results = [];
      
      // Try Tavily first if available
      if (isTavilyAvailable()) {
        try {
          const searchQuery = entities.length > 0 ? `${query} ${entities.join(' ')}` : query;
          const tavilyResults = await searchTavilyNews(searchQuery, { 
            maxResults: 5,
            timeFilter: '30d'
          });
          
          if (tavilyResults.length > 0) {
            results = tavilyResults.map((result, idx) => ({
              index: idx + 1,
              title: result.title,
              snippet: result.snippet,
              source_url: result.url,
              credibility: result.credibility || 'medium',
              source_type: 'news',
              published_date: result.publishedDate
            }));
            
            console.log(`   └─ Found ${results.length} results from Tavily`);
          }
        } catch (error) {
          console.log(`   └─ Tavily search failed, falling back to Wikipedia: ${error.message}`);
        }
      }
      
      // Fallback to regular web search (Wikipedia) if Tavily unavailable or returned no results
      if (results.length === 0) {
        const webResults = await searchWeb(query, entities, { temporality: 'recent' });
        
        results = webResults.map((result, idx) => ({
          index: idx + 1,
          title: result.title,
          snippet: result.snippet,
          source_url: result.url,
          credibility: result.credibility || 'medium',
          source_type: result.source || 'web'
        }));
        
        console.log(`   └─ Found ${results.length} results from fallback search`);
      }

      return JSON.stringify({
        success: true,
        source_type: isTavilyAvailable() && results.length > 0 ? 'tavily_news' : 'web_current',
        num_results: results.length,
        results
      });
    } catch (error) {
      console.error('Error in search_web_current tool:', error.message);
      return JSON.stringify({
        success: false,
        error: error.message,
        results: []
      });
    }
  }
});

/**
 * Tool: Search Web for Historical Information
 * Uses Tavily (when available) or web search for historical facts
 */
export const searchWebHistoricalTool = new DynamicStructuredTool({
  name: 'search_web_historical',
  description: 'Search the web for historical information and well-established facts. Use this for historical events, biographical information, scientific facts, and claims about the past. Searches Wikipedia, educational sites, and reliable encyclopedic sources.',
  schema: z.object({
    query: z.string().describe('The search query or historical claim to verify'),
    entities: z.array(z.string()).optional().default([]).describe('Key entities, names, or dates to focus the search')
  }),
  func: async ({ query, entities = [] }) => {
    try {
      console.log(`🔧 Tool: search_web_historical("${query}", entities=${JSON.stringify(entities)})`);
      
      let results = [];
      
      // Try Tavily historical search if available
      if (isTavilyAvailable()) {
        try {
          const searchQuery = entities.length > 0 ? `${query} ${entities.join(' ')}` : query;
          const tavilyResults = await searchTavilyHistorical(searchQuery, { 
            maxResults: 5
          });
          
          if (tavilyResults.length > 0) {
            results = tavilyResults.map((result, idx) => ({
              index: idx + 1,
              title: result.title,
              snippet: result.snippet,
              source_url: result.url,
              credibility: result.credibility || 'high',
              source_type: 'historical'
            }));
            
            console.log(`   └─ Found ${results.length} results from Tavily (historical)`);
          }
        } catch (error) {
          console.log(`   └─ Tavily historical search failed, falling back to Wikipedia: ${error.message}`);
        }
      }
      
      // Fallback to regular web search (Wikipedia)
      if (results.length === 0) {
        const webResults = await searchWeb(query, entities, { temporality: 'historical' });
        
        // Filter and prioritize Wikipedia and educational sources
        const historicalResults = webResults.filter(r => {
          const url = r.url.toLowerCase();
          return url.includes('wikipedia') || 
                 url.includes('.edu') || 
                 url.includes('britannica') ||
                 !url.includes('news'); // Exclude news sites for historical search
        });

        results = historicalResults.map((result, idx) => ({
          index: idx + 1,
          title: result.title,
          snippet: result.snippet,
          source_url: result.url,
          credibility: result.credibility || 'high',
          source_type: 'historical'
        }));
        
        console.log(`   └─ Found ${results.length} results from fallback search`);
      }

      return JSON.stringify({
        success: true,
        source_type: isTavilyAvailable() && results.length > 0 ? 'tavily_historical' : 'web_historical',
        num_results: results.length,
        results
      });
    } catch (error) {
      console.error('Error in search_web_historical tool:', error.message);
      return JSON.stringify({
        success: false,
        error: error.message,
        results: []
      });
    }
  }
});

/**
 * Get all available tools for the verification agent
 */
export function getVerificationTools() {
  return [
    searchKnowledgeBaseTool,
    searchWebCurrentTool,
    searchWebHistoricalTool
  ];
}
