/**
 * Ron AI — Chat Application Core (Slice 4.1)
 * Real User-Specific Chat History Foundation
 * Strictly NO OpenRouter / Gemini calls.
 */

'use strict';

// API Base URL
const API_BASE = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
  ? 'http://127.0.0.1:8000/api'
  : '/api';

// State
let currentUser = null;
let currentConversationId = null;
let conversations = [];
let isSending = false;

// DOM Elements cache
const DOM = {};

/**
 * Format relative time (e.g. "Just now", "5m ago", "2h ago", "Yesterday")
 */
function formatTimeAgo(isoString) {
  if (!isoString) return 'Just now';
  const date = new Date(isoString);
  const now = new Date();
  const diffSec = Math.floor((now - date) / 1000);

  if (diffSec < 45) return 'Just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  if (diffSec < 172800) return 'Yesterday';
  if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function formatClockTime(isoString) {
  if (!isoString) return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const d = new Date(isoString);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function getInitials(name) {
  const parts = (name || 'User').trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0].toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function getFirstName(name) {
  return (name || 'there').trim().split(/\s+/)[0];
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text || '';
  return div.innerHTML;
}

/**
 * Authenticated Fetch Helper
 */
async function authFetch(endpoint, options = {}) {
  const token = window.RonAuth.getAccessToken();
  if (!token) {
    redirectToLogin();
    return null;
  }

  const headers = {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...(options.headers || {})
  };

  try {
    const res = await fetch(`${API_BASE}${endpoint}`, {
      ...options,
      headers
    });

    if (res.status === 401) {
      window.RonAuth.clearAccessToken();
      redirectToLogin();
      return null;
    }

    return res;
  } catch (err) {
    console.error(`Network error requesting ${endpoint}:`, err);
    return null;
  }
}

function redirectToLogin() {
  window.location.href = 'login.html';
}

/**
 * Load current authenticated user details from /api/auth/me
 */
async function loadCurrentUser() {
  const res = await authFetch('/auth/me');
  if (!res || !res.ok) {
    // If auth failed, authFetch handles redirect
    return false;
  }

  currentUser = await res.json();
  renderUserProfile();
  return true;
}

function renderUserProfile() {
  if (!currentUser) return;
  const name = currentUser.name || currentUser.full_name || 'User';
  const email = currentUser.email || '';
  const initials = getInitials(name);
  const firstName = getFirstName(name);

  if (DOM.sidebarUserName) DOM.sidebarUserName.textContent = name;
  if (DOM.sidebarUserEmail) DOM.sidebarUserEmail.textContent = email;
  if (DOM.sidebarUserAvatar) DOM.sidebarUserAvatar.textContent = initials;

  if (DOM.headerUserName) DOM.headerUserName.textContent = firstName;
  if (DOM.dropdownUserName) DOM.dropdownUserName.textContent = name;
  if (DOM.dropdownUserEmail) DOM.dropdownUserEmail.textContent = email;
  if (DOM.greetingName) DOM.greetingName.textContent = firstName + '!';
}

/**
 * Load User-Specific Conversations from /api/conversations
 */
async function loadConversations() {
  const res = await authFetch('/conversations');
  if (!res || !res.ok) return;

  conversations = await res.json();
  renderConversationList();
}

function renderConversationList() {
  if (!DOM.chatList) return;
  DOM.chatList.innerHTML = '';

  if (conversations.length === 0) {
    DOM.sidebarEmptyState.classList.remove('hidden');
    return;
  }

  DOM.sidebarEmptyState.classList.add('hidden');

  conversations.forEach(conv => {
    const li = document.createElement('li');
    li.className = 'sidebar-chat-item' + (conv.id === currentConversationId ? ' active' : '');
    li.dataset.id = conv.id;
    li.setAttribute('role', 'listitem');

    li.innerHTML = `
      <div class="sidebar-chat-icon" aria-hidden="true">
        <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path>
        </svg>
      </div>
      <div class="sidebar-chat-info">
        <div class="sidebar-chat-title" title="${escapeHtml(conv.title)}">${escapeHtml(conv.title)}</div>
        <div class="sidebar-chat-time">${formatTimeAgo(conv.updated_at)}</div>
      </div>
      <button class="btn-delete-conv" title="Delete conversation" aria-label="Delete conversation">
        <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M3 6h18"></path>
          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"></path>
          <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path>
        </svg>
      </button>
    `;

    // Click to select conversation
    li.addEventListener('click', (e) => {
      if (e.target.closest('.btn-delete-conv')) return;
      selectConversation(conv.id);
    });

    // Delete conversation
    const delBtn = li.querySelector('.btn-delete-conv');
    if (delBtn) {
      delBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (confirm('Delete this conversation?')) {
          await deleteConversation(conv.id);
        }
      });
    }

    DOM.chatList.appendChild(li);
  });
}

/**
 * Select and load a conversation's messages
 */
async function selectConversation(convId) {
  currentConversationId = convId;

  // Highlight in sidebar
  document.querySelectorAll('.sidebar-chat-item').forEach(el => {
    el.classList.toggle('active', parseInt(el.dataset.id, 10) === convId);
  });

  const res = await authFetch(`/conversations/${convId}`);
  if (!res || !res.ok) {
    console.error('Failed to load conversation details');
    return;
  }

  const data = await res.json();
  renderMessages(data.messages || []);
  closeSidebar();
}

/**
 * Render message bubbles
 */
function renderMessages(messages) {
  if (!DOM.messagesList || !DOM.welcomeState) return;

  DOM.messagesList.innerHTML = '';

  if (!messages || messages.length === 0) {
    DOM.welcomeState.classList.remove('hidden');
    return;
  }

  DOM.welcomeState.classList.add('hidden');

  let lastUserPrompt = null;
  messages.forEach(msg => {
    if (msg.role === 'user') {
      lastUserPrompt = msg.content;
      appendUserBubble(msg.content, msg.created_at);
    } else {
      appendAssistantBubble(msg.content, msg.created_at, lastUserPrompt);
    }
  });

  scrollToBottom(true, false);
}

function appendUserBubble(content, timestamp) {
  const group = document.createElement('div');
  group.className = 'message-group user';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble user-bubble';
  bubble.textContent = content;

  const time = document.createElement('div');
  time.className = 'message-time user-time';
  time.textContent = formatClockTime(timestamp);

  group.appendChild(bubble);
  group.appendChild(time);
  DOM.messagesList.appendChild(group);
}

function appendAssistantBubble(content, timestamp, userPrompt = null) {
  const group = document.createElement('div');
  group.className = 'message-group assistant';

  const avatar = document.createElement('img');
  avatar.className = 'msg-ron-avatar';
  avatar.src = '../assets/images/ron-mascot.png';
  avatar.alt = 'Ron';

  const inner = document.createElement('div');
  inner.className = 'message-assistant-inner';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble assistant-markdown';
  bubble.innerHTML = formatAssistantText(content);

  // Bind copy handlers to all code blocks inside this bubble
  bubble.querySelectorAll('.btn-copy-code').forEach(copyBtn => {
    copyBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const codeWrapper = copyBtn.closest('.code-block-wrapper');
      const codeEl = codeWrapper ? codeWrapper.querySelector('code') : null;
      if (codeEl) {
        copyCodeToClipboard(copyBtn, codeEl.textContent);
      }
    });
  });

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = formatClockTime(timestamp);

  // Actions row
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  // 1. Copy Response Button
  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-msg-action btn-copy-msg';
  copyBtn.type = 'button';
  copyBtn.title = 'Copy response';
  copyBtn.setAttribute('aria-label', 'Copy response');
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span class="action-label">Copy</span>
  `;
  copyBtn.addEventListener('click', () => copyResponseToClipboard(copyBtn, content));

  // 2. Regenerate Response Button
  const regenBtn = document.createElement('button');
  regenBtn.className = 'btn-msg-action btn-regenerate-msg';
  regenBtn.type = 'button';
  regenBtn.title = 'Regenerate response';
  regenBtn.setAttribute('aria-label', 'Regenerate response');
  regenBtn.innerHTML = `
    <svg class="regen-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <polyline points="23 4 23 10 17 10"></polyline>
      <polyline points="1 20 1 14 7 14"></polyline>
      <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path>
    </svg>
    <span class="action-label">Regenerate</span>
  `;
  regenBtn.addEventListener('click', () => handleRegenerate(userPrompt));

  actions.appendChild(copyBtn);
  actions.appendChild(regenBtn);

  inner.appendChild(bubble);
  inner.appendChild(time);
  inner.appendChild(actions);

  group.appendChild(avatar);
  group.appendChild(inner);

  DOM.messagesList.appendChild(group);
}

/**
 * Handle Regenerate Response:
 * Re-submits the user prompt associated with this assistant response.
 */
function handleRegenerate(promptText) {
  if (isSending) return;

  let textToSend = promptText;
  if (!textToSend && DOM.messagesList) {
    const userBubbles = DOM.messagesList.querySelectorAll('.message-group.user .message-bubble');
    if (userBubbles.length > 0) {
      textToSend = userBubbles[userBubbles.length - 1].textContent;
    }
  }

  if (textToSend) {
    handleSendMessage(textToSend);
  }
}

/**
 * Robust, XSS-safe Markdown parser for assistant responses.
 * Supports:
 * - Fenced code blocks with language header and copy button
 * - Inline code with monospace highlight
 * - Headings (#, ##, ###, ####)
 * - Blockquotes (>)
 * - Horizontal rules (---, ***, ___)
 * - Unordered lists (-, *, •, +)
 * - Ordered lists (1., 2., etc.)
 * - Bold, italic, bold+italic, strikethrough
 * - Markdown tables (| ... |)
 * - Safe hyperlinks ([label](url))
 * - Paragraphs & line breaks
 */
function formatAssistantText(text) {
  if (!text) return '';

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = normalized.split('\n');
  const blocks = [];

  let inCodeBlock = false;
  let codeFenceChar = '';
  let codeFenceLen = 0;
  let codeLang = 'code';
  let codeLines = [];

  let currentList = null; // { type: 'ul' | 'ol', items: [] }
  let currentTable = null; // { headers: [], rows: [] }
  let currentBlockquote = [];
  let currentParagraph = [];

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const content = currentParagraph.map(l => formatInlineMarkup(l)).join('<br>');
      blocks.push(`<p class="assistant-paragraph">${content}</p>`);
      currentParagraph = [];
    }
  }

  function flushList() {
    if (currentList) {
      const tag = currentList.type === 'ul' ? 'ul' : 'ol';
      const cls = currentList.type === 'ul' ? 'assistant-bullet-list' : 'assistant-numbered-list';
      const itemsHtml = currentList.items.map(it => `<li>${formatInlineMarkup(it)}</li>`).join('');
      blocks.push(`<${tag} class="${cls}">${itemsHtml}</${tag}>`);
      currentList = null;
    }
  }

  function flushBlockquote() {
    if (currentBlockquote.length > 0) {
      const content = currentBlockquote.map(l => formatInlineMarkup(l)).join('<br>');
      blocks.push(`<blockquote class="assistant-blockquote">${content}</blockquote>`);
      currentBlockquote = [];
    }
  }

  function flushTable() {
    if (currentTable) {
      const ths = currentTable.headers.map(h => `<th>${formatInlineMarkup(h)}</th>`).join('');
      const rowsHtml = currentTable.rows.map(r => {
        const tds = r.map(c => `<td>${formatInlineMarkup(c)}</td>`).join('');
        return `<tr>${tds}</tr>`;
      }).join('');
      blocks.push(`
        <div class="table-wrapper">
          <table class="assistant-table">
            <thead><tr>${ths}</tr></thead>
            <tbody>${rowsHtml}</tbody>
          </table>
        </div>
      `);
      currentTable = null;
    }
  }

  function flushCodeBlock() {
    if (inCodeBlock) {
      const escaped = escapeHtml(codeLines.join('\n'));
      const langDisplay = (codeLang && codeLang !== 'code') ? codeLang : 'Code';
      blocks.push(`
        <div class="code-block-wrapper">
          <div class="code-block-header">
            <span class="code-lang-label">${escapeHtml(langDisplay)}</span>
            <button class="btn-copy-code" type="button" aria-label="Copy code snippet">
              <svg class="copy-icon" viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
              </svg>
              <span class="copy-label">Copy code</span>
            </button>
          </div>
          <pre class="code-block-pre"><code class="code-block-content language-${escapeHtml(codeLang)}">${escaped}</code></pre>
        </div>
      `);
      inCodeBlock = false;
      codeLines = [];
      codeLang = 'code';
    }
  }

  function flushAll() {
    flushParagraph();
    flushList();
    flushBlockquote();
    flushTable();
    flushCodeBlock();
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // If currently inside a fenced code block, check for closing fence
    if (inCodeBlock) {
      const closeMatch = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*$/);
      if (closeMatch && closeMatch[1][0] === codeFenceChar && closeMatch[1].length >= codeFenceLen) {
        flushCodeBlock();
      } else {
        codeLines.push(line);
      }
      continue;
    }

    const trimmed = line.trim();

    // Check for fenced code block opening (``` or ~~~ with optional language)
    const openMatch = line.match(/^[ \t]*(`{3,}|~{3,})[ \t]*([a-zA-Z0-9_\-\+\.#]*)[^\r\n]*/);
    if (openMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      flushTable();
      inCodeBlock = true;
      codeFenceChar = openMatch[1][0];
      codeFenceLen = openMatch[1].length;
      codeLang = openMatch[2].trim().toLowerCase() || 'code';
      codeLines = [];
      continue;
    }

    // Blank line
    if (!trimmed) {
      flushParagraph();
      flushList();
      flushBlockquote();
      flushTable();
      continue;
    }

    // Horizontal Rule: --- or *** or ___
    if (/^(?:---+|\*\*\*+|___+)\s*$/.test(trimmed)) {
      flushParagraph();
      flushList();
      flushBlockquote();
      flushTable();
      blocks.push('<hr class="assistant-hr" />');
      continue;
    }

    // Headings: #, ##, ###, ####
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+)$/);
    if (headingMatch) {
      flushParagraph();
      flushList();
      flushBlockquote();
      flushTable();
      const level = headingMatch[1].length;
      const headingContent = formatInlineMarkup(headingMatch[2].trim());
      blocks.push(`<h${level} class="assistant-h${level}">${headingContent}</h${level}>`);
      continue;
    }

    // Blockquote: > text
    const quoteMatch = line.match(/^>\s?(.*)$/);
    if (quoteMatch) {
      flushParagraph();
      flushList();
      flushTable();
      currentBlockquote.push(quoteMatch[1]);
      continue;
    } else if (currentBlockquote.length > 0) {
      flushBlockquote();
    }

    // Table detection: line with | ... | and separator row |---|---|
    if (trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2) {
      const cells = trimmed.split('|').slice(1, -1).map(c => c.trim());
      if (!currentTable && i + 1 < lines.length) {
        const nextTrimmed = lines[i + 1].trim();
        if (nextTrimmed.startsWith('|') && /^[\|\s\-:]+$/.test(nextTrimmed)) {
          // Table header detected
          flushParagraph();
          flushList();
          currentTable = { headers: cells, rows: [] };
          i++; // Skip the separator row
          continue;
        }
      } else if (currentTable) {
        // Table body row
        currentTable.rows.push(cells);
        continue;
      }
    } else if (currentTable) {
      flushTable();
    }

    // Unordered List item: -, *, •, +
    const ulMatch = line.match(/^(\s*)(?:[\*\-\•]|\+)\s+(.+)$/);
    if (ulMatch) {
      flushParagraph();
      flushBlockquote();
      flushTable();
      if (!currentList || currentList.type !== 'ul') {
        flushList();
        currentList = { type: 'ul', items: [] };
      }
      currentList.items.push(ulMatch[2]);
      continue;
    }

    // Ordered List item: 1. Item
    const olMatch = line.match(/^(\s*)\d+\.\s+(.+)$/);
    if (olMatch) {
      flushParagraph();
      flushBlockquote();
      flushTable();
      if (!currentList || currentList.type !== 'ol') {
        flushList();
        currentList = { type: 'ol', items: [] };
      }
      currentList.items.push(olMatch[2]);
      continue;
    }

    // Flush any pending list if current line is not a list item
    if (currentList) {
      flushList();
    }

    // Normal text line -> append to current paragraph
    currentParagraph.push(trimmed);
  }

  flushAll();
  return blocks.join('\n');
}

/**
 * Format inline Markdown markup: bold, italic, inline code, links, strikethrough.
 * Safely escapes HTML first to prevent XSS.
 */
function formatInlineMarkup(str) {
  if (!str) return '';

  // 1. Escape HTML for security
  let escaped = escapeHtml(str);

  // 2. Inline code: `code`
  escaped = escaped.replace(/`([^`]+)`/g, '<code class="inline-code">$1</code>');

  // 3. Bold + Italic: ***text*** or ___text___
  escaped = escaped.replace(/\*\*\*([^*]+)\*\*\*/g, '<strong><em>$1</em></strong>');
  escaped = escaped.replace(/___([^_]+)___/g, '<strong><em>$1</em></strong>');

  // 4. Bold: **text** or __text__
  escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  escaped = escaped.replace(/__([^_]+)__/g, '<strong>$1</strong>');

  // 5. Italic: *text* or _text_
  escaped = escaped.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  escaped = escaped.replace(/(?:^|\s)_([^_]+)_(?=\s|$)/g, ' <em>$1</em>');

  // 6. Strikethrough: ~~text~~
  escaped = escaped.replace(/~~([^~]+)~~/g, '<del>$1</del>');

  // 7. Safe hyperlinks: [text](http... or https...)
  escaped = escaped.replace(
    /\[([^\]]+)\]\((https?:\/\/[^\s\)"'<]+)\)/g,
    '<a href="$2" class="assistant-link" target="_blank" rel="noopener noreferrer">$1</a>'
  );

  return escaped;
}

/**
 * Copy helpers with animated visual feedback
 */
function copyCodeToClipboard(btn, text) {
  copyTextWithFeedback(btn, text, 'Copy code', 'Copied!');
}

function copyResponseToClipboard(btn, text) {
  copyTextWithFeedback(btn, text, 'Copy', 'Copied!');
}

function copyTextWithFeedback(btn, text, defaultLabel, copiedLabel) {
  const labelEl = btn.querySelector('.copy-label, .action-label, span');
  const markCopied = () => {
    btn.classList.add('copied');
    if (labelEl) labelEl.textContent = copiedLabel;
    setTimeout(() => {
      btn.classList.remove('copied');
      if (labelEl) labelEl.textContent = defaultLabel;
    }, 2000);
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(markCopied).catch(() => {
      fallbackCopyText(text);
      markCopied();
    });
  } else {
    fallbackCopyText(text);
    markCopied();
  }
}

function fallbackCopyText(text) {
  const ta = document.createElement('textarea');
  ta.value = text;
  ta.style.position = 'fixed';
  ta.style.left = '-9999px';
  ta.style.top = '-9999px';
  ta.style.opacity = '0';
  document.body.appendChild(ta);
  ta.focus();
  ta.select();
  try {
    document.execCommand('copy');
  } catch (err) {
    console.warn('Fallback copy error:', err);
  }
  document.body.removeChild(ta);
}

/**
 * Show temporary "Ron is thinking..." indicator
 */
function showThinkingIndicator() {
  removeThinkingIndicator();

  const group = document.createElement('div');
  group.className = 'message-group assistant thinking-group';
  group.id = 'thinkingIndicator';

  const avatar = document.createElement('img');
  avatar.className = 'msg-ron-avatar';
  avatar.src = '../assets/images/ron-mascot.png';
  avatar.alt = 'Ron';

  const inner = document.createElement('div');
  inner.className = 'message-assistant-inner';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble thinking-bubble';
  bubble.innerHTML = `
    <div class="thinking-dots" aria-hidden="true">
      <span></span><span></span><span></span>
    </div>
    <span class="thinking-text">Ron is thinking...</span>
  `;

  inner.appendChild(bubble);
  group.appendChild(avatar);
  group.appendChild(inner);

  DOM.messagesList.appendChild(group);
}

/**
 * Remove thinking indicator from DOM
 */
function removeThinkingIndicator() {
  const el = document.getElementById('thinkingIndicator');
  if (el) el.remove();
}

/**
 * Show error bubble with optional retry action
 */
function appendErrorMessage(errorText, retryCallback) {
  const group = document.createElement('div');
  group.className = 'message-group assistant error-group';

  const avatar = document.createElement('img');
  avatar.className = 'msg-ron-avatar';
  avatar.src = '../assets/images/ron-mascot.png';
  avatar.alt = 'Ron';

  const inner = document.createElement('div');
  inner.className = 'message-assistant-inner';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble error-bubble';

  const header = document.createElement('div');
  header.className = 'error-bubble-header';
  header.innerHTML = `
    <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="10"></circle>
      <line x1="12" y1="8" x2="12" y2="12"></line>
      <line x1="12" y1="16" x2="12.01" y2="16"></line>
    </svg>
    <span>${escapeHtml(errorText)}</span>
  `;
  bubble.appendChild(header);

  if (typeof retryCallback === 'function') {
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn-retry-msg';
    retryBtn.textContent = 'Retry';
    retryBtn.addEventListener('click', () => {
      group.remove();
      retryCallback();
    });
    bubble.appendChild(retryBtn);
  }

  inner.appendChild(bubble);
  group.appendChild(avatar);
  group.appendChild(inner);

  DOM.messagesList.appendChild(group);
}

/**
 * Handle Start New Chat
 */
function handleNewChat() {
  currentConversationId = null;
  document.querySelectorAll('.sidebar-chat-item').forEach(el => el.classList.remove('active'));

  if (DOM.messagesList) DOM.messagesList.innerHTML = '';
  if (DOM.welcomeState) DOM.welcomeState.classList.remove('hidden');

  if (DOM.composer) {
    DOM.composer.value = '';
    autoResizeTextarea(DOM.composer);
    DOM.composer.focus();
  }
  updateSendButton();
  closeSidebar();
}

/**
 * Handle Send Message via POST /api/chat
 */
async function handleSendMessage(overrideText = null) {
  if (isSending) return;
  const content = (overrideText !== null ? overrideText : DOM.composer.value).trim();
  if (!content) return;

  isSending = true;
  DOM.btnSend.disabled = true;
  DOM.composer.disabled = true;

  if (overrideText === null) {
    DOM.composer.value = '';
    DOM.composer.style.height = 'auto';
    updateSendButton();
  }

  // 1. Hide welcome state if visible
  if (DOM.welcomeState) DOM.welcomeState.classList.add('hidden');

  // 2. Display the user message bubble immediately
  appendUserBubble(content, new Date().toISOString());
  scrollToBottom(true, false);

  // 3. Show loading/thinking state
  showThinkingIndicator();
  scrollToBottom(true, true);

  try {
    // 4. Ensure conversation exists if needed
    if (!currentConversationId) {
      const resConv = await authFetch('/conversations', {
        method: 'POST',
        body: JSON.stringify({ title: 'New Chat' })
      });
      if (!resConv || !resConv.ok) {
        removeThinkingIndicator();
        appendErrorMessage(
          "Unable to create conversation. Please try again.",
          () => handleSendMessage(content)
        );
        scrollToBottom(true, true);
        return;
      }
      const newConv = await resConv.json();
      currentConversationId = newConv.id;
    }

    // 5. Send message to backend /api/chat
    const res = await authFetch('/chat', {
      method: 'POST',
      body: JSON.stringify({
        conversation_id: currentConversationId,
        message: content
      })
    });

    removeThinkingIndicator();

    if (!res || !res.ok) {
      let errMsg = "Ron couldn't respond right now. Please try again.";
      if (res) {
        try {
          const errData = await res.json();
          if (errData && errData.detail && typeof errData.detail === 'string') {
            errMsg = errData.detail;
          }
        } catch (_) {}
      }
      appendErrorMessage(errMsg, () => handleSendMessage(content));
      scrollToBottom(true, true);
      return;
    }

    const data = await res.json();
    if (data.assistant_message && data.assistant_message.content) {
      // Pass the user content so Regenerate knows which prompt was answered
      appendAssistantBubble(data.assistant_message.content, data.assistant_message.created_at, content);
      scrollToBottom(false, true);
    }

    // 6. Refresh conversation list so updated title / order appears
    await loadConversations();
    document.querySelectorAll('.sidebar-chat-item').forEach(el => {
      el.classList.toggle('active', parseInt(el.dataset.id, 10) === currentConversationId);
    });

  } catch (err) {
    console.error('Error during chat dispatch:', err);
    removeThinkingIndicator();
    appendErrorMessage(
      "Network error connecting to Ron. Please check your connection and try again.",
      () => handleSendMessage(content)
    );
    scrollToBottom(true, true);
  } finally {
    isSending = false;
    DOM.composer.disabled = false;
    DOM.btnSend.disabled = false;
    DOM.composer.focus();
  }
}

/**
 * Delete Conversation
 */
async function deleteConversation(convId) {
  const res = await authFetch(`/conversations/${convId}`, { method: 'DELETE' });
  if (res && res.status === 204) {
    if (currentConversationId === convId) {
      handleNewChat();
    }
    await loadConversations();
  }
}

/**
 * UI & Event Helpers
 */
function autoResizeTextarea(ta) {
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

function updateSendButton() {
  const hasText = DOM.composer.value.trim().length > 0;
  DOM.btnSend.classList.toggle('active', hasText);
}

/**
 * Smart Auto-Scroll Behavior:
 * - When force = true (e.g. user sent message), unconditionally scroll to bottom.
 * - Otherwise only scroll if the user is already near the bottom (within threshold),
 *   avoiding interrupting the user if they scrolled up to read earlier responses.
 */
function isScrolledNearBottom() {
  if (!DOM.messagesArea) return true;
  const threshold = 140;
  const distance = DOM.messagesArea.scrollHeight - DOM.messagesArea.scrollTop - DOM.messagesArea.clientHeight;
  return distance <= threshold;
}

function scrollToBottom(force = false, smooth = false) {
  if (!DOM.messagesArea) return;
  if (!force && !isScrolledNearBottom()) {
    return;
  }
  requestAnimationFrame(() => {
    if (!DOM.messagesArea) return;
    if (smooth) {
      DOM.messagesArea.scrollTo({
        top: DOM.messagesArea.scrollHeight,
        behavior: 'smooth'
      });
    } else {
      DOM.messagesArea.scrollTop = DOM.messagesArea.scrollHeight;
    }
  });
}

function toggleSidebar() {
  if (!DOM.chatShell) return;
  const isCollapsed = DOM.chatShell.classList.toggle('sidebar-collapsed');
  localStorage.setItem('ron-sidebar-collapsed', isCollapsed ? 'true' : 'false');
}

function closeSidebar() {
  if (DOM.chatShell) {
    DOM.chatShell.classList.add('sidebar-collapsed');
    localStorage.setItem('ron-sidebar-collapsed', 'true');
  }
}

function logout() {
  window.RonAuth.clearAccessToken();
  redirectToLogin();
}

/**
 * Initialize
 */
async function initChat() {
  DOM.chatShell = document.querySelector('.chat-shell');
  DOM.sidebar = document.getElementById('chatSidebar');
  DOM.hamburger = document.getElementById('btnHamburger');
  DOM.btnNewChat = document.getElementById('btnNewChat');
  DOM.chatList = document.getElementById('chatList');
  DOM.sidebarEmptyState = document.getElementById('sidebarEmptyState');
  DOM.sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
  DOM.sidebarUserName = document.getElementById('sidebarUserName');
  DOM.sidebarUserEmail = document.getElementById('sidebarUserEmail');
  DOM.btnLogout = document.getElementById('btnLogout');
  DOM.headerUserMenu = document.getElementById('headerUserMenu');
  DOM.headerUserBtn = document.getElementById('headerUserBtn');
  DOM.headerUserName = document.getElementById('headerUserName');
  DOM.dropdownUserName = document.getElementById('dropdownUserName');
  DOM.dropdownUserEmail = document.getElementById('dropdownUserEmail');
  DOM.btnHeaderLogout = document.getElementById('btnHeaderLogout');
  DOM.messagesArea = document.getElementById('chatMessages');
  DOM.messagesList = document.getElementById('messagesList');
  DOM.welcomeState = document.getElementById('welcomeState');
  DOM.greetingName = document.getElementById('greetingName');
  DOM.composer = document.getElementById('composerTextarea');
  DOM.btnSend = document.getElementById('btnSend');

  // Check auth & load user
  const authOk = await loadCurrentUser();
  if (!authOk) return;

  // Load user's conversations
  await loadConversations();

  // Restore desktop sidebar collapsed state
  const savedSidebarCollapsed = localStorage.getItem('ron-sidebar-collapsed');
  if (savedSidebarCollapsed === 'true' && DOM.chatShell) {
    DOM.chatShell.classList.add('sidebar-collapsed');
  }

  // Event Listeners
  if (DOM.hamburger) DOM.hamburger.addEventListener('click', toggleSidebar);
  if (DOM.btnNewChat) DOM.btnNewChat.addEventListener('click', handleNewChat);
  if (DOM.btnLogout) DOM.btnLogout.addEventListener('click', logout);

  // Minimal User Menu dropdown
  if (DOM.headerUserBtn && DOM.headerUserMenu) {
    DOM.headerUserBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isOpen = DOM.headerUserMenu.classList.toggle('open');
      DOM.headerUserBtn.setAttribute('aria-expanded', isOpen ? 'true' : 'false');
    });

    document.addEventListener('click', (e) => {
      if (DOM.headerUserMenu && !DOM.headerUserMenu.contains(e.target)) {
        DOM.headerUserMenu.classList.remove('open');
        DOM.headerUserBtn.setAttribute('aria-expanded', 'false');
      }
    });
  }

  if (DOM.btnHeaderLogout) {
    DOM.btnHeaderLogout.addEventListener('click', logout);
  }

  // Composer events: Enter to Send, Shift+Enter for New Line
  if (DOM.composer) {
    DOM.composer.addEventListener('input', () => {
      autoResizeTextarea(DOM.composer);
      updateSendButton();
    });

    DOM.composer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        if (e.isComposing) return;
        if (e.shiftKey) {
          // Shift + Enter: Allow natural newline insertion, then adjust height
          requestAnimationFrame(() => autoResizeTextarea(DOM.composer));
          return;
        }
        // Enter without Shift: Send message
        e.preventDefault();
        const text = DOM.composer.value.trim();
        if (text && !isSending) {
          handleSendMessage();
        }
      }
    });
  }

  if (DOM.btnSend) {
    DOM.btnSend.addEventListener('click', handleSendMessage);
  }

  // Suggestion Cards: populate composer, do not create conversation until send
  document.querySelectorAll('.suggestion-card').forEach(card => {
    card.addEventListener('click', () => {
      const prompt = card.getAttribute('data-prompt');
      if (prompt && DOM.composer) {
        DOM.composer.value = prompt;
        autoResizeTextarea(DOM.composer);
        updateSendButton();
        DOM.composer.focus();
      }
    });
  });

  console.log('Ron AI Chat initialized for user:', currentUser?.name);
}

document.addEventListener('DOMContentLoaded', initChat);
