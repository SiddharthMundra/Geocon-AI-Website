// Storage keys
const STORAGE_KEY_SUBMISSIONS = 'geocon_ai_submissions';
const STORAGE_KEY_USERS = 'geocon_ai_users';

// State
let allSubmissions = [];
let filteredSubmissions = [];
let employees = [];

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeAdmin();
    loadSubmissions();
});

function initializeAdmin() {
    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    const employeeFilter = document.getElementById('employee-filter');
    const statusFilter = document.getElementById('status-filter');
    
    refreshBtn.addEventListener('click', () => {
        loadSubmissions();
    });
    
    exportBtn.addEventListener('click', () => {
        exportToJSON();
    });
    
    clearBtn.addEventListener('click', () => {
        clearAllData();
    });
    
    employeeFilter.addEventListener('change', () => {
        applyFilters();
    });
    
    statusFilter.addEventListener('change', () => {
        applyFilters();
    });
}

function loadSubmissions() {
    const container = document.getElementById('submissions-container');
    const loading = document.getElementById('loading');
    
    container.innerHTML = '';
    loading.classList.remove('hidden');
    
    setTimeout(() => {
        try {
            // Get submissions from both sources
            allSubmissions = getAllSubmissions();
            
            console.log(`Loaded ${allSubmissions.length} submissions from storage`);
            
            // Extract unique employees
            extractEmployees();
            
            // Update employee filter dropdown
            updateEmployeeFilter();
            
            // Update stats
            updateStats(allSubmissions);
            
            // Apply filters and display
            applyFilters();
            
        } catch (error) {
            console.error('Error loading submissions:', error);
            container.innerHTML = `
                <div class="error-message">
                    <h3>Error Loading Submissions</h3>
                    <p>${error.message}</p>
                    <p>Data is stored in your browser's localStorage.</p>
                </div>
            `;
        } finally {
            loading.classList.add('hidden');
        }
    }, 300);
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
                loadSubmissions(); // Refresh the display
            } catch (error) {
                alert(`Error clearing data: ${error.message}`);
                console.error('Clear error:', error);
            }
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}
