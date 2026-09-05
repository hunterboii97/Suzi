import { Client, GatewayIntentBits, Partials, ActivityType, Events } from 'discord.js';
import { handleMessage } from './messageHandler.js';
import { registerSlashCommands } from './slashCommands.js';
import { executeSearchCommand, executeScrapeCommand, isUserAdmin } from './commandHandler.js';
import dotenv from 'dotenv';

dotenv.config();

export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message, Partials.User],
});

let isReady = false;
let botStartTime = null;

// Ready event handler
client.once(Events.ClientReady, async (c) => {
  isReady = true;
  botStartTime = Date.now();
  console.log(`🤖 [DiscordBot] Successfully logged in as ${c.user.tag} (ID: ${c.user.id})`);
  console.log(`📡 [DiscordBot] Connected to ${c.guilds.cache.size} server(s).`);

  // Set initial presence (Clean online status, no watching status)
  const activityName = process.env.DISCORD_ACTIVITY || null;
  c.user.setPresence({
    activities: activityName ? [{ name: activityName, type: ActivityType.Custom }] : [],
    status: 'online',
  });

  // Register /search and /scrape slash commands with Discord REST API (instantly per-guild & globally)
  const clientId = process.env.DISCORD_CLIENT_ID || c.user.id;
  registerSlashCommands(process.env.DISCORD_BOT_TOKEN, clientId, c.guilds.cache).catch((err) => {
    console.warn('⚠️ [DiscordBot] Slash command registration notice:', err.message);
  });
});

// When joined to a new guild, register commands instantly
client.on(Events.GuildCreate, async (guild) => {
  console.log(`🏰 [DiscordBot] Joined new guild: "${guild.name}" (${guild.id}). Registering commands...`);
  const clientId = process.env.DISCORD_CLIENT_ID || client.user.id;
  registerSlashCommands(process.env.DISCORD_BOT_TOKEN, clientId, new Map([[guild.id, guild]])).catch(() => { });
});

// Slash command interaction handler (Admin Only for /search and /scrape)
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;

  // Enforce Administrator-only access for /search and /scrape commands
  if (commandName === 'search' || commandName === 'scrape') {
    const hasAdminAccess = isUserAdmin({
      userId: interaction.user.id,
      member: interaction.member,
      guild: interaction.guild,
    });

    if (!hasAdminAccess) {
      console.warn(`🔒 [DiscordBot] Denied /${commandName} to non-admin @${interaction.user.tag} (${interaction.user.id})`);
      await interaction.reply({
        content: `⛔ **Access Denied**: The \`/${commandName}\` command is restricted to administrators only.`,
        ephemeral: true,
      });
      return;
    }
  }

  try {
    if (commandName === 'search') {
      const query = interaction.options.getString('query', true);
      await interaction.deferReply();

      await executeSearchCommand({
        query,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag || interaction.user.username,
        botUserId: client.user.id,
        member: interaction.member,
        guild: interaction.guild,
        replyCallback: async (chunks) => {
          for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
              await interaction.editReply({ content: chunks[i] });
            } else {
              await interaction.followUp({ content: chunks[i] });
            }
          }
        },
      });
    } else if (commandName === 'scrape') {
      const targetUrl = interaction.options.getString('url', true);
      const userPrompt = interaction.options.getString('query', false) || '';
      await interaction.deferReply();

      await executeScrapeCommand({
        targetUrl,
        userPrompt,
        channelId: interaction.channelId,
        userId: interaction.user.id,
        userTag: interaction.user.tag || interaction.user.username,
        botUserId: client.user.id,
        member: interaction.member,
        guild: interaction.guild,
        replyCallback: async (chunks) => {
          for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
              await interaction.editReply({ content: chunks[i] });
            } else {
              await interaction.followUp({ content: chunks[i] });
            }
          }
        },
      });
    }
  } catch (err) {
    console.error(`❌ [DiscordBot] Error executing /${commandName} slash command:`, err);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ content: `⚠️ Error executing /${commandName}: ${err.message}` }).catch(() => { });
    } else {
      await interaction.reply({ content: `⚠️ Error executing /${commandName}: ${err.message}`, ephemeral: true }).catch(() => { });
    }
  }
});

// Incoming message event handler
client.on('messageCreate', async (message) => {
  try {
    await handleMessage(message, client);
  } catch (err) {
    console.error('❌ [DiscordBot] Error handling message event:', err);
  }
});

client.on('error', (err) => {
  console.error('❌ [DiscordBot] Discord Client error:', err);
});

client.on('warn', (warning) => {
  console.warn('⚠️ [DiscordBot] Discord Client warning:', warning);
});

/**
 * Initializes and logs in the Discord Bot.
 * @returns {Promise<Client>}
 */
export async function initBot() {
  const token = process.env.DISCORD_BOT_TOKEN;
  if (!token || token === 'your_discord_bot_token_here') {
    console.warn('⚠️ [DiscordBot] DISCORD_BOT_TOKEN is not configured in .env. Bot startup skipped.');
    return null;
  }

  try {
    console.log('🔄 [DiscordBot] Connecting to Discord Gateway...');
    await client.login(token);
    return client;
  } catch (err) {
    console.error('❌ [DiscordBot] Failed to log in to Discord:', err.message);
    return null;
  }
}

/**
 * Returns current real-time telemetry of the Discord Bot for the Web Dashboard.
 */
export function getBotTelemetry() {
  if (!isReady || !client.user) {
    return {
      online: false,
      username: 'Offline / Not Connected',
      avatarUrl: null,
      guildCount: 0,
      ping: -1,
      uptimeSeconds: 0,
    };
  }

  return {
    online: true,
    tag: client.user.tag,
    id: client.user.id,
    avatarUrl: client.user.displayAvatarURL({ dynamic: true }),
    guildCount: client.guilds.cache.size,
    ping: Math.round(client.ws.ping),
    uptimeSeconds: botStartTime ? Math.floor((Date.now() - botStartTime) / 1000) : 0,
  };
}
