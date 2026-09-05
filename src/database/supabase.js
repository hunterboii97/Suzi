import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_KEY || process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.warn('⚠️ [Supabase] Warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is not defined in environment variables.');
}

export const supabase = (supabaseUrl && supabaseKey)
  ? createClient(supabaseUrl, supabaseKey, {
      auth: { persistSession: false },
    })
  : null;

// In-memory cache for bot settings to prevent excessive DB queries per message
let cachedSettings = null;
let lastSettingsFetch = 0;
const CACHE_TTL_MS = 5000; // 5 seconds cache

/**
 * Get the current bot settings from Supabase, falling back to environment defaults.
 * @param {boolean} forceRefresh - If true, bypasses the in-memory cache.
 */
export async function getBotSettings(forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && cachedSettings && (now - lastSettingsFetch < CACHE_TTL_MS)) {
    return cachedSettings;
  }

  const defaultSettings = {
    id: 'default',
    provider: process.env.AI_PROVIDER || 'gemini',
    gemini_api_key: process.env.GEMINI_API_KEY || '',
    gemini_model: process.env.GEMINI_MODEL || 'gemini-1.5-flash',
    openai_api_key: process.env.OPENAI_API_KEY || '',
    openai_model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    openai_base_url: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    system_instruction: process.env.SYSTEM_INSTRUCTION || `You are Suzi, a witty, natural, and concise AI Discord companion.
Identity: Your name is Suzi. You are an AI living on Discord.

Core Behavioral Rules:
1. When asked for your name or identity, proudly and directly say your name is Suzi.
2. Answer naturally with concise, clean formatting. Avoid long robotic essays unless asked for code or deep explanations.
3. Media / GIFs: Discord markdown cannot render local animated GIF files; never output fake markdown image links like ![gif](...). Use expressive emojis or playful text instead.
4. Keep the vibe friendly, authentic, and direct.`,
    auto_channel_id: process.env.AUTO_CHANNEL_ID || '',
    enable_web_search: process.env.ENABLE_WEB_SEARCH !== 'false',
    tavily_api_key: process.env.TAVILY_API_KEY || '',
    firecrawl_api_key: process.env.FIRECRAWL_API_KEY || '',
    temperature: 0.7,
    max_tokens: 1000,
    updated_at: new Date().toISOString(),
  };

  if (!supabase) {
    cachedSettings = defaultSettings;
    lastSettingsFetch = now;
    return defaultSettings;
  }

  try {
    const { data, error } = await supabase
      .from('bot_settings')
      .select('*')
      .eq('id', 'default')
      .maybeSingle();

    if (error) {
      console.error('❌ [Supabase] Error fetching bot_settings:', error.message);
      return cachedSettings || defaultSettings;
    }

    if (!data) {
      // Seed default settings row
      await supabase.from('bot_settings').upsert(defaultSettings);
      cachedSettings = defaultSettings;
      lastSettingsFetch = now;
      return defaultSettings;
    }

    // Determine effective provider: prioritize .env if explicitly set or if only OpenAI key exists
    let effectiveProvider = data.provider || 'gemini';
    if (process.env.AI_PROVIDER && process.env.AI_PROVIDER.toLowerCase() === 'openai') {
      effectiveProvider = 'openai';
    } else if (process.env.AI_PROVIDER && process.env.AI_PROVIDER.toLowerCase() === 'gemini') {
      effectiveProvider = 'gemini';
    } else if (!data.gemini_api_key && !process.env.GEMINI_API_KEY && (data.openai_api_key || process.env.OPENAI_API_KEY)) {
      effectiveProvider = 'openai';
    }

    // Merge DB data with environment fallbacks for any missing API keys or provider overrides
    const mergedSettings = {
      ...defaultSettings,
      ...data,
      provider: effectiveProvider,
      gemini_api_key: data.gemini_api_key || process.env.GEMINI_API_KEY || '',
      openai_api_key: data.openai_api_key || process.env.OPENAI_API_KEY || '',
      openai_base_url: process.env.OPENAI_BASE_URL || data.openai_base_url || 'https://api.openai.com/v1',
      openai_model: process.env.OPENAI_MODEL || data.openai_model || 'gpt-4o-mini',
      auto_channel_id: data.auto_channel_id || process.env.AUTO_CHANNEL_ID || '',
      enable_web_search: data.enable_web_search !== undefined ? Boolean(data.enable_web_search) : (process.env.ENABLE_WEB_SEARCH !== 'false'),
      tavily_api_key: data.tavily_api_key || process.env.TAVILY_API_KEY || '',
      firecrawl_api_key: data.firecrawl_api_key || process.env.FIRECRAWL_API_KEY || '',
    };

    cachedSettings = mergedSettings;
    lastSettingsFetch = now;
    return mergedSettings;
  } catch (err) {
    console.error('❌ [Supabase] Unexpected error in getBotSettings:', err);
    return cachedSettings || defaultSettings;
  }
}

/**
 * Update the bot settings in Supabase and invalidate local cache.
 * Sanitizes the payload to strictly match columns in the bot_settings table.
 * @param {object} newSettings 
 */
export async function updateBotSettings(newSettings) {
  if (!supabase) {
    throw new Error('Supabase client is not initialized');
  }

  const validColumns = [
    'id',
    'provider',
    'gemini_api_key',
    'gemini_model',
    'openai_api_key',
    'openai_model',
    'openai_base_url',
    'system_instruction',
    'auto_channel_id',
    'temperature',
    'max_tokens',
    'updated_at',
  ];

  const payload = {
    id: 'default',
    updated_at: new Date().toISOString(),
  };

  for (const col of validColumns) {
    if (newSettings[col] !== undefined) {
      payload[col] = newSettings[col];
    }
  }

  const { data, error } = await supabase
    .from('bot_settings')
    .upsert(payload)
    .select()
    .single();

  if (error) {
    throw new Error(`Failed to update bot settings: ${error.message}`);
  }

  // Invalidate and refresh cache immediately
  cachedSettings = {
    ...(cachedSettings || {}),
    ...data,
    tavily_api_key: newSettings.tavily_api_key !== undefined ? newSettings.tavily_api_key : (cachedSettings?.tavily_api_key || process.env.TAVILY_API_KEY || ''),
    firecrawl_api_key: newSettings.firecrawl_api_key !== undefined ? newSettings.firecrawl_api_key : (cachedSettings?.firecrawl_api_key || process.env.FIRECRAWL_API_KEY || ''),
    enable_web_search: newSettings.enable_web_search !== undefined ? Boolean(newSettings.enable_web_search) : (cachedSettings?.enable_web_search !== false),
  };
  lastSettingsFetch = Date.now();
  return cachedSettings;
}

/**
 * Flush all conversation history records across all channels (e.g. on server startup or manual action).
 */
export async function flushAllHistory() {
  if (!supabase) return { success: false, message: 'Supabase not initialized' };

  try {
    const { error, count } = await supabase
      .from('conversation_history')
      .delete()
      .gte('id', 0);

    if (error) {
      console.error('❌ [Supabase] Error flushing conversation_history:', error.message);
      return { success: false, error: error.message };
    }

    console.log('🧹 [Supabase] Successfully flushed all conversation history from database.');
    return { success: true, count };
  } catch (err) {
    console.error('❌ [Supabase] Error executing flushAllHistory:', err);
    return { success: false, error: err.message };
  }
}

/**
 * Flush conversation history for a specific channel.
 * @param {string} channelId 
 */
export async function flushChannelHistory(channelId) {
  if (!supabase || !channelId) return false;

  try {
    const { error } = await supabase
      .from('conversation_history')
      .delete()
      .eq('channel_id', channelId);

    if (error) {
      console.error(`❌ [Supabase] Error flushing channel ${channelId}:`, error.message);
      return false;
    }
    return true;
  } catch (err) {
    console.error(`❌ [Supabase] Error in flushChannelHistory for ${channelId}:`, err);
    return false;
  }
}

/**
 * Record an AI generation activity log to Supabase.
 * @param {object} logData
 */
export async function logActivity(logData) {
  if (!supabase) return;

  try {
    const { error } = await supabase
      .from('activity_logs')
      .insert({
        channel_id: logData.channelId || null,
        user_id: logData.userId || null,
        user_tag: logData.userTag || null,
        prompt: logData.prompt || '',
        reply: logData.reply || '',
        provider: logData.provider || 'unknown',
        model: logData.model || 'unknown',
        tokens_used: logData.tokensUsed || 0,
        latency_ms: logData.latencyMs || 0,
        created_at: new Date().toISOString(),
      });

    if (error) {
      console.error('❌ [Supabase] Failed to insert activity log:', error.message);
    }
  } catch (err) {
    console.error('❌ [Supabase] Error logging activity:', err);
  }
}

/**
 * Retrieve recent activity logs.
 * @param {number} limit 
 */
export async function getActivityLogs(limit = 20) {
  if (!supabase) return [];

  try {
    const { data, error } = await supabase
      .from('activity_logs')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('❌ [Supabase] Error fetching activity logs:', error.message);
      return [];
    }
    return data || [];
  } catch (err) {
    console.error('❌ [Supabase] Error in getActivityLogs:', err);
    return [];
  }
}

/**
 * Retrieve database telemetry stats for the dashboard.
 */
export async function getDashboardStats() {
  if (!supabase) {
    return { totalLogs: 0, activeMemoryRecords: 0, dbConnected: false };
  }

  try {
    const [{ count: logsCount }, { count: memoryCount }] = await Promise.all([
      supabase.from('activity_logs').select('*', { count: 'exact', head: true }),
      supabase.from('conversation_history').select('*', { count: 'exact', head: true }),
    ]);

    return {
      totalLogs: logsCount || 0,
      activeMemoryRecords: memoryCount || 0,
      dbConnected: true,
    };
  } catch (err) {
    console.error('❌ [Supabase] Error fetching dashboard stats:', err);
    return { totalLogs: 0, activeMemoryRecords: 0, dbConnected: false };
  }
}
