// Storage key for localStorage
const STORAGE_KEY = 'geocon_ai_submissions';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeAdmin();
    loadSubmissions();
});

function initializeAdmin() {
    const refreshBtn = document.getElementById('refresh-btn');
    const exportBtn = document.getElementById('export-btn');
    const clearBtn = document.getElementById('clear-btn');
    
    refreshBtn.addEventListener('click', () => {
        loadSubmissions();
    });
    
    exportBtn.addEventListener('click', () => {
        exportToJSON();
    });
    
    clearBtn.addEventListener('click', () => {
        clearAllData();
    });
}

function loadSubmissions() {
    const container = document.getElementById('submissions-container');
    const loading = document.getElementById('loading');
    
    container.innerHTML = '';
    loading.classList.remove('hidden');
    
    // Small delay to show loading state
    setTimeout(() => {
        try {
            const submissions = getFromLocalStorage();
            
            console.log(`Loaded ${submissions.length} submissions from browser storage`);
            
            // Update stats
            updateStats(submissions);
            
            // Display submissions
            displaySubmissions(submissions);
            
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

function getFromLocalStorage() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (error) {
        console.error('Error reading from localStorage:', error);
        return [];
    }
}

function updateStats(submissions) {
    const total = submissions.length;
    const flagged = submissions.filter(s => s.status && s.status !== 'safe').length;
    
    document.getElementById('total-count').textContent = total;
    document.getElementById('flagged-count').textContent = flagged;
}

function displaySubmissions(submissions) {
    const container = document.getElementById('submissions-container');
    
    if (submissions.length === 0) {
        container.innerHTML = '<p class="empty-state">No submissions found.</p>';
        return;
    }
    
    // Sort by ID (newest first)
    submissions.sort((a, b) => (b.id || 0) - (a.id || 0));
    
    let html = '<div class="submissions-grid">';
    
    submissions.forEach(submission => {
        const id = submission.id || 'N/A';
        const employeeName = submission.employeeName || 'Unknown';
        const prompt = submission.prompt || '';
        const response = submission.chatgptResponse || 'No response';
        const date = submission.date || submission.timestamp || 'Unknown date';
        const status = submission.status || 'unknown';
        const statusClass = status === 'safe' ? 'safe' : (status === 'danger' ? 'danger' : 'warning');
        
        html += `
            <div class="submission-card-admin">
                <div class="submission-header-admin">
                    <div class="submission-id">ID: <strong>${id}</strong></div>
                    <div class="submission-meta">
                        <span class="submission-employee">${escapeHtml(employeeName)}</span>
                        <span class="submission-date">${date}</span>
                    </div>
                    <span class="submission-status ${statusClass}">
                        ${status === 'safe' ? '✅ Safe' : status === 'danger' ? '🚫 Unsafe' : '⚠️ Warning'}
                    </span>
                </div>
                
                <div class="submission-content">
                    <div class="content-section">
                        <h4>Prompt:</h4>
                        <div class="content-box prompt-box">${escapeHtml(prompt)}</div>
                    </div>
                    
                    <div class="content-section">
                        <h4>ChatGPT Response:</h4>
                        <div class="content-box response-box">${escapeHtml(response)}</div>
                    </div>
                </div>
            </div>
        `;
    });
    
    html += '</div>';
    container.innerHTML = html;
}

function exportToJSON() {
    try {
        const submissions = getFromLocalStorage();
        
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
    } catch (error) {
        alert(`Error exporting data: ${error.message}`);
        console.error('Export error:', error);
    }
}

function clearAllData() {
    const submissions = getFromLocalStorage();
    
    if (submissions.length === 0) {
        alert('No data to clear.');
        return;
    }
    
    if (confirm(`Are you sure you want to delete all ${submissions.length} submissions? This cannot be undone.\n\nConsider exporting the data first!`)) {
        try {
            localStorage.removeItem(STORAGE_KEY);
            console.log('All data cleared from localStorage');
            alert('All data has been cleared.');
            loadSubmissions(); // Refresh the display
        } catch (error) {
            alert(`Error clearing data: ${error.message}`);
            console.error('Clear error:', error);
        }
    }
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

