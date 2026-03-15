// ==================== STATE MANAGEMENT ====================
let socket = null;
let clientId = localStorage.getItem('clientId') || generateClientId();
let sessionId = generateSessionId();
let currentPiString = "3.";
let nextPosition = 1;
let hasLock = false;
let lockExpires = null;
let timerInterval = null;
let reconnectAttempts = 0;

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

// ==================== UTILITY FUNCTIONS ====================

function generateClientId() {
    const id = 'user_' + Math.random().toString(36).substr(2, 9) + '_' + Date.now().toString(36);
    localStorage.setItem('clientId', id);
    return id;
}

function generateSessionId() {
    return 'session_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function showMessage(text, type = 'info') {
    console.log(`📢 [${type}] ${text}`);
    if (!messageEl) return;
    
    messageEl.className = `message ${type}`;
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    
    setTimeout(() => {
        if (messageEl.className === `message ${type}`) {
            messageEl.style.display = 'none';
        }
    }, 5000);
}

function updatePiDisplay(piString) {
    currentPiString = piString;
    
    if (!piFractionEl || !nextDigitIndicator) return;
    
    if (piString === "3.") {
        piFractionEl.innerHTML = '';
        nextDigitIndicator.style.display = 'inline-block';
    } else {
        const parts = piString.split('.');
        if (parts.length > 1) {
            piFractionEl.textContent = parts[1];
        }
        nextDigitIndicator.style.display = 'inline-block';
    }
    
    if (digitCountEl) {
        digitCountEl.textContent = piString.length - 2;
    }
}

function addToHistory(item) {
    if (!historyList) return;
    
    const historyItem = document.createElement('div');
    historyItem.className = 'history-item';
    
    const time = item.time ? new Date(item.time).toLocaleTimeString() : 'vừa xong';
    
    historyItem.innerHTML = `
        <span class="position">Vị trí ${item.position}:</span>
        <span class="digit">${item.digit}</span>
        <span class="contributor">- ${item.contributor || 'anonymous'}</span>
        <span class="time">${time}</span>
    `;
    
    historyList.insertBefore(historyItem, historyList.firstChild);
    
    // Giới hạn 50 items
    while (historyList.children.length > 50) {
        historyList.removeChild(historyList.lastChild);
    }
}

// ==================== WEBSOCKET ====================

function connectWebSocket() {
    try {
        // Kết nối đến cùng host
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        console.log('🔌 Connecting to WebSocket:', wsUrl);
        
        socket = io(wsUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            reconnectionAttempts: 10,
            reconnectionDelay: 1000,
            timeout: 10000
        });
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected', socket.id);
            showMessage('Đã kết nối đến server', 'info');
            reconnectAttempts = 0;
            loadInitialData();
        });
        
        socket.on('connect_error', (error) => {
            console.error('❌ WebSocket connection error:', error);
            reconnectAttempts++;
            if (reconnectAttempts > 5) {
                showMessage('Mất kết nối server, đang thử lại...', 'error');
            }
        });
        
        socket.on('new_digit', (data) => {
            console.log('📥 New digit received:', data);
            updatePiDisplay(data.pi_string);
            if (nextPositionEl) nextPositionEl.textContent = data.next_position;
            if (contributorCountEl) contributorCountEl.textContent = data.total_contributors;
            
            addToHistory({
                position: data.position,
                digit: data.digit,
                contributor: data.contributor_id,
                time: new Date().toISOString()
            });
            
            if (hasLock) {
                releaseLock(true);
            }
        });
        
        socket.on('lock_acquired', (data) => {
            console.log('🔒 Lock acquired by:', data.calculator_id);
            if (data.calculator_id !== clientId) {
                if (statusEl) statusEl.textContent = `🔴 Người khác đang tính`;
                if (calculateBtn) calculateBtn.disabled = true;
            }
        });
        
        socket.on('lock_released', (data) => {
            console.log('🔓 Lock released');
            if (!hasLock) {
                if (statusEl) statusEl.textContent = '🟢 Rảnh';
                if (calculateBtn) calculateBtn.disabled = false;
            }
        });
        
        socket.on('disconnect', (reason) => {
            console.log('❌ WebSocket disconnected:', reason);
            if (reason === 'io server disconnect') {
                setTimeout(connectWebSocket, 1000);
            }
        });
        
    } catch (error) {
        console.error('❌ WebSocket error:', error);
        setTimeout(connectWebSocket, 3000);
    }
}

// ==================== API CALLS ====================

async function loadInitialData() {
    try {
        console.log('📡 Loading initial data...');
        const response = await fetch('/api/status');
        const data = await response.json();
        
        console.log('📥 Status response:', data);
        
        if (data.success) {
            updatePiDisplay(data.pi_string);
            nextPosition = data.next_position;
            if (nextPositionEl) nextPositionEl.textContent = nextPosition;
            if (contributorCountEl) contributorCountEl.textContent = data.total_contributors;
            
            if (data.is_calculating) {
                if (statusEl) statusEl.textContent = '🔴 Đang có người tính';
                if (calculateBtn) calculateBtn.disabled = true;
            }
        }
        
        // Load history
        loadHistory();
        
    } catch (error) {
        console.error('❌ Error loading initial data:', error);
        showMessage('Không thể tải dữ liệu', 'error');
    }
}

async function loadHistory() {
    try {
        const response = await fetch('/api/history?limit=20');
        const history = await response.json();
        
        if (historyList) {
            historyList.innerHTML = '';
            history.forEach(item => addToHistory(item));
        }
        
    } catch (error) {
        console.error('❌ Error loading history:', error);
        if (historyList) {
            historyList.innerHTML = '<div class="loading">Không thể tải lịch sử</div>';
        }
    }
}

async function requestLock() {
    try {
        console.log('🔒 Requesting lock...');
        
        if (calculateBtn) {
            calculateBtn.disabled = true;
            calculateBtn.textContent = 'Đang xin khóa...';
        }
        
        const response = await fetch('/api/acquire-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
        
        const data = await response.json();
        console.log('📥 Lock response:', data);
        
        if (data.success) {
            hasLock = true;
            lockExpires = new Date(data.expires);
            
            // Update UI
            if (calculateBtn) calculateBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'flex';
            if (timerEl) timerEl.style.display = 'block';
            if (calculationArea) calculationArea.style.display = 'block';
            if (statusEl) statusEl.textContent = '🟡 Đang tính...';
            
            startTimer(lockExpires);
            await calculateDigit(data.position, data.current_pi);
            
        } else {
            console.log('❌ Cannot acquire lock:', data.error);
            showMessage(data.error || 'Không thể xin khóa', 'error');
            if (calculateBtn) {
                calculateBtn.disabled = false;
                calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
            }
        }
        
    } catch (error) {
        console.error('❌ Error requesting lock:', error);
        showMessage('Lỗi kết nối server', 'error');
        if (calculateBtn) {
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
        }
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
        
        // Update UI
        if (calculateBtn) {
            calculateBtn.style.display = 'flex';
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
        }
        if (cancelBtn) cancelBtn.style.display = 'none';
        if (timerEl) timerEl.style.display = 'none';
        if (calculationArea) calculationArea.style.display = 'none';
        
        if (!quiet && statusEl) {
            statusEl.textContent = '🟢 Rảnh';
        }
    }
}

async function calculateDigit(position, currentPi) {
    try {
        console.log('🧮 Calculating digit at position', position);
        
        // Giả lập thời gian tính (2-4 giây)
        const calculationTime = 2000 + Math.random() * 2000;
        await new Promise(resolve => setTimeout(resolve, calculationTime));
        
        // Tính digit (demo - dùng thuật toán đơn giản)
        // Trong thực tế, đây là nơi gọi API tính toán
        const digit = Math.floor(Math.random() * 10);
        console.log('✅ Calculated digit:', digit);
        
        await submitDigit(digit, position);
        
    } catch (error) {
        console.error('❌ Error calculating:', error);
        showMessage('Lỗi khi tính toán', 'error');
        await releaseLock();
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
        console.log('📥 Submit response:', data);
        
        if (data.success) {
            showMessage(data.message, 'success');
            await releaseLock(true);
        } else {
            showMessage(data.error, 'error');
            await releaseLock();
        }
        
    } catch (error) {
        console.error('❌ Error submitting digit:', error);
        showMessage('Không thể gửi kết quả', 'error');
        await releaseLock();
    }
}

function startTimer(expires) {
    clearInterval(timerInterval);
    
    timerInterval = setInterval(() => {
        const now = new Date();
        const diff = Math.max(0, Math.floor((expires - now) / 1000));
        
        if (timerSecondsEl) {
            timerSecondsEl.textContent = diff;
        }
        
        if (diff <= 0) {
            clearInterval(timerInterval);
            releaseLock();
            showMessage('Hết thời gian tính!', 'error');
        }
    }, 1000);
}

// ==================== EVENT LISTENERS ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 Script loaded, client ID:', clientId);
    
    // Add event listeners
    if (calculateBtn) {
        calculateBtn.addEventListener('click', requestLock);
    }
    
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => releaseLock());
    }
    
    // Connect WebSocket
    connectWebSocket();
    
    // Auto refresh status
    setInterval(async () => {
        if (!hasLock) {
            try {
                const response = await fetch('/api/status');
                const data = await response.json();
                
                if (data.success) {
                    updatePiDisplay(data.pi_string);
                    if (nextPositionEl) nextPositionEl.textContent = data.next_position;
                    if (contributorCountEl) contributorCountEl.textContent = data.total_contributors;
                    
                    if (data.is_calculating) {
                        if (statusEl) statusEl.textContent = '🔴 Đang có người tính';
                        if (calculateBtn) calculateBtn.disabled = true;
                    } else {
                        if (statusEl) statusEl.textContent = '🟢 Rảnh';
                        if (calculateBtn) calculateBtn.disabled = false;
                    }
                }
            } catch (error) {
                console.error('❌ Error refreshing status:', error);
            }
        }
    }, 5000);
});

// Handle before unload
window.addEventListener('beforeunload', () => {
    if (hasLock) {
        navigator.sendBeacon('/api/release-lock', JSON.stringify({ client_id: clientId }));
    }
});

// Log for debugging
console.log('✅ Script initialized', {
    clientId,
    sessionId,
    userAgent: navigator.userAgent,
    url: window.location.href
});
