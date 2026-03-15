// ==================== PI CALCULATOR - BẢN CỰC NHANH ====================
// Không rườm rà, không WebSocket phức tạp

// ID người dùng
let clientId = localStorage.getItem('clientId');
if (!clientId) {
    clientId = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem('clientId', clientId);
}

console.log('✅ Script loaded, ID:', clientId);

// DOM elements
const piFraction = document.getElementById('piFraction');
const nextDigitIndicator = document.getElementById('nextDigitIndicator');
const digitCount = document.getElementById('digitCount');
const contributorCount = document.getElementById('contributorCount');
const nextPosition = document.getElementById('nextPosition');
const statusEl = document.getElementById('status');
const calculateBtn = document.getElementById('calculateBtn');
const cancelBtn = document.getElementById('cancelBtn');
const timerEl = document.getElementById('timer');
const timerSeconds = document.getElementById('timerSeconds');
const calculationArea = document.getElementById('calculationArea');
const messageEl = document.getElementById('message');
const historyList = document.getElementById('historyList');

// ==================== HÀM CƠ BẢN ====================

function showMessage(text, type) {
    messageEl.className = `message ${type}`;
    messageEl.textContent = text;
    messageEl.style.display = 'block';
    setTimeout(() => { messageEl.style.display = 'none'; }, 3000);
}

// Cập nhật số Pi
function updatePiDisplay(piString) {
    if (piString === "3.") {
        piFraction.innerHTML = '';
    } else {
        const parts = piString.split('.');
        piFraction.textContent = parts[1] || '';
    }
    digitCount.textContent = piString.length - 2;
}

// Thêm vào lịch sử
function addToHistory(position, digit, contributor) {
    const item = document.createElement('div');
    item.className = 'history-item';
    item.innerHTML = `
        <span>Vị trí ${position}: <strong>${digit}</strong></span>
        <span> - ${contributor}</span>
        <span>${new Date().toLocaleTimeString()}</span>
    `;
    historyList.insertBefore(item, historyList.firstChild);
    if (historyList.children.length > 20) {
        historyList.removeChild(historyList.lastChild);
    }
}

// ==================== GỌI API ====================

// Tải dữ liệu ban đầu
async function loadStatus() {
    try {
        const res = await fetch('/api/status');
        const data = await res.json();
        
        if (data.success) {
            updatePiDisplay(data.pi_string);
            nextPosition.textContent = data.next_position;
            contributorCount.textContent = data.total_contributors;
            
            if (data.is_calculating) {
                statusEl.textContent = '🔴 Đang có người tính';
                calculateBtn.disabled = true;
            } else {
                statusEl.textContent = '🟢 Rảnh';
                calculateBtn.disabled = false;
            }
        }
    } catch (err) {
        console.error('Lỗi tải:', err);
    }
}

// Tải lịch sử
async function loadHistory() {
    try {
        const res = await fetch('/api/history?limit=10');
        const history = await res.json();
        
        historyList.innerHTML = '';
        history.forEach(item => {
            addToHistory(item.position, item.digit, item.contributor);
        });
    } catch (err) {
        console.error('Lỗi lịch sử:', err);
    }
}

// XIN KHÓA - Chạy ngay khi bấm nút
async function requestLock() {
    try {
        // Disable nút
        calculateBtn.disabled = true;
        calculateBtn.textContent = '⏳ Đang xin...';
        
        const res = await fetch('/api/acquire-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
        
        const data = await res.json();
        
        if (data.success) {
            // Đã xin được khóa - chuyển sang chế độ tính
            hasLock = true;
            calculateBtn.style.display = 'none';
            cancelBtn.style.display = 'flex';
            timerEl.style.display = 'block';
            calculationArea.style.display = 'block';
            statusEl.textContent = '🟡 Đang tính...';
            
            // Bắt đầu đếm ngược 30s
            let timeLeft = 30;
            timerSeconds.textContent = timeLeft;
            
            const timer = setInterval(() => {
                timeLeft--;
                timerSeconds.textContent = timeLeft;
                
                if (timeLeft <= 0) {
                    clearInterval(timer);
                    releaseLock();
                    showMessage('⏰ Hết thời gian!', 'error');
                }
            }, 1000);
            
            // TỰ ĐỘNG TÍNH NGAY (1 giây sau)
            setTimeout(async () => {
                // Tính số - demo random
                const digit = Math.floor(Math.random() * 10);
                
                // Gửi kết quả
                const submitRes = await fetch('/api/contribute', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        digit: digit,
                        position: data.position,
                        client_id: clientId,
                        session_id: 'session_' + Date.now()
                    })
                });
                
                const submitData = await submitRes.json();
                
                if (submitData.success) {
                    showMessage(`✅ Đã thêm chữ số ${digit}!`, 'success');
                    
                    // Cập nhật UI
                    updatePiDisplay(submitData.pi_string);
                    nextPosition.textContent = submitData.next_position;
                    contributorCount.textContent = submitData.total_contributors;
                    
                    // Thêm vào lịch sử
                    addToHistory(data.position, digit, clientId.substr(0, 8) + '...');
                    
                    // Trả khóa
                    releaseLock();
                } else {
                    showMessage('❌ Lỗi: ' + submitData.error, 'error');
                    releaseLock();
                }
            }, 1000); // CHỜ 1 GIÂY - có thể giảm xuống 500ms nếu muốn nhanh hơn
            
        } else {
            // Không xin được khóa
            showMessage(data.error || 'Đang có người tính', 'error');
            calculateBtn.disabled = false;
            calculateBtn.textContent = '🔢 Tính chữ số tiếp theo';
        }
        
    } catch (err) {
        console.error('Lỗi:', err);
        showMessage('❌ Lỗi kết nối server', 'error');
        calculateBtn.disabled = false;
        calculateBtn.textContent = '🔢 Tính chữ số tiếp theo';
    }
}

// TRẢ KHÓA
async function releaseLock() {
    if (!hasLock) return;
    
    try {
        await fetch('/api/release-lock', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ client_id: clientId })
        });
    } catch (err) {
        console.error('Lỗi trả khóa:', err);
    }
    
    // Reset UI
    hasLock = false;
    calculateBtn.style.display = 'flex';
    calculateBtn.disabled = false;
    calculateBtn.textContent = '🔢 Tính chữ số tiếp theo';
    cancelBtn.style.display = 'none';
    timerEl.style.display = 'none';
    calculationArea.style.display = 'none';
    
    // Cập nhật trạng thái
    loadStatus();
}

// ==================== SỰ KIỆN ====================

// Khi trang load
document.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 App starting...');
    
    // Load dữ liệu
    loadStatus();
    loadHistory();
    
    // Gắn sự kiện cho nút
    calculateBtn.addEventListener('click', requestLock);
    cancelBtn.addEventListener('click', releaseLock);
    
    // Tự động refresh mỗi 5 giây
    setInterval(() => {
        if (!hasLock) {
            loadStatus();
        }
    }, 5000);
    
    // Tự động refresh lịch sử mỗi 10 giây
    setInterval(() => {
        if (!hasLock) {
            loadHistory();
        }
    }, 10000);
});

// Khi thoát trang
window.addEventListener('beforeunload', () => {
    if (hasLock) {
        navigator.sendBeacon('/api/release-lock', JSON.stringify({ client_id: clientId }));
    }
});
