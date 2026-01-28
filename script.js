// API endpoint - automatically detects if running locally or in production
const API_BASE_URL = window.location.origin + '/api';

// Storage keys
const STORAGE_KEY_USERS = 'geocon_ai_users';
const STORAGE_KEY_CURRENT_USER = 'geocon_ai_current_user';
const STORAGE_KEY_SESSION_TOKEN = 'geocon_ai_session_token';
const STORAGE_KEY_SUBMISSIONS = 'geocon_ai_submissions';

// Global flag to prevent checkAuth from interfering with login
let isLoggingIn = false;

// Password no longer required - email-only login

// State
let currentUser = null;
let currentChatId = null;
let conversations = [];
let selectedFiles = [];
let isSendingMessage = false; // Prevent duplicate message submissions

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    // Set up login form listener immediately (before auth check)
    setupLoginListeners();
    // Only check auth if not already logged in (prevent unnecessary checks)
    // Delay checkAuth slightly to ensure DOM is ready
    setTimeout(() => {
        if (!isLoggingIn) {
            checkAuth();
        }
    }, 50);
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
async function checkAuth() {
    // Don't check auth if we're in the middle of logging in
    if (isLoggingIn) {
        console.log('Login in progress, skipping checkAuth');
        return;
    }
    
    // Don't check auth if app is already shown (prevent race condition)
    const appContainer = document.querySelector('.app-container');
    if (appContainer && !appContainer.classList.contains('hidden')) {
        console.log('App already shown, skipping checkAuth');
        return;
    }
    
    // First try to verify session token (for persistent login)
    const sessionToken = localStorage.getItem(STORAGE_KEY_SESSION_TOKEN);
    if (sessionToken) {
        try {
            const response = await fetch(`${API_BASE_URL}/users/verify-session`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_token: sessionToken })
            });
            
            if (response.ok) {
                const data = await response.json();
                if (data.success && data.user) {
                    // Session is valid, restore user
                    currentUser = {
                        email: data.user.email,
                        name: data.user.name,
                        id: data.user.id
                    };
                    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
                    
                    // Check if user has name
                    if (currentUser.name && currentUser.name.trim()) {
                        showApp();
                    } else {
                        showNameSetup();
                    }
                    return;
                }
            } else {
                // Session invalid or expired, clear it
                console.log('Session token invalid, clearing...');
                localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
            }
        } catch (error) {
            console.error('Error verifying session:', error);
            // Fall through to check saved user
        }
    }
    
    // Fallback: Check saved user and re-login
    const storedUser = localStorage.getItem(STORAGE_KEY_CURRENT_USER);
    if (storedUser) {
        try {
            currentUser = JSON.parse(storedUser);
            
            // Try to fetch latest user data from database (this will also get a new session token)
            try {
                const response = await fetch(`${API_BASE_URL}/users/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ email: currentUser.email })
                });
                
                if (response.ok) {
                    const data = await response.json();
                    // Update with latest data from database
                    currentUser.name = data.user.name;
                    currentUser.id = data.user.id;
                    localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
                    
                    // Save session token if provided
                    if (data.session_token) {
                        localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, data.session_token);
                    }
                    
                    // Also update local storage
                    const users = getUsers();
                    users[currentUser.email] = {
                        email: data.user.email,
                        name: data.user.name,
                        id: data.user.id
                    };
                    saveUsers(users);
                }
            } catch (apiError) {
                console.log('Could not fetch from API, using local data:', apiError);
                // Fallback to local storage if API fails
                const users = getUsers();
                const userData = users[currentUser.email];
                if (userData && userData.name) {
                    currentUser.name = userData.name;
                }
            }
            
            // Check if user has name
            if (currentUser.name && currentUser.name.trim()) {
                // User is logged in and has name
                showApp();
            } else {
                // User logged in but needs to set name
                showNameSetup();
            }
        } catch (e) {
            console.error('Error parsing stored user:', e);
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
    // Don't show login if we're in the middle of logging in
    if (isLoggingIn) {
        console.log('Login in progress, not showing login modal');
        return;
    }
    
    console.log('showLogin() called');
    const loginModal = document.getElementById('login-modal');
    const nameModal = document.getElementById('name-modal');
    const appContainer = document.querySelector('.app-container');
    
    if (loginModal) {
        loginModal.classList.remove('hidden');
        loginModal.style.display = 'flex';
    }
    if (nameModal) {
        nameModal.classList.add('hidden');
        nameModal.style.display = 'none';
    }
    if (appContainer) {
        appContainer.classList.add('hidden');
        appContainer.style.display = 'none';
        appContainer.classList.remove('initialized');
    }
    console.log('Login modal shown, app hidden');
}

// Show name setup modal
function showNameSetup() {
    console.log('showNameSetup() called');
    const loginModal = document.getElementById('login-modal');
    const nameModal = document.getElementById('name-modal');
    const appContainer = document.querySelector('.app-container');
    
    if (loginModal) loginModal.classList.add('hidden');
    if (nameModal) nameModal.classList.remove('hidden');
    if (appContainer) {
        appContainer.classList.add('hidden');
        appContainer.classList.remove('initialized');
    }
    console.log('Name setup modal shown');
}

// Show app (updated version with better error handling)
function showApp() {
    console.log('showApp() called');
    
    // Set flag to prevent checkAuth from interfering
    isLoggingIn = false;
    
    const loginModal = document.getElementById('login-modal');
    const nameModal = document.getElementById('name-modal');
    const appContainer = document.querySelector('.app-container');
    
    if (loginModal) {
        loginModal.classList.add('hidden');
        // Also set display: none to ensure it's completely hidden
        loginModal.style.display = 'none';
    }
    if (nameModal) {
        nameModal.classList.add('hidden');
        nameModal.style.display = 'none';
    }
    if (appContainer) {
        appContainer.classList.remove('hidden');
        appContainer.style.display = 'flex';
        // Initialize app only if not already initialized
        if (!appContainer.classList.contains('initialized')) {
            appContainer.classList.add('initialized');
            initializeApp();
        }
    }
    console.log('App shown, login modal hidden');
}

// Initialize app
async function initializeApp() {
    console.log('initializeApp() called for user:', currentUser?.email);
    
    // Ensure we have a current user
    if (!currentUser) {
        console.error('No current user, redirecting to login');
        // Don't show login if we're in the middle of logging in
        if (!isLoggingIn) {
            showLogin();
        }
        return;
    }
    
    // Display user info
    const userEmailDisplay = document.getElementById('user-email-display');
    if (userEmailDisplay) {
        userEmailDisplay.textContent = currentUser.email;
    }
    
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
    
    // Load conversations (async)
    console.log('Loading conversations...');
    await loadConversations();
    console.log('Conversations loaded, rendering chat history. Count:', conversations.length);
    renderChatHistory();
    console.log('Chat history rendered');
    
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

// Track if event listeners are already set up
let eventListenersSetup = false;

// Setup event listeners (for app functionality after login)
function setupEventListeners() {
    // Only set up once to prevent duplicate listeners
    if (eventListenersSetup) {
        return;
    }
    
    // Header logout button
    const logoutBtn = document.getElementById('header-logout-btn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
    
    // Settings button
    const settingsBtn = document.getElementById('settings-btn');
    if (settingsBtn) {
        settingsBtn.addEventListener('click', showSettings);
    }
    
    // Settings form
    const settingsForm = document.getElementById('settings-form');
    if (settingsForm) {
        settingsForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            handleSettingsSave(e);
        });
    }
    const settingsCancelBtn = document.getElementById('settings-cancel-btn');
    if (settingsCancelBtn) {
        settingsCancelBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            hideSettings(e);
        });
    }
    
    // New chat button
    const newChatBtn = document.getElementById('new-chat-btn');
    if (newChatBtn) {
        newChatBtn.addEventListener('click', createNewChat);
    }
    
    // Chat form submission - use named function to allow removal if needed
    const chatForm = document.getElementById('chat-form');
    if (chatForm) {
        const handleChatSubmit = async (e) => {
            e.preventDefault();
            e.stopPropagation(); // Prevent event bubbling
            await sendMessage();
        };
        chatForm.addEventListener('submit', handleChatSubmit);
    }
    
    // File upload
    const fileUploadBtn = document.getElementById('file-upload-btn');
    if (fileUploadBtn) {
        fileUploadBtn.addEventListener('click', () => {
            document.getElementById('file-upload').click();
        });
    }
    
    const fileUpload = document.getElementById('file-upload');
    if (fileUpload) {
        fileUpload.addEventListener('change', (e) => {
            selectedFiles = Array.from(e.target.files);
            renderFileList();
        });
    }
    
    // Document type selector
    const documentTypeSelect = document.getElementById('document-type');
    if (documentTypeSelect) {
        documentTypeSelect.addEventListener('change', async (e) => {
            const wrapper = document.querySelector('.document-generator-wrapper');
            const promptInput = document.getElementById('prompt-input');
            const selectedType = e.target.value;

            if (selectedType) {
                wrapper.classList.add('active');

                // Update placeholder to indicate document mode
                if (promptInput) {
                    const typeName = e.target.options[e.target.selectedIndex].text.trim();
                    promptInput.placeholder = `Provide information for ${typeName}... (Shift+Enter for new line, Enter to send)`;
                }

                // Prepopulate the textarea with the backend template for this document type
                try {
                    const resp = await fetch(`${API_BASE_URL}/document-format/${selectedType}`);
                    if (resp.ok) {
                        const data = await resp.json();
                        if (promptInput && data.template) {
                            promptInput.value = data.template + '\n\n';
                            // Trigger auto-resize
                            promptInput.style.height = 'auto';
                            promptInput.style.height = Math.min(promptInput.scrollHeight, 200) + 'px';
                        }
                    } else {
                        console.warn('Could not load document template:', await resp.text());
                    }
                } catch (err) {
                    console.error('Error loading document template:', err);
                }
            } else {
                wrapper.classList.remove('active');
                // Reset placeholder and clear any prefilled template
                if (promptInput) {
                    promptInput.placeholder = 'Type your message... (Shift+Enter for new line, Enter to send)';
                    promptInput.value = '';
                    promptInput.style.height = 'auto';
                }
            }
        });
    }
    
    // Enter key handling for chat input (Shift+Enter for new line)
    const promptInput = document.getElementById('prompt-input');
    if (promptInput) {
        promptInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                e.stopPropagation(); // Prevent duplicate submissions
                const chatForm = document.getElementById('chat-form');
                if (chatForm) {
                    chatForm.dispatchEvent(new Event('submit'));
                }
            }
        });
    }
    
    // Auto-resize textarea
    if (promptInput) {
        promptInput.addEventListener('input', (e) => {
            e.target.style.height = 'auto';
            e.target.style.height = Math.min(e.target.scrollHeight, 200) + 'px';
        });
    }
    
    eventListenersSetup = true;
}

// Handle login
async function handleLogin(e) {
    e.preventDefault();
    console.log('Login form submitted');
    
    // Set flag to prevent checkAuth from interfering
    isLoggingIn = true;
    
    const email = document.getElementById('login-email').value.trim().toLowerCase();
    const errorDiv = document.getElementById('login-error');
    
    console.log('Email:', email);
    
    // Validate email format
    if (!email.endsWith('@geoconinc.com')) {
        errorDiv.textContent = 'Email must be a @geoconinc.com address';
        errorDiv.classList.remove('hidden');
        console.log('Email validation failed');
        isLoggingIn = false;
        return;
    }
    
    errorDiv.classList.add('hidden');
    
    try {
        // Login via API to get/create user in database
        const response = await fetch(`${API_BASE_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email: email })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Login failed');
        }
        
        const data = await response.json();
        console.log('Login successful, user data:', data);
        
        // Set current user from database
        currentUser = {
            email: data.user.email,
            name: data.user.name,
            id: data.user.id
        };
        
        // Save session token for persistent login
        if (data.session_token) {
            localStorage.setItem(STORAGE_KEY_SESSION_TOKEN, data.session_token);
        }
        
        // Save to localStorage for offline access
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
        
        // Also update local users storage
        const users = getUsers();
        users[email] = {
            email: data.user.email,
            name: data.user.name,
            id: data.user.id
        };
        saveUsers(users);
        
        // Check if user has name
        if (currentUser.name && currentUser.name.trim()) {
            console.log('User has name, showing app');
            // Clear any error messages
            errorDiv.classList.add('hidden');
            // Clear login form
            const loginForm = document.getElementById('login-form');
            if (loginForm) loginForm.reset();
            // Show app immediately - use setTimeout to prevent race condition with checkAuth
            setTimeout(() => {
                showApp();
                // Reset flag after showing app
                isLoggingIn = false;
            }, 100);
        } else {
            // First time login - need to set name
            console.log('First time login, showing name setup');
            // Clear any error messages
            errorDiv.classList.add('hidden');
            // Clear login form
            const loginForm = document.getElementById('login-form');
            if (loginForm) loginForm.reset();
            // Show name setup
            setTimeout(() => {
                showNameSetup();
                // Reset flag after showing name setup
                isLoggingIn = false;
            }, 100);
        }
    } catch (error) {
        console.error('Login error:', error);
        errorDiv.textContent = error.message || 'Login failed. Please try again.';
        errorDiv.classList.remove('hidden');
        // Reset flag on error
        isLoggingIn = false;
    }
}

// Handle name setup
async function handleNameSetup(e) {
    e.preventDefault();
    const name = document.getElementById('setup-name').value.trim();
    const errorDiv = document.getElementById('name-error');
    
    if (!name) {
        errorDiv.textContent = 'Please enter your name';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    errorDiv.classList.add('hidden');
    
    try {
        // Save name to database via API
        const response = await fetch(`${API_BASE_URL}/users/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                email: currentUser.email,
                name: name
            })
        });
        
        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error || 'Failed to save name');
        }
        
        const data = await response.json();
        console.log('Name saved to database:', data);
        
        // Update current user
        currentUser.name = name;
        currentUser.id = data.user.id;
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
        
        // Also save to local storage for offline access
        const users = getUsers();
        if (!users[currentUser.email]) {
            users[currentUser.email] = {};
        }
        users[currentUser.email].name = name;
        users[currentUser.email].email = currentUser.email;
        users[currentUser.email].id = data.user.id;
        users[currentUser.email].createdAt = new Date().toISOString();
        saveUsers(users);
        
        showApp();
    } catch (error) {
        console.error('Error saving name:', error);
        errorDiv.textContent = error.message || 'Failed to save name. Please try again.';
        errorDiv.classList.remove('hidden');
    }
}

// Show settings modal
function showSettings() {
    const settingsModal = document.getElementById('settings-modal');
    const nameInput = document.getElementById('settings-name');
    
    // Populate current name
    if (currentUser && currentUser.name) {
        nameInput.value = currentUser.name;
    }
    
    settingsModal.classList.remove('hidden');
}

// Hide settings modal
function hideSettings(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const settingsModal = document.getElementById('settings-modal');
    if (settingsModal) {
        settingsModal.classList.add('hidden');
    }
    const errorDiv = document.getElementById('settings-error');
    if (errorDiv) {
        errorDiv.classList.add('hidden');
    }
    // Don't navigate anywhere - just hide the modal
    return false; // Prevent any default behavior
}

// Handle settings save
async function handleSettingsSave(e) {
    e.preventDefault();
    const newName = document.getElementById('settings-name').value.trim();
    const errorDiv = document.getElementById('settings-error');
    
    if (!newName) {
        errorDiv.textContent = 'Name is required';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    if (!currentUser || !currentUser.id) {
        errorDiv.textContent = 'User not found. Please log in again.';
        errorDiv.classList.remove('hidden');
        return;
    }
    
    errorDiv.classList.add('hidden');
    
    try {
        // Update name in database via API
        const response = await fetch(`${API_BASE_URL}/users/${currentUser.id}/update-name`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                name: newName
            })
        });
        
        // Check response status first
        if (!response.ok) {
            // Try to get JSON error, but handle HTML errors
            let errorMessage = 'Failed to update name';
            try {
                const contentType = response.headers.get('content-type');
                if (contentType && contentType.includes('application/json')) {
                    const errorData = await response.json();
                    errorMessage = errorData.error || errorMessage;
                } else {
                    const text = await response.text();
                    console.error('Non-JSON error response:', text.substring(0, 200));
                    errorMessage = `Server error (${response.status}). Please check the console.`;
                }
            } catch (e) {
                errorMessage = `Server error (${response.status})`;
            }
            throw new Error(errorMessage);
        }
        
        // Parse successful JSON response
        const contentType = response.headers.get('content-type');
        if (!contentType || !contentType.includes('application/json')) {
            const text = await response.text();
            console.error('Non-JSON response:', text.substring(0, 200));
            throw new Error('Server returned an invalid response format.');
        }
        
        const data = await response.json();
        console.log('Name updated in database:', data);
        
        // Update current user
        currentUser.name = newName;
        localStorage.setItem(STORAGE_KEY_CURRENT_USER, JSON.stringify(currentUser));
        
        // Also update local storage
        const users = getUsers();
        if (!users[currentUser.email]) {
            users[currentUser.email] = {};
        }
        users[currentUser.email].name = newName;
        users[currentUser.email].id = currentUser.id;
        saveUsers(users);
        
        // Update greeting
        updateGreeting();
        
        // Hide settings modal
        hideSettings();
        
        // Show success message
        alert('Display name updated successfully!');
    } catch (error) {
        console.error('Error updating name:', error);
        errorDiv.textContent = error.message || 'Failed to update name. Please try again.';
        errorDiv.classList.remove('hidden');
    }
}

// Handle logout
function handleLogout() {
    if (confirm('Are you sure you want to logout? Your chat history will be saved.')) {
        // Save current chat ID
        if (currentChatId) {
            localStorage.setItem(`current_chat_${currentUser.email}`, currentChatId);
        }
        
        // Clear session token
        localStorage.removeItem(STORAGE_KEY_SESSION_TOKEN);
        
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
async function createNewChat() {
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
    
    // Note: Conversation will be created in database when first message is sent
}

// Load chat
async function loadChat(chatId) {
    const chat = conversations.find(c => c.id === chatId);
    if (!chat) return;
    
    currentChatId = chatId;
    localStorage.setItem(`current_chat_${currentUser.email}`, chatId);
    
    // Load messages from database if available (they have proper timestamps)
    if (currentUser && currentUser.id) {
        try {
            const response = await fetch(`${API_BASE_URL}/users/${currentUser.id}/conversations`);
            if (response.ok) {
                const dbConversations = await response.json();
                const dbChat = dbConversations.find(c => c.id === chatId);
                if (dbChat && dbChat.messages && dbChat.messages.length > 0) {
                    // Use database messages (they have proper timestamps)
                    chat.messages = dbChat.messages.map(msg => ({
                        role: msg.role,
                        content: msg.content,
                        timestamp: msg.timestamp || msg.created_at,
                        metadata: msg.metadata || {}
                    }));
                }
            }
        } catch (error) {
            console.log('Could not load messages from database, using local:', error);
        }
    }
    
    // Render messages
    const messagesContainer = document.getElementById('chat-messages');
    messagesContainer.innerHTML = '';
    
    // Sort messages by timestamp
    const sortedMessages = [...chat.messages].sort((a, b) => {
        const timeA = new Date(a.timestamp || a.created_at || 0);
        const timeB = new Date(b.timestamp || b.created_at || 0);
        return timeA - timeB;
    });
    
    sortedMessages.forEach(message => {
        appendMessage(message.role, message.content, message.metadata);
    });
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
    
    // Update active state in sidebar
    renderChatHistory();
}

// Send message
async function sendMessage() {
    // Prevent duplicate submissions
    if (isSendingMessage) {
        console.log('Message already being sent, ignoring duplicate request');
        return;
    }
    
    const promptInput = document.getElementById('prompt-input');
    const prompt = promptInput.value.trim();
    const searchSharePoint = document.getElementById('search-sharepoint').checked;
    const sendBtn = document.getElementById('send-btn');
    const sendIcon = document.getElementById('send-icon');
    const sendLoader = document.getElementById('send-loader');
    
    if (!prompt) return;
    
    // Set flag to prevent duplicate submissions
    isSendingMessage = true;
    
    // Create new chat if needed
    if (!currentChatId) {
        currentChatId = generateChatId();
        const newChat = {
            id: currentChatId,
            title: prompt.substring(0, 50) + (prompt.length > 50 ? '...' : ''),
            messages: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            employeeName: currentUser?.name || '',
            employeeEmail: currentUser.email
        };
        conversations.unshift(newChat);
        
        // Create conversation in database immediately
        if (currentUser && currentUser.id) {
            try {
                const response = await fetch(`${API_BASE_URL}/conversations`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        user_id: currentUser.id,
                        id: currentChatId,
                        title: newChat.title
                    })
                });
                
                if (!response.ok) {
                    console.error('Failed to create conversation in database');
                }
            } catch (error) {
                console.error('Error creating conversation in database:', error);
            }
        }
        
        saveConversations();
        renderChatHistory();
    }
    
    // Get current chat
    const chat = conversations.find(c => c.id === currentChatId);
    
    // Build metadata for this user message
    const userMetadata = {
        filesCount: selectedFiles.length,
        fileNames: selectedFiles.map(f => f.name)
    };
    
    // Add user message to UI immediately
    appendMessage('user', prompt, userMetadata);
    
    // Add user message to chat (local state)
    chat.messages.push({
        role: 'user',
        content: prompt,
        timestamp: new Date().toISOString(),
        metadata: userMetadata
    });
    
    // Show loading state *before* any network calls so UI responds instantly
    sendBtn.disabled = true;
    sendIcon.classList.add('hidden');
    sendLoader.classList.remove('hidden');
    
    // Add loading message with dots animation
    const loadingId = 'loading-' + Date.now();
    appendLoadingMessage(loadingId);
    
    // Fire-and-forget save of user message to database (don't block UI)
    if (currentUser && currentUser.id && currentChatId) {
        fetch(`${API_BASE_URL}/conversations/${currentChatId}/messages`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                conversation_id: currentChatId,
                role: 'user',
                content: prompt,
                metadata: userMetadata
            })
        }).catch(error => {
            console.error('Error saving user message to database:', error);
        });
    }
    
    // Clear input after we've updated the UI
    promptInput.value = '';
    promptInput.style.height = 'auto';
    
    try {
        // Get document type if selected
        const documentTypeSelect = document.getElementById('document-type');
        const documentType = documentTypeSelect ? documentTypeSelect.value : '';
        
        // Prepare request
        let requestOptions;
        if (selectedFiles.length > 0) {
            const formData = new FormData();
            formData.append('employeeName', currentUser?.name || '');
            formData.append('prompt', prompt);
            formData.append('searchSharePoint', searchSharePoint);
            if (documentType) {
                formData.append('documentType', documentType);
            }
            
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
                    employeeName: currentUser?.name || '',
                    prompt: prompt,
                    searchSharePoint: searchSharePoint,
                    documentType: documentType || null
                })
            };
        }
        
        const response = await fetch(`${API_BASE_URL}/submit`, requestOptions);
        const data = await response.json();
        
        if (!response.ok) {
            throw new Error(data.error || 'Server error');
        }
        
        // Replace loading message with AI response (using same ID)
        const aiMetadata = {
            confidentialStatus: data.confidentialStatus,
            checkResults: data.checkResults,
            sharepointSearched: data.sharepointSearched || false,
            sharepointResultsCount: data.sharepointResultsCount || 0,
            filesProcessed: data.filesProcessed || 0,
            ...(data.aiMetadata || {})  // Include AI metadata (tokens, latency, model, etc.)
        };
        
        appendMessage('ai', data.chatgptResponse, aiMetadata, loadingId);
        
        // Add AI message to chat
        chat.messages.push({
            role: 'assistant',
            content: data.chatgptResponse,
            timestamp: new Date().toISOString(),
            metadata: aiMetadata
        });
        
        // Save assistant message to database with full metadata
        if (currentUser && currentUser.id && currentChatId) {
            try {
                await fetch(`${API_BASE_URL}/conversations/${currentChatId}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversation_id: currentChatId,
                        role: 'assistant',
                        content: data.chatgptResponse,
                        metadata: aiMetadata
                    })
                });
            } catch (error) {
                console.error('Error saving assistant message to database:', error);
            }
        }
        
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
        
        // Replace loading message with error message
        appendMessage('ai', `Error: ${error.message}`, { error: true }, loadingId);
    } finally {
        // Reset flag to allow new submissions
        isSendingMessage = false;
        
        sendBtn.disabled = false;
        sendIcon.classList.remove('hidden');
        sendLoader.classList.add('hidden');
        
        // Clear files
        selectedFiles = [];
        document.getElementById('file-upload').value = '';
        renderFileList();
    }
}

// Append loading message (just dots, no background)
function appendLoadingMessage(messageId) {
    const messagesContainer = document.getElementById('chat-messages');
    const messageDiv = document.createElement('div');
    messageDiv.className = 'message ai loading-message';
    messageDiv.id = messageId;
    
    messageDiv.innerHTML = `
        <div class="message-avatar ai">AI</div>
        <div class="message-content-loading">
            <div class="typing-dots">
                <span></span>
                <span></span>
                <span></span>
            </div>
        </div>
    `;
    
    messagesContainer.appendChild(messageDiv);
    
    // Remove welcome message if present
    const welcomeMsg = messagesContainer.querySelector('.welcome-message');
    if (welcomeMsg) welcomeMsg.remove();
    
    // Scroll to bottom
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Append message to chat
function appendMessage(role, content, metadata = {}, messageId = null) {
    const messagesContainer = document.getElementById('chat-messages');
    
    // If there's a loading message with this ID, replace it
    if (messageId) {
        const loadingEl = document.getElementById(messageId);
        if (loadingEl) {
            loadingEl.remove();
        }
    }
    
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
    if (metadata.error) {
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
    console.log('renderChatHistory() called, conversations count:', conversations.length);
    const historyContainer = document.getElementById('chat-history');
    if (!historyContainer) {
        console.error('Chat history container not found!');
        return;
    }
    historyContainer.innerHTML = '';
    
    if (conversations.length === 0) {
        historyContainer.innerHTML = '<div style="padding: 12px; color: var(--sidebar-text); opacity: 0.7; font-size: 13px;">No conversations yet</div>';
        console.log('No conversations to render');
        return;
    }
    
    console.log('Rendering', conversations.length, 'conversations');
    
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
async function deleteChat(chatId, event) {
    event.stopPropagation();
    if (confirm('Delete this conversation?')) {
        // Delete from database
        if (currentUser && currentUser.id) {
            try {
                const response = await fetch(`${API_BASE_URL}/conversations/${chatId}?user_id=${currentUser.id}`, {
                    method: 'DELETE'
                });
                
                if (!response.ok) {
                    const errorData = await response.json();
                    throw new Error(errorData.error || 'Failed to delete conversation');
                }
            } catch (error) {
                console.error('Error deleting conversation from database:', error);
                alert('Failed to delete conversation from database. Please try again.');
                return;
            }
        }
        
        // Remove from local array
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

// Load conversations from both database and localStorage
async function loadConversations() {
    console.log('loadConversations() called for user:', currentUser?.email, 'ID:', currentUser?.id);
    
    // First try to load from database
    if (currentUser && currentUser.id) {
        try {
            console.log(`Fetching conversations from: ${API_BASE_URL}/users/${currentUser.id}/conversations`);
            const response = await fetch(`${API_BASE_URL}/users/${currentUser.id}/conversations`);
            console.log('Response status:', response.status, response.statusText);
            
            if (response.ok) {
                const dbConversations = await response.json();
                console.log('Loaded conversations from database:', dbConversations?.length || 0, 'Type:', typeof dbConversations, 'Is Array:', Array.isArray(dbConversations));
                
                // Handle both empty arrays and arrays with data
                if (dbConversations && Array.isArray(dbConversations)) {
                    if (dbConversations.length > 0) {
                    // Convert database format to local format
                    conversations = dbConversations.map(conv => ({
                        id: conv.id,
                        title: conv.title || 'Untitled Chat',
                        messages: conv.messages || [],
                        createdAt: conv.created_at,
                        updatedAt: conv.updated_at,
                        employeeName: conv.employeeName || currentUser?.name || '',
                        employeeEmail: conv.employeeEmail || currentUser?.email || ''
                    }));
                    // Sort by updatedAt (newest first)
                    conversations.sort((a, b) => {
                        const dateA = new Date(a.updatedAt || a.createdAt || 0);
                        const dateB = new Date(b.updatedAt || b.createdAt || 0);
                        return dateB - dateA;
                    });
                        console.log('Processed conversations:', conversations.length);
                        // Save to localStorage for offline access
                        saveConversations();
                        return;
                    } else {
                        console.log('Database returned empty array - no conversations found');
                        conversations = [];
                        // Still save empty array to localStorage
                        saveConversations();
                        return;
                    }
                } else {
                    console.warn('Database response is not an array:', dbConversations);
                }
            } else {
                const errorText = await response.text();
                console.error('Failed to load conversations from database:', response.status, errorText);
            }
        } catch (error) {
            console.error('Error loading from database:', error);
            console.log('Falling back to localStorage');
        }
    } else {
        console.warn('No currentUser or user ID, cannot load from database');
    }
    
    // Fallback to localStorage
    const users = getUsers();
    const userData = users[currentUser?.email];
    if (userData && userData.conversations) {
        conversations = userData.conversations;
        // Sort by updatedAt (newest first)
        conversations.sort((a, b) => {
            const dateA = new Date(a.updatedAt || a.createdAt || 0);
            const dateB = new Date(b.updatedAt || b.createdAt || 0);
            return dateB - dateA;
        });
        console.log('Loaded conversations from localStorage:', conversations.length);
    } else {
        conversations = [];
        console.log('No conversations found in localStorage');
    }
}

// Save conversations to both database and localStorage
async function saveConversations() {
    // Save to localStorage for offline access
    const users = getUsers();
    if (!users[currentUser.email]) {
        users[currentUser.email] = {};
    }
    users[currentUser.email].conversations = conversations;
    users[currentUser.email].name = currentUser.name;
    users[currentUser.email].email = currentUser.email;
    saveUsers(users);
    
    // Also save to database if user has ID
    if (currentUser && currentUser.id) {
        try {
            // Save each conversation to database
            for (const chat of conversations) {
                await saveConversationToDatabase(chat);
            }
        } catch (error) {
            console.error('Error saving conversations to database:', error);
            // Continue even if database save fails
        }
    }
}

// Save a single conversation to database
async function saveConversationToDatabase(chat) {
    if (!currentUser || !currentUser.id) return;
    
    try {
        // Create or update conversation
        let response = await fetch(`${API_BASE_URL}/conversations`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: currentUser.id,
                id: chat.id,
                title: chat.title || 'New Chat'
            })
        });
        
        if (!response.ok) {
            console.warn('Failed to save conversation to database:', await response.text());
            return;
        }
        
        // Save all messages with proper timing
        for (const message of chat.messages) {
            try {
                await fetch(`${API_BASE_URL}/conversations/${chat.id}/messages`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        conversation_id: chat.id,
                        role: message.role,
                        content: message.content,
                        metadata: {
                            ...(message.metadata || {}),
                            // Preserve timestamp if available
                            timestamp: message.timestamp || message.created_at || new Date().toISOString()
                        }
                    })
                });
            } catch (msgError) {
                console.error('Error saving message to database:', msgError);
                // Continue with other messages
            }
        }
    } catch (error) {
        console.error('Error saving conversation to database:', error);
    }
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
                    employeeName: chat.employeeName || currentUser?.name || '',
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
