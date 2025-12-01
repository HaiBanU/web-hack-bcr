/* =========================================
   BACCARAT HACKER ENGINE - V9.5 (GAME CORE)
   ========================================= */

let currentTableId = null; 
let history = []; 
let isProcessing = false; 
const socket = io(); 

// TIMER CONFIG
let deductionTimer = null;
const DEDUCTION_INTERVAL = 30000; 

// --- 1. MATRIX BACKGROUND (Toàn màn hình) ---
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() { 
    if(canvas) { 
        canvas.width = window.innerWidth; 
        canvas.height = window.innerHeight; 
    } 
}
window.addEventListener('resize', resizeCanvas);
resizeCanvas(); 

const chars = "0123456789ABCDEF_HACK_SYSTEM"; 
const drops = canvas ? Array(Math.floor(canvas.width / 20)).fill(1) : [];

function drawMatrix() {
    if(!ctx) return;
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0F0"; 
    ctx.font = "14px monospace"; 
    for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 20, drops[i] * 20);
        if (drops[i] * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
    }
}
if(canvas) setInterval(drawMatrix, 50);


// --- 2. MATRIX RAIN INSIDE GAME (HIỆU ỨNG MỚI) ---
function initCardRain() {
    const c = document.getElementById('cardRain');
    if(!c) return;
    const ctxRain = c.getContext('2d');
    
    function resizeRain() {
        if(c.parentElement) {
            c.width = c.parentElement.clientWidth;
            c.height = c.parentElement.clientHeight;
        }
    }
    window.addEventListener('resize', resizeRain);
    resizeRain();

    const rainChars = "XY_01_WIN_$$";
    const rainDrops = [];
    const fontSize = 10;
    const columns = Math.floor(c.width / fontSize) + 1;
    
    for(let i=0; i<columns; i++) rainDrops[i] = 1;

    function drawInnerRain() {
        ctxRain.fillStyle = "rgba(0, 0, 0, 0.1)"; 
        ctxRain.fillRect(0, 0, c.width, c.height);
        
        ctxRain.fillStyle = "rgba(0, 255, 65, 0.5)"; // Màu xanh mờ hơn chút
        ctxRain.font = fontSize + "px monospace";
        
        for (let i = 0; i < rainDrops.length; i++) {
            const text = rainChars[Math.floor(Math.random() * rainChars.length)];
            ctxRain.fillText(text, i * fontSize, rainDrops[i] * fontSize);
            
            if (rainDrops[i] * fontSize > c.height && Math.random() > 0.98) rainDrops[i] = 0;
            rainDrops[i]++;
        }
    }
    setInterval(drawInnerRain, 60);
}

// --- MAIN INIT ---
window.addEventListener('DOMContentLoaded', () => {
    // Init Effects
    initCardRain();

    // 1. Cập nhật Token
    const savedTokens = localStorage.getItem('tokens') || 0;
    updateTokenUI(savedTokens);

    // 2. Lấy thông tin bàn
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tableName = urlParams.get('tableName') || "UNKNOWN";
    tableName = decodeURIComponent(tableName);
    if(!tableName.includes("BÀN")) tableName = "BÀN " + tableName.replace(/BACCARAT/i, "").trim();
    
    const nameDisplay = document.getElementById('tableNameDisplay');
    if(nameDisplay) nameDisplay.innerHTML = tableName.toUpperCase();
    
    addLog(`CONNECTED: ${tableName} [SECURE SOCKET]`);
    
    setInterval(updateSystemStats, 1000);
    setInterval(generateMatrixCode, 80);
    startFakeTransactions();
    startTokenDeduction();
});

// --- UI HELPERS ---
function updateTokenUI(amount) {
    const el = document.getElementById('headerTokenDisplay');
    if(el) {
        if(amount === 'VIP' || amount === 'unlimited') {
            el.innerText = "VIP"; el.style.color = "#ff003c";
        } else {
            el.innerText = Math.floor(amount).toLocaleString('vi-VN'); 
            el.style.color = "#fff";
        }
    }
}

function updateSystemStats() { /* Giữ chỗ update thông số khác */ }

function generateMatrixCode() {
    const chars = "0123456789ABCDEF";
    let str = "";
    for(let i=0; i<150; i++) {
        str += chars[Math.floor(Math.random() * chars.length)];
        if(i % 15 === 0) str += " ";
    }
    const el = document.getElementById('matrixCode');
    if(el) el.innerText = str;
}

function addLog(msg) {
    const box = document.getElementById('systemLog');
    if(!box) return;
    const div = document.createElement('div');
    div.className = "log-line";
    const now = new Date();
    div.innerHTML = `<span style="color:#666">[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]</span> ${msg}`;
    box.appendChild(div);
    if (box.children.length > 50) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
}

// --- TOKEN LOGIC ---
function startTokenDeduction() {
    const token = localStorage.getItem('token');
    if(!token) return;

    deductionTimer = setInterval(async () => {
        try {
            const res = await fetch('/api/deduct-periodic', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': token }
            });
            const data = await res.json();
            if (data.status === 'success') {
                updateTokenUI(data.remaining);
                localStorage.setItem('tokens', data.remaining);
            } else {
                clearInterval(deductionTimer);
                showOutOfTokenPopup();
            }
        } catch (e) { console.error("Lỗi trừ tiền:", e); }
    }, DEDUCTION_INTERVAL);
}

function showOutOfTokenPopup() {
    alert("⚠️ HẾT TOKEN! Vui lòng nạp thêm.");
    window.location.href = 'index.html';
}

// --- CORE GAME LOGIC ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;

    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverHistoryArr = (tableData.result || "").split('');

        if (serverHistoryArr.length > history.length || history.length === 0) {
            
            const realResult = serverHistoryArr[serverHistoryArr.length - 1];
            history = serverHistoryArr; 
            
            // Vẽ bảng cầu & Chart
            renderBigRoadGrid(history);
            drawTrendChart(history);

            if(realResult) {
                let winText = (realResult === 'P') ? "PLAYER" : (realResult === 'B' ? "BANKER" : "TIE");
                addLog(`>> KẾT QUẢ: [ ${winText} ] -> Cập nhật cầu.`);
            }

            analyzeAndRenderFuture(history);
        }
    }
});

function analyzeAndRenderFuture(historyArr) {
    isProcessing = true;
    
    // Reset UI
    document.querySelectorAll('.card-slot').forEach(c => { 
        c.className = "card-slot"; c.innerText = ""; c.classList.remove('revealed', 'hearts', 'diamonds', 'spades', 'clubs');
    });
    document.getElementById('playerScore').innerText = "-";
    document.getElementById('bankerScore').innerText = "-";
    
    const wrapper = document.querySelector('.prediction-wrapper');
    if(wrapper) wrapper.classList.remove('win-p', 'win-b');

    const textEl = document.getElementById('aiPredText');
    const adviceEl = document.getElementById('aiAdvice');

    if(textEl) { textEl.innerHTML = "SCANNING..."; textEl.className = "pred-result blink-wait"; }

    // ALGORITHM
    const analysis = getAdvancedAlgorithm(historyArr);
    const predictedSide = analysis.side; 
    const futureHand = simulateRealBaccaratHand(predictedSide);

    // DELAY & REVEAL
    setTimeout(() => {
        renderSingleCard('p1', futureHand.pCards[0], 0);
        renderSingleCard('p2', futureHand.pCards[1], 150);
        renderSingleCard('b1', futureHand.bCards[0], 300);
        renderSingleCard('b2', futureHand.bCards[1], 450);

        setTimeout(() => {
            if(futureHand.pCards[2]) renderSingleCard('p3', futureHand.pCards[2], 0);
            if(futureHand.bCards[2]) renderSingleCard('b3', futureHand.bCards[2], 150);
            
            document.getElementById('playerScore').innerText = futureHand.pScore;
            document.getElementById('bankerScore').innerText = futureHand.bScore;

            let confidence = Math.floor(Math.random() * (98 - 80 + 1)) + 80; // High confidence for visual
            
            if(textEl) {
                textEl.classList.remove('blink-wait');
                if (predictedSide === 'P') { 
                    textEl.innerHTML = "PLAYER"; 
                    textEl.className = "pred-result res-p"; 
                    if(wrapper) wrapper.classList.add('win-p');
                } else { 
                    textEl.innerHTML = "BANKER"; 
                    textEl.className = "pred-result res-b"; 
                    if(wrapper) wrapper.classList.add('win-b');
                }
            }
            if(adviceEl) adviceEl.innerHTML = `SIGNAL: ${analysis.name} | CONFIDENCE: ${confidence}%`;

            let confP = (predictedSide === 'P') ? confidence : (100 - confidence);
            let confB = (predictedSide === 'B') ? confidence : (100 - confidence);
            
            document.getElementById('confP').innerText = confP + "%"; document.getElementById('barP').style.width = confP + "%";
            document.getElementById('confB').innerText = confB + "%"; document.getElementById('barB').style.width = confB + "%";

            addLog(`SYSTEM: Dự đoán -> ${predictedSide} (${confidence}%)`);
            isProcessing = false;

        }, 1000);
    }, 500);
}

function getAdvancedAlgorithm(history) {
    if (!history || history.length < 3) return { side: (Math.random()>0.5?'P':'B'), name: "RANDOM", reason: "Wait Data..." };
    const cleanHistory = history.filter(x => x !== 'T');
    const len = cleanHistory.length;
    if (len < 3) return { side: 'B', name: "BASIC", reason: "Init..." };
    
    const last1 = cleanHistory[len - 1];
    const last2 = cleanHistory[len - 2];
    
    if (last1 === last2) return { side: last1, name: "DRAGON (Bệt)", reason: "Theo Bệt" };
    return { side: (last1 === 'P' ? 'B' : 'P'), name: "PING-PONG (1-1)", reason: "Bẻ Cầu" };
}

function renderSingleCard(slotId, cardData, delay) {
    setTimeout(() => {
        const el = document.getElementById(slotId);
        if(!el) return;
        el.classList.add(cardData.suit); 
        el.classList.add('revealed');
        let txt = cardData.raw;
        if(cardData.raw===1) txt="A"; else if(cardData.raw===11) txt="J"; else if(cardData.raw===12) txt="Q"; else if(cardData.raw===13) txt="K";
        el.innerText = txt;
    }, delay);
}

function getCard() {
    const raw = Math.floor(Math.random() * 13) + 1;
    const value = raw >= 10 ? 0 : raw;
    const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
    const suit = suits[Math.floor(Math.random() * 4)];
    return { raw, value, suit };
}
function calc(cards) { return cards.reduce((sum, c) => sum + c.value, 0) % 10; }

function simulateRealBaccaratHand(targetWinner) {
    // Logic giả lập bài để khớp với kết quả dự đoán
    let safeGuard = 0;
    while (safeGuard < 500) {
        safeGuard++;
        let p = [getCard(), getCard()]; let b = [getCard(), getCard()];
        let pScore = calc(p); let bScore = calc(b);
        let finished = false;
        if (pScore >= 8 || bScore >= 8) finished = true; 
        if (!finished) {
            let p3 = null;
            if (pScore <= 5) { p3 = getCard(); p.push(p3); pScore = calc(p); }
            let bDraws = false;
            if (p3 === null) { if (bScore <= 5) bDraws = true; } 
            else {
                const val3 = p3.value;
                if (bScore <= 2) bDraws = true;
                else if (bScore === 3 && val3 !== 8) bDraws = true;
                else if (bScore === 4 && val3 >= 2 && val3 <= 7) bDraws = true;
                else if (bScore === 5 && val3 >= 4 && val3 <= 7) bDraws = true;
                else if (bScore === 6 && (val3 === 6 || val3 === 7)) bDraws = true;
            }
            if (bDraws) { b.push(getCard()); bScore = calc(b); }
        }
        let winner = pScore > bScore ? 'P' : (bScore > pScore ? 'B' : 'T');
        if (targetWinner === 'T') return { pCards: p, bCards: b, pScore, bScore }; 
        if (winner === targetWinner) return { pCards: p, bCards: b, pScore, bScore };
    }
    return { pCards: [getCard(), getCard()], bCards: [getCard(), getCard()], pScore: 0, bScore: 0 }; // Fallback
}

function renderBigRoadGrid(resultArr) {
    const gridEl = document.getElementById('bigRoadGrid');
    if(!gridEl) return;
    
    // Cắt bớt dữ liệu hiển thị (30 cột cuối)
    let processedData = [];
    let data = resultArr;
    
    for(let char of data) {
        if (char === 'T') { if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; } 
        else { processedData.push({ type: char, hasTie: false }); }
    }

    let columns = []; let currentCol = []; let lastType = null;
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { columns.push(currentCol); currentCol = []; }
        currentCol.push(item); lastType = item.type;
        if(currentCol.length >= 6) { columns.push(currentCol); currentCol = []; lastType = null; }
    });
    if (currentCol.length > 0) columns.push(currentCol);
    while(columns.length < 20) { columns.push([]); }
    
    // Chỉ lấy 20 cột cuối
    let displayCols = columns.slice(-20);

    let html = '';
    displayCols.forEach(col => {
        html += '<div class="tool-road-col">'; 
        for (let r = 0; r < 6; r++) { 
            let cellContent = ''; let node = col[r];
            if (node) {
                let colorClass = (node.type === 'P') ? 'tool-p' : 'tool-b';
                cellContent = `<div class="tool-bead ${colorClass}"></div>`;
            }
            html += `<div class="tool-road-cell">${cellContent}</div>`;
        }
        html += '</div>'; 
    });
    gridEl.innerHTML = html;
}

function drawTrendChart(historyArr) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    // Resize lại để không bị vỡ
    if(canvas.parentElement) {
        canvas.width = canvas.parentElement.clientWidth;
        canvas.height = canvas.parentElement.clientHeight;
    }
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    ctx.clearRect(0, 0, w, h);

    let data = historyArr.slice(-30); 
    if(data.length < 2) return;

    let points = [];
    let currentVal = h / 2;
    let stepX = w / (data.length - 1); 
    const amplitude = 10; 

    data.forEach((char, index) => {
        if (char === 'B') currentVal -= amplitude; 
        else if (char === 'P') currentVal += amplitude; 
        // Clamp
        if (currentVal < 10) currentVal = 10;
        if (currentVal > h - 10) currentVal = h - 10;
        
        points.push({ x: index * stepX, y: currentVal, type: char });
    });

    // Draw Line
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        // Smooth curve
        const xc = (points[i].x + points[i - 1].x) / 2;
        const yc = (points[i].y + points[i - 1].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#00ff41';
    ctx.stroke();

    // Draw Dots
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        if (p.type === 'P') { ctx.fillStyle = '#00f3ff'; ctx.shadowColor = '#00f3ff'; } 
        else if (p.type === 'B') { ctx.fillStyle = '#ff003c'; ctx.shadowColor = '#ff003c'; } 
        else { ctx.fillStyle = '#aaa'; ctx.shadowColor = '#aaa'; }
        ctx.shadowBlur = 5;
        ctx.fill();
        ctx.shadowBlur = 0;
    });
}

function startFakeTransactions() {
    const box = document.getElementById('transLog');
    if(!box) return;
    const names = ["VipPro99", "HackerVN", "Bot_AI", "Master88", "Dragon9", "Ghost_X", "SystemV8"];
    setInterval(() => {
        const name = names[Math.floor(Math.random() * names.length)];
        const side = Math.random() > 0.5 ? 'P' : 'B';
        const amt = Math.floor(Math.random() * 500) + 50; 
        const div = document.createElement('div');
        div.className = 'trans-item';
        div.innerHTML = `
            <span style="color:#aaa">${name}</span>
            <span style="color:${side==='P'?'#00f3ff':'#ff003c'}; font-weight:bold;">${side==='P'?'PLAYER':'BANKER'}</span>
            <span style="color:#fff">$${amt}k</span>
        `;
        box.appendChild(div);
        if(box.children.length > 6) box.removeChild(box.firstChild);
    }, 1500);
}