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
  if (DOM.headerUserAvatar) DOM.headerUserAvatar.textContent = initials;
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

  messages.forEach(msg => {
    if (msg.role === 'user') {
      appendUserBubble(msg.content, msg.created_at);
    } else {
      appendAssistantBubble(msg.content, msg.created_at);
    }
  });

  scrollToBottom();
}

function appendUserBubble(content, timestamp) {
  const group = document.createElement('div');
  group.className = 'message-group user';

  const userInitial = getInitials(currentUser?.name || currentUser?.full_name || 'U');

  const row = document.createElement('div');
  row.className = 'message-user-row';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.textContent = content;

  const avatar = document.createElement('div');
  avatar.className = 'msg-user-avatar';
  avatar.textContent = userInitial;
  avatar.setAttribute('aria-hidden', 'true');

  row.appendChild(bubble);
  row.appendChild(avatar);

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = formatClockTime(timestamp);

  group.appendChild(row);
  group.appendChild(time);
  DOM.messagesList.appendChild(group);
}

function appendAssistantBubble(content, timestamp) {
  const group = document.createElement('div');
  group.className = 'message-group assistant';

  const avatar = document.createElement('img');
  avatar.className = 'msg-ron-avatar';
  avatar.src = '../assets/images/ron-mascot.png';
  avatar.alt = 'Ron';

  const inner = document.createElement('div');
  inner.className = 'message-assistant-inner';

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';
  bubble.innerHTML = formatAssistantText(content);

  const time = document.createElement('div');
  time.className = 'message-time';
  time.textContent = formatClockTime(timestamp);

  // Actions row
  const actions = document.createElement('div');
  actions.className = 'message-actions';

  const copyBtn = document.createElement('button');
  copyBtn.className = 'btn-copy-msg';
  copyBtn.innerHTML = `
    <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"></rect>
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path>
    </svg>
    <span>Copy</span>
  `;
  copyBtn.addEventListener('click', () => copyToClipboard(copyBtn, content));

  actions.appendChild(copyBtn);
  inner.appendChild(bubble);
  inner.appendChild(time);
  inner.appendChild(actions);

  group.appendChild(avatar);
  group.appendChild(inner);

  DOM.messagesList.appendChild(group);
}

function formatAssistantText(text) {
  if (!text) return '';
  const lines = text.split('\n');
  let html = '';
  let inList = false;

  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line) {
      if (inList) { html += '</ul>'; inList = false; }
      html += '<br>';
      continue;
    }

    const isBullet = line.startsWith('• ') || line.startsWith('- ') || line.startsWith('* ');
    if (isBullet) {
      if (!inList) { html += '<ul class="assistant-bullet-list">'; inList = true; }
      const itemContent = formatInlineMarkup(line.substring(2).trim());
      html += `<li>${itemContent}</li>`;
    } else {
      if (inList) { html += '</ul>'; inList = false; }
      html += `<p class="assistant-paragraph">${formatInlineMarkup(line)}</p>`;
    }
  }

  if (inList) html += '</ul>';
  return html;
}

function formatInlineMarkup(str) {
  let escaped = escapeHtml(str);
  escaped = escaped.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  return escaped;
}

function copyToClipboard(btn, text) {
  navigator.clipboard.writeText(text).then(() => {
    btn.classList.add('copied');
    btn.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('span').textContent = 'Copy';
    }, 1800);
  }).catch(() => {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    document.execCommand('copy');
    document.body.removeChild(ta);

    btn.classList.add('copied');
    btn.querySelector('span').textContent = 'Copied!';
    setTimeout(() => {
      btn.classList.remove('copied');
      btn.querySelector('span').textContent = 'Copy';
    }, 1800);
  });
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
    autoResizeTextarea(DOM.composer);
    updateSendButton();
  }

  // 1. Hide welcome state if visible
  if (DOM.welcomeState) DOM.welcomeState.classList.add('hidden');

  // 2. Display the user message bubble immediately
  appendUserBubble(content, new Date().toISOString());
  scrollToBottom();

  // 3. Show loading/thinking state
  showThinkingIndicator();
  scrollToBottom();

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
        scrollToBottom();
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
      scrollToBottom();
      return;
    }

    const data = await res.json();
    if (data.assistant_message && data.assistant_message.content) {
      appendAssistantBubble(data.assistant_message.content, data.assistant_message.created_at);
      scrollToBottom();
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
    scrollToBottom();
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
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, 140) + 'px';
}

function updateSendButton() {
  const hasText = DOM.composer.value.trim().length > 0;
  DOM.btnSend.classList.toggle('active', hasText);
}

function scrollToBottom() {
  requestAnimationFrame(() => {
    if (DOM.messagesArea) {
      DOM.messagesArea.scrollTop = DOM.messagesArea.scrollHeight;
    }
  });
}

function toggleSidebar() {
  const isOpen = DOM.sidebar.classList.contains('open');
  if (isOpen) closeSidebar();
  else openSidebar();
}

function openSidebar() {
  DOM.sidebar.classList.add('open');
  DOM.overlay.classList.add('visible');
  document.body.style.overflow = 'hidden';
}

function closeSidebar() {
  DOM.sidebar.classList.remove('open');
  DOM.overlay.classList.remove('visible');
  document.body.style.overflow = '';
}

function logout() {
  window.RonAuth.clearAccessToken();
  redirectToLogin();
}

/**
 * Initialize
 */
async function initChat() {
  DOM.sidebar = document.getElementById('chatSidebar');
  DOM.overlay = document.getElementById('sidebarOverlay');
  DOM.hamburger = document.getElementById('btnHamburger');
  DOM.btnNewChat = document.getElementById('btnNewChat');
  DOM.chatList = document.getElementById('chatList');
  DOM.sidebarEmptyState = document.getElementById('sidebarEmptyState');
  DOM.sidebarUserAvatar = document.getElementById('sidebarUserAvatar');
  DOM.sidebarUserName = document.getElementById('sidebarUserName');
  DOM.sidebarUserEmail = document.getElementById('sidebarUserEmail');
  DOM.btnLogout = document.getElementById('btnLogout');
  DOM.headerUserAvatar = document.getElementById('headerUserAvatar');
  DOM.headerUserName = document.getElementById('headerUserName');
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

  // Event Listeners
  if (DOM.hamburger) DOM.hamburger.addEventListener('click', toggleSidebar);
  if (DOM.overlay) DOM.overlay.addEventListener('click', closeSidebar);
  if (DOM.btnNewChat) DOM.btnNewChat.addEventListener('click', handleNewChat);
  if (DOM.btnLogout) DOM.btnLogout.addEventListener('click', logout);

  // Theme Toggle
  const themeToggle = document.getElementById('themeToggleChat');
  if (themeToggle) {
    themeToggle.addEventListener('click', () => {
      document.body.classList.toggle('dark-theme');
      const isDark = document.body.classList.contains('dark-theme');
      localStorage.setItem('ron-theme', isDark ? 'dark' : 'light');
    });
  }

  // Composer events
  if (DOM.composer) {
    DOM.composer.addEventListener('input', () => {
      autoResizeTextarea(DOM.composer);
      updateSendButton();
    });

    DOM.composer.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSendMessage();
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
