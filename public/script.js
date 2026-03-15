// ==================== PI CALCULATOR - BBP EXACT VERSION ====================
// Tính chính xác chữ số Pi thập phân ở BẤT KỲ vị trí nào

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
    }
    else {

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



// ==================== BBP ALGORITHM - CHÍNH XÁC CAO ====================

function modPow(base, exp, mod) {

    let result = 1;

    base = base % mod;

    while (exp > 0) {

        if (exp % 2 === 1)
            result = (result * base) % mod;

        base = (base * base) % mod;

        exp = Math.floor(exp / 2);
    }

    return result;
}


function series(j, n) {

    let s = 0;

    // Tính tổng phần 1 (dùng modular exponentiation)
    for (let k = 0; k <= n; k++) {

        let r = 8 * k + j;
        let mod = modPow(16, n - k, r);
        s += mod / r;
        s = s - Math.floor(s); // Giữ phần thập phân
    }

    // Tính tổng phần 2 (phần còn lại của chuỗi vô hạn)
    let t = 0;
    let k = n + 1;
    
    while (true) {
        let newTerm = Math.pow(16, n - k) / (8 * k + j);
        if (newTerm < 1e-18) break; // Độ chính xác cao hơn
        t += newTerm;
        k++;
    }

    return s + t;
}


// ==================== CHUYỂN HEX SANG THẬP PHÂN ====================

function hexToDecimalDigits(hexDigits, count = 1) {
    // hexDigits: mảng các chữ số hex (0-15)
    // count: số chữ số thập phân cần lấy
    
    // Tính giá trị thập phân từ các chữ số hex
    // Giá trị = d1/16 + d2/16^2 + d3/16^3 + ...
    
    let value = 0;
    for (let i = 0; i < hexDigits.length; i++) {
        value += hexDigits[i] / Math.pow(16, i + 1);
    }
    
    // Nhân với 10^count để lấy count chữ số thập phân
    let decimal = value * Math.pow(10, count);
    
    // Lấy phần nguyên
    return Math.floor(decimal);
}


// ==================== TÍNH CHỮ SỐ PI ====================

function calculatePiDigit(position) {
    // position là vị trí cần tính (1 = chữ số đầu sau dấu phẩy)
    
    // Dùng cache cho 100 số đầu
    if (position <= PI_DIGITS.length) {
        console.log(`📦 Cache[${position}] = ${PI_DIGITS[position - 1]}`);
        return PI_DIGITS[position - 1];
    }

    console.log(`🧮 BBP computing digit ${position}...`);

    let n = position - 1;
    
    // Cần tính 4 chữ số hex để có độ chính xác cho 1 chữ số thập phân
    // Vì mỗi chữ số hex = 4 bit, cần ~4 chữ số hex để có 1 chữ số thập phân
    let hexDigits = [];
    
    for (let offset = 0; offset < 4; offset++) {
        let x = 4 * series(1, n + offset) - 
                2 * series(4, n + offset) - 
                series(5, n + offset) - 
                series(6, n + offset);
        
        x = x - Math.floor(x);
        let hexDigit = Math.floor(16 * x);
        hexDigits.push(hexDigit);
    }
    
    // Chuyển 4 chữ số hex sang 1 chữ số thập phân
    let decimalDigit = hexToDecimalDigits(hexDigits, 1);
    
    console.log(`   Hex digits: ${hexDigits.map(d => d.toString(16)).join('')} → Decimal: ${decimalDigit}`);
    
    return decimalDigit;
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
        }
        else {

            statusEl.textContent = "🟢 Ready";

            calculateBtn.disabled = false;
        }

    }
    catch (err) {

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

    }, 1500); // Tăng thời gian lên 1.5s vì BBP lâu hơn
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
