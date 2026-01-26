// Storage keys
const STORAGE_KEY_SUBMISSIONS = 'geocon_ai_submissions';
const STORAGE_KEY_USERS = 'geocon_ai_users';

// State
let allSubmissions = [];
let filteredSubmissions = [];
let employees = [];
let selectedEmployeeId = null;
let currentView = 'employees'; // 'employees', 'details', or 'audit'
let auditLogs = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeAdmin();
    loadEmployees();
});

function initializeAdmin() {
    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const backBtn = document.getElementById('back-to-employees-btn');
    const auditLogsBtn = document.getElementById('audit-logs-btn');
    const auditRefreshBtn = document.getElementById('audit-refresh-btn');
    const backFromAuditBtn = document.getElementById('back-to-employees-from-audit-btn');
    
    refreshBtn.addEventListener('click', () => {
        if (currentView === 'employees') {
            loadEmployees();
        } else if (currentView === 'details') {
            loadEmployeeDetails(selectedEmployeeId);
        } else if (currentView === 'audit') {
            loadAuditLogs();
        }
    });
    
    exportBtn.addEventListener('click', () => {
        exportToJSON();
    });
    
    clearBtn.addEventListener('click', () => {
        clearAllData();
    });
    
    if (backBtn) {
        backBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showEmployeesView();
            return false;
        });
    }
    
    if (auditRefreshBtn) {
        auditRefreshBtn.addEventListener('click', () => {
            loadAuditLogs();
        });
    }
    
    if (backFromAuditBtn) {
        backFromAuditBtn.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            showEmployeesView();
            return false;
        });
    }
    
    // Audit logs button
    const auditLogsBtn = document.getElementById('audit-logs-btn');
    if (auditLogsBtn) {
        auditLogsBtn.addEventListener('click', () => {
            loadAuditLogs();
        });
    }
    
    // Audit log filters
    const auditActionFilter = document.getElementById('audit-action-type-filter');
    const auditCategoryFilter = document.getElementById('audit-category-filter');
    const auditStatusFilter = document.getElementById('audit-status-filter');
    const auditEmailFilter = document.getElementById('audit-user-email-filter');
    
    if (auditActionFilter) {
        auditActionFilter.addEventListener('change', loadAuditLogs);
    }
    if (auditCategoryFilter) {
        auditCategoryFilter.addEventListener('change', loadAuditLogs);
    }
    if (auditStatusFilter) {
        auditStatusFilter.addEventListener('change', loadAuditLogs);
    }
    if (auditEmailFilter) {
        auditEmailFilter.addEventListener('input', debounce(loadAuditLogs, 500));
    }
}

function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

async function loadSubmissions() {
    const container = document.getElementById('submissions-container');
    const loading = document.getElementById('loading');
    
    container.innerHTML = '';
    loading.classList.remove('hidden');
    
    try {
        // Get current user email from localStorage for admin auth
        const currentUser = JSON.parse(localStorage.getItem('geocon_ai_current_user') || '{}');
        const userEmail = currentUser.email || '';
        
        // Fetch stats from database API with admin auth
        const statsResponse = await fetch(`${window.location.origin}/api/admin/stats?email=${encodeURIComponent(userEmail)}`);
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            updateStatsFromAPI(stats);
        } else if (statsResponse.status === 403) {
            container.innerHTML = `
                <div class="error-message">
                    <h3>Access Denied</h3>
                    <p>You do not have permission to access the admin dashboard.</p>
                    <p>Only authorized administrators can view this page.</p>
                    <a href="index.html" class="nav-link" onclick="event.preventDefault(); window.location.href='index.html'; return false;">← Back to Chat</a>
                </div>
            `;
            loading.classList.add('hidden');
            return;
        }
        
        // Fetch submissions from database API
        const submissionsResponse = await fetch(`${window.location.origin}/api/submissions`);
        if (submissionsResponse.ok) {
            const submissions = await submissionsResponse.json();
            allSubmissions = submissions;
            console.log(`Loaded ${allSubmissions.length} submissions from database`);
        } else {
            // Fallback to localStorage if API fails
            console.log('API failed, falling back to localStorage');
            allSubmissions = getAllSubmissions();
        }
        
        // Extract unique employees
        extractEmployees();
        
        // Update employee filter dropdown
        updateEmployeeFilter();
        
        // Update stats (will use API stats if available)
        if (!statsResponse || !statsResponse.ok) {
            updateStats(allSubmissions);
        }
        
        // Apply filters and display
        applyFilters();
        
    } catch (error) {
        console.error('Error loading submissions:', error);
        // Fallback to localStorage
        try {
            allSubmissions = getAllSubmissions();
            updateStats(allSubmissions);
            extractEmployees();
            updateEmployeeFilter();
            applyFilters();
        } catch (fallbackError) {
            container.innerHTML = `
                <div class="error-message">
                    <h3>Error Loading Submissions</h3>
                    <p>${error.message}</p>
                    <p>Please refresh the page or check your connection.</p>
                </div>
            `;
        }
    } finally {
        loading.classList.add('hidden');
    }
}

function updateStatsFromAPI(stats) {
    const totalCountEl = document.getElementById('total-count');
    const employeeCountEl = document.getElementById('employee-count');
    const flaggedCountEl = document.getElementById('flagged-count');
    const dangerCountEl = document.getElementById('danger-count');
    
    if (totalCountEl) totalCountEl.textContent = stats.total || 0;
    if (employeeCountEl) employeeCountEl.textContent = stats.employees || 0;
    if (flaggedCountEl) flaggedCountEl.textContent = stats.flagged || 0;
    if (dangerCountEl) dangerCountEl.textContent = stats.danger || 0;
}

function getAllSubmissions() {
    const submissions = [];
    
    // Get from submissions storage
    try {
        const submissionsData = localStorage.getItem(STORAGE_KEY_SUBMISSIONS);
        if (submissionsData) {
            const parsed = JSON.parse(submissionsData);
            if (Array.isArray(parsed)) {
                submissions.push(...parsed);
            }
        }
    } catch (error) {
        console.error('Error reading submissions:', error);
    }
    
    // Get from conversations storage (all users)
    try {
        const usersData = localStorage.getItem(STORAGE_KEY_USERS);
        if (usersData) {
            const users = JSON.parse(usersData);
            Object.keys(users).forEach(email => {
                const user = users[email];
                if (user.conversations && Array.isArray(user.conversations)) {
                    user.conversations.forEach(chat => {
                        if (chat.messages && Array.isArray(chat.messages)) {
                            chat.messages.forEach((msg, index) => {
                                if (msg.role === 'user') {
                                    const aiMsg = chat.messages[index + 1];
                                    if (aiMsg && aiMsg.role === 'assistant') {
                                        submissions.push({
                                            id: chat.id + '-' + index,
                                            employeeName: chat.employeeName || user.name || 'Unknown',
                                            employeeEmail: chat.employeeEmail || email,
                                            prompt: msg.content,
                                            chatgptResponse: aiMsg.content,
                                            status: aiMsg.metadata?.confidentialStatus || 'safe',
                                            checkResults: aiMsg.metadata?.checkResults || [],
                                            timestamp: msg.timestamp || chat.createdAt,
                                            date: msg.timestamp ? new Date(msg.timestamp).toLocaleString() : (chat.createdAt ? new Date(chat.createdAt).toLocaleString() : 'Unknown date'),
                                            filesProcessed: msg.metadata?.filesCount || 0,
                                            sharepointSearched: aiMsg.metadata?.sharepointSearched || false,
                                            conversationId: chat.id
                                        });
                                    }
                                }
                            });
                        }
                    });
                }
            });
        }
    } catch (error) {
        console.error('Error reading conversations:', error);
    }
    
    // Remove duplicates based on ID
    const uniqueSubmissions = [];
    const seenIds = new Set();
    submissions.forEach(sub => {
        if (!seenIds.has(sub.id)) {
            seenIds.add(sub.id);
            uniqueSubmissions.push(sub);
        }
    });
    
    // Sort by timestamp (newest first)
    uniqueSubmissions.sort((a, b) => {
        const timeA = new Date(a.timestamp || a.date || 0).getTime();
        const timeB = new Date(b.timestamp || b.date || 0).getTime();
        return timeB - timeA;
    });
    
    return uniqueSubmissions;
}

function extractEmployees() {
    const employeeSet = new Set();
    allSubmissions.forEach(sub => {
        if (sub.employeeName) {
            employeeSet.add(sub.employeeName);
        }
        if (sub.employeeEmail) {
            employeeSet.add(sub.employeeEmail);
        }
    });
    employees = Array.from(employeeSet).sort();
}

function updateEmployeeFilter() {
    const filter = document.getElementById('employee-filter');
    const currentValue = filter.value;
    
    // Clear existing options except "All"
    filter.innerHTML = '<option value="all">All Employees</option>';
    
    // Add employee options
    employees.forEach(employee => {
        const option = document.createElement('option');
        option.value = employee;
        option.textContent = employee;
        filter.appendChild(option);
    });
    
    // Restore selection if still valid
    if (currentValue !== 'all' && employees.includes(currentValue)) {
        filter.value = currentValue;
    }
}

function applyFilters() {
    const employeeFilter = document.getElementById('employee-filter').value;
    const statusFilter = document.getElementById('status-filter').value;
    
    filteredSubmissions = allSubmissions.filter(sub => {
        // Employee filter
        if (employeeFilter !== 'all') {
            const matchesEmployee = 
                (sub.employeeName && sub.employeeName === employeeFilter) ||
                (sub.employeeEmail && sub.employeeEmail === employeeFilter);
            if (!matchesEmployee) return false;
        }
        
        // Status filter
        if (statusFilter !== 'all') {
            if (sub.status !== statusFilter) return false;
        }
        
        return true;
    });
    
    // Update stats for filtered results
    updateStats(filteredSubmissions, true);
    
    // Display filtered submissions
    displaySubmissions(filteredSubmissions);
}

function updateStats(submissions, isFiltered = false) {
    if (!submissions || !Array.isArray(submissions)) {
        submissions = [];
    }
    
    const total = submissions.length;
    const flagged = submissions.filter(s => s && s.status && s.status !== 'safe').length;
    const danger = submissions.filter(s => s && s.status === 'danger').length;
    
    // Get unique employees
    const uniqueEmployees = new Set();
    submissions.forEach(s => {
        if (s) {
            if (s.employeeName) uniqueEmployees.add(s.employeeName);
            if (s.employeeEmail) uniqueEmployees.add(s.employeeEmail);
        }
    });
    
    const totalCountEl = document.getElementById('total-count');
    const employeeCountEl = document.getElementById('employee-count');
    const flaggedCountEl = document.getElementById('flagged-count');
    const dangerCountEl = document.getElementById('danger-count');
    
    if (totalCountEl) totalCountEl.textContent = total;
    if (employeeCountEl) employeeCountEl.textContent = uniqueEmployees.size;
    if (flaggedCountEl) flaggedCountEl.textContent = flagged;
    if (dangerCountEl) dangerCountEl.textContent = danger;
    
    // Update label if filtered
    if (isFiltered && submissions.length < allSubmissions.length && totalCountEl) {
        const labelEl = totalCountEl.parentElement.querySelector('.stat-label');
        if (labelEl) {
            labelEl.textContent = `Showing ${total} of ${allSubmissions.length}`;
        }
    } else if (totalCountEl) {
        const labelEl = totalCountEl.parentElement.querySelector('.stat-label');
        if (labelEl) {
            labelEl.textContent = 'Total Submissions';
        }
    }
}

function displaySubmissions(submissions) {
    const container = document.getElementById('submissions-container');
    
    if (submissions.length === 0) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="empty-icon"></div>
                <h3>No submissions found</h3>
                <p>Try adjusting your filters or check back later.</p>
            </div>
        `;
        return;
    }
    
    let html = '<div class="submissions-grid">';
    
    submissions.forEach(submission => {
        const id = submission.id || 'N/A';
        const employeeName = submission.employeeName || 'Unknown';
        const employeeEmail = submission.employeeEmail || '';
        const prompt = submission.prompt || '';
        const response = submission.chatgptResponse || 'No response';
        const date = submission.date || submission.timestamp || 'Unknown date';
        const status = submission.status || 'unknown';
        const statusClass = status === 'safe' ? 'safe' : (status === 'danger' ? 'danger' : 'warning');
        const filesCount = submission.filesProcessed || 0;
        const sharepointSearched = submission.sharepointSearched || false;
        
        html += `
            <div class="submission-card-admin">
                <div class="submission-header-admin">
                    <div class="submission-id-section">
                        <div class="submission-id">ID: <strong>${escapeHtml(String(id))}</strong></div>
                        <div class="submission-employee">
                            <span class="employee-name">${escapeHtml(employeeName)}</span>
                            ${employeeEmail ? `<span class="employee-email">${escapeHtml(employeeEmail)}</span>` : ''}
                        </div>
                    </div>
                    <div class="submission-meta">
                        <div class="submission-date">${escapeHtml(date)}</div>
                        ${filesCount > 0 ? `<div class="submission-badge">Files: ${filesCount}</div>` : ''}
                        ${sharepointSearched ? `<div class="submission-badge">SharePoint</div>` : ''}
                    </div>
                    <span class="submission-status ${statusClass}">
                        ${status === 'safe' ? 'Safe' : status === 'danger' ? 'Unsafe' : 'Warning'}
                    </span>
                </div>
                
                <div class="submission-content">
                    <div class="content-section">
                        <h4>Prompt:</h4>
                        <div class="content-box prompt-box">${formatContent(prompt)}</div>
                    </div>
                    
                    <div class="content-section">
                        <h4>AI Response:</h4>
                        <div class="content-box response-box">${formatContent(response)}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function formatContent(text) {
    if (!text) return '<em>No content</em>';
    // Escape HTML and preserve line breaks
    let formatted = escapeHtml(text);
    // Convert line breaks to <br>
    formatted = formatted.replace(/\n/g, '<br>');
    return formatted;
}

function exportToJSON() {
    try {
        const submissions = filteredSubmissions.length > 0 ? filteredSubmissions : allSubmissions;
        
        if (submissions.length === 0) {
            alert('No submissions to export.');
            return;
        }
        
        const jsonStr = JSON.stringify(submissions, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `geocon-submissions-${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        
        console.log(`Exported ${submissions.length} submissions to JSON`);
        alert(`Successfully exported ${submissions.length} submissions!`);
    } catch (error) {
        alert(`Error exporting data: ${error.message}`);
        console.error('Export error:', error);
    }
}

function clearAllData() {
    const submissions = allSubmissions;
    
    if (submissions.length === 0) {
        alert('No data to clear.');
        return;
    }
    
    if (confirm(`WARNING: Are you sure you want to delete all ${submissions.length} submissions?\n\nThis will delete:\n- All submission records\n- All conversation history\n\nThis action CANNOT be undone!\n\nConsider exporting the data first!`)) {
        if (confirm('This is your last chance. Are you absolutely sure?')) {
            try {
                localStorage.removeItem(STORAGE_KEY_SUBMISSIONS);
                localStorage.removeItem(STORAGE_KEY_USERS);
                localStorage.removeItem('geocon_ai_current_user');
                console.log('All data cleared from localStorage');
                alert('All data has been cleared.');
                if (currentView === 'employees') {
                    loadEmployees();
                } else {
                    loadEmployeeDetails(selectedEmployeeId);
                }
            } catch (error) {
                alert(`Error clearing data: ${error.message}`);
                console.error('Clear error:', error);
            }
        }
    }
}

// Load employees list
async function loadEmployees() {
    const employeesList = document.getElementById('employees-list');
    const loading = document.getElementById('loading');
    
    employeesList.innerHTML = '';
    loading.classList.remove('hidden');
    currentView = 'employees';
    
    try {
        // Get current user email from localStorage for admin auth
        const currentUser = JSON.parse(localStorage.getItem('geocon_ai_current_user') || '{}');
        const userEmail = currentUser.email || '';
        
        // Check if user is admin
        const adminEmails = ['carter@geoconinc.com', 'mundra@geoconinc.com'];
        if (!adminEmails.includes(userEmail.toLowerCase())) {
            employeesList.innerHTML = `
                <div class="error-message">
                    <h3>Access Denied</h3>
                    <p>You do not have permission to access the admin dashboard.</p>
                    <p>Only authorized administrators can view this page.</p>
                    <a href="index.html" class="nav-link" onclick="event.preventDefault(); window.location.href='index.html'; return false;">← Back to Chat</a>
                </div>
            `;
            loading.classList.add('hidden');
            return;
        }
        
        // Fetch stats from database API with admin auth
        const statsResponse = await fetch(`${window.location.origin}/api/admin/stats?email=${encodeURIComponent(userEmail)}`);
        if (statsResponse.ok) {
            const stats = await statsResponse.json();
            updateStatsFromAPI(stats);
        }
        
        // Fetch employees from database API with admin auth
        const employeesResponse = await fetch(`${window.location.origin}/api/admin/employees?email=${encodeURIComponent(userEmail)}`);
        if (employeesResponse.ok) {
            employees = await employeesResponse.json();
            console.log(`Loaded ${employees.length} employees from database`);
            displayEmployees();
        } else {
            throw new Error('Failed to load employees');
        }
        
    } catch (error) {
        console.error('Error loading employees:', error);
        employeesList.innerHTML = `
            <div class="error-message">
                <h3>Error Loading Employees</h3>
                <p>${error.message}</p>
                <p>Please refresh the page or check your connection.</p>
            </div>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

// Display employees list
function displayEmployees() {
    const employeesList = document.getElementById('employees-list');
    
    if (employees.length === 0) {
        employeesList.innerHTML = '<div class="empty-state">No employees found</div>';
        return;
    }
    
    employeesList.innerHTML = employees.map(emp => `
        <div class="employee-card" data-employee-id="${emp.id}">
            <div class="employee-card-header">
                <div class="employee-info">
                    <h3 class="employee-name">${escapeHtml(emp.name || emp.email)}</h3>
                    <p class="employee-email">${escapeHtml(emp.email)}</p>
                </div>
                <div class="employee-stats">
                    <div class="employee-stat">
                        <span class="stat-value">${emp.conversations_count || 0}</span>
                        <span class="stat-label">Chats</span>
                    </div>
                    <div class="employee-stat">
                        <span class="stat-value">${emp.submissions_count || 0}</span>
                        <span class="stat-label">Submissions</span>
                    </div>
                    ${emp.flagged_count > 0 ? `
                    <div class="employee-stat warning">
                        <span class="stat-value">${emp.flagged_count}</span>
                        <span class="stat-label">Flagged</span>
                    </div>
                    ` : ''}
                    ${emp.danger_count > 0 ? `
                    <div class="employee-stat danger">
                        <span class="stat-value">${emp.danger_count}</span>
                        <span class="stat-label">Unsafe</span>
                    </div>
                    ` : ''}
                </div>
            </div>
            <div class="employee-card-footer">
                <span class="last-login">Last login: ${emp.last_login ? new Date(emp.last_login).toLocaleString() : 'Never'}</span>
            </div>
        </div>
    `).join('');
    
    // Add click handlers
    employeesList.querySelectorAll('.employee-card').forEach(card => {
        card.addEventListener('click', () => {
            const employeeId = parseInt(card.dataset.employeeId);
            loadEmployeeDetails(employeeId);
        });
    });
}

// Load employee details and conversations
async function loadEmployeeDetails(userId) {
    const loading = document.getElementById('loading');
    const employeesView = document.getElementById('employees-view');
    const detailsView = document.getElementById('employee-details-view');
    const conversationsContainer = document.getElementById('employee-conversations');
    const employeeNameEl = document.getElementById('employee-details-name');
    
    loading.classList.remove('hidden');
    selectedEmployeeId = userId;
    currentView = 'details';
    
    // Hide employees view, show details view
    employeesView.classList.add('hidden');
    detailsView.classList.remove('hidden');
    
    try {
        // Get current user email from localStorage for admin auth
        const currentUser = JSON.parse(localStorage.getItem('geocon_ai_current_user') || '{}');
        const userEmail = currentUser.email || '';
        
        const response = await fetch(`${window.location.origin}/api/admin/employees/${userId}/conversations?email=${encodeURIComponent(userEmail)}`);
        if (!response.ok) {
            throw new Error('Failed to load employee conversations');
        }
        
        const data = await response.json();
        const user = data.user;
        const conversations = data.conversations;
        
        // Update header
        employeeNameEl.textContent = `${user.name} (${user.email})`;
        
        // Display conversations
        if (conversations.length === 0) {
            conversationsContainer.innerHTML = '<div class="empty-state">No conversations found for this employee</div>';
        } else {
            conversationsContainer.innerHTML = conversations.map(conv => `
                <div class="conversation-card">
                    <div class="conversation-header">
                        <h4 class="conversation-title">${escapeHtml(conv.title)}</h4>
                        <div class="conversation-meta">
                            <span>${conv.messages_count} messages</span>
                            <span>•</span>
                            <span>${conv.submissions_count} submissions</span>
                            <span>•</span>
                            <span>${new Date(conv.updated_at).toLocaleString()}</span>
                        </div>
                    </div>
                    <div class="conversation-preview">
                        ${conv.messages && conv.messages.length > 0 ? `
                            <div class="message-preview">
                                ${conv.messages.slice(0, 3).map(msg => `
                                    <div class="preview-message ${msg.role}">
                                        <strong>${msg.role === 'user' ? 'User' : 'AI'}:</strong>
                                        ${escapeHtml(msg.content.substring(0, 150))}${msg.content.length > 150 ? '...' : ''}
                                    </div>
                                `).join('')}
                            </div>
                        ` : '<p class="no-messages">No messages in this conversation</p>'}
                    </div>
                </div>
            `).join('');
        }
        
    } catch (error) {
        console.error('Error loading employee details:', error);
        conversationsContainer.innerHTML = `
            <div class="error-message">
                <h3>Error Loading Conversations</h3>
                <p>${error.message}</p>
            </div>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

// Show employees view
function showEmployeesView() {
    const employeesView = document.getElementById('employees-view');
    const detailsView = document.getElementById('employee-details-view');
    const auditView = document.getElementById('audit-logs-view');
    
    if (employeesView) employeesView.classList.remove('hidden');
    if (detailsView) detailsView.classList.add('hidden');
    if (auditView) auditView.classList.add('hidden');
    currentView = 'employees';
    selectedEmployeeId = null;
    
    // Prevent any navigation
    return false;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Load audit logs
async function loadAuditLogs() {
    const container = document.getElementById('audit-logs-container');
    const loading = document.getElementById('loading');
    
    if (!container) return;
    
    container.innerHTML = '';
    loading.classList.remove('hidden');
    currentView = 'audit';
    
    // Show audit logs view, hide others
    document.getElementById('employees-view').classList.add('hidden');
    document.getElementById('employee-details-view').classList.add('hidden');
    document.getElementById('audit-logs-view').classList.remove('hidden');
    
    try {
        // Get current user email from localStorage for admin auth
        const currentUser = JSON.parse(localStorage.getItem('geocon_ai_current_user') || '{}');
        const userEmail = currentUser.email || '';
        
        // Get filter values
        const actionType = document.getElementById('audit-action-type-filter')?.value || 'all';
        const category = document.getElementById('audit-category-filter')?.value || 'all';
        const status = document.getElementById('audit-status-filter')?.value || 'all';
        const emailFilter = document.getElementById('audit-user-email-filter')?.value || '';
        
        // Build query string
        const params = new URLSearchParams({
            email: userEmail,
            limit: '200',
            offset: '0'
        });
        if (actionType !== 'all') params.append('action_type', actionType);
        if (category !== 'all') params.append('category', category);
        if (status !== 'all') params.append('status', status);
        if (emailFilter) params.append('user_email', emailFilter);
        
        const response = await fetch(`${window.location.origin}/api/admin/audit-logs?${params}`);
        
        if (!response.ok) {
            if (response.status === 403) {
                container.innerHTML = `
                    <div class="error-message">
                        <h3>Access Denied</h3>
                        <p>You do not have permission to view audit logs.</p>
                    </div>
                `;
                loading.classList.add('hidden');
                return;
            }
            throw new Error('Failed to load audit logs');
        }
        
        const data = await response.json();
        auditLogs = data.logs || [];
        
        displayAuditLogs(auditLogs, data.total || 0);
        
    } catch (error) {
        console.error('Error loading audit logs:', error);
        container.innerHTML = `
            <div class="error-message">
                <h3>Error Loading Audit Logs</h3>
                <p>${error.message}</p>
            </div>
        `;
    } finally {
        loading.classList.add('hidden');
    }
}

// Display audit logs
function displayAuditLogs(logs, total) {
    const container = document.getElementById('audit-logs-container');
    
    if (logs.length === 0) {
        container.innerHTML = '<div class="empty-state">No audit logs found</div>';
        return;
    }
    
    let html = `<div class="audit-logs-summary">Total: ${total} logs</div>`;
    html += '<div class="audit-logs-table">';
    html += '<table class="audit-table">';
    html += '<thead><tr>';
    html += '<th>Timestamp</th>';
    html += '<th>User</th>';
    html += '<th>Action</th>';
    html += '<th>Category</th>';
    html += '<th>Description</th>';
    html += '<th>Status</th>';
    html += '<th>IP Address</th>';
    html += '</tr></thead>';
    html += '<tbody>';
    
    logs.forEach(log => {
        const statusClass = log.status === 'success' ? 'success' : 
                           log.status === 'failure' ? 'failure' : 
                           log.status === 'unauthorized' ? 'unauthorized' : 'error';
        
        html += `<tr class="audit-log-row ${statusClass}">`;
        html += `<td>${escapeHtml(log.date || log.timestamp || 'N/A')}</td>`;
        html += `<td>${escapeHtml(log.user_email || log.user_name || 'N/A')}</td>`;
        html += `<td><span class="audit-action-type">${escapeHtml(log.action_type || 'N/A')}</span></td>`;
        html += `<td><span class="audit-category">${escapeHtml(log.action_category || 'N/A')}</span></td>`;
        html += `<td>${escapeHtml(log.description || 'N/A')}</td>`;
        html += `<td><span class="audit-status ${statusClass}">${escapeHtml(log.status || 'N/A')}</span></td>`;
        html += `<td>${escapeHtml(log.ip_address || 'N/A')}</td>`;
        html += '</tr>';
    });
    
    html += '</tbody></table></div>';
    container.innerHTML = html;
}

// Show employees view
function showEmployeesView() {
    const employeesView = document.getElementById('employees-view');
    const detailsView = document.getElementById('employee-details-view');
    const auditView = document.getElementById('audit-logs-view');
    
    employeesView.classList.remove('hidden');
    detailsView.classList.add('hidden');
    if (auditView) auditView.classList.add('hidden');
    currentView = 'employees';
    selectedEmployeeId = null;
}
