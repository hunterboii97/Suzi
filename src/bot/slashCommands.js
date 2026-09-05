import { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } from 'discord.js';

/**
 * Slash Command Definitions for Discord Application Commands (Restricted to Administrators)
 */
export const slashCommands = [
  new SlashCommandBuilder()
    .setName('search')
    .setDescription('Search the live web and chat with Suzi about the findings (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('The question or topic you want to search on the live web')
        .setRequired(true)
    ),
  new SlashCommandBuilder()
    .setName('scrape')
    .setDescription('Scrape a website and chat with Suzi about its content (Admin Only)')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((option) =>
      option
        .setName('url')
        .setDescription('The website URL or link to scrape (e.g. https://example.com)')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('query')
        .setDescription('Optional question, instruction, or prompt about the webpage')
        .setRequired(false)
    ),
];

/**
 * Registers application slash commands globally and clears any guild-level duplicates.
 * 
 * @param {string} token - Discord Bot Token
 * @param {string} clientId - Discord Client Application ID
 * @param {Collection<string, Guild>|Map<string, Guild>} [guilds] - Active bot guilds
 */
export async function registerSlashCommands(token, clientId, guilds = null) {
  if (!token || !clientId) {
    console.warn('⚠️ [SlashCommands] Missing token or clientId. Skipping slash command registration.');
    return;
  }

  try {
    const rest = new REST({ version: '10' }).setToken(token);
    const body = slashCommands.map((cmd) => cmd.toJSON());

    // 1. Clear any guild-specific commands so they don't duplicate global commands
    if (guilds && guilds.size > 0) {
      for (const [guildId] of guilds) {
        try {
          await rest.put(Routes.applicationGuildCommands(clientId, guildId), { body: [] });
        } catch {
          // Ignore if missing permissions or already empty
        }
      }
    }

    // 2. Register globally (single source of truth everywhere)
    console.log('🔄 [SlashCommands] Synchronizing global application (/) commands...');
    await rest.put(Routes.applicationCommands(clientId), { body });
    console.log('✅ [SlashCommands] Global /search and /scrape registered with 0 duplicates!');
  } catch (err) {
    console.error('⚠️ [SlashCommands] Failed to register application commands:', err.message);
  }
}
