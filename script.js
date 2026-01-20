// API endpoint - automatically detects if running locally or in production
const API_BASE_URL = window.location.origin + '/api';

// Storage keys
const STORAGE_KEY_USERS = 'geocon_ai_users';
const STORAGE_KEY_CURRENT_USER = 'geocon_ai_current_user';
const STORAGE_KEY_SUBMISSIONS = 'geocon_ai_submissions';

// Default password
const DEFAULT_PASSWORD = 'geocon123';

// State
let currentUser = null;
let currentChatId = null;
let conversations = [];
let selectedFiles = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set up login form listener immediately (before auth check)
    setupLoginListeners();
    checkAuth();
    checkServerConnection();
});

// Setup login-related event listeners (called on page load)
function setupLoginListeners() {
    // Login form
    const loginForm = document.getElementById('login-form');
    if (loginForm) {
        console.log('Setting up login form listener');
        loginForm.addEventListener('submit', function(e) {
            console.log('Form submit event triggered');
            handleLogin(e);
        });
    } else {
        console.error('Login form not found!');
        // Retry after a short delay
        setTimeout(() => {
            const retryForm = document.getElementById('login-form');
            if (retryForm) {
                console.log('Retrying login form setup');
                retryForm.addEventListener('submit', handleLogin);
            }
        }, 500);
    }
    
    // Name setup form
    const nameForm = document.getElementById('name-form');
    if (nameForm) {
        console.log('Setting up name form listener');
        nameForm.addEventListener('submit', function(e) {
            console.log('Name form submit event triggered');
            handleNameSetup(e);
        });
    } else {
        console.error('Name form not found!');
    }
}

// Check authentication
function checkAuth() {
    const storedUser = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            // Check if user has name set
            const users = getUsers();
            const userData = users[currentUser.email];
            if (userData && userData.name) {
                // User is logged in and has name
                showApp();
            } else {
                // User logged in but needs to set name
                showNameSetup();
            }
        } catch (e) {
            showLogin();
        }
    } else {
        showLogin();
    }
}

// Get users data
function getUsers() {
    const stored = localStorage.getItem(STORAGE_KEY_USERS);
    return stored ? JSON.parse(stored) : {};
}

// Save users data
function saveUsers(users) {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(users));
}

// Show login modal
function showLogin() {
    document.getElementById('login-modal').classList.remove('hidden');
    document.getElementById('name-modal').classList.add('hidden');
    document.querySelector('.app-container').classList.add('hidden');
}

// Show name setup modal
function showNameSetup() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('name-modal').classList.remove('hidden');
    document.querySelector('.app-container').classList.add('hidden');
}

// Show app
function showApp() {
    document.getElementById('login-modal').classList.add('hidden');
    document.getElementById('name-modal').classList.add('hidden');
    document.querySelector('.app-container').classList.remove('hidden');
    initializeApp();
}

// Initialize app
function initializeApp() {
    // Display user info
    document.getElementById('user-email-display').textContent = currentUser.email;
    
    // Show/hide admin dashboard based on email
    const adminLink = document.getElementById('admin-dashboard-link');
    const adminEmails = ['carter@geoconinc.com', 'mundra@geoconinc.com'];
    if (adminEmails.includes(currentUser.email.toLowerCase())) {
        adminLink.classList.remove('hidden');
    } else {
        adminLink.classList.add('hidden');
    }
    
    // Add greeting to header
    updateGreeting();
    
    // Load conversations
    loadConversations();
    renderChatHistory();
    
    // Set up event listeners
    setupEventListeners();
    
    // Load current chat if exists
    const savedChatId = localStorage.getItem(`current_chat_${currentUser.email}`);
    if (savedChatId && conversations.find(c => c.id === savedChatId)) {
        loadChat(savedChatId);
    }
}

// Update greeting in header
function updateGreeting() {
    const greetingDiv = document.getElementById('greeting');
    if (greetingDiv && currentUser && currentUser.name) {
        const hour = new Date().getHours();
        let greeting;
        if (hour < 12) {
            greeting = 'Good morning';
        } else if (hour < 18) {
            greeting = 'Good afternoon';
        } else {
            greeting = 'Good evening';
        }
        greetingDiv.textContent = `${greeting}, ${currentUser.name}!`;
    }
}

// Setup event listeners (for app functionality after login)
function setupEventListeners() {
    // Header logout button
    document.getElementById('header-logout-btn').addEventListener('click', handleLogout);
    
    // Settings button (placeholder for now)
    document.getElementById('settings-btn').addEventListener('click', () => {
        alert('Settings feature coming soon!');
    });
    
    // New chat button
    document.getElementById('new-chat-btn').addEventListener('click', createNewChat);
    
    // Chat form submission
    document.getElementById('chat-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        await sendMessage();
    });
    
    // File upload
    document.getElementById('file-upload-btn').addEventListener('click', () => {
        document.getElementById('file-upload').click();
    });
    
    document.getElementById('file-upload').addEventListener('change', (e) => {
        selectedFiles = Array.from(e.target.files);
        renderFileList();
    });
    
    // Enter key handling for chat input (Shift+Enter for new line)
    document.getElementById('prompt-input').addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            document.getElementById('chat-form').dispatchEvent(new Event('submit'));
        }
    });
    
    // Auto-resize textarea
    document.getElementById('prompt-input').addEventListener('input', (e) => {
        e.target.style.height = 'auto';
        e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
    });
}

// Handle login
function handleLogin(e) {
    e.preventDefault();
    console.log('Login form submitted');
    
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const password = document.getElementById('login-password').value;
    const errorDiv = document.getElementById('login-error');
    
    console.log('Email:', email);
    console.log('Password entered:', password ? '***' : 'empty');
    
    // Validate email format
    if (!email.endsWith('@geoconinc.com')) {
        errorDiv.textContent = 'Email must be a @geoconinc.com address';
        errorDiv.classList.remove('hidden');
        console.log('Email validation failed');
        return;
    }
    
    // Validate password
    if (password !== DEFAULT_PASSWORD) {
        errorDiv.textContent = 'Invalid password';
        errorDiv.classList.remove('hidden');
        console.log('Password validation failed');
        return;
    }
    
    // Login successful
    console.log('Login successful');
    errorDiv.classList.add('hidden');
    currentUser = { email: email };
    
    // Check if user exists and has name
    const users = getUsers();
    if (users[email] && users[email].name) {
        currentUser.name = users[email].name;
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
        console.log('User has name, showing app');
        showApp();
    } else {
        // First time login - need to set name
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
        console.log('First time login, showing name setup');
        showNameSetup();
    }
}

// Handle name setup
function handleNameSetup(e) {
    e.preventDefault();
    const name = document.getElementById('setup-name').value.trim();
    const errorDiv = document.getElementById('name-error');
    
    if (!name) {
        errorDiv.textContent = 'Please enter your name';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    // Save user with name
    const users = getUsers();
    if (!users[currentUser.email]) {
        users[currentUser.email] = {};
    }
    users[currentUser.email].name = name;
    users[currentUser.email].email = currentUser.email;
    users[currentUser.email].createdAt = new Date().toISOString();
    saveUsers(users);
    
    currentUser.name = name;
    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
    
    showApp();
}

// Handle logout
function handleLogout() {
    if (confirm('Are you sure you want to logout? Your chat history will be saved.')) {
        // Save current chat ID
        if (currentChatId) {
            localStorage.setItem(`current_chat_${currentUser.email}`, currentChatId);
        }
        
        // Clear current user
        currentUser = null;
        localStorage.removeItem(STORAGE_KEY_CURRENT_USER);
        
        // Reset state
        currentChatId = null;
        conversations = [];
        selectedFiles = [];
        
        // Show login
        showLogin();
        
        // Clear forms
        document.getElementById('login-form').reset();
        document.getElementById('name-form').reset();
    }
}

// Check server connection
async function checkServerConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            console.log('Server connection successful');
        }
    } catch (error) {
        console.warn('Cannot connect to server:', error.message);
    }
}

// Create new chat
function createNewChat() {
    currentChatId = null;
    document.getElementById('chat-messages').innerHTML = `
        <div class="welcome-message">
            <h2>Welcome to Geocon AI Copilot</h2>
            <p>Start a new conversation or continue an existing one from the sidebar.</p>
        </div>
    `;
    document.getElementById('prompt-input').value = '';
    selectedFiles = [];
    renderFileList();
    renderChatHistory();
    localStorage.removeItem(`current_chat_${currentUser.email}`);
}

// Load chat
function loadChat(chatId) {
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;
    
    currentChatId = chatId;
    localStorage.setItem(`current_chat_${currentUser.email}`, chatId);
    
    // Render messages
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';
    
    chat.messages.forEach(message => {
        appendMessage(message.role, message.content, message.metadata);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update active state in sidebar
    renderChatHistory();
}

// Send message
async function sendMessage() {
    const promptInput = document.getElementById('prompt-input');
    const prompt = promptInput.value.trim();
    const searchSharePoint = document.getElementById('search-sharepoint').checked;
    const sendBtn = document.getElementById('send-btn');
    const sendIcon = document.getElementById('send-icon');
    const sendLoader = document.getElementById('send-loader');
    
    if (!prompt) return;
    
    // Create new chat if needed
    if (!currentChatId) {
        currentChatId = generateChatId();
        const newChat = {
            id: currentChatId,
            title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            employeeName: currentUser.name,
            employeeEmail: currentUser.email
        };
        conversations.unshift(newChat);
        saveConversations();
        renderChatHistory();
    }
    
    // Get current chat
    const chat = conversations.find(c => c.id === currentChatId);
    
    // Add user message to UI
    appendMessage('user', prompt, {
        filesCount: selectedFiles.length,
        fileNames: selectedFiles.map(f => f.name)
    });
    
    // Add user message to chat
    chat.messages.push({
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        metadata: {
            filesCount: selectedFiles.length,
            fileNames: selectedFiles.map(f => f.name)
        }
    });
    
    // Clear input
    promptInput.value = '';
    promptInput.style.height = 'auto';
    
    // Show loading
    sendBtn.disabled = true;
    sendIcon.classList.add('hidden');
    sendLoader.classList.remove('hidden');
    
    // Add loading message
    const loadingId = 'loading-' + Date.now();
    appendMessage('ai', '...', {}, loadingId);
    
    try {
        // Prepare request
        let requestOptions;
        if (selectedFiles.length > 0) {
            const formData = new FormData();
            formData.append('employeeName', currentUser.name);
            formData.append('prompt', prompt);
            formData.append('searchSharePoint', searchSharePoint);
            
            selectedFiles.forEach(file => {
                formData.append('files', file);
            });
            
            requestOptions = {
                method: 'POST',
                body: formData
            };
        } else {
            requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    employeeName: currentUser.name,
                    prompt: prompt,
                    searchSharePoint: searchSharePoint
                })
            };
        }
        
        const response = await fetch(`${API_BASE_URL}/submit`, requestOptions);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Server error');
        }
        
        // Remove loading message
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        // Add AI response
        appendMessage('ai', data.chatgptResponse, {
            confidentialStatus: data.confidentialStatus,
            checkResults: data.checkResults,
            sharepointSearched: data.sharepointSearched || false,
            sharepointResultsCount: data.sharepointResultsCount || 0,
            filesProcessed: data.filesProcessed || 0
        });
        
        // Add AI message to chat
        chat.messages.push({
            role: 'assistant',
            content: data.chatgptResponse,
            timestamp: new Date().toISOString(),
            metadata: {
                confidentialStatus: data.confidentialStatus,
                checkResults: data.checkResults,
                sharepointSearched: data.sharepointSearched || false,
                sharepointResultsCount: data.sharepointResultsCount || 0,
                filesProcessed: data.filesProcessed || 0
            }
        });
        
        // Update chat title if it's the first message
        if (chat.messages.length === 2) {
            chat.title = prompt.substring(0, 50) + (prompt.length > 50 ? '...' : '');
        }
        
        chat.updatedAt = new Date().toISOString();
        saveConversations();
        renderChatHistory();
        
        // Save to admin submissions (for backward compatibility)
        saveToAdminSubmissions(chat, data);
        
    } catch (error) {
        console.error('Error sending message:', error);
        
        // Remove loading message
        const loadingEl = document.getElementById(loadingId);
        if (loadingEl) loadingEl.remove();
        
        // Show error message
        appendMessage('ai', `Error: ${error.message}`, { error: true });
    } finally {
        sendBtn.disabled = false;
        sendIcon.classList.remove('hidden');
        sendLoader.classList.add('hidden');
        
        // Clear files
        selectedFiles = [];
        document.getElementById('file-upload').value = '';
        renderFileList();
    }
}

// Append message to chat
function appendMessage(role, content, metadata = {}, messageId = null) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${role}`;
    if (messageId) messageDiv.id = messageId;
    
    const avatar = role === 'user' ? (currentUser.name ? currentUser.name.charAt(0).toUpperCase() : 'U') : 'AI';
    const avatarClass = role === 'user' ? 'user' : 'ai';
    
    let messageHTML = `
        <div class="message-avatar ${avatarClass}">${avatar}</div>
        <div class="message-content">
    `;
    
    // Add content
    if (content === '...') {
        messageHTML += '<div class="loader"></div>';
    } else if (metadata.error) {
        messageHTML += `<p style="color: var(--danger-color);">${escapeHtml(content)}</p>`;
    } else {
        messageHTML += formatMessageContent(content);
    }
    
    // Add metadata
    if (metadata.filesCount > 0) {
        messageHTML += `<div class="message-files">Files: ${metadata.filesCount} file(s): ${metadata.fileNames.join(', ')}</div>`;
    }
    
    if (metadata.sharepointSearched) {
        messageHTML += `<div class="sharepoint-info">Searched SharePoint: Found ${metadata.sharepointResultsCount || 0} relevant document(s)</div>`;
    }
    
    if (metadata.confidentialStatus && metadata.confidentialStatus !== 'safe') {
        const warningClass = metadata.confidentialStatus === 'danger' ? 'danger' : 'warning';
        messageHTML += `<div class="confidential-warning ${warningClass}">Warning: Confidential information detected: ${metadata.confidentialStatus}</div>`;
    }
    
    messageHTML += `
            <div class="message-meta">${new Date().toLocaleString()}</div>
        </div>
    `;
    
    messageDiv.innerHTML = messageHTML;
    messagesContainer.appendChild(messageDiv);
    
    // Remove welcome message if present
    const welcomeMsg = messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) welcomeMsg.remove();
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Format message content (markdown-like)
function formatMessageContent(content) {
    if (!content) return '';
    
    let formatted = content;
    
    // Split content into parts (code blocks and regular text)
    const parts = [];
    let lastIndex = 0;
    // Match code blocks with optional language and optional newline
    const codeBlockRegex = /```(\w+)?\n?([\s\S]*?)```/g;
    let match;
    
    // Extract code blocks first
    while ((match = codeBlockRegex.exec(formatted)) !== null) {
        // Add text before code block
        if (match.index > lastIndex) {
            parts.push({ type: 'text', content: formatted.substring(lastIndex, match.index) });
        }
        // Add code block
        parts.push({ 
            type: 'code', 
            language: match[1] || '', 
            content: match[2] 
        });
        lastIndex = match.index + match[0].length;
    }
    
    // Add remaining text
    if (lastIndex < formatted.length) {
        parts.push({ type: 'text', content: formatted.substring(lastIndex) });
    }
    
    // If no code blocks found, treat entire content as text
    if (parts.length === 0) {
        parts.push({ type: 'text', content: formatted });
    }
    
    // Process each part
    let result = '';
    for (const part of parts) {
        if (part.type === 'code') {
            // Code block
            result += `<pre><code class="language-${part.language || 'text'}">${escapeHtml(part.content)}</code></pre>`;
        } else {
            // Regular text - process markdown
            let text = escapeHtml(part.content);
            
            // Headers
            text = text.replace(/^### (.*$)/gim, '<h3>$1</h3>');
            text = text.replace(/^## (.*$)/gim, '<h2>$1</h2>');
            text = text.replace(/^# (.*$)/gim, '<h1>$1</h1>');
            
            // Bold and italic (order matters - bold before italic)
            text = text.replace(/\*\*\*(.*?)\*\*\*/g, '<strong><em>$1</em></strong>');
            text = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
            text = text.replace(/\*(.*?)\*/g, '<em>$1</em>');
            
            // Inline code (but not inside code blocks)
            text = text.replace(/`([^`]+)`/g, '<code>$1</code>');
            
            // Links
            text = text.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
            
            // Horizontal rule
            text = text.replace(/^---$/gm, '<hr>');
            
            // Blockquotes
            text = text.replace(/^>\s+(.+)$/gim, '<blockquote>$1</blockquote>');
            
            // Process lists - need to handle them before splitting paragraphs
            // Unordered lists
            text = text.replace(/(?:^|\n)([-*+]\s+.+(?:\n[-*+]\s+.+)*)/gm, (match) => {
                const items = match.trim().split(/\n/).map(item => {
                    const content = item.replace(/^[-*+]\s+/, '').trim();
                    return `<li>${content}</li>`;
                }).join('');
                return `\n<ul>${items}</ul>\n`;
            });
            
            // Ordered lists
            text = text.replace(/(?:^|\n)(\d+\.\s+.+(?:\n\d+\.\s+.+)*)/gm, (match) => {
                const items = match.trim().split(/\n/).map(item => {
                    const content = item.replace(/^\d+\.\s+/, '').trim();
                    return `<li>${content}</li>`;
                }).join('');
                return `\n<ol>${items}</ol>\n`;
            });
            
            // Split into paragraphs (double newlines)
            const paragraphs = text.split(/\n\n+/);
            const processedParagraphs = paragraphs.map(p => {
                p = p.trim();
                if (!p) return '';
                
                // If it's already a block element, return as is
                if (p.match(/^<(h[1-6]|ul|ol|pre|blockquote|hr)/)) {
                    return p;
                }
                
                // Convert single line breaks to <br> (but preserve block elements)
                p = p.replace(/\n(?!<)/g, '<br>');
                return `<p>${p}</p>`;
            }).filter(p => p).join('');
            
            result += processedParagraphs;
        }
    }
    
    return result || '<p>' + escapeHtml(content) + '</p>';
}

// Escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Render chat history
function renderChatHistory() {
    const historyContainer = document.getElementById('chat-history');
    historyContainer.innerHTML = '';
    
    if (conversations.length === 0) {
        historyContainer.innerHTML = '<div style="padding: 12px; color: var(--sidebar-text); opacity: 0.7; font-size: 13px;">No conversations yet</div>';
        return;
    }
    
    conversations.forEach(chat => {
        const item = document.createElement('div');
        item.className = `chat-history-item ${chat.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <div class="chat-history-item-title" title="${escapeHtml(chat.title)}">${escapeHtml(chat.title)}</div>
            <div class="chat-history-item-actions">
                <button class="chat-history-item-delete" onclick="deleteChat('${chat.id}', event)">×</button>
            </div>
        `;
        item.addEventListener('click', (e) => {
            if (!e.target.classList.contains('chat-history-item-delete')) {
                loadChat(chat.id);
            }
        });
        historyContainer.appendChild(item);
    });
}

// Delete chat
function deleteChat(chatId, event) {
    event.stopPropagation();
    if (confirm('Delete this conversation?')) {
        conversations = conversations.filter(c => c.id !== chatId);
        if (currentChatId === chatId) {
            createNewChat();
        }
        saveConversations();
        renderChatHistory();
    }
}

// File list rendering
function renderFileList() {
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    
    if (selectedFiles.length === 0) return;
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item-inline';
        fileItem.innerHTML = `
            <span>${file.name}</span>
            <button class="file-item-inline-remove" onclick="removeFile(${index})">×</button>
        `;
        fileList.appendChild(fileItem);
    });
}

// Remove file
function removeFile(index) {
    selectedFiles.splice(index, 1);
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    document.getElementById('file-upload').files = dataTransfer.files;
    renderFileList();
}

// Load conversations
function loadConversations() {
    const users = getUsers();
    const userData = users[currentUser.email];
    if (userData && userData.conversations) {
        conversations = userData.conversations;
        // Sort by updatedAt (newest first)
        conversations.sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt));
    } else {
        conversations = [];
    }
}

// Save conversations
function saveConversations() {
    const users = getUsers();
    if (!users[currentUser.email]) {
        users[currentUser.email] = {};
    }
    users[currentUser.email].conversations = conversations;
    users[currentUser.email].name = currentUser.name;
    users[currentUser.email].email = currentUser.email;
    saveUsers(users);
}

// Save to admin submissions (for backward compatibility)
function saveToAdminSubmissions(chat, latestResponse) {
    let submissions = [];
    const stored = localStorage.getItem(STORAGE_KEY_SUBMISSIONS);
    if (stored) {
        try {
            submissions = JSON.parse(stored);
        } catch (e) {
            submissions = [];
        }
    }
    
    // Add submission for each user message
    chat.messages.forEach((msg, index) => {
        if (msg.role === 'user') {
            const aiMsg = chat.messages[index + 1];
            if (aiMsg && aiMsg.role === 'assistant') {
                submissions.push({
                    id: chat.id + '-' + index,
                    employeeName: chat.employeeName,
                    employeeEmail: chat.employeeEmail,
                    prompt: msg.content,
                    chatgptResponse: aiMsg.content,
                    status: aiMsg.metadata?.confidentialStatus || 'safe',
                    checkResults: aiMsg.metadata?.checkResults || [],
                    timestamp: msg.timestamp,
                    date: new Date(msg.timestamp).toLocaleString(),
                    filesProcessed: msg.metadata?.filesCount || 0,
                    conversationId: chat.id
                });
            }
        }
    });
    
    localStorage.setItem(STORAGE_KEY_SUBMISSIONS, JSON.stringify(submissions));
}

// Generate chat ID
function generateChatId() {
    return 'chat-' + Date.now() + '-' + Math.random().toString(36).substring(2, 11);
}
