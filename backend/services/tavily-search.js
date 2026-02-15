/**
 * Tavily API service for real-time news and web search
 * Tavily provides focused, high-quality search results optimized for LLMs
 */

import { tavily } from '@tavily/core';

// Initialize Tavily client
let tavilyClient = null;

/**
 * Initialize Tavily client with API key
 */
function initTavilyClient() {
  if (!tavilyClient && process.env.TAVILY_API_KEY) {
    tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY });
  }
  return tavilyClient;
}

/**
 * Check if Tavily API is available and configured
 */
export function isTavilyAvailable() {
  return !!process.env.TAVILY_API_KEY;
}

/**
 * Search Tavily for current news and web information
 * 
 * @param {string} query - The search query
 * @param {Object} options - Search options
 * @param {number} options.maxResults - Maximum number of results (default: 5)
 * @param {string} options.searchDepth - 'basic' or 'advanced' (default: 'basic')
 * @param {string} options.timeFilter - Time range: '1d', '7d', '30d', '1y' (default: '30d')
 * @param {boolean} options.includeAnswer - Include AI-generated answer (default: false)
 * @param {string[]} options.includeDomains - Filter to specific domains
 * @param {string[]} options.excludeDomains - Exclude specific domains
 * @returns {Promise<Array>} Search results with title, url, snippet, and metadata
 */
export async function searchTavily(query, options = {}) {
  const {
    maxResults = 5,
    searchDepth = 'basic',
    timeFilter = '30d',
    includeAnswer = false,
    includeDomains = [],
    excludeDomains = []
  } = options;

  // Check if Tavily is available
  if (!isTavilyAvailable()) {
    console.log('⚠️  Tavily API key not configured - skipping Tavily search');
    return [];
  }

  try {
    const client = initTavilyClient();
    
    console.log(`🔍 Tavily: Searching for "${query}" (depth=${searchDepth}, time=${timeFilter}, maxResults=${maxResults})`);
    
    // Build request options - only include supported parameters
    const requestOptions = {
      maxResults,
      searchDepth,
      includeAnswer,
      includeRawContent: false,
      includeImages: false
    };

    // Add time filter if supported by the API (days parameter)
    if (timeFilter) {
      requestOptions.days = parseDaysFromTimeFilter(timeFilter);
    }

    // Add domain filters if provided
    if (includeDomains.length > 0) {
      requestOptions.includeDomains = includeDomains;
    }
    if (excludeDomains.length > 0) {
      requestOptions.excludeDomains = excludeDomains;
    }

    // Perform the search - pass query as first argument, options as second
    const response = await client.search(query, requestOptions);
    
    // Parse and format results
    const results = (response.results || []).map((result, idx) => ({
      title: result.title,
      url: result.url,
      snippet: result.content || result.snippet || '',
      score: result.score || 0,
      publishedDate: result.publishedDate || null,
      credibility: calculateCredibility(result),
      source: 'Tavily',
      sourceType: 'news'
    }));

    console.log(`   └─ Found ${results.length} results from Tavily`);

    // Optionally include AI-generated answer
    if (includeAnswer && response.answer) {
      console.log(`   └─ AI Answer: ${response.answer.substring(0, 100)}...`);
    }

    return results;
  } catch (error) {
    console.error('❌ Tavily search error:', error.message);
    return [];
  }
}

/**
 * Search Tavily specifically for news articles
 * Focuses on news domains and recent content
 */
export async function searchTavilyNews(query, options = {}) {
  const newsOptions = {
    ...options,
    searchDepth: 'basic',
    timeFilter: options.timeFilter || '7d', // Default to last 7 days for news
    includeDomains: [
      'reuters.com',
      'apnews.com',
      'bbc.com',
      'cnn.com',
      'theguardian.com',
      'nytimes.com',
      'washingtonpost.com',
      'npr.org',
      'bloomberg.com',
      'wsj.com',
      ...(options.includeDomains || [])
    ]
  };

  return searchTavily(query, newsOptions);
}

/**
 * Search Tavily for historical or encyclopedic information
 * Focuses on authoritative sources like Wikipedia, educational sites
 */
export async function searchTavilyHistorical(query, options = {}) {
  const historicalOptions = {
    ...options,
    searchDepth: 'advanced',
    includeDomains: [
      'wikipedia.org',
      'britannica.com',
      '.edu',
      'history.com',
      'smithsonianmag.com',
      ...(options.includeDomains || [])
    ],
    excludeDomains: [
      // Exclude news sites for historical searches
      'cnn.com',
      'foxnews.com',
      'msnbc.com',
      ...(options.excludeDomains || [])
    ]
  };

  return searchTavily(query, historicalOptions);
}

/**
 * Calculate credibility score based on source characteristics
 */
function calculateCredibility(result) {
  const url = result.url?.toLowerCase() || '';
  const score = result.score || 0;

  // High credibility sources
  if (url.includes('wikipedia.org') || 
      url.includes('.gov') || 
      url.includes('.edu') ||
      url.includes('reuters.com') ||
      url.includes('apnews.com') ||
      url.includes('bbc.com')) {
    return 'high';
  }

  // Medium credibility based on score
  if (score > 0.7) {
    return 'high';
  } else if (score > 0.5) {
    return 'medium';
  } else {
    return 'low';
  }
}

/**
 * Parse time filter string to number of days
 */
function parseDaysFromTimeFilter(timeFilter) {
  const match = timeFilter.match(/^(\d+)([dmy])$/);
  if (!match) return 30; // Default to 30 days

  const [, value, unit] = match;
  const num = parseInt(value);

  switch (unit) {
    case 'd':
      return num;
    case 'm':
      return num * 30;
    case 'y':
      return num * 365;
    default:
      return 30;
  }
}
