// ==================== PI CALCULATOR - BẢN NHẸ, NHANH ====================

// State
let clientId = localStorage.getItem('clientId');
if (!clientId) {
    clientId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('clientId', clientId);
}

let hasLock = false;
let timerInterval = null;
let statusInterval = null;

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
    historyList: document.getElementById('historyList')
};

// ==================== UTILITIES ====================

function showMessage(text, type = 'info', duration = 3000) {
    const el = elements.message;
    if (!el) return;
    el.className = `message ${type}`;
    el.textContent = text;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, duration);
}

function updatePiDisplay(piString) {
    if (!elements.piFraction) return;
    
    if (piString === "3.") {
        elements.piFraction.innerHTML = '';
    } else {
        const parts = piString.split('.');
        elements.piFraction.textContent = parts[1] || '';
    }
    
    if (elements.digitCount) {
        elements.digitCount.textContent = piString.length - 2;
    }
}

function addToHistory(position, digit, contributor) {
    if (!elements.historyList) return;
    
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
        <span>Vị trí ${position}: <strong style="color:#feca57">${digit}</strong></span>
        <span style="color:#a8a8a8"> - ${contributor}</span>
        <span style="color:#666">${new Date().toLocaleTimeString()}</span>
    `;
    elements.historyList.insertBefore(item, elements.historyList.firstChild);
    
    // Giữ 30 item gần nhất
    while (elements.historyList.children.length > 30) {
        elements.historyList.removeChild(elements.historyList.lastChild);
    }
}

// ==================== API CALLS ====================

async function loadStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
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
    } catch (err) {
        console.error('Lỗi load status:', err);
    }
}

async function loadHistory() {
    try {
        const res = await fetch('/api/history?limit=20');
        const history = await res.json();
        
        if (elements.historyList) {
            elements.historyList.innerHTML = '';
            history.forEach(item => {
                addToHistory(item.position, item.digit, item.contributor);
            });
        }
    } catch (err) {
        console.error('Lỗi load history:', err);
    }
}

// ==================== LOCK & CALCULATION ====================

async function requestLock() {
    try {
        // Disable nút
        if (elements.calculateBtn) {
            elements.calculateBtn.disabled = true;
            elements.calculateBtn.innerHTML = '<span class="btn-icon">⏳</span><span class="btn-text">Đang xin...</span>';
        }
        
        const res = await fetch('/api/acquire-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Đã xin được khóa
            hasLock = true;
            
            // UI chuyển sang chế độ tính
            if (elements.calculateBtn) elements.calculateBtn.style.display = 'none';
            if (elements.cancelBtn) elements.cancelBtn.style.display = 'flex';
            if (elements.timer) elements.timer.style.display = 'block';
            if (elements.calculationArea) elements.calculationArea.style.display = 'block';
            if (elements.status) elements.status.textContent = '🟡 Đang tính...';
            
            // Bắt đầu đếm ngược 30s
            let timeLeft = 30;
            if (elements.timerSeconds) elements.timerSeconds.textContent = timeLeft;
            
            clearInterval(timerInterval);
            timerInterval = setInterval(() => {
                timeLeft--;
                if (elements.timerSeconds) elements.timerSeconds.textContent = timeLeft;
                
                if (timeLeft <= 0) {
                    clearInterval(timerInterval);
                    releaseLock();
                    showMessage('⏰ Hết thời gian!', 'error');
                }
            }, 1000);
            
            // TÍNH TOÁN - chỉ chờ 1 giây cho demo
            setTimeout(() => {
                // Random digit (có thể thay bằng thuật toán thật)
                const digit = Math.floor(Math.random() * 10);
                
                // Gửi kết quả
                submitDigit(digit, data.position);
                
            }, 1000); // 1 giây - có thể giảm xuống 500ms nếu muốn nhanh hơn
            
        } else {
            // Không xin được khóa
            showMessage(data.error || 'Đang có người tính', 'error');
            if (elements.calculateBtn) {
                elements.calculateBtn.disabled = false;
                elements.calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
            }
        }
        
    } catch (err) {
        console.error('Lỗi request lock:', err);
        showMessage('❌ Lỗi kết nối', 'error');
        if (elements.calculateBtn) {
            elements.calculateBtn.disabled = false;
            elements.calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
        }
    }
}

async function submitDigit(digit, position) {
    try {
        const res = await fetch('/api/contribute', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                digit: digit,
                position: position,
                client_id: clientId,
                session_id: 'session_' + Date.now()
            })
        });
        
        const data = await res.json();
        
        if (data.success) {
            showMessage(`✅ Đã thêm chữ số ${digit}!`, 'success');
            
            // Cập nhật UI
            updatePiDisplay(data.pi_string);
            if (elements.nextPosition) elements.nextPosition.textContent = data.next_position;
            if (elements.contributorCount) elements.contributorCount.textContent = data.total_contributors;
            
            // Thêm vào lịch sử
            addToHistory(position, digit, clientId.substr(0, 6) + '...');
            
            // Trả khóa
            releaseLock();
        } else {
            showMessage('❌ ' + data.error, 'error');
            releaseLock();
        }
        
    } catch (err) {
        console.error('Lỗi submit:', err);
        showMessage('❌ Lỗi gửi kết quả', 'error');
        releaseLock();
    }
}

async function releaseLock() {
    if (!hasLock) return;
    
    try {
        await fetch('/api/release-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
    } catch (err) {
        console.error('Lỗi release lock:', err);
    }
    
    // Reset UI
    hasLock = false;
    clearInterval(timerInterval);
    
    if (elements.calculateBtn) {
        elements.calculateBtn.style.display = 'flex';
        elements.calculateBtn.disabled = false;
        elements.calculateBtn.innerHTML = '<span class="btn-icon">🔢</span><span class="btn-text">Tính chữ số tiếp theo</span>';
    }
    if (elements.cancelBtn) elements.cancelBtn.style.display = 'none';
    if (elements.timer) elements.timer.style.display = 'none';
    if (elements.calculationArea) elements.calculationArea.style.display = 'none';
    
    // Load lại status
    loadStatus();
}

// ==================== WEBSOCKET ====================

let socket = null;

function connectWebSocket() {
    try {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;
        
        socket = io(wsUrl, {
            transports: ['websocket', 'polling'],
            reconnection: true,
            timeout: 5000
        });
        
        socket.on('connect', () => {
            console.log('✅ WebSocket connected');
        });
        
        socket.on('new_digit', (data) => {
            console.log('📥 New digit:', data);
            updatePiDisplay(data.pi_string);
            if (elements.nextPosition) elements.nextPosition.textContent = data.next_position;
            if (elements.contributorCount) elements.contributorCount.textContent = data.total_contributors;
            addToHistory(data.position, data.digit, data.contributor_id);
        });
        
        socket.on('reset', (data) => {
            console.log('🔄 Reset:', data);
            updatePiDisplay(data.pi_string);
            if (elements.nextPosition) elements.nextPosition.textContent = data.next_position;
            showMessage(data.message, 'warning');
        });
        
    } catch (err) {
        console.error('❌ WebSocket error:', err);
    }
}

// ==================== INIT ====================

document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App started, ID:', clientId);
    
    // Load dữ liệu
    loadStatus();
    loadHistory();
    
    // WebSocket
    connectWebSocket();
    
    // Event listeners
    if (elements.calculateBtn) {
        elements.calculateBtn.addEventListener('click', requestLock);
    }
    if (elements.cancelBtn) {
        elements.cancelBtn.addEventListener('click', releaseLock);
    }
    
    // Auto refresh mỗi 5 giây
    setInterval(() => {
        if (!hasLock) loadStatus();
    }, 5000);
    
    // Refresh history mỗi 10 giây
    setInterval(() => {
        if (!hasLock) loadHistory();
    }, 10000);
});

// Release lock khi thoát
window.addEventListener('beforeunload', () => {
    if (hasLock) {
        navigator.sendBeacon('/api/release-lock', JSON.stringify({ client_id: clientId }));
    }
});
