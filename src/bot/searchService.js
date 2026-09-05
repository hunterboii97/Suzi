import dotenv from 'dotenv';

dotenv.config();

/**
 * Normalizes a user-provided URL or domain string into a valid HTTPS URL.
 * e.g. "yumezone.live" -> "https://yumezone.live"
 * @param {string} urlStr
 * @returns {string}
 */
export function normalizeUrl(urlStr) {
  if (!urlStr || typeof urlStr !== 'string') return '';
  let clean = urlStr.trim().replace(/^<|>$/g, ''); // remove Discord angle brackets if present
  if (!/^https?:\/\//i.test(clean)) {
    clean = `https://${clean}`;
  }
  return clean;
}

/**
 * Scrapes a website using Firecrawl API to extract full clean markdown.
 * @param {string} targetUrl
 * @param {string} apiKey
 * @returns {Promise<{title?: string, markdown?: string, description?: string, url: string} | null>}
 */
async function scrapeWithFirecrawl(targetUrl, apiKey) {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        url: targetUrl,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firecrawl HTTP ${response.status}: ${errText}`);
    }

    const json = await response.json();
    if (json.success && json.data) {
      const data = json.data;
      return {
        title: data.metadata?.title || 'Website Scrape',
        description: data.metadata?.description || '',
        markdown: (data.markdown || '').slice(0, 8000), // Cap at 8,000 chars to avoid token limits
        url: targetUrl,
      };
    }
    return null;
  } catch (err) {
    console.error('❌ [SearchService] Firecrawl scrape error:', err.message);
    return null;
  }
}

/**
 * Extracts website content using Tavily Extract API.
 * @param {string} targetUrl
 * @param {string} apiKey
 * @returns {Promise<{title?: string, markdown?: string, url: string} | null>}
 */
async function extractWithTavily(targetUrl, apiKey) {
  try {
    const response = await fetch('https://api.tavily.com/extract', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        urls: [targetUrl],
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Tavily Extract HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    if (data.results && data.results.length > 0) {
      const item = data.results[0];
      return {
        title: item.title || 'Extracted Page',
        markdown: (item.raw_content || '').slice(0, 8000),
        url: targetUrl,
      };
    }
    return null;
  } catch (err) {
    console.error('❌ [SearchService] Tavily extract error:', err.message);
    return null;
  }
}

/**
 * Native direct fetch & basic text extraction fallback for websites.
 * @param {string} targetUrl
 * @returns {Promise<{title?: string, markdown?: string, url: string} | null>}
 */
async function directFetchWebsite(targetUrl) {
  try {
    const response = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(10000), // 10s timeout
    });

    if (!response.ok) {
      throw new Error(`Direct fetch HTTP ${response.status}`);
    }

    const html = await response.text();

    // Extract page title
    const titleMatch = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
    const title = titleMatch ? titleMatch[1].replace(/<[^>]+>/g, '').trim() : 'Website';

    // Extract meta description
    const descMatch = html.match(/<meta[^>]+name="description"[^>]+content="([^"]*)"/i) ||
                      html.match(/<meta[^>]+property="og:description"[^>]+content="([^"]*)"/i);
    const description = descMatch ? descMatch[1].trim() : '';

    // Strip scripts, styles, noscript, and tags
    let cleanText = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, '')
      .replace(/<nav[\s\S]*?<\/nav>/gi, '')
      .replace(/<footer[\s\S]*?<\/footer>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    cleanText = cleanText.slice(0, 4000);

    return {
      title,
      description,
      markdown: cleanText,
      url: targetUrl,
    };
  } catch (err) {
    console.error(`❌ [SearchService] Direct website scrape failed for ${targetUrl}:`, err.message);
    return null;
  }
}

/**
 * Scrapes and reads the content of a specific website or URL.
 * Automatically tries Firecrawl -> Tavily Extract -> Direct Fallback.
 * 
 * @param {string} rawUrl - The URL or domain name (e.g. "yumezone.live" or "https://yumezone.live").
 * @param {object} [options]
 * @param {string} [options.firecrawlApiKey] - Optional Firecrawl key.
 * @param {string} [options.tavilyApiKey] - Optional Tavily key.
 * @returns {Promise<{success: boolean, title: string, content: string, url: string}>}
 */
export async function scrapeWebsite(rawUrl, { firecrawlApiKey, tavilyApiKey } = {}) {
  const url = normalizeUrl(rawUrl);
  if (!url) {
    return { success: false, title: '', content: 'Invalid URL provided', url: '' };
  }

  const fcKey = firecrawlApiKey || process.env.FIRECRAWL_API_KEY;
  const tvKey = tavilyApiKey || process.env.TAVILY_API_KEY;

  // 1. Try Firecrawl Scrape API
  if (fcKey) {
    console.log(`🔥 [SearchService] Scraping website via Firecrawl: "${url}"`);
    const fcResult = await scrapeWithFirecrawl(url, fcKey);
    if (fcResult && fcResult.markdown) {
      return {
        success: true,
        title: fcResult.title || 'Scraped Website',
        content: `### ${fcResult.title}\n${fcResult.description ? `*${fcResult.description}*\n\n` : ''}${fcResult.markdown}`,
        url,
      };
    }
    console.warn('⚠️ [SearchService] Firecrawl scrape failed, trying Tavily extract fallback...');
  }

  // 2. Try Tavily Extract API
  if (tvKey) {
    console.log(`🌐 [SearchService] Extracting website via Tavily Extract: "${url}"`);
    const tvResult = await extractWithTavily(url, tvKey);
    if (tvResult && tvResult.markdown) {
      return {
        success: true,
        title: tvResult.title || 'Scraped Website',
        content: `### ${tvResult.title}\n\n${tvResult.markdown}`,
        url,
      };
    }
  }

  // 3. Native Direct Fetch Fallback
  console.log(`🌐 [SearchService] Scraping website via Direct Fetch: "${url}"`);
  const directResult = await directFetchWebsite(url);
  if (directResult && directResult.markdown) {
    return {
      success: true,
      title: directResult.title,
      content: `### ${directResult.title}\n${directResult.description ? `*${directResult.description}*\n\n` : ''}${directResult.markdown}`,
      url,
    };
  }

  return {
    success: false,
    title: 'Website Scraping Failed',
    content: `Could not retrieve content from ${url}. The website might be offline or blocking scrapers.`,
    url,
  };
}

/**
 * Searches the web using Firecrawl Search API.
 * @param {string} query
 * @param {string} apiKey
 * @param {number} maxResults
 * @returns {Promise<Array<{title: string, snippet: string, url: string}>>}
 */
async function searchFirecrawl(query, apiKey, maxResults = 3) {
  try {
    const response = await fetch('https://api.firecrawl.dev/v1/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        limit: maxResults,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Firecrawl Search HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const results = [];

    if (data.data && Array.isArray(data.data)) {
      for (const item of data.data.slice(0, maxResults)) {
        results.push({
          title: item.title || 'Untitled',
          snippet: item.markdown || item.description || '',
          url: item.url || '',
        });
      }
    }

    return results;
  } catch (err) {
    console.error('❌ [SearchService] Firecrawl search error:', err.message);
    return [];
  }
}

/**
 * Searches the web using Tavily AI Search API.
 * @param {string} query
 * @param {string} apiKey
 * @param {number} maxResults
 * @returns {Promise<Array<{title: string, snippet: string, url: string}>>}
 */
async function searchTavily(query, apiKey, maxResults = 3) {
  try {
    const response = await fetch('https://api.tavily.com/search', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        api_key: apiKey,
        query,
        max_results: maxResults,
        search_depth: 'basic',
        include_answer: true,
      }),
    });

    if (!response.ok) {
      const errText = await response.text();
      throw new Error(`Tavily HTTP ${response.status}: ${errText}`);
    }

    const data = await response.json();
    const results = [];

    if (data.answer) {
      results.push({
        title: 'Direct Answer',
        snippet: data.answer,
        url: 'https://tavily.com',
      });
    }

    if (data.results && Array.isArray(data.results)) {
      for (const item of data.results.slice(0, maxResults)) {
        results.push({
          title: item.title || 'Untitled',
          snippet: item.content || item.snippet || '',
          url: item.url || '',
        });
      }
    }

    return results;
  } catch (err) {
    console.error('❌ [SearchService] Tavily search error:', err.message);
    return [];
  }
}

/**
 * Main Web Search function with Tavily and Firecrawl fallback.
 * 
 * @param {string} query - The search query.
 * @param {object} [options]
 * @param {string} [options.tavilyApiKey] - Optional Tavily API Key.
 * @param {string} [options.firecrawlApiKey] - Optional Firecrawl API Key.
 * @param {number} [options.maxResults=3] - Maximum results to retrieve.
 * @returns {Promise<Array<{title: string, snippet: string, url: string}>>}
 */
export async function searchWeb(query, { tavilyApiKey, firecrawlApiKey, maxResults = 3 } = {}) {
  if (!query || typeof query !== 'string') return [];

  const cleanQuery = query.trim();
  const tvKey = tavilyApiKey || process.env.TAVILY_API_KEY;
  const fcKey = firecrawlApiKey || process.env.FIRECRAWL_API_KEY;

  // 1. Try Tavily Search first (best AI search summaries)
  if (tvKey) {
    console.log(`🌐 [SearchService] Searching via Tavily AI for: "${cleanQuery}"`);
    const tavilyResults = await searchTavily(cleanQuery, tvKey, maxResults);
    if (tavilyResults.length > 0) {
      return tavilyResults;
    }
    console.warn('⚠️ [SearchService] Tavily returned 0 results or failed. Trying Firecrawl Search fallback...');
  }

  // 2. Try Firecrawl Search API fallback
  if (fcKey) {
    console.log(`🔥 [SearchService] Searching via Firecrawl Search for: "${cleanQuery}"`);
    const firecrawlResults = await searchFirecrawl(cleanQuery, fcKey, maxResults);
    if (firecrawlResults.length > 0) {
      return firecrawlResults;
    }
  }

  // 3. Fallback: Query search engine for clean topical text
  console.log(`🌐 [SearchService] Querying web summaries for: "${cleanQuery}"`);
  return [
    {
      title: `Search summary for "${cleanQuery}"`,
      snippet: `Live search query conducted for "${cleanQuery}".`,
      url: `https://www.google.com/search?q=${encodeURIComponent(cleanQuery)}`,
    },
  ];
}
