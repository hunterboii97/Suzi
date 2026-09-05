import express from 'express';
import {
  getBotSettings,
  updateBotSettings,
  flushAllHistory,
  flushChannelHistory,
  getActivityLogs,
  getDashboardStats,
} from '../../database/supabase.js';
import { getBotTelemetry, client } from '../../bot/client.js';
import { AIService, DEFAULT_SYSTEM_PROMPT } from '../../bot/aiService.js';

const router = express.Router();

/**
 * Authentication middleware to restrict dashboard access to logged-in Discord admins.
 */
export function requireAuth(req, res, next) {
  if (!req.session || !req.session.user) {
    return res.redirect('/auth/login');
  }
  next();
}

// Apply auth middleware to all dashboard routes
router.use(requireAuth);

/**
 * Helper to fetch all text channels across joined guilds for the auto-channel selector.
 */
function getAvailableChannels() {
  if (!client || !client.isReady()) return [];
  const channels = [];
  try {
    for (const guild of client.guilds.cache.values()) {
      for (const ch of guild.channels.cache.values()) {
        if (ch.isTextBased() && !ch.isDMBased() && !ch.isThread()) {
          channels.push({
            id: ch.id,
            name: ch.name,
            guildName: guild.name,
            guildId: guild.id,
          });
        }
      }
    }
  } catch (err) {
    console.error('Error fetching available channels:', err);
  }
  return channels;
}

// 1. Render Main Dashboard View
router.get('/', async (req, res) => {
  try {
    const [settings, dbStats, logs] = await Promise.all([
      getBotSettings(true),
      getDashboardStats(),
      getActivityLogs(30),
    ]);

    const botTelemetry = getBotTelemetry();
    const channels = getAvailableChannels();

    res.render('dashboard', {
      user: req.session.user,
      settings,
      dbStats,
      logs,
      botTelemetry,
      channels,
      defaultSystemPrompt: DEFAULT_SYSTEM_PROMPT,
      successMessage: req.query.success || null,
      errorMessage: req.query.error || null,
    });
  } catch (err) {
    console.error('❌ [Dashboard] Error loading dashboard:', err);
    res.status(500).send('Internal Server Error rendering dashboard');
  }
});

// 2. Save Bot & Provider Settings
router.post('/settings', async (req, res) => {
  try {
    const {
      provider,
      gemini_api_key,
      gemini_model,
      openai_api_key,
      openai_model,
      openai_base_url,
      system_instruction,
      auto_channel_id,
      enable_web_search,
      tavily_api_key,
      firecrawl_api_key,
      temperature,
      max_tokens,
    } = req.body;

    const updated = await updateBotSettings({
      provider: provider === 'openai' ? 'openai' : 'gemini',
      gemini_api_key: (gemini_api_key || '').trim(),
      gemini_model: (gemini_model || 'gemini-1.5-flash').trim(),
      openai_api_key: (openai_api_key || '').trim(),
      openai_model: (openai_model || 'gpt-4o-mini').trim(),
      openai_base_url: (openai_base_url || 'https://api.openai.com/v1').trim(),
      system_instruction: (system_instruction || '').trim(),
      auto_channel_id: (auto_channel_id || '').trim(),
      enable_web_search: enable_web_search === 'on' || enable_web_search === 'true' || enable_web_search === true,
      tavily_api_key: (tavily_api_key || '').trim(),
      firecrawl_api_key: (firecrawl_api_key || '').trim(),
      temperature: parseFloat(temperature) || 0.7,
      max_tokens: parseInt(max_tokens, 10) || 1000,
    });

    console.log('⚙️ [Dashboard] Bot settings updated by admin:', req.session.user.username);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, settings: updated });
    }

    res.redirect('/dashboard?success=Settings+saved+successfully');
  } catch (err) {
    console.error('❌ [Dashboard] Failed to save settings:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
  }
});

// 3. Flush All Conversation Memory
router.post('/flush-memory', async (req, res) => {
  try {
    const result = await flushAllHistory();
    console.log(`🧹 [Dashboard] Memory flush triggered by ${req.session.user.username}`);

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, message: 'All channel conversation memory wiped clean.' });
    }

    res.redirect('/dashboard?success=All+conversation+history+has+been+flushed');
  } catch (err) {
    console.error('❌ [Dashboard] Memory flush failed:', err);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, error: err.message });
    }
    res.redirect(`/dashboard?error=${encodeURIComponent(err.message)}`);
  }
});

// 4. Flush Specific Channel Memory
router.post('/flush-channel', async (req, res) => {
  const { channelId } = req.body;
  if (!channelId) {
    return res.status(400).json({ success: false, error: 'Channel ID required' });
  }

  const success = await flushChannelHistory(channelId);
  res.json({ success, message: success ? `Context for channel ${channelId} flushed.` : 'Flush failed' });
});

// 5. Real-time Activity Logs API (JSON for live table updates)
router.get('/api/logs', async (req, res) => {
  try {
    const limit = parseInt(req.query.limit, 10) || 30;
    const logs = await getActivityLogs(limit);
    res.json({ success: true, logs });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 6. Real-time System Status API (JSON for live widgets)
router.get('/api/status', async (req, res) => {
  try {
    const botTelemetry = getBotTelemetry();
    const dbStats = await getDashboardStats();
    res.json({
      success: true,
      bot: botTelemetry,
      db: dbStats,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// 7. Test AI Connection Diagnostic API
router.post('/api/test-ai', async (req, res) => {
  try {
    const { provider, apiKey, modelName, baseURL } = req.body;
    console.log(`🧪 [Dashboard] Testing AI connection: ${provider} -> ${modelName}`);

    const result = await AIService.testConnection({
      provider: (provider || 'openai').toLowerCase(),
      apiKey: (apiKey || '').trim(),
      modelName: (modelName || '').trim(),
      baseURL: (baseURL || '').trim(),
    });

    res.json(result);
  } catch (err) {
    console.error('❌ [Dashboard] Test AI error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
});

export default router;
