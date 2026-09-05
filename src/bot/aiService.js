import { GoogleGenerativeAI } from '@google/generative-ai';
import OpenAI from 'openai';
import { getBotSettings, logActivity } from '../database/supabase.js';

/**
 * Legacy stub: Automated tool intent detection is now deprecated in favor of
 * explicit user commands (/search and /scrape).
 */
export function detectLiveQueryIntent() {
  return { needsSearch: false, needsScrape: false, targetUrl: null, searchQuery: null };
}

export const DEFAULT_SYSTEM_PROMPT = `You are Suzi, a witty, natural, and concise AI Discord companion.
Identity: Your name is Suzi. You are an AI living on Discord.

Core Behavioral Rules:
1. When asked for your name or identity, proudly and directly say your name is Suzi.
2. Answer naturally with concise, clean formatting. Avoid long robotic essays unless asked for code or deep explanations.
3. Media / GIFs: Discord markdown cannot render local animated GIF files; never output fake markdown image links like ![gif](...). Use expressive emojis or playful text instead.
4. Keep the vibe friendly, authentic, and direct.`;

export class AIService {
  /**
   * Generates a conversational AI response based on current Supabase settings and history.
   * When toolContext is provided (e.g. from /search or /scrape), it is injected into the prompt.
   * Normal chat messages run with 0 tools and zero background searches.
   * 
   * @param {object} params
   * @param {string} params.prompt - The incoming user message or command prompt.
   * @param {Array<{role: string, content: string}>} params.history - Previous conversation messages.
   * @param {string} [params.channelId] - The Discord channel ID (for logging).
   * @param {string} [params.userId] - The Discord user ID (for logging).
   * @param {string} [params.userTag] - The Discord username/tag (for logging).
   * @param {string} [params.toolContext] - Live search snippets or scraped website content if explicitly invoked.
   * @param {string} [params.toolType] - 'search' | 'scrape' | null
   * @returns {Promise<{reply: string, tokensUsed: number, latencyMs: number, provider: string, model: string}>}
   */
  static async generateReply({
    prompt,
    history = [],
    channelId,
    userId,
    userTag,
    toolContext = null,
    toolType = null,
  }) {
    const startTime = Date.now();
    const settings = await getBotSettings(true);
    const provider = (settings.provider || 'gemini').toLowerCase();

    console.log(`\n======================================================`);
    console.log(`📥 [AIService] Processing message from @${userTag || userId || 'User'}`);
    console.log(`💬 [AIService] Prompt: "${prompt.length > 80 ? prompt.slice(0, 80) + '...' : prompt}"`);
    console.log(`⚙️ [AIService] Provider: [${provider.toUpperCase()}]`);

    let effectivePrompt = prompt;

    if (toolContext) {
      console.log(`🛠️ [AIService] Mode: Tool-Assisted [${(toolType || 'TOOL').toUpperCase()}]`);
      effectivePrompt = `${prompt}\n\n${toolContext}`;
    } else {
      console.log(`💬 [AIService] Mode: Direct Conversational (0 Tools, Minimal Token Overhead)`);
    }

    const systemInstruction = (settings.system_instruction && settings.system_instruction.trim())
      ? settings.system_instruction.trim()
      : DEFAULT_SYSTEM_PROMPT;

    let reply = '';
    let tokensUsed = 0;
    let modelUsed = '';

    try {
      if (provider === 'gemini') {
        modelUsed = settings.gemini_model || 'gemini-1.5-flash-latest';
        console.log(`🤖 [AIService] Target Model: ${modelUsed}`);
        const result = await this._callGemini({
          prompt: effectivePrompt,
          history,
          apiKey: settings.gemini_api_key,
          modelName: modelUsed,
          systemInstruction,
          temperature: parseFloat(settings.temperature) || 0.7,
          maxTokens: parseInt(settings.max_tokens, 10) || 1000,
        });

        reply = result.reply;
        tokensUsed = result.tokensUsed;
        modelUsed = result.modelName;
      } else {
        // OpenAI or OpenAI-compatible (Groq, OpenRouter, DeepSeek, AgentRouter)
        modelUsed = settings.openai_model || 'gpt-4o-mini';
        const baseURL = settings.openai_base_url || 'https://api.openai.com/v1';
        console.log(`🤖 [AIService] Target Model: ${modelUsed}`);
        console.log(`🔗 [AIService] Endpoint: ${baseURL}`);

        const result = await this._callOpenAI({
          prompt: effectivePrompt,
          history,
          apiKey: settings.openai_api_key,
          modelName: modelUsed,
          baseURL,
          systemInstruction,
          temperature: parseFloat(settings.temperature) || 0.7,
          maxTokens: parseInt(settings.max_tokens, 10) || 1000,
        });

        reply = result.reply;
        tokensUsed = result.tokensUsed;
        modelUsed = result.modelName;
      }

      console.log(`✅ [AIService] Response generated successfully in ${Date.now() - startTime}ms (${tokensUsed} tokens)`);
      console.log(`======================================================\n`);
    } catch (err) {
      const errMsg = err.message || 'unknown error';
      const status = err.status || (err.response ? err.response.status : null);
      const is429 = status === 429 || errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('Too Many Requests');

      console.error(`❌ [AIService] Generation failed after retries!`);
      console.error(`   - Provider: ${provider}`);
      console.error(`   - Model: ${modelUsed}`);
      console.error(`   - Status: ${status || 'N/A'}`);
      console.error(`   - Error Message: ${errMsg}`);
      if (err.stack) {
        console.error(`   - Stack Trace:\n${err.stack}`);
      }
      console.log(`======================================================\n`);

      if (is429) {
        reply = `⚠️ **AI Rate Limit / Quota Exceeded (429)**\nThe API key on \`${settings.openai_base_url || 'provider'}\` has reached its rate limit or run out of credits/balance.\n👉 *Fix: Check your key balance, or switch provider/key in the dashboard (\`http://localhost:3000\`).*`;
      } else {
        reply = `⚠️ **AI Service Error**: \`${errMsg}\`\nPlease verify your API key and model settings in the dashboard.`;
      }
    }

    const latencyMs = Date.now() - startTime;

    // Asynchronously log interaction to Supabase without blocking the reply
    logActivity({
      channelId,
      userId,
      userTag,
      prompt,
      reply,
      provider,
      model: modelUsed,
      tokensUsed,
      latencyMs,
    }).catch((e) => console.error('Failed to log activity:', e));

    return {
      reply: reply || "I couldn't generate a response. Please try again in a moment.",
      tokensUsed,
      latencyMs,
      provider,
      model: modelUsed,
    };
  }

  /**
   * Fast connection diagnostic tool used by the dashboard's "Test AI Connection" button.
   */
  static async testConnection({ provider, apiKey, modelName, baseURL, prompt = 'Respond with "Connection Verified!" in 2 words.' }) {
    const startTime = Date.now();
    try {
      if (provider === 'gemini') {
        const result = await this._callGemini({
          prompt,
          history: [],
          apiKey,
          modelName: modelName || 'gemini-1.5-flash',
          systemInstruction: 'You are a test agent. Give a very short answer.',
          temperature: 0.3,
          maxTokens: 50,
        });
        return {
          success: true,
          reply: result.reply,
          model: result.modelName,
          latencyMs: Date.now() - startTime,
        };
      } else {
        const result = await this._callOpenAI({
          prompt,
          history: [],
          apiKey,
          modelName: modelName || 'gpt-4o-mini',
          baseURL: baseURL || 'https://api.openai.com/v1',
          systemInstruction: 'You are a test agent. Give a very short answer.',
          temperature: 0.3,
          maxTokens: 50,
        });
        return {
          success: true,
          reply: result.reply,
          model: result.modelName,
          latencyMs: Date.now() - startTime,
        };
      }
    } catch (err) {
      return {
        success: false,
        error: err.message || 'Connection failed',
        latencyMs: Date.now() - startTime,
      };
    }
  }

  /**
   * Internal handler for Google Gemini API models.
   */
  static async _callGemini({ prompt, history, apiKey, modelName, systemInstruction, temperature, maxTokens }) {
    if (!apiKey) {
      throw new Error('Gemini API Key is missing. Please configure it in the web dashboard or GEMINI_API_KEY environment variable.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const candidateModels = [
      modelName,
      'gemini-1.5-flash-latest',
      'gemini-1.5-flash',
      'gemini-1.5-pro-latest',
    ].filter(Boolean);

    let lastError = null;

    for (const candidate of candidateModels) {
      try {
        const model = genAI.getGenerativeModel({
          model: candidate,
          systemInstruction: systemInstruction ? { parts: [{ text: systemInstruction }] } : undefined,
          generationConfig: {
            temperature,
            maxOutputTokens: maxTokens,
          },
        });

        // Format history for Gemini chat format
        const formattedHistory = [];
        for (const msg of history) {
          formattedHistory.push({
            role: msg.role === 'assistant' ? 'model' : 'user',
            parts: [{ text: msg.content }],
          });
        }

        const chat = model.startChat({ history: formattedHistory });
        const result = await chat.sendMessage(prompt);
        const responseText = result.response.text();

        return {
          reply: responseText ? responseText.trim() : '',
          tokensUsed: result.response.usageMetadata?.totalTokenCount || Math.ceil((prompt.length + (responseText ? responseText.length : 0)) / 4),
          modelName: candidate,
        };
      } catch (err) {
        lastError = err;
        const errMsg = err.message || '';
        if (errMsg.includes('404') || errMsg.includes('not found') || errMsg.includes('is not supported')) {
          console.warn(`⚠️ [AIService] Model "${candidate}" not found, trying fallback...`);
          continue;
        }
        throw err;
      }
    }

    throw lastError || new Error(`Failed to call Gemini model: ${modelName}`);
  }

  /**
   * Internal handler for OpenAI and OpenAI-compatible providers (Groq, OpenRouter, DeepSeek, NVIDIA NIM).
   * Includes automated exponential backoff retries for 429 Rate Limits, 5xx server errors, and connection drops.
   */
  static async _callOpenAI({ prompt, history, apiKey, modelName, baseURL, systemInstruction, temperature, maxTokens }) {
    if (!apiKey) {
      throw new Error('OpenAI / Provider API Key is missing. Please configure it in the web dashboard or OPENAI_API_KEY environment variable.');
    }

    const client = new OpenAI({
      apiKey,
      baseURL: baseURL || 'https://api.openai.com/v1',
      maxRetries: 2,
      timeout: 45000,
    });

    const messages = [];

    if (systemInstruction) {
      messages.push({ role: 'system', content: systemInstruction });
    }

    for (const msg of history) {
      const role = msg.role === 'assistant' ? 'assistant' : 'user';
      messages.push({ role, content: msg.content });
    }

    messages.push({ role: 'user', content: prompt });

    const maxAttempts = 4;
    let lastError = null;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const completion = await client.chat.completions.create({
          model: modelName,
          messages,
          temperature,
          max_tokens: maxTokens,
        });

        const choice = completion.choices?.[0];
        const rawReply = choice?.message?.content || '';
        const reply = rawReply
          .replace(/<think>[\s\S]*?<\/think>/gi, '')
          .replace(/<thought>[\s\S]*?<\/thought>/gi, '')
          .replace(/^[\s\S]*?<\/think>/gi, '')
          .replace(/<\/?(think|thought)>/gi, '')
          .trim();
        const tokensUsed = completion.usage?.total_tokens || Math.ceil((prompt.length + reply.length) / 4);

        return {
          reply,
          tokensUsed,
          modelName,
        };
      } catch (err) {
        lastError = err;
        const status = err.status || (err.response ? err.response.status : null);
        const errMsg = err.message || '';
        const isRateLimit = status === 429 || errMsg.includes('429') || errMsg.includes('rate limit') || errMsg.includes('Too Many Requests');
        const isTransientError = isRateLimit || status === 500 || status === 502 || status === 503 || status === 504 || errMsg.includes('Connection error') || errMsg.includes('ECONNRESET') || errMsg.includes('ETIMEDOUT');

        if (isTransientError && attempt < maxAttempts) {
          const baseDelay = isRateLimit ? 1500 : 1000;
          const jitter = Math.floor(Math.random() * 600);
          const delayMs = Math.min(8000, baseDelay * Math.pow(2, attempt - 1) + jitter);

          console.warn(`⚠️ [AIService] Provider transient error (${status || errMsg}) on attempt ${attempt}/${maxAttempts}. Backing off for ${delayMs}ms before retry...`);
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }

        console.error(`❌ [AIService] Provider call failed (attempt ${attempt}/${maxAttempts}):`, errMsg);
        break;
      }
    }

    throw lastError || new Error(`Failed to generate reply from ${modelName}`);
  }
}
