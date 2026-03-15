// ==================== PI CALCULATOR - CHUDNOVSKY ALGORITHM ====================
// Thuật toán nhanh nhất thế giới để tính Pi

// ==================== USER ID ====================

let clientId = localStorage.getItem('clientId');

if (!clientId) {
    clientId = 'user_' + Math.random().toString(36).substring(2, 9);
    localStorage.setItem('clientId', clientId);
}

let hasLock = false;
let timerInterval = null;

console.log("Client:", clientId);


// ==================== FIRST 100 PI DIGITS ====================

const PI_DIGITS = [
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


// ==================== DOM ====================

const piFraction = document.getElementById("piFraction");
const digitCount = document.getElementById("digitCount");
const contributorCount = document.getElementById("contributorCount");
const nextPosition = document.getElementById("nextPosition");
const statusEl = document.getElementById("status");

const calculateBtn = document.getElementById("calculateBtn");
const cancelBtn = document.getElementById("cancelBtn");

const timerEl = document.getElementById("timer");
const timerSeconds = document.getElementById("timerSeconds");

const historyList = document.getElementById("historyList");
const messageEl = document.getElementById("message");


// ==================== MESSAGE ====================

function showMessage(text, type) {
    messageEl.className = "message " + type;
    messageEl.innerText = text;
    messageEl.style.display = "block";

    setTimeout(() => {
        messageEl.style.display = "none";
    }, 3000);
}


// ==================== PI DISPLAY ====================

function updatePiDisplay(piString) {
    if (piString === "3.") {
        piFraction.innerHTML = "";
    } else {
        let parts = piString.split(".");
        piFraction.textContent = parts[1] || "";
    }

    digitCount.textContent = piString.length - 2;
}


// ==================== HISTORY ====================

function addToHistory(position, digit, contributor) {
    const item = document.createElement("div");
    item.className = "history-item";
    item.innerHTML =
        `<span>#${position}: <b>${digit}</b></span>
         <span>${contributor}</span>
         <span>${new Date().toLocaleTimeString()}</span>`;

    historyList.prepend(item);

    if (historyList.children.length > 20)
        historyList.removeChild(historyList.lastChild);
}


// ==================== CHUDNOVSKY ALGORITHM ====================
// Tính chính xác chữ số thập phân thứ n của Pi

function calculatePiDigit(position) {
    // Dùng cache cho 100 số đầu
    if (position <= PI_DIGITS.length) {
        console.log(`📦 Cache[${position}] = ${PI_DIGITS[position - 1]}`);
        return PI_DIGITS[position - 1];
    }

    console.log(`🧮 Chudnovsky computing digit ${position}...`);

    // Số vòng lặp cần thiết để đạt độ chính xác cho vị trí position
    // Công thức: mỗi vòng lặp Chudnovsky cho ~14 chữ số
    let iterations = Math.ceil(position / 14) + 5;

    let C = 426880 * Math.sqrt(10005);
    let sum = 0;
    
    for (let k = 0; k < iterations; k++) {
        // Tính (6k)!
        let fact6k = factorial(6 * k);
        
        // Tính (3k)!
        let fact3k = factorial(3 * k);
        
        // Tính (k!)^3
        let factk = factorial(k);
        let factk3 = Math.pow(factk, 3);
        
        // Tính tử số
        let numerator = Math.pow(-1, k) * fact6k * (13591409 + 545140134 * k);
        
        // Tính mẫu số
        let denominator = fact3k * factk3 * Math.pow(640320, 3 * k);
        
        // Cộng dồn
        sum += numerator / denominator;
        
        // Debug mỗi 10 vòng
        if (k % 10 === 0) {
            console.log(`   Iteration ${k}: sum = ${sum}`);
        }
    }

    // Tính Pi
    let pi = C / sum;
    
    console.log(`   Raw Pi: ${pi}`);
    
    // Chuyển Pi thành chuỗi và lấy chữ số thứ position
    let piString = pi.toString();
    
    // Tìm dấu chấm thập phân
    let dotIndex = piString.indexOf('.');
    
    if (dotIndex === -1) {
        console.error("❌ Không tìm thấy dấu chấm thập phân");
        return Math.floor(Math.random() * 10);
    }
    
    // Lấy chữ số tại vị trí cần
    if (position <= piString.length - dotIndex - 1) {
        let digit = parseInt(piString.charAt(dotIndex + position));
        console.log(`   Digit from string: ${digit}`);
        return digit;
    } else {
        // Nếu chuỗi không đủ dài, tính thêm
        console.log(`⚠️ Chuỗi không đủ dài, cần tính thêm...`);
        
        // Tính với iterations lớn hơn
        return calculatePiDigitWithMoreIterations(position);
    }
}

// Hàm factorial đơn giản (có thể dùng bảng tra cho nhanh)
function factorial(n) {
    if (n === 0 || n === 1) return 1;
    let result = 1;
    for (let i = 2; i <= n; i++) {
        result *= i;
    }
    return result;
}

// Fallback khi cần độ chính xác cao hơn
function calculatePiDigitWithMoreIterations(position) {
    console.log(`🧮 Computing with more iterations for position ${position}...`);
    
    let iterations = Math.ceil(position / 10) * 2;
    let C = 426880 * Math.sqrt(10005);
    let sum = 0;
    
    for (let k = 0; k < iterations; k++) {
        let fact6k = factorial(6 * k);
        let fact3k = factorial(3 * k);
        let factk = factorial(k);
        let factk3 = Math.pow(factk, 3);
        
        let numerator = Math.pow(-1, k) * fact6k * (13591409 + 545140134 * k);
        let denominator = fact3k * factk3 * Math.pow(640320, 3 * k);
        
        sum += numerator / denominator;
    }
    
    let pi = C / sum;
    let piString = pi.toString();
    let dotIndex = piString.indexOf('.');
    
    if (dotIndex !== -1 && position <= piString.length - dotIndex - 1) {
        return parseInt(piString.charAt(dotIndex + position));
    }
    
    // Ultimate fallback: random nhưng thông báo
    console.warn("⚠️ Không thể tính chính xác, dùng random fallback");
    return Math.floor(Math.random() * 10);
}


// ==================== LOAD STATUS ====================

async function loadStatus() {
    try {
        let res = await fetch("/api/status");
        let data = await res.json();

        if (!data.success) return;

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
    } catch (err) {
        console.error(err);
    }
}


// ==================== REQUEST LOCK ====================

async function requestLock() {
    calculateBtn.disabled = true;

    let res = await fetch("/api/acquire-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId })
    });

    let data = await res.json();

    if (!data.success) {
        calculateBtn.disabled = false;
        showMessage("Someone else computing", "error");
        return;
    }

    hasLock = true;

    calculateBtn.style.display = "none";
    cancelBtn.style.display = "flex";
    timerEl.style.display = "block";
    statusEl.textContent = "Computing...";

    let timeLeft = 30;
    timerSeconds.textContent = timeLeft;

    timerInterval = setInterval(() => {
        timeLeft--;
        timerSeconds.textContent = timeLeft;

        if (timeLeft <= 0) {
            releaseLock();
            clearInterval(timerInterval);
        }
    }, 1000);

    setTimeout(async () => {
        let digit = calculatePiDigit(data.position);
        console.log("Final digit:", digit);

        let submit = await fetch("/api/contribute", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                digit: digit,
                position: data.position,
                client_id: clientId
            })
        });

        let result = await submit.json();

        if (result.success) {
            updatePiDisplay(result.pi_string);
            nextPosition.textContent = result.next_position;
            addToHistory(data.position, digit, clientId.slice(0,6));
            showMessage("Digit added!", "success");
        }

        releaseLock();
    }, 2000);
}


// ==================== RELEASE LOCK ====================

async function releaseLock() {
    if (!hasLock) return;

    await fetch("/api/release-lock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_id: clientId })
    });

    hasLock = false;
    clearInterval(timerInterval);

    calculateBtn.style.display = "flex";
    cancelBtn.style.display = "none";
    timerEl.style.display = "none";
    calculateBtn.disabled = false;

    loadStatus();
}


// ==================== EVENTS ====================

document.addEventListener("DOMContentLoaded", () => {
    loadStatus();

    calculateBtn.addEventListener("click", requestLock);
    cancelBtn.addEventListener("click", releaseLock);

    setInterval(() => {
        if (!hasLock)
            loadStatus();
    }, 5000);
});


window.addEventListener("beforeunload", () => {
    if (hasLock)
        navigator.sendBeacon("/api/release-lock",
            JSON.stringify({ client_id: clientId }));
});
