-- ==============================================================================
-- SUPABASE DATABASE SCHEMA FOR DISCORD AI BOT & DASHBOARD
-- ==============================================================================

-- 1. BOT SETTINGS TABLE (Stores dynamic configuration, provider keys, and persona)
CREATE TABLE IF NOT EXISTS public.bot_settings (
    id TEXT PRIMARY KEY DEFAULT 'default',
    provider TEXT NOT NULL DEFAULT 'gemini' CHECK (provider IN ('gemini', 'openai')),
    gemini_api_key TEXT,
    gemini_model TEXT NOT NULL DEFAULT 'gemini-1.5-flash',
    openai_api_key TEXT,
    openai_model TEXT NOT NULL DEFAULT 'gpt-4o-mini',
    openai_base_url TEXT NOT NULL DEFAULT 'https://api.openai.com/v1',
    system_instruction TEXT NOT NULL DEFAULT 'You are Suzi, a witty, natural, and concise AI Discord companion. Identity: Your name is Suzi. You are an AI living on Discord. Core Behavioral Rules: 1. When asked for your name or identity, proudly and directly say your name is Suzi. 2. Answer naturally with concise, clean formatting. Avoid long robotic essays unless asked for code or deep explanations. 3. Media / GIFs: Discord markdown cannot render local animated GIF files; never output fake markdown image links. Use expressive emojis or playful text instead. 4. Keep the vibe friendly, authentic, and direct.',
    auto_channel_id TEXT,
    temperature NUMERIC NOT NULL DEFAULT 0.7,
    max_tokens INTEGER NOT NULL DEFAULT 1000,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Seed initial row if not already present
INSERT INTO public.bot_settings (
    id,
    provider,
    gemini_model,
    openai_model,
    openai_base_url,
    system_instruction
) VALUES (
    'default',
    'gemini',
    'gemini-1.5-flash',
    'gpt-4o-mini',
    'https://api.openai.com/v1',
    'You are Suzi, a witty, natural, and concise AI Discord companion. Identity: Your name is Suzi. You are an AI living on Discord. Core Behavioral Rules: 1. When asked for your name or identity, proudly and directly say your name is Suzi. 2. Answer naturally with concise, clean formatting. Avoid long robotic essays unless asked for code or deep explanations. 3. Media / GIFs: Discord markdown cannot render local animated GIF files; never output fake markdown image links. Use expressive emojis or playful text instead. 4. Keep the vibe friendly, authentic, and direct.'
) ON CONFLICT (id) DO NOTHING;


-- 2. CONVERSATION HISTORY TABLE (Channel-specific memory with 2-hour inactivity tracking)
CREATE TABLE IF NOT EXISTS public.conversation_history (
    id BIGSERIAL PRIMARY KEY,
    channel_id TEXT NOT NULL,
    user_id TEXT,
    role TEXT NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
    content TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for lightning-fast memory queries and channel history lookups
CREATE INDEX IF NOT EXISTS idx_conv_history_channel_created 
    ON public.conversation_history (channel_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_conv_history_created 
    ON public.conversation_history (created_at DESC);


-- 3. ACTIVITY LOGS TABLE (Real-time telemetry, tokens, latency, and prompt/response tracking)
CREATE TABLE IF NOT EXISTS public.activity_logs (
    id BIGSERIAL PRIMARY KEY,
    channel_id TEXT,
    user_id TEXT,
    user_tag TEXT,
    prompt TEXT,
    reply TEXT,
    provider TEXT NOT NULL,
    model TEXT NOT NULL,
    tokens_used INTEGER DEFAULT 0,
    latency_ms INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for real-time dashboard log retrieval
CREATE INDEX IF NOT EXISTS idx_activity_logs_created_at 
    ON public.activity_logs (created_at DESC);


-- Optional helper RPC function to truncate/flush history quickly
CREATE OR REPLACE FUNCTION flush_all_conversation_history()
RETURNS void
LANGUAGE sql
AS $$
    TRUNCATE TABLE public.conversation_history;
$$;
