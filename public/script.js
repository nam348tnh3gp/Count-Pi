// ==================== SCRIPT ĐÃ SỬA LỖI - TỐI ƯU TỐC ĐỘ ====================

// State management
let socket = null;
let clientId = localStorage.getItem('clientId') || generateClientId();
let sessionId = generateSessionId();
let hasLock = false;
let timerInterval = null;

// DOM elements
const elements = {
    piFraction: document.getElementById('piFraction'),
    nextDigitIndicator: document.getElementById('nextDigitIndicator'),
    digitCount: document.getElementById('digitCount'),
    contributorCount: document.getElementById('contributorCount'),
    nextPosition: document.getElementById('nextPosition'),
    status: document.getElementById('status'),
    calculateBtn: document.getElementById('calculateBtn'),
    cancelBtn: document.getElementById('cancelBtn'),
    timer: document.getElementById('timer'),
    timerSeconds: document.getElementById('timerSeconds'),
    calculationArea: document.getElementById('calculationArea'),
    message: document.getElementById('message'),
    historyList: document.getElementById('historyList'),
    piDisplay: document.getElementById('piDisplay')
};

// ==================== UTILITY FUNCTIONS ====================

function generateClientId() {
    const id = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('clientId', id);
    return id;
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showMessage(text, type = 'info', duration = 3000) {
    const msgEl = elements.message;
    if (!msgEl) return;
    
    msgEl.className = `message ${type}`;
    msgEl.textContent = text;
    msgEl.style.display = 'block';
    
    setTimeout(() => {
        msgEl.style.display = 'none';
    }, duration);
}

function updatePiDisplay(piString) {
    if (!elements.piFraction || !elements.nextDigitIndicator) return;
    
    if (piString === "3.") {
        elements.piFraction.innerHTML = '';
    } else {
        const parts = piString.split('.');
        if (parts.length > 1) {
            elements.piFraction.textContent = parts[1];
        }
    }
    
    if (elements.digitCount) {
        elements.digitCount.textContent = piString.length - 2;
    }
}

function addToHistory(item) {
    if (!elements.historyList) return;
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    const time = item.time ? new Date(item.time).toLocaleTimeString() : 'vừa xong';
    const contributor = item.contributor || 'anonymous';
    
    historyItem.innerHTML = `
        <span class="position">Vị trí ${item.position}:</span>
        <span class="digit">${item.digit}</span>
        <span class="contributor">- ${contributor}</span>
        <span class="time">${time}</span>
    `;
    
    elements.historyList.insertBefore(historyItem, elements.historyList.firstChild);
    
    // Giới hạn 50 items
    while (elements.historyList.children.length > 50) {
        elements.historyList.removeChild(elements.historyList.lastChild);
    }
}

// ==================== WEBSOCKET & API ====================

function connectWebSocket() {
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔄 Connecting WebSocket...');
        
        socket = io(wsUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionDelay: 1000,
            timeout: 5000
        });
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
            showMessage('Đã kết nối', 'info', 2000);
            loadInitialData();
        });
        
        socket.on('connect_error', (error) => {
            console.error('❌ WebSocket error:', error);
            // Fallback to polling
        });
        
        socket.on('new_digit', (data) => {
            console.log('📥 New digit:', data);
            updatePiDisplay(data.pi_string);
            if (elements.nextPosition) elements.nextPosition.textContent = data.next_position;
            if (elements.contributorCount) elements.contributorCount.textContent = data.total_contributors;
            
            addToHistory({
                position: data.position,
                digit: data.digit,
                contributor: data.contributor_id,
                time: new Date().toISOString()
            });
        });
        
        socket.on('lock_acquired', (data) => {
            if (data.calculator_id !== clientId) {
                if (elements.status) elements.status.textContent = `🔴 Người khác đang tính`;
                if (elements.calculateBtn) elements.calculateBtn.disabled = true;
            }
        });
        
        socket.on('lock_released', () => {
            if (!hasLock) {
                if (elements.status) elements.status.textContent = '🟢 Rảnh';
                if (elements.calculateBtn) elements.calculateBtn.disabled = false;
            }
        });
        
    } catch (error) {
        console.error('❌ WebSocket error:', error);
    }
}

async function loadInitialData() {
    try {
        const response = await fetch('/api/status');
        const data = await response.json();
        
        if (data.success) {
            updatePiDisplay(data.pi_string);
            if (elements.nextPosition) elements.nextPosition.textContent = data.next_position;
            if (elements.contributorCount) elements.contributorCount.textContent = data.total_contributors;
            
            if (data.is_calculating) {
                if (elements.status) elements.status.textContent = '🔴 Đang có người tính';
                if (elements.calculateBtn) elements.calculateBtn.disabled = true;
            }
        }
        
        // Load history
        loadHistory();
        
    } catch (error) {
        console.error('❌ Error:', error);
    }
}

async function loadHistory() {
    try {
        const response = await fetch('/api/history?limit=20');
        const history = await response.json();
        
        if (elements.historyList) {
            elements.historyList.innerHTML = '';
            history.forEach(item => addToHistory(item));
        }
    } catch (error) {
        console.error('❌ Error loading history:', error);
    }
}

// ==================== LOCK & CALCULATION ====================

async function requestLock() {
    try {
        if (elements.calculateBtn) {
            elements.calculateBtn.disabled = true;
            elements.calculateBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Đang xin khóa...</span>';
        }
        
        const response = await fetch('/api/acquire-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
        
        const data = await response.json();
        
        if (data.success) {
            hasLock = true;
            const lockExpires = new Date(data.expires);
            
            // Update UI immediately
            if (elements.calculateBtn) elements.calculateBtn.style.display = 'none';
            if (elements.cancelBtn) elements.cancelBtn.style.display = 'flex';
            if (elements.timer) elements.timer.style.display = 'block';
            if (elements.calculationArea) elements.calculationArea.style.display = 'block';
            if (elements.status) elements.status.textContent = '🟡 Đang tính...';
            
            startTimer(lockExpires);
            
            // Calculate digit immediately (simulate fast calculation)
            setTimeout(() => {
                const digit = Math.floor(Math.random() * 10); // Demo - replace with real algorithm
                submitDigit(digit, data.position);
            }, 500); // Only wait 0.5 seconds for demo
            
        } else {
            showMessage(data.error || 'Không thể xin khóa', 'error');
            resetButton();
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showMessage('Lỗi kết nối', 'error');
        resetButton();
    }
}

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
            showMessage(`✅ Đã thêm chữ số ${digit}`, 'success', 2000);
            releaseLock(true);
        } else {
            showMessage(data.error, 'error');
            releaseLock();
        }
        
    } catch (error) {
        console.error('❌ Error:', error);
        showMessage('Lỗi gửi kết quả', 'error');
        releaseLock();
    }
}

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
        resetButton(quiet);
    }
}

function resetButton(quiet = false) {
    if (elements.calculateBtn) {
        elements.calculateBtn.style.display = 'flex';
        elements.calculateBtn.disabled = false;
        elements.calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
    }
    if (elements.cancelBtn) elements.cancelBtn.style.display = 'none';
    if (elements.timer) elements.timer.style.display = 'none';
    if (elements.calculationArea) elements.calculationArea.style.display = 'none';
    
    if (!quiet && elements.status) {
        elements.status.textContent = '🟢 Rảnh';
    }
}

function startTimer(expires) {
    clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const now = new Date();
        const diff = Math.max(0, Math.floor((expires - now) / 1000));
        
        if (elements.timerSeconds) {
            elements.timerSeconds.textContent = diff;
        }
        
        if (diff <= 0) {
            clearInterval(timerInterval);
            releaseLock();
            showMessage('⏰ Hết thời gian!', 'error');
        }
    }, 1000);
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App started, client ID:', clientId);
    
    if (elements.calculateBtn) {
        elements.calculateBtn.addEventListener('click', requestLock);
    }
    
    if (elements.cancelBtn) {
        elements.cancelBtn.addEventListener('click', () => releaseLock());
    }
    
    connectWebSocket();
    
    // Auto refresh status every 5 seconds (fallback)
    setInterval(async () => {
        if (!hasLock) {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                if (data.success) {
                    updatePiDisplay(data.pi_string);
                    if (elements.nextPosition) elements.nextPosition.textContent = data.next_position;
                    if (elements.contributorCount) elements.contributorCount.textContent = data.total_contributors;
                    
                    if (data.is_calculating) {
                        if (elements.status) elements.status.textContent = '🔴 Đang có người tính';
                        if (elements.calculateBtn) elements.calculateBtn.disabled = true;
                    } else {
                        if (elements.status) elements.status.textContent = '🟢 Rảnh';
                        if (elements.calculateBtn) elements.calculateBtn.disabled = false;
                    }
                }
            } catch (error) {
                console.error('❌ Refresh error:', error);
            }
        }
    }, 5000);
});

window.addEventListener('beforeunload', () => {
    if (hasLock) {
        navigator.sendBeacon('/api/release-lock', JSON.stringify({ client_id: clientId }));
    }
});

console.log('✅ Script ready');
