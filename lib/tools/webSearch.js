/**
 * Tavily Web Search Tool
 * 
 * Production-grade search tool for AI research agents.
 * Uses Tavily's AI-optimized search API for high-quality,
 * relevant results with full article content.
 * 
 * Capabilities:
 * - Multi-query research (batch multiple angles)
 * - News-specific search (topic: "news")
 * - Adjustable depth (basic for L1, advanced for L2/L3)
 * - Full content extraction (not just snippets)
 */

import { tavily } from '@tavily/core';

// Initialize Tavily client
const tvly = tavily({ apiKey: process.env.TAVILY_API_KEY });

/**
 * Execute a single search query with configurable depth.
 * 
 * @param {string} query - Search query
 * @param {Object} options - Search options
 * @param {string} options.topic - "general" | "news" (default: "general")
 * @param {string} options.searchDepth - "basic" | "advanced" (default: "basic")
 * @param {number} options.maxResults - Number of results (default: 5)
 * @param {boolean} options.includeAnswer - Include AI summary (default: false — we do our own analysis)
 * @returns {Object} - Search results with title, content, url, score
 */
export async function search(query, options = {}) {
  const {
    topic = 'general',
    searchDepth = 'basic',
    maxResults = 5,
    includeAnswer = false,
  } = options;

  try {
    const response = await tvly.search(query, {
      topic,
      searchDepth,
      maxResults,
      includeAnswer,
    });

    const results = (response.results || []).map(r => ({
      title: r.title,
      url: r.url,
      content: r.content,
      score: r.score,
      publishedDate: r.publishedDate || null,
    }));

    return {
      success: true,
      query,
      resultCount: results.length,
      data: results,
      fetchedAt: new Date().toISOString(),
    };
  } catch (error) {
    return {
      success: false,
      query,
      error: `Search failed: ${error.message}`,
      data: [],
      fetchedAt: new Date().toISOString(),
    };
  }
}

/**
 * Execute multiple search queries in parallel.
 * Used for multi-angle research in data collection phase.
 * 
 * @param {Array<{query: string, topic?: string, searchDepth?: string, maxResults?: number}>} queries
 * @returns {Object} - Combined results from all queries
 */
export async function multiSearch(queries) {
  const results = await Promise.all(
    queries.map(q => search(
      q.query,
      {
        topic: q.topic || 'general',
        searchDepth: q.searchDepth || 'basic',
        maxResults: q.maxResults || 5,
      }
    ))
  );

  const allResults = [];
  const seenUrls = new Set();

  // Deduplicate across queries (same article might appear in multiple searches)
  for (const result of results) {
    for (const item of result.data) {
      if (!seenUrls.has(item.url)) {
        seenUrls.add(item.url);
        allResults.push({
          ...item,
          sourceQuery: result.query,
        });
      }
    }
  }

  const successCount = results.filter(r => r.success).length;

  return {
    success: successCount > 0,
    totalQueries: queries.length,
    successfulQueries: successCount,
    totalResults: allResults.length,
    data: allResults,
    queryResults: results.map(r => ({
      query: r.query,
      success: r.success,
      resultCount: r.resultCount || 0,
      error: r.error || null,
    })),
    errors: results.filter(r => !r.success).map(r => ({
      query: r.query,
      error: r.error,
    })),
    fetchedAt: new Date().toISOString(),
  };
}

/**
 * Build research queries for a company.
 * This is the UNIVERSAL TEMPLATE (Layer 1) — same queries for every company.
 * 
 * @param {string} companyName - Full company name
 * @param {string} ticker - Ticker symbol
 * @param {string} sector - Company sector
 * @param {string} exchange - Listing exchange (optional)
 * @returns {Array} - Array of query objects for multiSearch
 */
export function buildUniversalQueries(companyName, ticker, sector, exchange = '') {
  const year = new Date().getFullYear();

  const queries = [
    {
      query: `${companyName} latest news ${year}`,
      topic: 'news',
      maxResults: 5,
    },
    {
      query: `${companyName} ${ticker} quarterly earnings results ${year}`,
      topic: 'news',
      maxResults: 4,
    },
    {
      query: `${companyName} risks controversies problems ${year}`,
      topic: 'news',
      maxResults: 4,
    },
    {
      query: `${companyName} analyst rating investment outlook`,
      topic: 'news',
      maxResults: 3,
    },
    {
      query: `${companyName} management leadership strategy`,
      topic: 'general',
      maxResults: 3,
    },
    {
      query: `${sector} industry outlook trends ${year}`,
      topic: 'general',
      maxResults: 3,
    },
  ];

  // Optional SEC EDGAR query for US-listed companies
  const isUS = !ticker.includes('.') || 
    ['NASDAQ', 'NYSE', 'AMEX', 'BATS', 'NEW YORK STOCK EXCHANGE'].includes(exchange?.toUpperCase()) ||
    exchange?.toUpperCase().includes('USA') ||
    exchange?.toUpperCase().includes('US');

  if (isUS) {
    queries.push({
      query: `site:sec.gov/Archives/edgar/data "${companyName}" "Item 1A" OR "risk factors" 10-K OR 10-Q`,
      topic: 'general',
      maxResults: 3,
    });
  }

  return queries;
}

/**
 * Build sector discovery queries for unknown sectors.
 * Used when no pre-built sector module exists.
 * 
 * @param {string} sector - Sector name
 * @param {string} industry - Industry name
 * @returns {Array} - Array of query objects for multiSearch
 */
export function buildSectorDiscoveryQueries(sector, industry) {
  return [
    {
      query: `key investment metrics for ${industry} sector analysis`,
      topic: 'general',
      searchDepth: 'advanced',
      maxResults: 5,
    },
    {
      query: `what analysts evaluate when investing in ${industry} companies`,
      topic: 'general',
      searchDepth: 'advanced',
      maxResults: 4,
    },
    {
      query: `${industry} sector risk factors investors should know`,
      topic: 'general',
      maxResults: 4,
    },
  ];
}

/**
 * Build adaptive research queries for specific gaps or conflicts.
 * Used in Level 2/3 research escalation.
 * 
 * @param {string} companyName - Company name
 * @param {Array<string>} gaps - Specific gaps or conflicts to research
 * @returns {Array} - Array of query objects for multiSearch
 */
export function buildAdaptiveQueries(companyName, gaps) {
  return gaps.map(gap => ({
    query: `${companyName} ${gap}`,
    topic: 'general',
    searchDepth: 'advanced',
    maxResults: 4,
  }));
}
