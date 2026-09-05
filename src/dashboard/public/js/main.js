/**
 * Frontend Controller for Suzi OLED Black Web Dashboard & Prompt Studio
 */

// 1. Toast Notification Helper
function showToast(message, type = 'success') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  const isSuccess = type === 'success';

  toast.className = `pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl border text-xs font-semibold shadow-2xl backdrop-blur-2xl transition-all duration-300 transform translate-x-8 opacity-0 ${
    isSuccess
      ? 'bg-[#05130b] border-emerald-500/40 text-emerald-300 shadow-emerald-950/40'
      : 'bg-[#180509] border-rose-500/40 text-rose-300 shadow-rose-950/40'
  }`;

  toast.innerHTML = `
    <i class="fa-solid ${isSuccess ? 'fa-circle-check text-emerald-400' : 'fa-circle-exclamation text-rose-400'} text-sm shrink-0"></i>
    <span>${message}</span>
  `;

  container.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove('translate-x-8', 'opacity-0');
  });

  setTimeout(() => {
    toast.classList.add('translate-x-8', 'opacity-0');
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

// 2. Toggle Provider UI Panels
function toggleProviderUI(provider) {
  const geminiFields = document.getElementById('gemini-fields');
  const openaiFields = document.getElementById('openai-fields');
  const tabGemini = document.getElementById('tab-gemini');
  const tabOpenai = document.getElementById('tab-openai');
  const providerInput = document.getElementById('provider-input');

  if (provider === 'gemini') {
    geminiFields?.classList.remove('hidden');
    openaiFields?.classList.add('hidden');
    tabGemini?.classList.add('bg-white', 'text-black');
    tabGemini?.classList.remove('text-slate-400', 'hover:text-white');
    tabOpenai?.classList.remove('bg-white', 'text-black');
    tabOpenai?.classList.add('text-slate-400', 'hover:text-white');
    if (providerInput) providerInput.value = 'gemini';
  } else {
    openaiFields?.classList.remove('hidden');
    geminiFields?.classList.add('hidden');
    tabOpenai?.classList.add('bg-white', 'text-black');
    tabOpenai?.classList.remove('text-slate-400', 'hover:text-white');
    tabGemini?.classList.remove('bg-white', 'text-black');
    tabGemini?.classList.add('text-slate-400', 'hover:text-white');
    if (providerInput) providerInput.value = 'openai';
  }
}

// 3. Preset Switcher for OpenAI-Compatible Endpoints
function applyPreset(type) {
  const modelInput = document.getElementById('openai_model');
  const baseUrlInput = document.getElementById('openai_base_url');

  if (type === 'nvidia') {
    if (modelInput) modelInput.value = 'meta/llama-3.2-11b-vision-instruct';
    if (baseUrlInput) baseUrlInput.value = 'https://integrate.api.nvidia.com/v1';
    showToast('Applied NVIDIA NIM preset (meta/llama-3.2-11b-vision-instruct)');
  } else if (type === 'groq') {
    if (modelInput) modelInput.value = 'llama-3.3-70b-versatile';
    if (baseUrlInput) baseUrlInput.value = 'https://api.groq.com/openai/v1';
    showToast('Applied Groq preset (llama-3.3-70b-versatile)');
  } else if (type === 'openai') {
    if (modelInput) modelInput.value = 'gpt-4o-mini';
    if (baseUrlInput) baseUrlInput.value = 'https://api.openai.com/v1';
    showToast('Applied OpenAI preset (gpt-4o-mini)');
  } else if (type === 'deepseek') {
    if (modelInput) modelInput.value = 'deepseek-chat';
    if (baseUrlInput) baseUrlInput.value = 'https://api.deepseek.com/v1';
    showToast('Applied DeepSeek preset (deepseek-chat)');
  } else if (type === 'openrouter') {
    if (modelInput) modelInput.value = 'deepseek/deepseek-chat';
    if (baseUrlInput) baseUrlInput.value = 'https://openrouter.ai/api/v1';
    showToast('Applied OpenRouter preset');
  }
}

// 4. System Prompt Studio: Live Character & Word Counters
function updatePromptCounters() {
  const textarea = document.getElementById('system_instruction');
  const counterElem = document.getElementById('prompt-counter');
  if (!textarea || !counterElem) return;

  const text = textarea.value || '';
  const charCount = text.length;
  const wordCount = text.trim() ? text.trim().split(/\s+/).length : 0;
  const estTokens = Math.ceil(charCount / 4);

  counterElem.innerText = `${charCount} chars | ${wordCount} words (~${estTokens} tokens)`;
}

// 5. System Prompt Presets
function applyPersonaPreset(type) {
  const textarea = document.getElementById('system_instruction');
  if (!textarea) return;

  if (type === 'default') {
    textarea.value = `You are Suzi, a witty, natural, and concise AI Discord companion.
Identity: Your name is Suzi. You are an AI living on Discord.

Core Behavioral Rules:
1. When asked for your name or identity, proudly and directly say your name is Suzi.
2. Answer naturally with concise, clean formatting. Avoid long robotic essays unless asked for code or deep explanations.
3. Media / GIFs: Discord markdown cannot render local animated GIF files; never output fake markdown image links like ![gif](...). Use expressive emojis or playful text instead.
4. Keep the vibe friendly, authentic, and direct.`;
    showToast('Applied "Suzi Default" persona');
  } else if (type === 'witty') {
    textarea.value = `You are Suzi, a playful, witty, and slightly sarcastic Discord companion.
Identity: Your name is Suzi.
Style: Talk like an actual Discord server member. Use casual lowercase touches, witty humor, and dry sarcasm when appropriate. Never sound like a corporate FAQ bot. Keep answers sharp and entertaining.`;
    showToast('Applied "Witty & Sarcastic" persona');
  } else if (type === 'developer') {
    textarea.value = `You are Suzi, an elite senior software engineer Discord bot.
Identity: Your name is Suzi.
Style: Clean, idiomatic markdown code blocks. Zero fluff. Explain bugs and architecture concisely in bullet points. Focus on performance, modern best practices, and elegant patterns.`;
    showToast('Applied "Senior Developer" persona');
  } else if (type === 'minimalist') {
    textarea.value = `You are Suzi, an ultra-concise AI assistant.
Identity: Your name is Suzi.
Style: Maximum 1 to 2 sentences per answer unless explicitly asked for deep detail. Direct, helpful, zero filler phrases.`;
    showToast('Applied "Minimalist" persona');
  }

  updatePromptCounters();
}

function resetPromptToDefault() {
  if (confirm('Reset system prompt to default Suzi instructions?')) {
    applyPersonaPreset('default');
  }
}

// 6. Password / Key Visibility Toggle
function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (!input) return;
  input.type = input.type === 'password' ? 'text' : 'password';
}

// 7. Interactive Live "Test AI Connection" Tool
async function testAiConnection() {
  const btn = document.getElementById('btn-test-ai');
  const resultCard = document.getElementById('test-ai-result');
  const resultText = document.getElementById('test-ai-output');
  const resultMeta = document.getElementById('test-ai-meta');

  if (!btn) return;

  const originalHtml = btn.innerHTML;
  btn.disabled = true;
  btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Testing Connection...';

  const provider = document.getElementById('provider-input')?.value || 'openai';
  const isGemini = provider === 'gemini';

  const apiKey = isGemini
    ? document.getElementById('gemini_api_key')?.value
    : document.getElementById('openai_api_key')?.value;

  const modelName = isGemini
    ? document.getElementById('gemini_model')?.value
    : document.getElementById('openai_model')?.value;

  const baseURL = document.getElementById('openai_base_url')?.value || 'https://api.openai.com/v1';

  try {
    const res = await fetch('/dashboard/api/test-ai', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        provider,
        apiKey,
        modelName,
        baseURL,
      }),
    });

    const data = await res.json();

    if (resultCard && resultText && resultMeta) {
      resultCard.classList.remove('hidden');
      if (data.success) {
        resultCard.className = 'mt-4 p-4 rounded-xl border bg-[#05130b] border-emerald-500/40 text-xs';
        resultMeta.innerHTML = `<span class="text-emerald-400 font-bold"><i class="fa-solid fa-circle-check mr-1"></i> Connection Verified</span> &bull; <span class="font-mono text-slate-400">${data.latencyMs}ms</span> &bull; Model: <span class="font-mono text-emerald-300">${data.model}</span>`;
        resultText.innerText = data.reply;
        showToast(`AI Connection Verified (${data.latencyMs}ms)!`, 'success');
      } else {
        resultCard.className = 'mt-4 p-4 rounded-xl border bg-[#180509] border-rose-500/40 text-xs';
        resultMeta.innerHTML = `<span class="text-rose-400 font-bold"><i class="fa-solid fa-circle-xmark mr-1"></i> Connection Failed</span> &bull; <span class="font-mono text-slate-400">${data.latencyMs}ms</span>`;
        resultText.innerText = data.error || 'Connection failed. Please verify API key, model name, and base URL.';
        showToast('AI Connection Failed', 'error');
      }
    }
  } catch (err) {
    showToast(`Network error testing connection: ${err.message}`, 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = originalHtml;
  }
}

// 8. AJAX Settings Form Submission
async function saveAllSettings(event) {
  if (event) event.preventDefault();

  const form = document.getElementById('settings-form');
  const btnSettings = document.getElementById('btn-save-settings');
  const btnPrompt = document.getElementById('btn-save-prompt');
  if (!form) return;

  const originalSettingsHtml = btnSettings ? btnSettings.innerHTML : '';
  const originalPromptHtml = btnPrompt ? btnPrompt.innerHTML : '';

  if (btnSettings) {
    btnSettings.disabled = true;
    btnSettings.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Saving...';
  }
  if (btnPrompt) {
    btnPrompt.disabled = true;
    btnPrompt.innerHTML = '<i class="fa-solid fa-spinner fa-spin mr-1.5"></i> Saving...';
  }

  const formData = new FormData(form);
  const payload = {};
  formData.forEach((value, key) => {
    payload[key] = value;
  });

  // Explicit overrides to ensure values from dynamic fields are never missed
  const sysPromptElem = document.getElementById('system_instruction');
  if (sysPromptElem) payload.system_instruction = sysPromptElem.value;

  const providerElem = document.getElementById('provider-input');
  if (providerElem) payload.provider = providerElem.value;

  try {
    const res = await fetch('/dashboard/settings', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const data = await res.json();
    if (data.success) {
      showToast('Settings & System Prompt saved successfully!', 'success');
    } else {
      showToast(`Error: ${data.error || 'Failed to save settings'}`, 'error');
    }
  } catch (err) {
    showToast(`Network error: ${err.message}`, 'error');
  } finally {
    if (btnSettings) {
      btnSettings.disabled = false;
      btnSettings.innerHTML = originalSettingsHtml;
    }
    if (btnPrompt) {
      btnPrompt.disabled = false;
      btnPrompt.innerHTML = originalPromptHtml;
    }
  }
}

// 9. Flush Modal Controls
function openFlushModal() {
  document.getElementById('flush-modal')?.classList.remove('hidden');
}

function closeFlushModal() {
  document.getElementById('flush-modal')?.classList.add('hidden');
}

// 10. Execute Global Context Memory Flush
async function executeFlushAll() {
  closeFlushModal();
  try {
    const res = await fetch('/dashboard/flush-memory', {
      method: 'POST',
      headers: { 'Accept': 'application/json' },
    });

    const data = await res.json();
    if (data.success) {
      showToast('All conversation memory wiped clean!', 'success');
      const memoryCountElem = document.getElementById('stat-memory-count');
      if (memoryCountElem) memoryCountElem.innerText = '0 Messages';
    } else {
      showToast(data.error || 'Failed to flush memory', 'error');
    }
  } catch (err) {
    showToast('Network error flushing memory', 'error');
  }
}

// 11. Toggle Log Detail Expandable Row
function toggleLogDetail(logId) {
  const detailRow = document.getElementById(`log-detail-${logId}`);
  if (detailRow) {
    detailRow.classList.toggle('hidden');
  }
}

// 12. Real-time Activity Logs Refresh
async function refreshActivityLogs() {
  try {
    const res = await fetch('/dashboard/api/logs?limit=30');
    const data = await res.json();

    if (!data.success || !data.logs) return;

    const tbody = document.getElementById('activity-logs-tbody');
    if (!tbody) return;

    if (data.logs.length === 0) {
      tbody.innerHTML = `
        <tr>
          <td colspan="6" class="px-4 py-8 text-center text-slate-500 font-mono text-xs">
            No activity logs recorded yet. Send a message in Discord to start logging!
          </td>
        </tr>
      `;
      return;
    }

    let html = '';
    data.logs.forEach((log) => {
      const timeStr = new Date(log.created_at).toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
      const isGemini = log.provider === 'gemini';
      const latencyColor = (log.latency_ms || 0) > 3000 ? 'text-amber-400' : 'text-emerald-400';

      html += `
        <tr class="hover:bg-[#111111] transition-colors border-b border-[#141414]">
          <td class="px-4 py-3 font-mono text-slate-400 whitespace-nowrap text-xs">${timeStr}</td>
          <td class="px-4 py-3 font-medium text-white whitespace-nowrap text-xs">
            <span class="text-violet-400">@${escapeHtml(log.user_tag || log.user_id || 'User')}</span>
          </td>
          <td class="px-4 py-3 whitespace-nowrap">
            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-mono ${
              isGemini
                ? 'bg-violet-950/40 text-violet-300 border border-violet-800/40'
                : 'bg-cyan-950/40 text-cyan-300 border border-cyan-800/40'
            }">
              ${escapeHtml(log.model || log.provider)}
            </span>
          </td>
          <td class="px-4 py-3 font-mono text-slate-300 whitespace-nowrap text-xs">${log.tokens_used || 0}</td>
          <td class="px-4 py-3 font-mono whitespace-nowrap text-xs">
            <span class="${latencyColor}">${log.latency_ms || 0}ms</span>
          </td>
          <td class="px-4 py-3 text-right whitespace-nowrap">
            <button type="button" onclick="toggleLogDetail('${log.id}')" class="text-violet-400 hover:text-violet-300 font-semibold text-xs transition-colors">
              View Trace <i class="fa-solid fa-chevron-down text-[10px] ml-1"></i>
            </button>
          </td>
        </tr>
        <tr id="log-detail-${log.id}" class="hidden bg-[#030303]">
          <td colspan="6" class="p-4 border-b border-[#1a1a1a]">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
              <div>
                <div class="font-bold text-slate-400 mb-1 flex items-center gap-1.5 font-mono text-[11px]">
                  <i class="fa-solid fa-user text-violet-400"></i> User Prompt:
                </div>
                <div class="bg-[#080808] p-3 rounded-xl border border-[#1a1a1a] text-slate-200 font-mono text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto">${escapeHtml(log.prompt || '')}</div>
              </div>
              <div>
                <div class="font-bold text-slate-400 mb-1 flex items-center gap-1.5 font-mono text-[11px]">
                  <i class="fa-solid fa-robot text-emerald-400"></i> AI Response:
                </div>
                <div class="bg-[#080808] p-3 rounded-xl border border-[#1a1a1a] text-slate-200 font-mono text-[11px] whitespace-pre-wrap max-h-40 overflow-y-auto">${escapeHtml(log.reply || '')}</div>
              </div>
            </div>
          </td>
        </tr>
      `;
    });

    tbody.innerHTML = html;
    showToast('Activity logs refreshed');
  } catch (err) {
    console.error('Failed to refresh activity logs:', err);
  }
}

// 13. Telemetry Poller
async function pollTelemetry() {
  try {
    const res = await fetch('/dashboard/api/status');
    const data = await res.json();
    if (data.success && data.db) {
      const memoryCountElem = document.getElementById('stat-memory-count');
      const logsCountElem = document.getElementById('stat-logs-count');
      if (memoryCountElem) memoryCountElem.innerText = `${data.db.activeMemoryRecords} Messages`;
      if (logsCountElem) logsCountElem.innerText = data.db.totalLogs;
    }
  } catch {
    // Ignore polling errors
  }
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// 14. Expose all functions to window for guaranteed accessibility
window.showToast = showToast;
window.toggleProviderUI = toggleProviderUI;
window.applyPreset = applyPreset;
window.updatePromptCounters = updatePromptCounters;
window.applyPersonaPreset = applyPersonaPreset;
window.resetPromptToDefault = resetPromptToDefault;
window.togglePasswordVisibility = togglePasswordVisibility;
window.testAiConnection = testAiConnection;
window.saveAllSettings = saveAllSettings;
window.openFlushModal = openFlushModal;
window.closeFlushModal = closeFlushModal;
window.executeFlushAll = executeFlushAll;
window.toggleLogDetail = toggleLogDetail;
window.refreshActivityLogs = refreshActivityLogs;

// 15. DOM Event Listeners initialization
document.addEventListener('DOMContentLoaded', () => {
  // Form submission
  const settingsForm = document.getElementById('settings-form');
  if (settingsForm) {
    settingsForm.addEventListener('submit', saveAllSettings);
  }

  // System prompt textarea live counters
  const textarea = document.getElementById('system_instruction');
  if (textarea) {
    textarea.addEventListener('input', updatePromptCounters);
    textarea.addEventListener('keyup', updatePromptCounters);
    updatePromptCounters();
  }

  // Persona presets buttons
  document.querySelectorAll('[data-persona-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const preset = btn.getAttribute('data-persona-preset');
      if (preset) applyPersonaPreset(preset);
    });
  });

  // Reset prompt button
  document.getElementById('btn-reset-prompt')?.addEventListener('click', resetPromptToDefault);

  // Provider tabs
  document.querySelectorAll('[data-provider-tab]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const provider = btn.getAttribute('data-provider-tab');
      if (provider) toggleProviderUI(provider);
    });
  });

  // Endpoint presets
  document.querySelectorAll('[data-endpoint-preset]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const endpoint = btn.getAttribute('data-endpoint-preset');
      if (endpoint) applyPreset(endpoint);
    });
  });

  // Test AI Connection button
  document.getElementById('btn-test-ai')?.addEventListener('click', testAiConnection);

  // Channel dropdown syncing with input
  const channelSelect = document.getElementById('channel-select');
  if (channelSelect) {
    channelSelect.addEventListener('change', (e) => {
      const manualInput = document.getElementById('auto_channel_id');
      if (manualInput) manualInput.value = e.target.value;
    });
  }

  // Range slider label
  const tempSlider = document.querySelector('input[name="temperature"]');
  if (tempSlider) {
    tempSlider.addEventListener('input', (e) => {
      const tempVal = document.getElementById('temp-val');
      if (tempVal) tempVal.innerText = e.target.value;
    });
  }
});

// Start 15s telemetry polling
setInterval(pollTelemetry, 15000);
