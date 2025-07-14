// Global variables
let selectedFiles = [];
let isDocumentsLoaded = false;

// DOM elements
const uploadArea = document.getElementById('uploadArea');
const fileInput = document.getElementById('fileInput');
const uploadBtn = document.getElementById('uploadBtn');
const clearBtn = document.getElementById('clearBtn');
const fileList = document.getElementById('fileList');
const chatInput = document.getElementById('chatInput');
const sendBtn = document.getElementById('sendBtn');
const chatMessages = document.getElementById('chatMessages');
const loadingOverlay = document.getElementById('loadingOverlay');
const statusIndicator = document.getElementById('statusIndicator');
const statusDot = statusIndicator.querySelector('.status-dot');
const statusText = statusIndicator.querySelector('.status-text');

// Initialize the application
document.addEventListener('DOMContentLoaded', async function() {
    await clearCurrentSession();  // Clear session on page load
    initializeEventListeners();
    checkDocumentStatus();
});

// Initialize all event listeners
function initializeEventListeners() {
    // File upload events
    uploadArea.addEventListener('click', () => fileInput.click());
    uploadArea.addEventListener('dragover', handleDragOver);
    uploadArea.addEventListener('dragleave', handleDragLeave);
    uploadArea.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);
    uploadBtn.addEventListener('click', uploadFiles);
    clearBtn.addEventListener('click', handleClearAll);

    // Chat events
    chatInput.addEventListener('keypress', handleChatKeyPress);
    sendBtn.addEventListener('click', sendMessage);

    // Auto-resize chat input
    chatInput.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = this.scrollHeight + 'px';
    });
}

// Drag and drop handlers
function handleDragOver(e) {
    e.preventDefault();
    uploadArea.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    uploadArea.classList.remove('drag-over');
    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

// File selection handler
function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
}

// Add files to the selection
function addFiles(files) {
    const validFiles = files.filter(file => {
        const isValidType = file.type === 'application/pdf' || file.type === 'text/plain';
        const isValidSize = file.size <= 16 * 1024 * 1024; // 16MB
        if (!isValidType) {
            showToast('error', 'Invalid File Type', `${file.name} is not a supported file type.`);
            return false;
        }
        if (!isValidSize) {
            showToast('error', 'File Too Large', `${file.name} exceeds the 16MB size limit.`);
            return false;
        }
        return true;
    });
    // Add valid files to selection
    validFiles.forEach(file => {
        if (!selectedFiles.some(f => f.name === file.name)) {
            selectedFiles.push(file);
        }
    });
    updateFileList();
    updateUploadButton();
}

// Update file list display
function updateFileList() {
    fileList.innerHTML = '';
    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';
        const fileIcon = getFileIcon(file.type);
        const fileSize = formatFileSize(file.size);
        fileItem.innerHTML = `
            <span class="file-icon"><i class="fas ${fileIcon}"></i></span>
            <span class="file-name">${file.name}</span>
            <span class="file-size">${fileSize}</span>
            <span class="file-remove" onclick="removeFile(${index})"><i class="fas fa-times"></i></span>
        `;
        fileList.appendChild(fileItem);
    });
}

// Get file icon based on type
function getFileIcon(type) {
    switch (type) {
        case 'application/pdf': return 'fa-file-pdf';
        case 'text/plain': return 'fa-file-alt';
        default: return 'fa-file';
    }
}

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Remove file from selection
function removeFile(index) {
    selectedFiles.splice(index, 1);
    updateFileList();
    updateUploadButton();
}

// Update upload button state
function updateUploadButton() {
    uploadBtn.disabled = selectedFiles.length === 0;
}

// Handle clear all action
async function handleClearAll() {
    await cleanupAll();
    selectedFiles = [];
    updateFileList();
    updateUploadButton();
    fileInput.value = '';
}

// Upload files to server
async function uploadFiles() {
    if (selectedFiles.length === 0) {
        showToast('warning', 'No Files', 'Please select files to upload.');
        return;
    }
    const formData = new FormData();
    selectedFiles.forEach(file => {
        formData.append('files', file);
    });
    showLoading(true);
    try {
        // Clear session before uploading new files
        await clearCurrentSession();
        
        const response = await fetch('/upload', { method: 'POST', body: formData });
        const result = await response.json();
        if (response.ok) {
            showToast('success', 'Success', result.message);
            isDocumentsLoaded = true;
            updateDocumentStatus(true);
            selectedFiles = [];
            updateFileList();
            updateUploadButton();
            fileInput.value = '';
            clearChatMessages();
        } else {
            showToast('error', 'Upload Failed', result.error || 'Failed to upload files.');
        }
    } catch (error) {
        showToast('error', 'Network Error', 'Failed to connect to server.');
        console.error('Upload error:', error);
    } finally {
        showLoading(false);
    }
}

// Check document status
async function checkDocumentStatus() {
    try {
        const response = await fetch('/status');
        const result = await response.json();
        if (response.ok) {
            isDocumentsLoaded = result.documents_loaded;
            updateDocumentStatus(isDocumentsLoaded);
        }
    } catch (error) {
        console.error('Status check error:', error);
    }
}

// Update document status indicator
function updateDocumentStatus(loaded) {
    if (loaded) {
        statusDot.classList.add('active');
        statusText.textContent = 'Documents loaded';
        chatInput.disabled = false;
        sendBtn.disabled = false;
    } else {
        statusDot.classList.remove('active');
        statusText.textContent = 'No documents loaded';
        chatInput.disabled = true;
        sendBtn.disabled = true;
    }
}

// Clear chat messages
function clearChatMessages() {
    chatMessages.innerHTML = ``;
}

// Handle chat input keypress
function handleChatKeyPress(e) {
    if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
    }
}

// Send message and render full chat history
async function sendMessage() {
    const message = chatInput.value.trim();
    if (!message) {
        showToast('warning', 'Empty Message', 'Please enter a message.');
        return;
    }
    if (!isDocumentsLoaded) {
        showToast('warning', 'No Documents', 'Please upload documents first.');
        return;
    }
    // Add user message to chat (optimistic UI)
    addMessageToChat('user', message);

    // Clear input
    chatInput.value = '';
    chatInput.style.height = 'auto';

    // Show loading
    showLoading(true);

    try {
        const response = await fetch('/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ message: message })
        });
        const result = await response.json();
        if (response.ok) {
            // If chat_history is present, render the entire conversation
            if (result.chat_history && Array.isArray(result.chat_history)) {
                renderChatHistory(result.chat_history);
            } else {
                // Fallback: just add the latest bot answer
                addMessageToChat('bot', result.answer, result.response_time);
            }
        } else {
            addMessageToChat('bot', result.error || 'Sorry, I encountered an error processing your request.');
        }
    } catch (error) {
        addMessageToChat('bot', 'Sorry, I couldn\'t connect to the server. Please try again.');
        console.error('Chat error:', error);
    } finally {
        showLoading(false);
    }
}

// Render the full chat history (alternates user/bot)
function renderChatHistory(history) {
    clearChatMessages();
    history.forEach((msg, idx) => {
        const sender = idx % 2 === 0 ? 'user' : 'bot';
        addMessageToChat(sender, msg);
    });
}

// Add message to chat
function addMessageToChat(sender, text, responseTime = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message ${sender}`;
    const avatar = sender === 'user' ? 'fa-user' : 'fa-robot';
    const timeStr = formatTime(new Date());
    let responseTimeStr = '';
    if (responseTime !== null) {
        responseTimeStr = `<span class="response-time">Response time: ${responseTime.toFixed(2)}s</span>`;
    }
    messageDiv.innerHTML = `
        <div class="message-avatar"><i class="fas ${avatar}"></i></div>
        <div class="message-content">
            <div class="message-text">${escapeHtml(text)}</div>
            <div class="message-time">${timeStr} ${responseTimeStr}</div>
        </div>
    `;
    chatMessages.appendChild(messageDiv);
    chatMessages.scrollTop = chatMessages.scrollHeight;
}

// Utility to clear chat messages
function clearChatMessages() {
    chatMessages.innerHTML = ``;
}

// Simple HTML escape to prevent XSS
function escapeHtml(text) {
    return text.replace(/[&<>"']/g, function (m) {
        return ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&#39;'
        })[m];
    });
}

// Format time for chat messages
function formatTime(date) {
    return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Show/hide loading overlay
function showLoading(show) {
    if (show) {
        loadingOverlay.classList.add('show');
    } else {
        loadingOverlay.classList.remove('show');
    }
}

// Toast notifications
function showToast(type, title, message) {
    // You can implement your own toast system or use a library
    // Here is a simple example:
    const toastContainer = document.getElementById('toastContainer');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `<div class="toast-title">${title}</div><div class="toast-message">${message}</div>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.remove();
    }, 4000);
}

// Session management functions
async function clearCurrentSession() {
    try {
        const response = await fetch('/clear-session', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        if (!response.ok) {
            console.error('Failed to clear session:', result.error);
        } else {
            clearChatMessages();
            isDocumentsLoaded = false;
            updateDocumentStatus(false);
        }
    } catch (error) {
        console.error('Error clearing session:', error);
    }
}

// Manual cleanup function
async function cleanupAll() {
    try {
        const response = await fetch('/cleanup', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            }
        });
        const result = await response.json();
        if (!response.ok) {
            showToast('error', 'Cleanup Failed', result.error || 'Failed to clean up data');
        } else {
            showToast('success', 'Cleanup Success', 'All data cleared successfully');
            clearChatMessages();
            isDocumentsLoaded = false;
            updateDocumentStatus(false);
        }
    } catch (error) {
        showToast('error', 'Cleanup Error', 'Failed to connect to server');
        console.error('Cleanup error:', error);
    }
}
