import express from 'express';
import session from 'express-session';
import path from 'path';
import { fileURLToPath } from 'url';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import dotenv from 'dotenv';

import authRouter from './routes/auth.js';
import dashboardRouter from './routes/dashboard.js';
import { getBotTelemetry } from '../bot/client.js';
import { getDashboardStats } from '../database/supabase.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();

  // Logging
  if (process.env.NODE_ENV !== 'production') {
    app.use(morgan('dev'));
  } else {
    app.use(morgan('combined'));
  }

  // Security Headers (Configured to permit Tailwind CDN, Google Fonts, Discord CDN, and inline event handlers)
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: [
            "'self'",
            "'unsafe-inline'",
            "'unsafe-eval'",
            'https://cdn.tailwindcss.com',
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com',
          ],
          scriptSrcAttr: ["'unsafe-inline'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            'https://fonts.googleapis.com',
            'https://cdn.jsdelivr.net',
            'https://cdnjs.cloudflare.com',
          ],
          styleSrcAttr: ["'unsafe-inline'"],
          fontSrc: ["'self'", 'https://fonts.gstatic.com', 'https://cdnjs.cloudflare.com'],
          imgSrc: [
            "'self'",
            'data:',
            'https://cdn.discordapp.com',
            'https://images.unsplash.com',
            'https://api.dicebear.com',
          ],
          connectSrc: ["'self'"],
        },
      },
      crossOriginEmbedderPolicy: false,
    })
  );

  app.use(cors());
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  // Static Assets
  app.use(express.static(path.join(__dirname, 'public')));

  // Session Middleware
  const isProduction = process.env.NODE_ENV === 'production';
  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'discord-ai-bot-super-secret-key-2025',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: isProduction, // Uses HTTPS in production on Render
        httpOnly: true,
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );

  // Trust first proxy for Render / Railway HTTPS reverse proxies
  if (isProduction || process.env.RENDER || process.env.RAILWAY_ENVIRONMENT || process.env.RAILWAY_STATIC_URL) {
    app.set('trust proxy', 1);
  }

  // View Engine (EJS)
  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));

  // Prevent service worker 404 logs from browser extensions / PWA probes
  app.get('/service-worker.js', (req, res) => res.status(204).end());

  // 1. Health Check Endpoint (For Render Port Binding & Uptime Monitors)
  app.get('/health', async (req, res) => {
    try {
      const botTelemetry = getBotTelemetry();
      const dbStats = await getDashboardStats();

      res.status(200).json({
        status: 'ok',
        uptime: process.uptime(),
        timestamp: new Date().toISOString(),
        bot: {
          online: botTelemetry.online,
          guilds: botTelemetry.guildCount,
          ping: botTelemetry.ping,
        },
        database: {
          connected: dbStats.dbConnected,
          activeMemoryRecords: dbStats.activeMemoryRecords,
        },
      });
    } catch (err) {
      res.status(200).json({ status: 'degraded', error: err.message });
    }
  });

  // 2. Root Redirect
  app.get('/', (req, res) => {
    if (req.session && req.session.user) {
      res.redirect('/dashboard');
    } else {
      res.redirect('/auth/login');
    }
  });

  // 3. Mount Route Handlers
  app.use('/auth', authRouter);
  app.use('/dashboard', dashboardRouter);

  // 4. 404 Handler
  app.use((req, res) => {
    res.status(404).send(`
      <!DOCTYPE html>
      <html lang="en">
        <head>
          <meta charset="UTF-8">
          <title>404 Not Found | Suzi AI</title>
          <script src="https://cdn.tailwindcss.com"></script>
          <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;800&family=JetBrains+Mono:wght@500&display=swap" rel="stylesheet">
          <link rel="stylesheet" href="/css/style.css">
        </head>
        <body class="bg-[#000000] text-[#ededed] min-h-screen flex items-center justify-center font-['Plus_Jakarta_Sans',sans-serif] p-4">
          <div class="text-center p-8 bg-[#080808] border border-[#1a1a1a] rounded-3xl max-w-md shadow-2xl shadow-black">
            <h1 class="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-violet-400 to-cyan-400 mb-4 font-mono">404</h1>
            <p class="text-zinc-400 text-sm mb-6">Page not found or route does not exist.</p>
            <a href="/dashboard" class="inline-flex items-center gap-2 px-6 py-2.5 bg-[#111] hover:bg-[#1a1a1a] border border-[#262626] text-white text-xs font-semibold rounded-xl transition-all shadow-lg hover:border-violet-500/50">Return to Dashboard</a>
          </div>
        </body>
      </html>
    `);
  });

  return app;
}
