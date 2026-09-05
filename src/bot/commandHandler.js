import { PermissionFlagsBits } from 'discord.js';
import { searchWeb, scrapeWebsite, normalizeUrl } from './searchService.js';
import { AIService } from './aiService.js';
import { MemoryManager } from './memoryManager.js';
import { getBotSettings } from '../database/supabase.js';
import { splitMessage } from './messageHandler.js';

/**
 * Checks whether a Discord user has admin privileges.
 * An admin is:
 * 1. Listed in ADMIN_USER_IDS in .env (bot owner / global admin)
 * 2. The owner of the Discord guild (guild.ownerId === userId)
 * 3. Has the Administrator permission in the Discord guild
 *
 * @param {object} params
 * @param {string} params.userId
 * @param {import('discord.js').GuildMember} [params.member]
 * @param {import('discord.js').Guild} [params.guild]
 * @returns {boolean}
 */
export function isUserAdmin({ userId, member = null, guild = null }) {
  if (!userId) return false;

  // 1. Check ADMIN_USER_IDS (.env comma-separated list)
  const envAdmins = (process.env.ADMIN_USER_IDS || '')
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);

  if (envAdmins.includes(userId)) {
    return true;
  }

  // 2. Check Guild Owner
  if (guild && guild.ownerId === userId) {
    return true;
  }

  // 3. Check Administrator permission on guild member
  if (member && member.permissions) {
    try {
      if (member.permissions.has(PermissionFlagsBits.Administrator)) {
        return true;
      }
    } catch {
      // Ignore errors
    }
  }

  return false;
}

/**
 * Executes a /search tool + chat query.
 * Searches the web for `query`, feeds the live search findings to the AI, and returns a natural conversational answer.
 * Restricted to administrators only.
 */
export async function executeSearchCommand({
  query,
  channelId,
  userId,
  userTag,
  botUserId,
  member = null,
  guild = null,
  replyCallback,
}) {
  if (!isUserAdmin({ userId, member, guild })) {
    await replyCallback([
      '⛔ **Access Denied**: The `/search` command is restricted to administrators only.',
    ]);
    return;
  }

  const cleanQuery = (query || '').trim();

  if (!cleanQuery) {
    await replyCallback([
      '⚠️ **Please provide a search query!**\nUsage: `/search <what you want to find>`\n*Example:* `/search who won the champions league match today`',
    ]);
    return;
  }

  const settings = await getBotSettings();
  if (settings.enable_web_search === false) {
    await replyCallback([
      '⚠️ **Web search is currently disabled in the dashboard settings.**',
    ]);
    return;
  }

  const tavilyApiKey = settings.tavily_api_key || process.env.TAVILY_API_KEY || '';
  const firecrawlApiKey = settings.firecrawl_api_key || process.env.FIRECRAWL_API_KEY || '';

  console.log(`\n======================================================`);
  console.log(`🔍 [CommandHandler] /search invoked by @${userTag || userId}`);
  console.log(`🔎 [CommandHandler] Search Query: "${cleanQuery}"`);

  let toolContext = '';
  try {
    const searchResults = await searchWeb(cleanQuery, {
      tavilyApiKey,
      firecrawlApiKey,
      maxResults: 4,
    });

    if (searchResults && searchResults.length > 0) {
      const snippetsText = searchResults
        .map((r) => `- **${r.title}**: ${r.snippet} (Source: ${r.url})`)
        .join('\n');
      toolContext = `[Live Web Search Findings for "${cleanQuery}"]:\n${snippetsText}\n\nInstructions: Use the above live web search findings to answer the user accurately. Cite sources with markdown links where appropriate.`;
      console.log(`📑 [CommandHandler] Retrieved ${searchResults.length} search snippet(s).`);
    } else {
      toolContext = `[Live Web Search Notice]: Web search was performed for "${cleanQuery}", but returned 0 results or was unreachable. Please answer using your existing knowledge if possible and mention that live search returned no results.`;
    }
  } catch (err) {
    console.error('❌ [CommandHandler] Web search error:', err.message);
    toolContext = `[Live Web Search Notice]: Web search encountered a temporary error (${err.message}). Answer using your general knowledge and notify the user.`;
  }

  // Retrieve channel conversation history
  const history = await MemoryManager.getHistory(channelId);

  // Generate AI response with tool context
  const { reply } = await AIService.generateReply({
    prompt: cleanQuery,
    history,
    channelId,
    userId,
    userTag,
    toolContext,
    toolType: 'search',
  });

  const replyText = (reply && reply.trim()) || "I couldn't find relevant search information. Please try again.";

  // Persist user command and assistant reply to memory
  await MemoryManager.saveMessage(channelId, userId, 'user', `/search ${cleanQuery}`);
  if (botUserId) {
    await MemoryManager.saveMessage(channelId, botUserId, 'assistant', replyText);
  }

  // Deliver response split into safe Discord message chunks
  const chunks = splitMessage(replyText, 1950);
  await replyCallback(chunks);
}

/**
 * Executes a /scrape tool + chat query.
 * Scrapes `url`, feeds the webpage content to the AI, and answers the user's prompt or summarizes the page.
 * Restricted to administrators only.
 */
export async function executeScrapeCommand({
  targetUrl,
  userPrompt,
  channelId,
  userId,
  userTag,
  botUserId,
  member = null,
  guild = null,
  replyCallback,
}) {
  if (!isUserAdmin({ userId, member, guild })) {
    await replyCallback([
      '⛔ **Access Denied**: The `/scrape` command is restricted to administrators only.',
    ]);
    return;
  }

  const rawUrl = (targetUrl || '').trim();

  if (!rawUrl) {
    await replyCallback([
      '⚠️ **Please provide a valid website URL to scrape!**\nUsage: `/scrape <url> [optional question]`\n*Example:* `/scrape https://example.com what is this website about?`',
    ]);
    return;
  }

  const cleanUrl = normalizeUrl(rawUrl);

  const settings = await getBotSettings();
  if (settings.enable_web_search === false) {
    await replyCallback([
      '⚠️ **Web scraping is currently disabled in the dashboard settings.**',
    ]);
    return;
  }

  const tavilyApiKey = settings.tavily_api_key || process.env.TAVILY_API_KEY || '';
  const firecrawlApiKey = settings.firecrawl_api_key || process.env.FIRECRAWL_API_KEY || '';

  console.log(`\n======================================================`);
  console.log(`🌐 [CommandHandler] /scrape invoked by @${userTag || userId}`);
  console.log(`🔗 [CommandHandler] Target URL: "${cleanUrl}"`);
  if (userPrompt) {
    console.log(`💬 [CommandHandler] User Query: "${userPrompt}"`);
  }

  let toolContext = '';
  try {
    const scrapeResult = await scrapeWebsite(cleanUrl, {
      firecrawlApiKey,
      tavilyApiKey,
    });

    if (scrapeResult && scrapeResult.content) {
      toolContext = `[Live Website Content for ${cleanUrl} (Title: "${scrapeResult.title || 'Webpage'}")]:\n${scrapeResult.content}\n\nInstructions: Analyze the above webpage content to answer the user's inquiry or provide a concise, structured summary.`;
      console.log(`📄 [CommandHandler] Scraped successfully (Title: "${scrapeResult.title}")`);
    } else {
      toolContext = `[Live Website Scraper Notice]: Attempted to scrape ${cleanUrl}, but could not retrieve content (page may require login, block scrapers, or be offline). Notify the user politely.`;
    }
  } catch (err) {
    console.error('❌ [CommandHandler] Website scraping error:', err.message);
    toolContext = `[Live Website Scraper Notice]: Error while scraping ${cleanUrl}: ${err.message}.`;
  }

  const effectivePrompt = userPrompt && userPrompt.trim()
    ? userPrompt.trim()
    : `Please summarize this webpage (${cleanUrl}) and highlight its key information, features, or content.`;

  // Retrieve channel conversation history
  const history = await MemoryManager.getHistory(channelId);

  // Generate AI response with tool context
  const { reply } = await AIService.generateReply({
    prompt: effectivePrompt,
    history,
    channelId,
    userId,
    userTag,
    toolContext,
    toolType: 'scrape',
  });

  const replyText = (reply && reply.trim()) || "I couldn't extract readable content from that website. Please try another link.";

  // Persist to memory
  const storedUserPrompt = `/scrape ${cleanUrl}${userPrompt ? ` ${userPrompt}` : ''}`;
  await MemoryManager.saveMessage(channelId, userId, 'user', storedUserPrompt);
  if (botUserId) {
    await MemoryManager.saveMessage(channelId, botUserId, 'assistant', replyText);
  }

  // Deliver response split into safe Discord message chunks
  const chunks = splitMessage(replyText, 1950);
  await replyCallback(chunks);
}
