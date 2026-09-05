import { getBotSettings } from '../database/supabase.js';
import { MemoryManager } from './memoryManager.js';
import { AIService } from './aiService.js';
import { executeSearchCommand, executeScrapeCommand, isUserAdmin } from './commandHandler.js';

// Common command prefixes to ignore in auto-chat channel (excluding /search and /scrape)
const COMMAND_PREFIXES = ['!', '/', '.', '$', '?', '-', '~', '>', ','];

/**
 * Splits a long text into chunks <= maxLength (Discord limit is 2000),
 * safely handling markdown code blocks, paragraphs, and sentences.
 * 
 * @param {string} text 
 * @param {number} maxLength 
 * @returns {string[]}
 */
export function splitMessage(text, maxLength = 1950) {
  if (!text) return [];
  if (text.length <= maxLength) return [text];

  const chunks = [];
  let remaining = text;
  let inCodeBlock = false;
  let codeBlockLang = '';

  while (remaining.length > 0) {
    const prefix = inCodeBlock ? `\`\`\`${codeBlockLang}\n` : '';
    const availableLength = Math.max(100, maxLength - prefix.length - 10);

    let chunkText = '';
    if (remaining.length <= availableLength) {
      chunkText = remaining;
      remaining = '';
    } else {
      let slice = remaining.slice(0, availableLength);

      const doubleNewline = slice.lastIndexOf('\n\n');
      const singleNewline = slice.lastIndexOf('\n');
      const sentenceEnd = Math.max(slice.lastIndexOf('. '), slice.lastIndexOf('! '), slice.lastIndexOf('? '));
      const spaceIndex = slice.lastIndexOf(' ');

      let splitIndex = availableLength;
      if (doubleNewline > availableLength * 0.5) {
        splitIndex = doubleNewline + 2;
      } else if (singleNewline > availableLength * 0.5) {
        splitIndex = singleNewline + 1;
      } else if (sentenceEnd > availableLength * 0.5) {
        splitIndex = sentenceEnd + 2;
      } else if (spaceIndex > availableLength * 0.3) {
        splitIndex = spaceIndex + 1;
      }

      chunkText = remaining.slice(0, splitIndex);
      remaining = remaining.slice(splitIndex);
    }

    const matches = chunkText.match(/```(\w*)/g) || [];
    const toggleCount = matches.length;

    let finalChunk = prefix + chunkText;

    if (inCodeBlock) {
      if (toggleCount % 2 !== 0) {
        // Closed the code block in this chunk
        inCodeBlock = false;
        codeBlockLang = '';
      } else if (remaining.length > 0) {
        // Still open at the end of this chunk
        finalChunk += '\n```';
      }
    } else {
      if (toggleCount % 2 !== 0) {
        // Started a code block that remains unclosed
        inCodeBlock = true;
        const lastMatch = matches[matches.length - 1];
        codeBlockLang = lastMatch.replace('```', '').trim();
        if (remaining.length > 0) {
          finalChunk += '\n```';
        }
      }
    }

    chunks.push(finalChunk.trim());
  }

  return chunks.filter((c) => c.length > 0);
}

/**
 * Handles incoming Discord messages according to channel rules and mention triggers.
 * 
 * @param {import('discord.js').Message} message 
 * @param {import('discord.js').Client} client 
 */
export async function handleMessage(message, client) {
  // 1. Strictly ignore bot messages and system messages
  if (!message || message.author?.bot || message.system) {
    return;
  }

  // 2. Check for explicit text commands (/search or /scrape), including when @bot is mentioned
  const rawContent = (message.content || '').trim();
  const botMentionRegex = new RegExp(`^<@!?${client.user.id}>\\s*`, 'i');
  const isMentionedDirectly = botMentionRegex.test(rawContent) || message.mentions.has(client.user.id);
  const cleanCmdText = rawContent.replace(botMentionRegex, '').trim();

  const isSearchCmd = /^\/search\b|^!search\b/i.test(cleanCmdText) || (isMentionedDirectly && /^search\b/i.test(cleanCmdText));
  const isScrapeCmd = /^\/scrape\b|^!scrape\b/i.test(cleanCmdText) || (isMentionedDirectly && /^scrape\b/i.test(cleanCmdText));

  // Enforce Administrator-only access for text-based /search and /scrape commands
  if (isSearchCmd || isScrapeCmd) {
    const hasAdminAccess = isUserAdmin({
      userId: message.author.id,
      member: message.member,
      guild: message.guild,
    });

    if (!hasAdminAccess) {
      const cmdName = isSearchCmd ? 'search' : 'scrape';
      console.warn(`🔒 [MessageHandler] Denied /${cmdName} to non-admin @${message.author.username} (${message.author.id})`);
      await message.reply({
        content: `⛔ **Access Denied**: The \`/${cmdName}\` command is restricted to administrators only.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  }

  // A. Dedicated /search Tool + Chat execution
  if (isSearchCmd) {
    const query = cleanCmdText.replace(/^(\/search|!search|search)\s*/i, '').trim();
    console.log(`🔍 [MessageHandler] Intercepted /search query from @${message.author.username}: "${query}"`);
    const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
    message.channel.sendTyping().catch(() => {});

    try {
      await executeSearchCommand({
        query,
        channelId: message.channel.id,
        userId: message.author.id,
        userTag: message.author.tag || message.author.username,
        botUserId: client.user.id,
        member: message.member,
        guild: message.guild,
        replyCallback: async (chunks) => {
          clearInterval(typingInterval);
          for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
              await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
            } else {
              await message.channel.send({ content: chunks[i] });
            }
          }
        },
      });
    } catch (err) {
      clearInterval(typingInterval);
      console.error('❌ [MessageHandler] /search error:', err);
      await message.reply({
        content: `⚠️ Error executing web search: ${err.message}`,
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }

  // B. Dedicated /scrape Tool + Chat execution
  if (isScrapeCmd) {
    const rest = cleanCmdText.replace(/^(\/scrape|!scrape|scrape)\s*/i, '').trim();
    console.log(`🌐 [MessageHandler] Intercepted /scrape from @${message.author.username}: "${rest}"`);
    const parts = rest.split(/\s+/);
    const targetUrl = parts[0] || '';
    const userPrompt = parts.slice(1).join(' ') || '';

    const typingInterval = setInterval(() => message.channel.sendTyping().catch(() => {}), 8000);
    message.channel.sendTyping().catch(() => {});

    try {
      await executeScrapeCommand({
        targetUrl,
        userPrompt,
        channelId: message.channel.id,
        userId: message.author.id,
        userTag: message.author.tag || message.author.username,
        botUserId: client.user.id,
        member: message.member,
        guild: message.guild,
        replyCallback: async (chunks) => {
          clearInterval(typingInterval);
          for (let i = 0; i < chunks.length; i++) {
            if (i === 0) {
              await message.reply({ content: chunks[i], allowedMentions: { repliedUser: false } });
            } else {
              await message.channel.send({ content: chunks[i] });
            }
          }
        },
      });
    } catch (err) {
      clearInterval(typingInterval);
      console.error('❌ [MessageHandler] /scrape error:', err);
      await message.reply({
        content: `⚠️ Error scraping webpage: ${err.message}`,
        allowedMentions: { repliedUser: false },
      });
    }
    return;
  }

  // 3. Normal Conversational Chat Logic (0 Tools)
  const settings = await getBotSettings();
  const autoChannelId = settings.auto_channel_id || process.env.AUTO_CHANNEL_ID;
  const isAutoChannel = Boolean(autoChannelId && message.channel.id === autoChannelId);
  const isDM = !message.guild;

  // Determine if the bot was directly mentioned or replied to
  const isMentioned = message.mentions.has(client.user.id);
  let isReplyingToBot = false;

  if (message.reference && message.reference.messageId) {
    try {
      const referencedMsg = await message.channel.messages.fetch(message.reference.messageId);
      if (referencedMsg && referencedMsg.author?.id === client.user.id) {
        isReplyingToBot = true;
      }
    } catch {
      // Message might be deleted or uncached; ignore error
    }
  }

  // 4. Trigger Decision Logic:
  // - In DMs: always respond
  // - In dedicated auto-chat channel: respond to all messages unless starting with an unrelated command prefix.
  // - In all other channels: ONLY respond if @mentioned or replied to.
  let shouldTrigger = false;

  if (isDM) {
    shouldTrigger = true;
  } else if (isAutoChannel) {
    const trimmed = message.content.trim();
    const isCommand = COMMAND_PREFIXES.some((prefix) => trimmed.startsWith(prefix));
    if (!isCommand && trimmed.length > 0) {
      shouldTrigger = true;
    }
  } else if (isMentioned || isReplyingToBot) {
    shouldTrigger = true;
  }

  if (!shouldTrigger) {
    return;
  }

  // 5. Clean user prompt (remove @bot mention tag)
  const cleanPrompt = message.content.replace(botMentionRegex, '').trim();

  if (!cleanPrompt) {
    // User only pinged the bot without text
    await message.reply({
      content: "hey! what's on your mind?",
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  // 6. Manage active typing indicator loop
  let typingInterval = null;
  const startTyping = async () => {
    try {
      await message.channel.sendTyping();
    } catch {
      // Channel permissions might prevent typing; ignore
    }
  };

  await startTyping();
  // Refresh typing indicator every 8 seconds (Discord typing indicator times out around 9-10s)
  typingInterval = setInterval(startTyping, 8000);

  try {
    const channelId = message.channel.id;
    const userId = message.author.id;
    const userTag = message.author.tag || message.author.username;

    // 7. Retrieve context history (with automatic 2-hour inactivity reset)
    const history = await MemoryManager.getHistory(channelId);

    // 8. Generate response via Multi-Provider AI Service
    const { reply } = await AIService.generateReply({
      prompt: cleanPrompt,
      history,
      channelId,
      userId,
      userTag,
    });

    // 9. Persist user message and assistant reply in memory
    const replyText = (reply && reply.trim()) || "I couldn't generate a response. Please try again.";
    await MemoryManager.saveMessage(channelId, userId, 'user', cleanPrompt);
    await MemoryManager.saveMessage(channelId, client.user.id, 'assistant', replyText);

    // 10. Split response into clean chunks if >2000 chars
    const chunks = splitMessage(replyText, 1950);

    // 11. Send chunks to Discord
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      if (i === 0) {
        // First chunk sent as reply to user message without pinging
        await message.reply({
          content: chunk,
          allowedMentions: { repliedUser: false },
        });
      } else {
        // Subsequent chunks sent as regular channel messages
        await message.channel.send({
          content: chunk,
        });
      }
    }
  } catch (err) {
    console.error('❌ [MessageHandler] Unhandled error responding to message:', err);
    try {
      await message.reply({
        content: '⚠️ Something went wrong processing your request. Please try again in a moment.',
        allowedMentions: { repliedUser: false },
      });
    } catch {
      // Ignore if reply also fails
    }
  } finally {
    if (typingInterval) {
      clearInterval(typingInterval);
    }
  }
}
