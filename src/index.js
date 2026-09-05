import dotenv from 'dotenv';
import { createServer } from './dashboard/server.js';
import { initBot, client } from './bot/client.js';
import { flushAllHistory, getBotSettings, updateBotSettings } from './database/supabase.js';

// Load environment variables
dotenv.config();

const PORT = process.env.PORT || 3000;

async function bootstrap() {
  console.log('====================================================');
  console.log('🚀 [Core] Starting Discord AI Bot & Web Dashboard...');
  console.log('====================================================');

  // 1. Startup Flush: Wipe conversation memory table so state starts fresh on every Render deploy or restart
  try {
    console.log('🧹 [Startup] Executing restart memory flush on Supabase...');
    const flushResult = await flushAllHistory();
    if (flushResult.success) {
      console.log('✨ [Startup] Supabase conversation_history flushed successfully.');
    } else {
      console.warn('⚠️ [Startup] Memory flush notice:', flushResult.message || flushResult.error);
    }
  } catch (err) {
    console.error('❌ [Startup] Failed during initial memory flush:', err.message);
  }

  // 2. Pre-fetch and synchronize bot settings with .env overrides
  try {
    let initialSettings = await getBotSettings(true);
    
    // If .env specifies openai or keys have changed, persist to database
    if (process.env.AI_PROVIDER === 'openai' || (!initialSettings.gemini_api_key && process.env.OPENAI_API_KEY)) {
      initialSettings = await updateBotSettings({
        ...initialSettings,
        provider: 'openai',
        openai_api_key: process.env.OPENAI_API_KEY || initialSettings.openai_api_key,
        openai_model: process.env.OPENAI_MODEL || initialSettings.openai_model,
        openai_base_url: process.env.OPENAI_BASE_URL || initialSettings.openai_base_url,
      });
    }

    console.log(`⚙️ [Config] Active Provider: "${initialSettings.provider.toUpperCase()}"`);
    console.log(`🤖 [Config] Model: "${initialSettings.provider === 'gemini' ? initialSettings.gemini_model : initialSettings.openai_model}"`);
    if (initialSettings.provider === 'openai') {
      console.log(`🔗 [Config] Base URL: "${initialSettings.openai_base_url}"`);
    }
    if (initialSettings.auto_channel_id) {
      console.log(`📢 [Config] Auto-Chat Channel ID: ${initialSettings.auto_channel_id}`);
    }
  } catch (err) {
    console.error('⚠️ [Config] Error reading/syncing initial settings from DB:', err.message);
  }

  // 3. Start Express Web Dashboard Server (Satisfies Render PORT binding)
  const app = createServer();
  const server = app.listen(PORT, '0.0.0.0', () => {
    console.log(`🌐 [Express] Web Dashboard listening on port ${PORT} (http://localhost:${PORT})`);
    console.log(`🩺 [Health] Render health check available at http://localhost:${PORT}/health`);
  });

  // 4. Initialize & Connect Discord Bot
  try {
    await initBot();
  } catch (err) {
    console.error('❌ [DiscordBot] Startup error:', err.message);
  }

  // 5. Graceful Shutdown Handlers for Render deployments and container lifecycle
  const handleShutdown = async (signal) => {
    console.log(`\n🛑 [Core] Received ${signal}. Initiating graceful shutdown...`);

    // Stop accepting new HTTP requests
    server.close(() => {
      console.log('🔌 [Express] HTTP server closed.');
    });

    // Disconnect Discord Bot
    if (client && client.isReady()) {
      try {
        console.log('🤖 [DiscordBot] Destroying client session...');
        await client.destroy();
        console.log('🤖 [DiscordBot] Disconnected cleanly.');
      } catch (err) {
        console.error('Error destroying bot client:', err);
      }
    }

    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

// Start application
bootstrap().catch((err) => {
  console.error('💥 [Fatal] Unhandled error during application bootstrap:', err);
  process.exit(1);
});
