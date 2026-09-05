# 🤖 Discord AI Bot with Web Dashboard & Supabase Memory

A production-ready, highly token-efficient Discord AI Bot with an Express.js Web Dashboard, multi-provider AI support (Google Gemini & OpenAI-compatible endpoints including NVIDIA NIM, Groq, DeepSeek), intelligent channel routing, and Supabase memory management with automated 2-hour inactivity resets. Fully optimized for 1-click deployment on **Render**.

---

## ✨ Features

- 🎯 **Dedicated Auto-Chat Channel**: Configurable `AUTO_CHANNEL_ID` where the bot automatically replies to every message without needing `@mentions` or reply tags. Ignores bots and command prefixes.
- 💤 **Dormant General Mode**: In all other channels, stays completely dormant and only answers if directly `@mentioned` or replied to.
- 🔮 **AI System Prompt Studio**: View, edit, and switch full persona prompts live with 1-click presets (*Suzi Default, Witty & Fun, Senior Dev, Minimalist*) and real-time character/token counters.
- ⚡ **Admin-Only `/search` and `/scrape` Tools**: Dedicated Discord slash and chat commands with live Tavily AI Web Search and Firecrawl Web Scraping, restricted to server administrators and bot owners.
- 🧠 **2-Hour Inactivity Context Reset**: Channel history is stored in Supabase and automatically wiped when inactive for > 2 hours, keeping conversations fresh and token consumption low.
- 🧹 **Restart & Manual Memory Flush**: Memory is automatically flushed on server startup / Render deployment, with an instant "Flush All Context Memory" button on the dashboard.
- ⚡ **Multi-Provider AI Service**:
  - **Google Gemini**: Defaults to `gemini-1.5-flash` or `gemini-2.0-flash` with Google Generative AI SDK.
  - **OpenAI-Compatible**: Seamlessly supports OpenAI (`gpt-4o-mini`), NVIDIA NIM (`llama-3.2-11b-vision-instruct`), Groq (`llama-3.3-70b-versatile`), OpenRouter, and DeepSeek via custom Base URLs.
  - **Live Dynamic Updates**: Switch providers, models, keys, and system persona prompts in the dashboard with zero bot restarts.
  - **Live AI Diagnostic**: Built-in "Test Connection" tool on the dashboard to test model responsiveness and measure latency.
- 🖤 **Pure OLED Pitch-Black Dashboard (`#000000`)**:
  - True pitch-black aesthetic with obsidian glass surfaces, glowing accent badges, and custom scrollbars.
  - Restricted strictly to Discord User IDs listed in `ADMIN_USER_IDS` via Discord OAuth2.
  - Real-time bot telemetry (status, ping, servers, memory count).
  - Live activity feed with expandable trace viewer tracking prompts, completions, tokens used, and latency.
- 💬 **Human-Like Chat Formatting**:
  - Automatically triggers Discord typing indicator while generating responses.
  - Auto-splits replies exceeding Discord's 2,000-character limit cleanly without breaking markdown blocks or words.
- 🚀 **Render Deployment Ready**: Single process entry point (`src/index.js`) listening on `PORT` with a built-in `GET /health` endpoint.

---

## 📁 Project Structure

```
.
├── src/
│   ├── bot/
│   │   ├── client.js           # discord.js client initialization & telemetry
│   │   ├── messageHandler.js   # Trigger rules, typing indicator & auto-split
│   │   ├── memoryManager.js    # 2-hour inactivity tracking & history window
│   │   └── aiService.js        # Multi-provider (Gemini & OpenAI/Groq/DeepSeek)
│   ├── dashboard/
│   │   ├── server.js           # Express server setup & /health endpoint
│   │   ├── routes/
│   │   │   ├── auth.js         # Discord OAuth2 & ADMIN_USER_IDS security
│   │   │   └── dashboard.js    # Settings management & activity telemetry
│   │   ├── views/              # EJS templates (dashboard, login, unauthorized)
│   │   └── public/             # CSS styling & client-side scripts
│   ├── database/
│   │   └── supabase.js         # Supabase client, caching & logging helpers
│   └── index.js                # Single process entry point
├── schema.sql                  # Supabase database schema
├── .env.example                # Environment variable template
├── package.json                # Dependencies and start script
└── README.md                   # Setup guide
```

---

## 🛠️ Step 1: Discord Developer Portal Setup

1. Go to the [Discord Developer Portal](https://discord.com/developers/applications) and create a **New Application**.
2. **Bot Setup**:
   - Go to the **Bot** tab and click **Reset Token** to copy your `DISCORD_BOT_TOKEN`.
   - Scroll down to **Privileged Gateway Intents** and enable:
     - ✅ **Message Content Intent** (Required)
     - ✅ **Server Members Intent** (Optional / Recommended)
3. **OAuth2 Setup**:
   - Go to the **OAuth2** tab.
   - Copy the **Client ID** (`DISCORD_CLIENT_ID`) and **Client Secret** (`DISCORD_CLIENT_SECRET`).
   - Under **Redirects**, click **Add Redirect** and add:
     - Local: `http://localhost:3000/auth/discord/callback`
     - Production (Render): `https://your-service.onrender.com/auth/discord/callback`
4. **Invite the Bot**:
   - Go to **OAuth2** -> **URL Generator**.
   - Select scopes: `bot`, `identify`, `guilds`.
   - Select bot permissions: `Send Messages`, `Read Messages/View Channels`, `Read Message History`, `Send Messages in Threads`.
   - Copy the generated URL and invite the bot to your Discord server.
5. **Get Your Admin User ID**:
   - In Discord: User Settings -> Advanced -> Turn on **Developer Mode**.
   - Right-click your profile and select **Copy User ID**. This will be placed in `ADMIN_USER_IDS`.

---

## 🗄️ Step 2: Supabase Database Setup

1. Create a free project at [Supabase](https://supabase.com/).
2. In your Supabase Dashboard, open the **SQL Editor**.
3. Copy the entire contents of [`schema.sql`](./schema.sql) and paste it into the editor, then click **Run**.
4. Retrieve your API credentials:
   - Go to **Project Settings** -> **API**.
   - Copy the **Project URL** (`SUPABASE_URL`).
   - Copy the **service_role secret key** (`SUPABASE_SERVICE_ROLE_KEY`) or the `anon` key.

---

## 💻 Step 3: Local Setup & Running

1. **Install Dependencies**:
   ```bash
   npm install
   ```

2. **Configure Environment Variables**:
   ```bash
   cp .env.example .env
   ```
   Fill in your credentials in `.env`:
   ```env
   DISCORD_BOT_TOKEN="your_token"
   DISCORD_CLIENT_ID="your_client_id"
   DISCORD_CLIENT_SECRET="your_client_secret"
   ADMIN_USER_IDS="your_discord_user_id"

   SUPABASE_URL="https://xyz.supabase.co"
   SUPABASE_SERVICE_ROLE_KEY="your_service_role_key"

   PORT=3000
   APP_URL="http://localhost:3000"
   SESSION_SECRET="your_secure_session_secret"

   # Initial AI Key (or configure in Dashboard)
   GEMINI_API_KEY="AIzaSy..."
   ```

3. **Start the Application**:
   ```bash
   # Production mode
   npm start

   # Development mode with hot reload
   npm run dev
   ```

4. Open `http://localhost:3000` in your browser and log in with your Discord account!

---

## ☁️ Step 4: Deploying to Render

This application is engineered for deployment as a **Render Web Service**:

1. Push your repository to GitHub or GitLab.
2. Go to your [Render Dashboard](https://dashboard.render.com/) and click **New +** -> **Web Service**.
3. Connect your repository.
4. Set the build settings:
   - **Environment**: `Node`
   - **Node Version**: `20` (or leave default)
   - **Build Command**: `npm install`
   - **Start Command**: `node src/index.js`
   - **Health Check Path**: `/health`
5. Under **Environment Variables**, add:
   - `DISCORD_BOT_TOKEN`
   - `DISCORD_CLIENT_ID`
   - `DISCORD_CLIENT_SECRET`
   - `ADMIN_USER_IDS`
   - `SUPABASE_URL`
   - `SUPABASE_SERVICE_ROLE_KEY`
   - `APP_URL`: `https://your-service-name.onrender.com` (your Render service URL)
   - `SESSION_SECRET`: A secure random string
   - `GEMINI_API_KEY` (and/or `OPENAI_API_KEY`)
6. **Important**: Copy your Render service URL (e.g. `https://your-bot.onrender.com`) and add `https://your-bot.onrender.com/auth/discord/callback` to the Redirect URIs in your Discord Developer Portal OAuth2 tab.
7. Click **Deploy Web Service**. Render will bind to `process.env.PORT` automatically and monitor `/health`.

---

## ⚙️ AI Provider Presets

The dashboard includes one-click configuration presets for OpenAI-compatible providers:

| Provider | Base URL | Recommended Model |
| :--- | :--- | :--- |
| **Google Gemini** | Built-in SDK | `gemini-1.5-flash` / `gemini-2.0-flash` |
| **OpenAI** | `https://api.openai.com/v1` | `gpt-4o-mini` |
| **Groq** | `https://api.groq.com/openai/v1` | `llama-3.3-70b-versatile` |
| **OpenRouter** | `https://openrouter.ai/api/v1` | `deepseek/deepseek-chat` |
| **DeepSeek** | `https://api.deepseek.com/v1` | `deepseek-chat` |

---

## 🛡️ Security

- **OAuth2 Admin Gate**: Dashboard routes are gated by `ADMIN_USER_IDS`. Unauthorized Discord accounts receive a 403 Forbidden page and are denied access.
- **Session Protection**: Encrypted sessions with HTTP-only cookies and automatic HTTPS proxy trust.
- **CSP Headers**: Configured via Helmet to prevent XSS while allowing modern fonts and Discord avatars.

---

## 📄 License
MIT License. Built for high performance, reliability, and token efficiency.
