import { supabase, flushAllHistory, flushChannelHistory } from '../database/supabase.js';

// Inactivity threshold: 2 hours in milliseconds (7,200,000 ms)
const INACTIVITY_TIMEOUT_MS = 2 * 60 * 60 * 1000;
// Maximum messages to retain per channel for token efficiency
const MAX_HISTORY_MESSAGES = 10;

/**
 * MemoryManager handles channel-isolated conversation contexts and automatic 2-hour resets.
 */
export class MemoryManager {
  /**
   * Retrieves active conversation history for a channel, automatically resetting if inactive for >2 hours.
   * @param {string} channelId
   * @returns {Promise<Array<{role: string, content: string}>>}
   */
  static async getHistory(channelId) {
    if (!supabase || !channelId) return [];

    try {
      // 1. Fetch the most recent message in this channel to check inactivity window
      const { data: latestRecords, error: checkError } = await supabase
        .from('conversation_history')
        .select('created_at')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(1);

      if (checkError) {
        console.error(`❌ [MemoryManager] Error checking last message time for ${channelId}:`, checkError.message);
        return [];
      }

      // If records exist, check elapsed time
      if (latestRecords && latestRecords.length > 0) {
        const lastTimestamp = new Date(latestRecords[0].created_at).getTime();
        const elapsed = Date.now() - lastTimestamp;

        if (elapsed > INACTIVITY_TIMEOUT_MS) {
          console.log(`⏱️ [MemoryManager] Inactivity timeout (${Math.round(elapsed / 60000)}m > 120m) for channel ${channelId}. Wiping old memory...`);
          await flushChannelHistory(channelId);
          return [];
        }
      }

      // 2. Fetch the sliding window of recent conversation history (ordered newest first, then reverse)
      const { data: messages, error: fetchError } = await supabase
        .from('conversation_history')
        .select('role, content, created_at')
        .eq('channel_id', channelId)
        .order('created_at', { ascending: false })
        .limit(MAX_HISTORY_MESSAGES);

      if (fetchError) {
        console.error(`❌ [MemoryManager] Error fetching messages for ${channelId}:`, fetchError.message);
        return [];
      }

      if (!messages || messages.length === 0) {
        return [];
      }

      // Reverse so messages are in chronological order (oldest to newest)
      return messages.reverse().map((msg) => ({
        role: msg.role,
        content: msg.content,
      }));
    } catch (err) {
      console.error(`❌ [MemoryManager] Unexpected error getting history for ${channelId}:`, err);
      return [];
    }
  }

  /**
   * Persists a message to Supabase conversation history.
   * @param {string} channelId
   * @param {string} userId
   * @param {'user'|'assistant'|'system'} role
   * @param {string} content
   */
  static async saveMessage(channelId, userId, role, content) {
    if (!supabase || !channelId || !content) return;

    try {
      const { error } = await supabase
        .from('conversation_history')
        .insert({
          channel_id: channelId,
          user_id: userId || null,
          role,
          content: content.trim(),
          created_at: new Date().toISOString(),
        });

      if (error) {
        console.error(`❌ [MemoryManager] Failed to save message for channel ${channelId}:`, error.message);
      }
    } catch (err) {
      console.error(`❌ [MemoryManager] Unexpected error saving message:`, err);
    }
  }

  /**
   * Clears context for a specific channel.
   * @param {string} channelId
   */
  static async wipeChannel(channelId) {
    return await flushChannelHistory(channelId);
  }

  /**
   * Clears all context memory across the entire bot.
   */
  static async wipeAll() {
    return await flushAllHistory();
  }
}
