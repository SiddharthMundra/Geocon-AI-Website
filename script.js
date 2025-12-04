// API endpoint - automatically detects if running locally or in production
const API_BASE_URL = window.location.origin + '/api';

// Storage key for localStorage
const STORAGE_KEY = 'geocon_ai_submissions';

// Initialize
document.addEventListener('DOMContentLoaded', () => {
    initializeForm();
    checkServerConnection();
});

// Check if server is running
async function checkServerConnection() {
    try {
        const response = await fetch(`${API_BASE_URL}/health`);
        if (response.ok) {
            console.log('✅ Server connection successful');
        } else {
            console.warn('⚠️ Server responded but with error status');
        }
    } catch (error) {
        console.warn('⚠️ Cannot connect to server:', error.message);
        console.warn('Make sure the Python backend is running: python app.py');
    }
}

// File management
let selectedFiles = [];

// Form handling
function initializeForm() {
    const form = document.getElementById('prompt-form');
    const fileInput = document.getElementById('file-upload');
    const fileList = document.getElementById('file-list');
    
    form.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitPrompt();
    });
    
    // Handle file selection
    fileInput.addEventListener('change', (e) => {
        const files = Array.from(e.target.files);
        selectedFiles = files;
        updateFileList();
    });
}

function updateFileList() {
    const fileList = document.getElementById('file-list');
    fileList.innerHTML = '';
    
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        
        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-item-info';
        
        const fileName = document.createElement('span');
        fileName.className = 'file-item-name';
        fileName.textContent = file.name;
        
        const fileSize = document.createElement('span');
        fileSize.className = 'file-item-size';
        fileSize.textContent = formatFileSize(file.size);
        
        fileInfo.appendChild(fileName);
        fileInfo.appendChild(fileSize);
        
        const removeBtn = document.createElement('button');
        removeBtn.className = 'file-item-remove';
        removeBtn.textContent = 'Remove';
        removeBtn.type = 'button';
        removeBtn.onclick = () => removeFile(index);
        
        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);
        fileList.appendChild(fileItem);
    });
}

function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    
    // Update the file input
    const fileInput = document.getElementById('file-upload');
    const dataTransfer = new DataTransfer();
    selectedFiles.forEach(file => dataTransfer.items.add(file));
    fileInput.files = dataTransfer.files;
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
}

async function submitPrompt() {
    const employeeName = document.getElementById('employee-name').value.trim();
    const prompt = document.getElementById('prompt-input').value.trim();
    const searchSharePoint = document.getElementById('search-sharepoint').checked;
    const submitBtn = document.getElementById('submit-btn');
    const submitText = document.getElementById('submit-text');
    const submitLoader = document.getElementById('submit-loader');
    const responseSection = document.getElementById('response-section');
    const statusMessage = document.getElementById('status-message');
    
    if (!employeeName || !prompt) {
        showStatus('Please fill in all fields.', 'error');
        return;
    }
    
    // Show loading state
    submitBtn.disabled = true;
    submitText.classList.remove('hidden');
    submitLoader.classList.remove('hidden');
    responseSection.classList.add('hidden');
    statusMessage.classList.add('hidden');
    
    // Update loading text based on options
    if (selectedFiles.length > 0 && searchSharePoint) {
        submitText.textContent = `Processing ${selectedFiles.length} file(s), searching SharePoint, and generating response...`;
    } else if (selectedFiles.length > 0) {
        submitText.textContent = `Processing ${selectedFiles.length} file(s) and generating response...`;
    } else if (searchSharePoint) {
        submitText.textContent = 'Searching SharePoint and generating response...';
    } else {
        submitText.textContent = 'Generating response...';
    }
    
    try {
        console.log('Submitting prompt to:', `${API_BASE_URL}/submit`);
        console.log('Request data:', { 
            employeeName, 
            prompt: prompt.substring(0, 50) + '...',
            searchSharePoint: searchSharePoint,
            filesCount: selectedFiles.length
        });
        
        // Use FormData if files are present, otherwise use JSON
        let requestOptions;
        if (selectedFiles.length > 0) {
            const formData = new FormData();
            formData.append('employeeName', employeeName);
            formData.append('prompt', prompt);
            formData.append('searchSharePoint', searchSharePoint);
            
            selectedFiles.forEach((file, index) => {
                formData.append('files', file);
            });
            
            requestOptions = {
                method: 'POST',
                body: formData
                // Don't set Content-Type header - browser will set it with boundary
            };
        } else {
            requestOptions = {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    employeeName: employeeName,
                    prompt: prompt,
                    searchSharePoint: searchSharePoint
                })
            };
        }
        
        const response = await fetch(`${API_BASE_URL}/submit`, requestOptions);
        
        console.log('Response status:', response.status, response.statusText);
        
        // Check if response is ok before trying to parse JSON
        let data;
        try {
            data = await response.json();
            console.log('Response data:', data);
        } catch (jsonError) {
            console.error('Failed to parse JSON response:', jsonError);
            const text = await response.text();
            console.error('Response text:', text);
            throw new Error(`Server returned invalid response (${response.status}): ${text.substring(0, 200)}`);
        }
        
        if (!response.ok) {
            const errorMsg = data.error || `Server error (${response.status}): ${response.statusText}`;
            console.error('Server error:', errorMsg);
            throw new Error(errorMsg);
        }
        
        // Hide debug info on success
        document.getElementById('debug-info').classList.add('hidden');
        
        // Display ChatGPT response
        console.log('Response data received:', data);
        console.log('ChatGPT response:', data.chatgptResponse);
        console.log('Response length:', data.chatgptResponse ? data.chatgptResponse.length : 'null/undefined');
        
        if (!data.chatgptResponse || data.chatgptResponse.trim() === '') {
            console.error('ChatGPT response is empty or null!');
            showStatus('Warning: Received empty response from ChatGPT. Check terminal for details.', 'error');
        } else {
            displayChatGPTResponse(
                data.chatgptResponse, 
                data.confidentialStatus, 
                data.checkResults,
                data.sharepointSearched || false,
                data.sharepointResultsCount || 0,
                data.filesProcessed || 0
            );
            
            // Store submission in browser localStorage
            const submission = {
                id: data.submissionId || Date.now(),
                employeeName: employeeName,
                prompt: prompt,
                chatgptResponse: data.chatgptResponse,
                status: data.confidentialStatus || 'safe',
                checkResults: data.checkResults || [],
                timestamp: new Date().toISOString(),
                date: new Date().toLocaleString(),
                filesCount: selectedFiles.length,
                fileNames: selectedFiles.map(f => f.name)
            };
            
            saveToLocalStorage(submission);
            console.log('Submission saved to browser localStorage');
            
            // Clear file selection after successful submission
            selectedFiles = [];
            document.getElementById('file-upload').value = '';
            updateFileList();
        }
        
        // Show success message
        showStatus('Prompt submitted successfully and stored for IT administration.', 'success');
        
        // Reset form
        document.getElementById('prompt-form').reset();
        
    } catch (error) {
        console.error('Full error details:', error);
        console.error('Error name:', error.name);
        console.error('Error message:', error.message);
        console.error('Error stack:', error.stack);
        
        // Handle different types of errors
        let errorMessage = 'An error occurred';
        let debugInfo = '';
        
        if (error.name === 'TypeError' && error.message.includes('fetch')) {
            errorMessage = `Connection Error: Cannot connect to server at ${API_BASE_URL}. Make sure the Python backend is running on port 5000.`;
            debugInfo = `Error Type: ${error.name}\nError Message: ${error.message}\n\nTroubleshooting:\n1. Make sure you ran: python app.py\n2. Check that the server is running on port 5000\n3. Try opening http://localhost:5000/api/health in your browser\n4. Check browser console (F12) for more details`;
        } else if (error.message) {
            errorMessage = error.message;
            debugInfo = `Error Type: ${error.name}\nError Message: ${error.message}\n\nCheck the Python terminal for detailed error logs.`;
        } else {
            errorMessage = `Error: ${error.toString()}`;
            debugInfo = `Error Type: ${error.name}\nError: ${error.toString()}\n\nCheck the Python terminal for detailed error logs.`;
        }
        
        showStatus(errorMessage, 'error');
        showDebugInfo(debugInfo);
        
        // If there's a confidential status in the error, still show it
        if (error.confidentialStatus) {
            displayConfidentialWarning(error.confidentialStatus, error.checkResults);
        }
    } finally {
        // Reset button state
        submitBtn.disabled = false;
        submitText.classList.remove('hidden');
        submitLoader.classList.add('hidden');
    }
}

function displayChatGPTResponse(response, confidentialStatus, checkResults, sharepointSearched, sharepointResultsCount, filesProcessed) {
    const responseSection = document.getElementById('response-section');
    const responseDiv = document.getElementById('chatgpt-response');
    
    console.log('Displaying response. Length:', response ? response.length : 'null');
    
    // Clear previous content
    responseDiv.innerHTML = '';
    
    // Check if response exists
    if (!response || response.trim() === '') {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'response-content';
        errorDiv.style.color = 'var(--danger-color)';
        errorDiv.textContent = 'No response received from ChatGPT. Please check the terminal for error details.';
        responseDiv.appendChild(errorDiv);
        responseSection.classList.remove('hidden');
        return;
    }
    
    // Show file upload indicator if files were processed
    if (filesProcessed > 0) {
        const fileInfoDiv = document.createElement('div');
        fileInfoDiv.className = 'sharepoint-info';
        fileInfoDiv.innerHTML = `<strong>Files Processed:</strong> ${filesProcessed} file(s) were analyzed and included in the response.`;
        responseDiv.appendChild(fileInfoDiv);
    }
    
    // Show SharePoint search indicator if enabled
    if (sharepointSearched) {
        const sharepointInfo = document.createElement('div');
        sharepointInfo.className = 'sharepoint-info';
        if (sharepointResultsCount > 0) {
            sharepointInfo.innerHTML = `🔍 <strong>SharePoint Search:</strong> Found ${sharepointResultsCount} relevant document(s). Response includes information from Geocon SharePoint.`;
        } else {
            sharepointInfo.innerHTML = `🔍 <strong>SharePoint Search:</strong> No relevant documents found in SharePoint. Answering from general knowledge.`;
            sharepointInfo.style.background = '#fff3cd';
            sharepointInfo.style.color = '#856404';
        }
        responseDiv.appendChild(sharepointInfo);
    }
    
    // Show confidential warning if needed
    if (confidentialStatus && confidentialStatus !== 'safe') {
        const warningDiv = document.createElement('div');
        warningDiv.className = `confidential-warning ${confidentialStatus}`;
        
        let warningText = '';
        if (confidentialStatus === 'danger') {
            warningText = '⚠️ WARNING: Your prompt contained highly sensitive information. Please be cautious with confidential data.';
        } else {
            warningText = '⚠️ CAUTION: Your prompt contained potentially sensitive information.';
        }
        
        warningDiv.textContent = warningText;
        responseDiv.appendChild(warningDiv);
    }
    
    // Display ChatGPT response with formatting
    const responseContent = document.createElement('div');
    responseContent.className = 'response-content';
    responseContent.innerHTML = formatResponse(response);
    responseDiv.appendChild(responseContent);
    
    // Show response section
    responseSection.classList.remove('hidden');
    
    // Scroll to response
    responseSection.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function displayConfidentialWarning(status, checkResults) {
    const responseSection = document.getElementById('response-section');
    const responseDiv = document.getElementById('chatgpt-response');
    
    responseDiv.innerHTML = '';
    
    const warningDiv = document.createElement('div');
    warningDiv.className = `confidential-warning ${status}`;
    
    let warningText = '';
    if (status === 'danger') {
        warningText = '🚫 UNSAFE: Your prompt contains highly sensitive information.';
    } else {
        warningText = '⚠️ CAUTION: Your prompt contains potentially sensitive information.';
    }
    
    warningDiv.textContent = warningText;
    responseDiv.appendChild(warningDiv);
    
    if (checkResults && checkResults.length > 0) {
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'check-details';
        detailsDiv.innerHTML = '<h4>Detected Issues:</h4><ul>';
        
        checkResults.forEach(result => {
            detailsDiv.innerHTML += `<li><strong>${result.type}</strong>: Found ${result.matches} instance(s)`;
            if (result.examples && result.examples.length > 0) {
                detailsDiv.innerHTML += ` - Examples: ${result.examples.slice(0, 2).join(', ')}`;
            }
            detailsDiv.innerHTML += `</li>`;
        });
        
        detailsDiv.innerHTML += '</ul>';
        responseDiv.appendChild(detailsDiv);
    }
    
    responseSection.classList.remove('hidden');
}

function showStatus(message, type) {
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.classList.remove('hidden');
    
    // Auto-hide after 5 seconds for success messages
    if (type === 'success') {
        setTimeout(() => {
            statusMessage.classList.add('hidden');
        }, 5000);
    }
}

function showDebugInfo(info) {
    const debugInfo = document.getElementById('debug-info');
    const debugContent = document.getElementById('debug-content');
    
    if (info) {
        debugContent.innerHTML = `<pre>${info}</pre>`;
        debugInfo.classList.remove('hidden');
    } else {
        debugInfo.classList.add('hidden');
    }
}

function saveToLocalStorage(submission) {
    try {
        const submissions = getFromLocalStorage();
        submissions.push(submission);
        localStorage.setItem(STORAGE_KEY, JSON.stringify(submissions));
        console.log(`Saved submission ${submission.id} to localStorage. Total: ${submissions.length}`);
    } catch (error) {
        console.error('Error saving to localStorage:', error);
        // If localStorage is full, try to clear old entries
        if (error.name === 'QuotaExceededError') {
            alert('Browser storage is full. Please export and clear old data from the admin page.');
        }
    }
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

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatResponse(text) {
    if (!text) return '';
    
    // Escape HTML to prevent XSS, then format
    let formatted = escapeHtml(text);
    
    // Convert markdown-style headings to HTML
    formatted = formatted.replace(/^### (.*$)/gim, '<h3>$1</h3>');
    formatted = formatted.replace(/^## (.*$)/gim, '<h2>$1</h2>');
    formatted = formatted.replace(/^# (.*$)/gim, '<h1>$1</h1>');
    
    // Convert bold (**text** or __text__)
    formatted = formatted.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
    formatted = formatted.replace(/__(.*?)__/g, '<strong>$1</strong>');
    
    // Convert italic (*text* or _text_)
    formatted = formatted.replace(/\*(.*?)\*/g, '<em>$1</em>');
    formatted = formatted.replace(/_(.*?)_/g, '<em>$1</em>');
    
    // Convert horizontal rules
    formatted = formatted.replace(/^---$/gim, '<hr>');
    formatted = formatted.replace(/^___$/gim, '<hr>');
    
    // Split into lines for better processing
    let lines = formatted.split('<br>');
    let result = [];
    let inList = false;
    let listType = null; // 'ul' or 'ol'
    let listItems = [];
    
    for (let i = 0; i < lines.length; i++) {
        let line = lines[i].trim();
        
        // Check for bullet list
        if (/^[-*] (.+)$/.test(line)) {
            if (!inList || listType !== 'ul') {
                if (inList && listItems.length > 0) {
                    result.push(`<${listType}>${listItems.join('')}</${listType}>`);
                    listItems = [];
                }
                inList = true;
                listType = 'ul';
            }
            listItems.push('<li>' + line.replace(/^[-*] /, '') + '</li>');
        }
        // Check for numbered list
        else if (/^\d+\. (.+)$/.test(line)) {
            if (!inList || listType !== 'ol') {
                if (inList && listItems.length > 0) {
                    result.push(`<${listType}>${listItems.join('')}</${listType}>`);
                    listItems = [];
                }
                inList = true;
                listType = 'ol';
            }
            listItems.push('<li>' + line.replace(/^\d+\. /, '') + '</li>');
        }
        // Regular line
        else {
            if (inList && listItems.length > 0) {
                result.push(`<${listType}>${listItems.join('')}</${listType}>`);
                listItems = [];
                inList = false;
            }
            if (line) {
                result.push(line);
            }
        }
    }
    
    // Close any remaining list
    if (inList && listItems.length > 0) {
        result.push(`<${listType}>${listItems.join('')}</${listType}>`);
    }
    
    formatted = result.join('<br>');
    
    // Convert code blocks (```code```)
    formatted = formatted.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');
    
    // Convert inline code (`code`)
    formatted = formatted.replace(/`([^`]+)`/g, '<code>$1</code>');
    
    // Convert links [text](url)
    formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
    
    // Preserve line breaks (convert \n to <br>)
    formatted = formatted.replace(/\n/g, '<br>');
    
    // Clean up: remove <br> before block elements
    formatted = formatted.replace(/<br>(<[h|u|o]l|<[h1-6]|<hr|<pre)/g, '$1');
    formatted = formatted.replace(/(<\/[h1-6]|<\/[u|o]l|<\/pre>)<br>/g, '$1');
    
    return formatted;
}
