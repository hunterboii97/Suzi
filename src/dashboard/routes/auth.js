import express from 'express';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

/**
 * Helper to parse comma-separated admin user IDs from environment variables.
 * @returns {string[]}
 */
export function getAdminUserIds() {
  const envAdmins = process.env.ADMIN_USER_IDS || '';
  return envAdmins
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id.length > 0);
}

/**
 * Compute the OAuth2 redirect URI based on environment settings.
 */
function getRedirectUri(req) {
  // If APP_URL is explicitly set and is not localhost
  if (process.env.APP_URL && !process.env.APP_URL.includes('localhost')) {
    let cleanUrl = process.env.APP_URL.trim().replace(/\/$/, '');
    if (!cleanUrl.startsWith('http://') && !cleanUrl.startsWith('https://')) {
      cleanUrl = `https://${cleanUrl}`;
    }
    return `${cleanUrl}/auth/discord/callback`;
  }

  // Dynamic detection from incoming request headers (e.g. Railway reverse proxy)
  const host = req.get('x-forwarded-host') || req.get('host');
  const isHttps = req.protocol === 'https' || req.get('x-forwarded-proto') === 'https' || (process.env.NODE_ENV === 'production' && !host.includes('localhost'));
  const protocol = isHttps ? 'https' : 'http';
  return `${protocol}://${host}/auth/discord/callback`;
}

// 1. Render Login Page
router.get('/login', (req, res) => {
  if (req.session && req.session.user) {
    return res.redirect('/dashboard');
  }
  res.render('login', {
    error: req.query.error || null,
  });
});

// 2. Redirect to Discord OAuth2 Authorize Endpoint
router.get('/discord', (req, res) => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId || clientId === 'your_discord_client_id_here') {
    return res.status(500).send('DISCORD_CLIENT_ID is not configured in .env');
  }

  const redirectUri = getRedirectUri(req);
  console.log(`🔗 [OAuth2] Authorize request initiated with redirect_uri: "${redirectUri}"`);

  const discordAuthUrl = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
    redirectUri
  )}&response_type=code&scope=identify%20guilds`;

  res.redirect(discordAuthUrl);
});

// 3. Discord OAuth2 Callback
router.get('/discord/callback', async (req, res) => {
  const { code, error } = req.query;

  if (error || !code) {
    return res.redirect(`/auth/login?error=${encodeURIComponent(error || 'Authorization was cancelled')}`);
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  const redirectUri = getRedirectUri(req);
  console.log(`🔗 [OAuth2] Exchanging code with redirect_uri: "${redirectUri}"`);

  try {
    // Exchange authorization code for access token
    const tokenResponse = await fetch('https://discord.com/api/oauth2/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        grant_type: 'authorization_code',
        code: code.toString(),
        redirect_uri: redirectUri,
      }),
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      console.error('❌ [Auth] Failed to exchange code for token:', errText);
      return res.redirect('/auth/login?error=Failed+to+exchange+OAuth2+token');
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user profile from Discord
    const userResponse = await fetch('https://discord.com/api/users/@me', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userResponse.ok) {
      console.error('❌ [Auth] Failed to fetch user profile from Discord');
      return res.redirect('/auth/login?error=Failed+to+fetch+user+profile');
    }

    const discordUser = await userResponse.json();
    const adminIds = getAdminUserIds();

    // Check if user ID is listed in ADMIN_USER_IDS
    const isAuthorized = adminIds.includes(discordUser.id);

    if (!isAuthorized) {
      console.warn(`🔒 [Auth] Access Denied for Discord user ${discordUser.username} (ID: ${discordUser.id}). Not in ADMIN_USER_IDS.`);
      return res.status(403).render('unauthorized', {
        user: discordUser,
        adminListConfigured: adminIds.length > 0,
      });
    }

    // Set authorized user in session
    const avatarUrl = discordUser.avatar
      ? `https://cdn.discordapp.com/avatars/${discordUser.id}/${discordUser.avatar}.png`
      : `https://cdn.discordapp.com/embed/avatars/${parseInt(discordUser.discriminator || '0', 10) % 5}.png`;

    req.session.user = {
      id: discordUser.id,
      username: discordUser.username,
      globalName: discordUser.global_name || discordUser.username,
      discriminator: discordUser.discriminator,
      avatarUrl,
    };

    console.log(`✅ [Auth] Admin user logged in: ${discordUser.username} (${discordUser.id})`);
    res.redirect('/dashboard');
  } catch (err) {
    console.error('❌ [Auth] Unexpected OAuth2 callback error:', err);
    res.redirect('/auth/login?error=Unexpected+authentication+error');
  }
});

// 4. Logout
router.get('/logout', (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error('Error destroying session:', err);
    }
    res.redirect('/auth/login');
  });
});

export default router;
