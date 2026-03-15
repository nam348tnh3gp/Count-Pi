// State management
let socket = null;
let clientId = generateClientId();
let sessionId = generateSessionId();
let currentPiString = "3.";
let nextPosition = 1;
let hasLock = false;
let lockExpires = null;
let timerInterval = null;

// DOM elements
const piFractionEl = document.getElementById('piFraction');
const nextDigitIndicator = document.getElementById('nextDigitIndicator');
const digitCountEl = document.getElementById('digitCount');
const contributorCountEl = document.getElementById('contributorCount');
const nextPositionEl = document.getElementById('nextPosition');
const statusEl = document.getElementById('status');
const calculateBtn = document.getElementById('calculateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const timerEl = document.getElementById('timer');
const timerSecondsEl = document.getElementById('timerSeconds');
const calculationArea = document.getElementById('calculationArea');
const messageEl = document.getElementById('message');
const historyList = document.getElementById('historyList');

// Initialize
function init() {
    connectWebSocket();
    loadInitialData();
    loadHistory();
    
    // Lưu session vào localStorage
    localStorage.setItem('clientId', clientId);
}

// Generate IDs
function generateClientId() {
    let id = localStorage.getItem('clientId');
    if (!id) {
        id = 'user_' + Math.random().toString(36).substr(2, 9);
    }
    return id;
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

// WebSocket connection
function connectWebSocket() {
    socket = io();
    
    socket.on('connect', () => {
        console.log('Connected to server');
        showMessage('Đã kết nối đến server', 'info');
    });
    
    socket.on('new_digit', (data) => {
        updatePiDisplay(data.pi_string);
        nextPosition = data.next_position;
        nextPositionEl.textContent = nextPosition;
        contributorCountEl.textContent = data.total_contributors;
        
        // Thêm vào lịch sử
        addToHistory({
            position: data.position,
            digit: data.digit,
            contributor: data.contributor_id,
            time: new Date().toISOString()
        });
        
        // Cập nhật giao diện
        if (hasLock) {
            releaseLock(true); // Tự động release khi có người khác gửi
        }
    });
    
    socket.on('lock_acquired', (data) => {
        if (data.calculator_id !== clientId) {
            statusEl.textContent = `🔴 Người khác đang tính`;
            calculateBtn.disabled = true;
            showMessage(`Có người đang tính chữ số thứ ${data.position}`, 'info');
        }
    });
    
    socket.on('lock_released', () => {
        if (!hasLock) {
            statusEl.textContent = '🟢 Rảnh';
            calculateBtn.disabled = false;
        }
    });
    
    socket.on('status_update', (data) => {
        updatePiDisplay(data.pi_string);
        nextPosition = data.next_position;
        nextPositionEl.textContent = nextPosition;
        contributorCountEl.textContent = data.total_contributors;
        digitCountEl.textContent = data.pi_string.length - 2;
        
        if (data.is_calculating && !hasLock) {
            statusEl.textContent = '🔴 Đang có người tính';
            calculateBtn.disabled = true;
        } else if (!hasLock) {
            statusEl.textContent = '🟢 Rảnh';
            calculateBtn.disabled = false;
        }
    });
    
    socket.on('disconnect', () => {
        console.log('Disconnected from server');
        showMessage('Mất kết nối server, đang thử lại...', 'error');
    });
}

// Load initial data
async function loadInitialData() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        updatePiDisplay(data.pi_string);
        nextPosition = data.next_position;
        digitCountEl.textContent = data.length;
        contributorCountEl.textContent = data.total_contributors;
        nextPositionEl.textContent = nextPosition;
        
        if (data.is_calculating) {
            statusEl.textContent = '🔴 Đang có người tính';
            calculateBtn.disabled = true;
        }
        
    } catch (error) {
        console.error('Error loading initial data:', error);
        showMessage('Không thể tải dữ liệu', 'error');
    }
}

// Load history
async function loadHistory() {
    try {
        const response = await fetch('/api/history?limit=20');
        const history = await response.json();
        
        historyList.innerHTML = '';
        history.forEach(item => {
            addToHistory(item);
        });
        
    } catch (error) {
        console.error('Error loading history:', error);
        historyList.innerHTML = '<div class="loading">Không thể tải lịch sử</div>';
    }
}

// Add to history
function addToHistory(item) {
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    historyItem.innerHTML = `
        <span class="position">Vị trí ${item.position}:</span>
        <span class="digit">${item.digit}</span>
        <span class="contributor">- ${item.contributor}</span>
        <span class="time">${new Date(item.time).toLocaleTimeString()}</span>
    `;
    
    historyList.insertBefore(historyItem, historyList.firstChild);
    
    // Giới hạn số item
    if (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }
}

// Update Pi display
function updatePiDisplay(piString) {
    currentPiString = piString;
    
    if (piString === "3.") {
        piFractionEl.innerHTML = '';
        nextDigitIndicator.style.display = 'inline-block';
        return;
    }
    
    const parts = piString.split('.');
    if (parts.length > 1) {
        piFractionEl.textContent = parts[1];
    }
    
    digitCountEl.textContent = piString.length - 2;
}

// Show message
function showMessage(text, type = 'info') {
    messageEl.className = `message ${type}`;
    messageEl.textContent = text;
    
    // Auto hide after 5 seconds
    setTimeout(() => {
        if (messageEl.className === `message ${type}`) {
            messageEl.style.display = 'none';
        }
    }, 5000);
}

// Request lock
async function requestLock() {
    try {
        const response = await fetch('/api/acquire-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            hasLock = true;
            lockExpires = new Date(data.expires);
            
            // Update UI
            calculateBtn.style.display = 'none';
            cancelBtn.style.display = 'flex';
            timerEl.style.display = 'block';
            calculationArea.style.display = 'block';
            statusEl.textContent = '🟡 Đang tính...';
            
            // Start timer
            startTimer(lockExpires);
            
            // Calculate digit
            await calculateDigit(data.position, data.current_pi);
        } else {
            showMessage(data.error, 'error');
        }
        
    } catch (error) {
        console.error('Error requesting lock:', error);
        showMessage('Không thể xin khóa', 'error');
    }
}

// Release lock
async function releaseLock(quiet = false) {
    if (!hasLock) return;
    
    try {
        await fetch('/api/release-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
        
    } catch (error) {
        console.error('Error releasing lock:', error);
    } finally {
        hasLock = false;
        clearInterval(timerInterval);
        
        // Update UI
        calculateBtn.style.display = 'flex';
        cancelBtn.style.display = 'none';
        timerEl.style.display = 'none';
        calculationArea.style.display = 'none';
        
        if (!quiet) {
            statusEl.textContent = '🟢 Rảnh';
            calculateBtn.disabled = false;
        }
    }
}

// Start timer
function startTimer(expires) {
    clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const now = new Date();
        const diff = Math.max(0, Math.floor((expires - now) / 1000));
        
        timerSecondsEl.textContent = diff;
        
        if (diff <= 0) {
            clearInterval(timerInterval);
            releaseLock();
            showMessage('Hết thời gian tính!', 'error');
        }
    }, 1000);
}

// Calculate digit using Spigot algorithm
async function calculateDigit(position, currentPi) {
    try {
        // Mô phỏng quá trình tính toán (thực tế sẽ chạy thuật toán phức tạp)
        // Ở đây chúng ta giả lập thời gian tính 3 giây
        await new Promise(resolve => setTimeout(resolve, 3000));
        
        // Tính digit (demo - random)
        // Trong thực tế, đây là nơi chạy thuật toán Spigot thật
        const digit = Math.floor(Math.random() * 10);
        
        // Gửi kết quả
        await submitDigit(digit, position);
        
    } catch (error) {
        console.error('Error calculating:', error);
        showMessage('Lỗi khi tính toán', 'error');
        releaseLock();
    }
}

// Submit digit
async function submitDigit(digit, position) {
    try {
        const response = await fetch('/api/contribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                digit: digit,
                position: position,
                client_id: clientId,
                session_id: sessionId
            })
        });
        
        const data = await response.json();
        
        if (data.success) {
            showMessage(data.message, 'success');
            releaseLock(true);
        } else {
            showMessage(data.error, 'error');
            releaseLock();
        }
        
    } catch (error) {
        console.error('Error submitting digit:', error);
        showMessage('Không thể gửi kết quả', 'error');
        releaseLock();
    }
}

// Auto-refresh status every 10 seconds
setInterval(async () => {
    if (!hasLock) {
        try {
            const response = await fetch('/api/status');
            const data = await response.json();
            
            updatePiDisplay(data.pi_string);
            nextPosition = data.next_position;
            nextPositionEl.textContent = nextPosition;
            contributorCountEl.textContent = data.total_contributors;
            
            if (data.is_calculating) {
                statusEl.textContent = '🔴 Đang có người tính';
                calculateBtn.disabled = true;
            } else {
                statusEl.textContent = '🟢 Rảnh';
                calculateBtn.disabled = false;
            }
            
        } catch (error) {
            console.error('Error refreshing status:', error);
        }
    }
}, 10000);

// Handle before unload
window.addEventListener('beforeunload', () => {
    if (hasLock) {
        releaseLock(true);
    }
});

// Start
document.addEventListener('DOMContentLoaded', init);
