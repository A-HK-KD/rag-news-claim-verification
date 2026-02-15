/**
 * Web search service for retrieving real-time evidence
 * Uses Tavily API for news/current events, falls back to Wikipedia
 */

import { searchTavily, searchTavilyNews, isTavilyAvailable } from './tavily-search.js';

/**
 * Search the web for evidence related to the claim
 * 
 * @param {string} claim - The claim to search for
 * @param {string[]} entities - Key entities extracted from the claim
 * @param {Object} options - Search options
 * @param {string} options.temporality - 'current', 'recent', 'historical', 'timeless'
 * @param {number} options.maxResults - Maximum number of results
 * @returns {Promise<Array>} Search results with title, url, snippet, credibility
 */
export async function searchWeb(claim, entities = [], options = {}) {
  const { temporality = 'recent', maxResults = 5 } = options;
  
  console.log(`Searching web for evidence (temporality=${temporality})...`);
  
  try {
    // Use entities for better search results, fallback to claim keywords
    let searchTerms = entities.length > 0 ? entities : extractKeywords(claim);
    
    // Clean entity names (remove titles, honorifics)
    searchTerms = searchTerms.map(cleanEntityName);
    
    const searchQuery = searchTerms[0] || claim;
    
    // For timeless/historical claims, use Wikipedia directly (skip Tavily)
    if (temporality === 'timeless' || temporality === 'historical') {
      console.log(`   └─ Using Wikipedia for ${temporality} claim (skipping Tavily)`);
      const results = await searchWikipedia(searchQuery);
      return results;
    }
    
    // For current/recent claims, try Tavily first (if available)
    if ((temporality === 'current' || temporality === 'recent') && isTavilyAvailable()) {
      try {
        const timeFilter = temporality === 'current' ? '7d' : '30d';
        const tavilyResults = await searchTavilyNews(searchQuery, { 
          maxResults,
          timeFilter
        });
        
        if (tavilyResults.length > 0) {
          console.log(`   └─ Using Tavily results (${tavilyResults.length} found)`);
          return tavilyResults;
        }
      } catch (error) {
        console.log(`   └─ Tavily search failed, falling back to Wikipedia: ${error.message}`);
      }
    }
    
    // Fallback to Wikipedia
    console.log(`   └─ Using Wikipedia fallback`);
    const results = await searchWikipedia(searchQuery);
    
    return results;
  } catch (error) {
    console.error('Web search error:', error.message);
    // Return empty array if search fails
    return [];
  }
}

/**
 * Clean entity name for better search results
 * Removes titles, honorifics, and other prefixes
 */
function cleanEntityName(entityName) {
  if (typeof entityName !== 'string') return entityName;
  
  // Remove common titles and honorifics
  return entityName.replace(/^(Shri|Shrimati|Mr\.|Mrs\.|Ms\.|Dr\.|Prof\.|Sir|Dame|Lord|Lady)\s+/i, '').trim();
}

/**
 * Extract key search terms from claim if entities not provided
 */
function extractKeywords(claim) {
  // Remove common words and extract nouns/proper nouns
  const stopWords = ['the', 'is', 'are', 'was', 'were', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'of'];
  const words = claim.split(/\s+/)
    .filter(word => word.length > 3)
    .filter(word => !stopWords.includes(word.toLowerCase()));
  
  // Return first few meaningful words
  return words.slice(0, 3);
}

/**
 * Search Wikipedia for reliable information
 */
async function searchWikipedia(searchTerm) {
  try {
    const searchQuery = encodeURIComponent(searchTerm);
    const searchUrl = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${searchQuery}&limit=3&format=json&origin=*`;
    
    const response = await fetch(searchUrl);
    const data = await response.json();
    
    // Wikipedia API returns: [query, [titles], [descriptions], [urls]]
    const [, titles, , urls] = data;
    
    if (titles.length === 0) {
      console.log(`   └─ Found 0 Wikipedia results for "${searchTerm}"`);
      return [];
    }
    
    // Fetch content extracts for each page
    const results = [];
    for (let i = 0; i < titles.length; i++) {
      try {
        const extract = await getWikipediaExtract(titles[i]);
        results.push({
          title: titles[i],
          url: urls[i],
          snippet: extract || 'No description available.',
          credibility: 'high', // Wikipedia is generally credible
          source: 'Wikipedia'
        });
      } catch (err) {
        // Skip pages that fail to fetch
        console.error(`   └─ Failed to fetch extract for ${titles[i]}`);
      }
    }
    
    console.log(`   └─ Found ${results.length} Wikipedia results`);
    return results;
  } catch (error) {
    console.error('Wikipedia search error:', error.message);
    return [];
  }
}

/**
 * Get Wikipedia page extract (first few sentences)
 */
async function getWikipediaExtract(pageTitle) {
  try {
    const encodedTitle = encodeURIComponent(pageTitle);
    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&format=json&prop=extracts&exintro=true&explaintext=true&titles=${encodedTitle}&origin=*`;
    
    const response = await fetch(extractUrl);
    const data = await response.json();
    
    const pages = data.query.pages;
    const pageId = Object.keys(pages)[0];
    const extract = pages[pageId].extract;
    
    // Return first 500 characters
    return extract ? extract.substring(0, 500) + '...' : null;
  } catch (error) {
    console.error(`Error fetching Wikipedia extract: ${error.message}`);
    return null;
  }
}

/**
 * Mock search results for testing
 */
function getMockSearchResults(claim) {
  console.log('   └─ Using mock search results (fallback)');
  return [
    {
      title: 'Mock Search Result - Encyclopedia',
      url: 'https://example.com/mock-result',
      snippet: `This is a mock search result for the claim: "${claim}". In a production environment, this would be replaced with real search results from APIs like Tavily, SerpAPI, or Bing Search.`,
      credibility: 'medium',
      source: 'Mock'
    },
    {
      title: 'Mock News Article',
      url: 'https://example.com/mock-news',
      snippet: 'Mock news content that would provide additional context for verification.',
      credibility: 'medium',
      source: 'Mock'
    }
  ];
}
