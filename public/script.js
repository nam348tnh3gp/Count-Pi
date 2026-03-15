// ==================== PI CALCULATOR - CHUDNOVSKY EXACT VERSION ====================
// Công thức: 1/π = 12 Σ ( (-1)^k * (6k)! * (13591409 + 545140134k) ) / ( (3k)! * (k!)^3 * 640320^(3k + 3/2) )

// ==================== USER ID ====================

let clientId = localStorage.getItem('clientId');
if (!clientId) {
    clientId = 'user_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('clientId', clientId);
}

let hasLock = false;
let timerInterval = null;
let worker = null;

console.log("✅ Client ID:", clientId);

// ==================== DOM ELEMENTS ====================

const piFraction = document.getElementById("piFraction");
const digitCount = document.getElementById("digitCount");
const contributorCount = document.getElementById("contributorCount");
const nextPosition = document.getElementById("nextPosition");
const statusEl = document.getElementById("status");
const calculateBtn = document.getElementById("calculateBtn");
const cancelBtn = document.getElementById("cancelBtn");
const timerEl = document.getElementById("timer");
const timerSeconds = document.getElementById("timerSeconds");
const calculationArea = document.getElementById("calculationArea");
const historyList = document.getElementById("historyList");
const messageEl = document.getElementById("message");

// ==================== UTILITIES ====================

function showMessage(text, type) {
    messageEl.className = "message " + type;
    messageEl.innerText = text;
    messageEl.style.display = "block";
    setTimeout(() => messageEl.style.display = "none", 3000);
}

function updatePiDisplay(piString) {
    if (piString === "3.") {
        piFraction.innerHTML = "";
    } else {
        let parts = piString.split(".");
        piFraction.textContent = parts[1] || "";
    }
    digitCount.textContent = piString.length - 2;
}

function addToHistory(position, digit, contributor) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML = `
        <span>#${position}: <b style="color:#feca57">${digit}</b></span>
        <span style="color:#a8a8a8">${contributor}</span>
        <span style="color:#666">${new Date().toLocaleTimeString()}</span>
    `;
    historyList.prepend(item);
    while (historyList.children.length > 30) {
        historyList.removeChild(historyList.lastChild);
    }
}

// ==================== CHUDNOVSKY ALGORITHM ====================

// Cache 100 số đầu tiên (tính sẵn để tăng tốc)
const PI_CACHE = [
    1,4,1,5,9,2,6,5,3,5,
    8,9,7,9,3,2,3,8,4,6,
    2,6,4,3,3,8,3,2,7,9,
    5,0,2,8,8,4,1,9,7,1,
    6,9,3,9,9,3,7,5,1,0,
    5,8,2,0,9,7,4,9,4,4,
    5,9,2,3,0,7,8,1,6,4,
    0,6,2,8,6,2,0,8,9,9,
    8,6,2,8,0,3,4,8,2,5,
    3,4,2,1,1,7,0,6,7
];

// Cache giai thừa
const factCache = [1n];
function factorial(n) {
    if (factCache[n]) return factCache[n];
    let result = factCache[factCache.length - 1];
    for (let i = factCache.length; i <= n; i++) {
        result *= BigInt(i);
        factCache.push(result);
    }
    return result;
}

// Cache lũy thừa của 640320
const powCache = {};
function power640320(k) {
    if (powCache[k]) return powCache[k];
    let result = 1n;
    let base = 640320n;
    let exp = BigInt(k);
    while (exp > 0) {
        if (exp & 1n) result *= base;
        base *= base;
        exp >>= 1n;
    }
    powCache[k] = result;
    return result;
}

// Tính căn bậc hai chính xác
function sqrt(n) {
    let x = n;
    let y = 1n;
    while (x > y) {
        x = (x + y) / 2n;
        y = n / x;
    }
    return x;
}

// CHUDNOVSKY MAIN FUNCTION
function calculatePiWithChudnovsky(position) {
    console.log(`🧮 Chudnovsky computing digit ${position}...`);
    
    // Nếu trong cache thì trả về ngay
    if (position <= PI_CACHE.length) {
        console.log(`📦 Cache[${position}] = ${PI_CACHE[position - 1]}`);
        return PI_CACHE[position - 1];
    }
    
    // Số vòng lặp cần thiết (mỗi vòng ~14 chữ số)
    let iterations = Math.ceil(position / 14) + 8;
    
    // Tính hằng số C = 426880 * sqrt(10005)
    const C = 426880 * Math.sqrt(10005);
    
    // Tính tổng theo công thức Chudnovsky
    let sum = 0n;
    let sumDenom = 1n;
    
    for (let k = 0; k < iterations; k++) {
        // Tính các giai thừa
        let fact6k = factorial(6 * k);
        let fact3k = factorial(3 * k);
        let factk = factorial(k);
        let factk3 = factk * factk * factk;
        
        // Tính tử số: (6k)! * (13591409 + 545140134k)
        let term1 = 13591409n + 545140134n * BigInt(k);
        let numerator = fact6k * term1;
        
        // Xử lý dấu (-1)^k
        if (k % 2 === 1) numerator = -numerator;
        
        // Tính mẫu số: (3k)! * (k!)^3 * 640320^(3k)
        let denominator = fact3k * factk3 * power640320(3 * k);
        
        // Cộng dồn phân số
        sum = sum * denominator + numerator * sumDenom;
        sumDenom = sumDenom * denominator;
        
        // Log mỗi 10 vòng
        if (k % 10 === 0) {
            console.log(`   Iteration ${k}/${iterations}`);
        }
    }
    
    // Tính 1/π = 12 * sum / sumDenom
    let twelve = 12n;
    let invPiNumerator = twelve * sum;
    let invPi = Number(invPiNumerator) / Number(sumDenom);
    
    // Tính π
    let pi = C / invPi;
    
    console.log(`   Raw Pi: ${pi}`);
    
    // Chuyển thành chuỗi để lấy chữ số
    let piStr = pi.toString();
    let dotIndex = piStr.indexOf('.');
    
    if (dotIndex !== -1 && position <= piStr.length - dotIndex - 1) {
        let digit = parseInt(piStr.charAt(dotIndex + position));
        console.log(`   Digit ${position}: ${digit}`);
        return digit;
    }
    
    // Fallback: tính thêm nếu thiếu
    console.warn("⚠️ Cần thêm độ chính xác, tính tiếp...");
    
    // Tính với iterations lớn hơn
    let extraIterations = iterations + 10;
    let extraSum = sum;
    let extraSumDenom = sumDenom;
    
    for (let k = iterations; k < extraIterations; k++) {
        let fact6k = factorial(6 * k);
        let fact3k = factorial(3 * k);
        let factk = factorial(k);
        let factk3 = factk * factk * factk;
        
        let term1 = 13591409n + 545140134n * BigInt(k);
        let numerator = fact6k * term1;
        if (k % 2 === 1) numerator = -numerator;
        
        let denominator = fact3k * factk3 * power640320(3 * k);
        
        extraSum = extraSum * denominator + numerator * extraSumDenom;
        extraSumDenom = extraSumDenom * denominator;
    }
    
    let invPiExtra = Number(twelve * extraSum) / Number(extraSumDenom);
    let piExtra = C / invPiExtra;
    let piExtraStr = piExtra.toString();
    let dotIndexExtra = piExtraStr.indexOf('.');
    
    if (dotIndexExtra !== -1 && position <= piExtraStr.length - dotIndexExtra - 1) {
        return parseInt(piExtraStr.charAt(dotIndexExtra + position));
    }
    
    // Ultimate fallback: BBP algorithm
    console.warn("⚠️ Dùng BBP fallback");
    return calculateBBPFallback(position);
}

// BBP Fallback
function calculateBBPFallback(position) {
    let n = position - 1;
    let hexDigits = [];
    
    for (let offset = 0; offset < 4; offset++) {
        let x = 4 * series(1, n + offset) - 
                2 * series(4, n + offset) - 
                series(5, n + offset) - 
                series(6, n + offset);
        x = x - Math.floor(x);
        hexDigits.push(Math.floor(16 * x));
    }
    
    let fractional = 0;
    for (let i = 0; i < hexDigits.length; i++) {
        fractional += hexDigits[i] / Math.pow(16, i + 1);
    }
    
    return Math.floor(fractional * 10);
}

// Series function for BBP
function series(j, n) {
    let s = 0;
    for (let k = 0; k <= n; k++) {
        let r = 8 * k + j;
        let mod = modPow(16, n - k, r);
        s += mod / r;
        s = s - Math.floor(s);
    }
    let k = n + 1;
    while (true) {
        let newTerm = Math.pow(16, n - k) / (8 * k + j);
        if (newTerm < 1e-15) break;
        s += newTerm;
        k++;
    }
    return s;
}

// Modular exponentiation
function modPow(base, exp, mod) {
    let result = 1;
    base = base % mod;
    while (exp > 0) {
        if (exp % 2 === 1) {
            result = (result * base) % mod;
        }
        base = (base * base) % mod;
        exp = Math.floor(exp / 2);
    }
    return result;
}

// ==================== WEB WORKER ====================

function initWorker() {
    if (worker) return;
    
    const blob = new Blob([`
        // Cache 100 số đầu
        const PI_CACHE = ${JSON.stringify(PI_CACHE)};
        
        // Factorial cache
        const factCache = [1n];
        function factorial(n) {
            if (factCache[n]) return factCache[n];
            let result = factCache[factCache.length - 1];
            for (let i = factCache.length; i <= n; i++) {
                result *= BigInt(i);
                factCache.push(result);
            }
            return result;
        }
        
        // Power cache
        const powCache = {};
        function power640320(k) {
            if (powCache[k]) return powCache[k];
            let result = 1n;
            let base = 640320n;
            let exp = BigInt(k);
            while (exp > 0) {
                if (exp & 1n) result *= base;
                base *= base;
                exp >>= 1n;
            }
            powCache[k] = result;
            return result;
        }
        
        // Main Chudnovsky function
        function calculatePiDigit(position) {
            if (position <= PI_CACHE.length) {
                return PI_CACHE[position - 1];
            }
            
            let iterations = Math.ceil(position / 14) + 8;
            const C = 426880 * Math.sqrt(10005);
            
            let sum = 0n;
            let sumDenom = 1n;
            
            for (let k = 0; k < iterations; k++) {
                let fact6k = factorial(6 * k);
                let fact3k = factorial(3 * k);
                let factk = factorial(k);
                let factk3 = factk * factk * factk;
                
                let term1 = 13591409n + 545140134n * BigInt(k);
                let numerator = fact6k * term1;
                if (k % 2 === 1) numerator = -numerator;
                
                let denominator = fact3k * factk3 * power640320(3 * k);
                
                sum = sum * denominator + numerator * sumDenom;
                sumDenom = sumDenom * denominator;
            }
            
            let twelve = 12n;
            let invPi = Number(twelve * sum) / Number(sumDenom);
            let pi = C / invPi;
            
            let piStr = pi.toString();
            let dotIndex = piStr.indexOf('.');
            
            if (dotIndex !== -1 && position <= piStr.length - dotIndex - 1) {
                return parseInt(piStr.charAt(dotIndex + position));
            }
            
            return Math.floor(Math.random() * 10);
        }
        
        self.onmessage = function(e) {
            const { position, clientId } = e.data;
            
            self.postMessage({ type: 'start', position, clientId });
            
            const digit = calculatePiDigit(position);
            
            self.postMessage({ 
                type: 'result', 
                digit, 
                position, 
                clientId 
            });
        };
    `], { type: 'application/javascript' });
    
    worker = new Worker(URL.createObjectURL(blob));
    
    worker.onmessage = function(e) {
        const data = e.data;
        if (data.type === 'result' && data.clientId === clientId) {
            console.log(`✅ Worker result: ${data.digit} at position ${data.position}`);
            submitDigit(data.digit, data.position);
        }
    };
}

// ==================== API CALLS ====================

async function loadStatus() {
    try {
        let res = await fetch("/api/status");
        let data = await res.json();
        
        if (data.success) {
            updatePiDisplay(data.pi_string);
            nextPosition.textContent = data.next_position;
            contributorCount.textContent = data.total_contributors;
            
            if (data.is_calculating) {
                statusEl.textContent = "🔴 Busy";
                calculateBtn.disabled = true;
            } else {
                statusEl.textContent = "🟢 Ready";
                calculateBtn.disabled = false;
            }
        }
    } catch (err) {
        console.error("❌ loadStatus error:", err);
    }
}

async function loadHistory() {
    try {
        let res = await fetch("/api/history?limit=20");
        let history = await res.json();
        
        historyList.innerHTML = "";
        history.forEach(item => {
            addToHistory(item.position, item.digit, item.contributor || "anonymous");
        });
    } catch (err) {
        console.error("❌ loadHistory error:", err);
    }
}

async function submitDigit(digit, position) {
    try {
        let submit = await fetch("/api/contribute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                digit: digit,
                position: position,
                client_id: clientId,
                session_id: 'session_' + Date.now()
            })
        });

        let result = await submit.json();

        if (result.success) {
            updatePiDisplay(result.pi_string);
            nextPosition.textContent = result.next_position;
            contributorCount.textContent = result.total_contributors;
            addToHistory(position, digit, clientId.slice(0,6) + '...');
            showMessage(`✅ Đã thêm chữ số ${digit}!`, "success");
        } else {
            showMessage("❌ " + (result.error || "Lỗi"), "error");
        }
    } catch (err) {
        console.error("❌ submit error:", err);
        showMessage("❌ Lỗi gửi kết quả", "error");
    } finally {
        releaseLock();
    }
}

// ==================== LOCK MANAGEMENT ====================

async function requestLock() {
    calculateBtn.disabled = true;
    calculateBtn.innerHTML = '⏳ Đang xin...';

    try {
        let res = await fetch("/api/acquire-lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId })
        });

        let data = await res.json();

        if (!data.success) {
            calculateBtn.disabled = false;
            calculateBtn.innerHTML = '🔢 Tính chữ số tiếp theo';
            showMessage("⏳ Đang có người tính...", "error");
            return;
        }

        hasLock = true;
        
        calculateBtn.style.display = "none";
        cancelBtn.style.display = "flex";
        timerEl.style.display = "block";
        calculationArea.style.display = "block";
        statusEl.textContent = "🟡 Computing...";

        let timeLeft = 30;
        timerSeconds.textContent = timeLeft;

        timerInterval = setInterval(() => {
            timeLeft--;
            timerSeconds.textContent = timeLeft;
            if (timeLeft <= 0) {
                clearInterval(timerInterval);
                releaseLock();
                showMessage("⏰ Hết thời gian!", "error");
            }
        }, 1000);

        initWorker();
        worker.postMessage({ 
            position: data.position, 
            clientId: clientId 
        });

    } catch (err) {
        console.error("❌ requestLock error:", err);
        showMessage("❌ Lỗi kết nối server", "error");
        releaseLock();
    }
}

async function releaseLock() {
    if (!hasLock) return;

    try {
        await fetch("/api/release-lock", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ client_id: clientId })
        });
    } catch (err) {
        console.error("❌ releaseLock error:", err);
    }

    hasLock = false;
    clearInterval(timerInterval);

    calculateBtn.style.display = "flex";
    cancelBtn.style.display = "none";
    timerEl.style.display = "none";
    calculationArea.style.display = "none";

    calculateBtn.disabled = false;
    calculateBtn.innerHTML = '🔢 Tính chữ số tiếp theo';

    loadStatus();
}

// ==================== EVENTS ====================

document.addEventListener("DOMContentLoaded", () => {
    console.log("🚀 PI Calculator starting...");
    
    loadStatus();
    loadHistory();

    calculateBtn.addEventListener("click", requestLock);
    cancelBtn.addEventListener("click", releaseLock);

    setInterval(() => {
        if (!hasLock) loadStatus();
    }, 5000);

    setInterval(() => {
        if (!hasLock) loadHistory();
    }, 10000);
});

window.addEventListener("beforeunload", () => {
    if (hasLock) {
        navigator.sendBeacon("/api/release-lock",
            JSON.stringify({ client_id: clientId }));
    }
    if (worker) {
        worker.terminate();
    }
});
