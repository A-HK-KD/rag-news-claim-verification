/**
 * Web search service for retrieving real-time evidence
 * This is a simple implementation using DuckDuckGo-like search
 */

/**
 * Search the web for evidence related to the claim
 */
export async function searchWeb(claim, entities = []) {
  console.log('Searching web for evidence...');
  
  // For the prototype, we'll use a simple fetch-based approach
  // In production, you'd use Tavily, SerpAPI, or Bing Search API
  
  try {
    // Use entities for better search results, fallback to claim keywords
    let searchTerms = entities.length > 0 ? entities : extractKeywords(claim);
    
    // Clean entity names (remove titles, honorifics)
    searchTerms = searchTerms.map(cleanEntityName);
    
    // Search Wikipedia with the most relevant entity/keyword
    const results = await searchWikipedia(searchTerms[0] || claim);
    
    return results;
  } catch (error) {
    console.error('Web search error:', error.message);
    // Return empty array if search fails (don't use mock by default)
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
