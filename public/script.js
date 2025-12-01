/* --- START OF FILE script.js --- */

let currentTableId = null;
let history = [];
let isProcessing = false;
let tokenInterval = null;
const socket = io();

// --- 1. INIT & SETUP ---
window.addEventListener('DOMContentLoaded', () => {
    initCardRain();
    
    // URL Params
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "UNKNOWN");
    if (!tName.includes("BACCARAT")) tName = tName.replace("BÀN", "BÀN BACCARAT");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();
    
    // Token UI
    updateTokenUI(localStorage.getItem('tokens') || 0);
    addLog(`SYSTEM CONNECTED: ${tName}`);
    addLog(`>> CONNECTING TO SERVER... [OK]`);

    deductToken('entry');
    startPeriodicDeduction();

    setInterval(generateMatrixCode, 100); 
    resetCardsUI();      
    startWaveChartLoop(); // Khởi chạy biểu đồ sóng mới
    startFakeTransactions();
});

// --- 2. TOKEN LOGIC ---
async function deductToken(type) {
    const token = localStorage.getItem('token');
    if (!token) window.location.href = 'login.html';
    const endpoint = (type === 'entry') ? '/api/enter-table' : '/api/deduct-periodic';
    try {
        const res = await fetch(endpoint, {
            method: 'POST',
            headers: { 'Authorization': token, 'Content-Type': 'application/json' }
        });
        const data = await res.json();
        if (data.status === 'success') {
            let remaining = data.remaining; 
            if(remaining === 'VIP') remaining = 999999;
            updateTokenUI(remaining);
            if (type === 'entry') addLog(`>> ENTRY FEE: -5 TOKENS`);
            else addLog(`>> MAINTENANCE FEE: -5 TOKENS`);
        } else {
            alert("❌ HẾT TOKEN! Vui lòng liên hệ Admin.");
            window.location.href = 'index.html';
        }
    } catch (e) { console.error(e); }
}

function startPeriodicDeduction() {
    if (tokenInterval) clearInterval(tokenInterval);
    tokenInterval = setInterval(() => { deductToken('periodic'); }, 30000);
}

function updateTokenUI(amount) {
    localStorage.setItem('tokens', amount);
    const displayAmt = Math.floor(amount).toLocaleString('vi-VN');
    document.getElementById('headerTokenDisplay').innerText = displayAmt;
}

// --- 3. SOCKET LISTENER ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;
    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverRes = (tableData.result || "").split('');
        // Chỉ cập nhật khi có kết quả mới hoặc lần đầu load
        if (serverRes.length > history.length || history.length === 0) {
            history = serverRes;
            
            // Render các bảng cầu
            renderBigRoadGrid(history);
            renderBeadPlate(history);
            
            // Cập nhật biểu đồ sóng
            updateChartData(history); 

            if (history.length > 0) {
                const lastWin = history[history.length - 1];
                addLog(`-------------------------------`);
                addLog(`>> KẾT QUẢ VỪA RA: [ ${lastWin} ]`);
                runPredictionSystem(history);
            }
        }
    }
});

// --- 4. PREDICTION LOGIC (SYSTEM AI) ---
function runPredictionSystem(historyArr) {
    isProcessing = true;
    resetCardsUI();
    
    const adviceEl = document.getElementById('aiAdvice');
    const predEl = document.getElementById('aiPredText');
    const gaugePath = document.getElementById('gaugePath');
    const gaugeValue = document.getElementById('gaugeValue');
    const gaugeContainer = document.querySelector('.pred-gauge');
    
    // Reset State
    adviceEl.innerText = "MATRIX ANALYSIS V18"; adviceEl.style.color = "#00ff41";
    predEl.innerText = "WAITING"; predEl.className = "pred-result res-wait";
    gaugePath.setAttribute("stroke-dasharray", "0, 100"); gaugeValue.innerText = "0%";
    gaugeContainer.classList.remove('active');
    
    const cleanHist = historyArr.filter(x => x !== 'T');
    let prediction = 'B'; let confidence = 50; let reason = "MATRIX SCANNING";

    // Fake AI Logic
    if (cleanHist.length >= 3) {
        const len = cleanHist.length;
        const last1 = cleanHist[len-1]; const last2 = cleanHist[len-2];
        if (last1 === last2) { 
            prediction = last1; 
            confidence = Math.floor(Math.random() * (98 - 88) + 88); 
            reason = `DETECTED DRAGON (${last1})`; 
        } else { 
            prediction = (last1 === 'P') ? 'B' : 'P'; 
            confidence = Math.floor(Math.random() * (92 - 82) + 82); 
            reason = "PING-PONG PATTERN"; 
        }
    } else { 
        prediction = (Math.random() > 0.5) ? 'P' : 'B'; 
        reason = "INITIALIZING DATA..."; 
    }

    setTimeout(() => { addLog(`>> ANALYZING NEXT ROUND...`); }, 500);
    setTimeout(() => { 
        // Hiển thị kết quả
        adviceEl.innerText = reason;
        predEl.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        predEl.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        
        gaugeValue.innerText = confidence + "%";
        gaugePath.setAttribute("stroke-dasharray", `${confidence}, 100`);
        
        // Màu vòng tròn
        if (prediction === 'P') { 
            gaugePath.className.baseVal = "circle stroke-p"; 
            gaugeContainer.style.setProperty('--target-color', '#00f3ff'); 
        } else { 
            gaugePath.className.baseVal = "circle stroke-b"; 
            gaugeContainer.style.setProperty('--target-color', '#ff003c'); 
        }
        gaugeContainer.classList.add('active');

        // Update thanh bar bên phải
        let confP = (prediction==='P') ? confidence : (100-confidence);
        let confB = (prediction==='B') ? confidence : (100-confidence);
        document.getElementById('confP').innerText = confP+"%"; document.getElementById('barP').style.width = confP+"%";
        document.getElementById('confB').innerText = confB+"%"; document.getElementById('barB').style.width = confB+"%";
        
        addLog(`>> PREDICTION: [ ${prediction} ] (RATE: ${confidence}%)`);
        simulateHandReveal(prediction);
    }, 1500);
}

// --- 5. CARD SIMULATION ---
function getCardValue(card) { if (card.raw >= 10) return 0; return card.raw; }
function calculateHandScore(hand) { return hand.reduce((sum, card) => sum + getCardValue(card), 0) % 10; }
function generateFakeHand(targetWinner) {
    let attempts = 0;
    while(attempts < 5000) {
        attempts++;
        let pHand = [getCard(), getCard()];
        let bHand = [getCard(), getCard()];
        let pScore = calculateHandScore(pHand);
        let bScore = calculateHandScore(bHand);
        let isNatural = (pScore >= 8 || bScore >= 8);
        if (!isNatural) {
            let p3 = null;
            if (pScore <= 5) { p3 = getCard(); pHand.push(p3); pScore = calculateHandScore(pHand); }
            let bDraws = false;
            if (pHand.length === 2) { if (bScore <= 5) bDraws = true; } 
            else {
                let p3Val = getCardValue(p3);
                if (bScore <= 2) bDraws = true;
                else if (bScore === 3 && p3Val !== 8) bDraws = true;
                else if (bScore === 4 && [2,3,4,5,6,7].includes(p3Val)) bDraws = true;
                else if (bScore === 5 && [4,5,6,7].includes(p3Val)) bDraws = true;
                else if (bScore === 6 && [6,7].includes(p3Val)) bDraws = true;
            }
            if (bDraws) { bHand.push(getCard()); bScore = calculateHandScore(bHand); }
        }
        let actualResult = 'T';
        if (pScore > bScore) actualResult = 'P'; else if (bScore > pScore) actualResult = 'B';
        if (actualResult === targetWinner || targetWinner === 'T') return { p: pHand, b: bHand, pScore, bScore };
    }
    return { p:[getCard(), getCard()], b:[getCard(), getCard()], pScore:0, bScore:0 };
}
function simulateHandReveal(target) {
    const hand = generateFakeHand(target);
    document.querySelector('.p-side').classList.remove('winner-p','winner-b');
    document.querySelector('.b-side').classList.remove('winner-p','winner-b');
    setTimeout(() => revealCard('p1', hand.p[0]), 500);
    setTimeout(() => revealCard('b1', hand.b[0]), 1000);
    setTimeout(() => revealCard('p2', hand.p[1]), 1500);
    setTimeout(() => revealCard('b2', hand.b[1]), 2000);
    setTimeout(() => {
        if(hand.p[2]) revealCard('p3', hand.p[2]); else document.getElementById('p3').style.opacity = '0.3';
        if(hand.b[2]) revealCard('b3', hand.b[2]); else document.getElementById('b3').style.opacity = '0.3';
        document.getElementById('playerScore').innerText = hand.pScore;
        document.getElementById('bankerScore').innerText = hand.bScore;
        if(hand.pScore > hand.bScore) document.querySelector('.p-side').classList.add('winner-p');
        else if(hand.bScore > hand.pScore) document.querySelector('.b-side').classList.add('winner-b');
        isProcessing = false;
    }, 3000);
}
function revealCard(id, card) {
    const slot = document.getElementById(id); slot.style.opacity = '1';
    const front = slot.querySelector('.card-front');
    let val = card.raw; if(val===1) val='A'; else if(val===11) val='J'; else if(val===12) val='Q'; else if(val===13) val='K';
    let suit = (card.suit==='hearts'?'♥':(card.suit==='diamonds'?'♦':(card.suit==='clubs'?'♣':'♠')));
    let color = (card.suit==='hearts' || card.suit==='diamonds') ? '#ff003c' : '#000';
    front.innerHTML = `<div style="color:${color}">${val}</div><div style="font-size:1.5rem; color:${color}">${suit}</div>`;
    slot.classList.add('flipped');
}
function resetCardsUI() {
    document.getElementById('playerScore').innerText = "?"; document.getElementById('bankerScore').innerText = "?";
    document.querySelector('.p-side').classList.remove('winner-p','winner-b');
    document.querySelector('.b-side').classList.remove('winner-p','winner-b');
    ['p1','p2','p3','b1','b2','b3'].forEach(id => {
        const el = document.getElementById(id); el.className = "card-slot"; el.style.opacity = '1';
        el.innerHTML = `<div class="card-back"></div><div class="card-front"></div>`;
    });
}
function getCard() {
    const raw = Math.floor(Math.random()*13)+1;
    return { raw, value: raw>=10?0:raw, suit: ['spades','hearts','clubs','diamonds'][Math.floor(Math.random()*4)] };
}

// --- 6. VISUAL HELPERS ---
function addLog(msg) {
    const box = document.getElementById('systemLog');
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const div = document.createElement('div');
    div.style.borderBottom = "1px solid #111"; div.style.padding = "3px 0"; div.style.fontFamily = "monospace"; div.style.fontSize = "0.75rem";
    let color = "#fff";
    if(msg.includes("PLAYER")) color = "#00f3ff"; else if(msg.includes("BANKER")) color = "#ff003c"; else if(msg.includes("FEE")) color = "#ff9800"; else if(msg.includes("ALGORITHM")) color = "#00ff41";
    div.innerHTML = `<span style="color:#666">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    box.appendChild(div); box.scrollTop = box.scrollHeight;
}
function initCardRain() {
    const c = document.getElementById('cardRain'); 
    if(!c) return;
    const ctx = c.getContext('2d');
    function resize() { if(c.parentElement) { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; } }
    window.addEventListener('resize', resize); resize();
    const chars = "01_XY_WIN_$$__HACK_$$"; const fontSize = 14; 
    const drops = Array(Math.floor(c.width / fontSize)).fill(1);
    setInterval(() => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#00ff41"; ctx.font = fontSize + "px monospace"; ctx.shadowBlur = 0;
        for(let i = 0; i < drops.length; i++){
            const text = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);
            if(drops[i] * fontSize > c.height && Math.random() > 0.98) drops[i] = 0;
            drops[i]++;
        }
    }, 40);
}
function generateMatrixCode() {
    const el = document.getElementById('matrixCode');
    if(el) {
        const lines = ["DECRYPTING PACKET...", "BYPASS_FIREWALL...", "CALCULATING_ODDS...", "PACKET_SNIFFING...", "inject_sql_v2... OK", "SCANNING TABLE DATA...", "AI PREDICTION: LOADING", "SERVER RESPONSE: 200 OK"];
        const div = document.createElement('div');
        div.style.marginBottom = "2px";
        div.innerText = "> " + lines[Math.floor(Math.random()*lines.length)] + " [" + Math.random().toString(16).substring(2,6).toUpperCase() + "]";
        el.prepend(div); 
        if(el.children.length > 25) el.lastChild.remove();
    }
}
function startFakeTransactions() {
    const box = document.getElementById('transLog'); if(!box) return;
    const names = ["User99", "HackerVN", "ProPlayer", "Bot_AI", "Winner88", "Master_B", "Dragon_X"];
    setInterval(() => {
        const n = names[Math.floor(Math.random()*names.length)];
        const side = Math.random()>0.5 ? "PLAYER" : "BANKER";
        const amt = Math.floor(Math.random()*900)+100;
        const color = side==="PLAYER"?"#00f3ff":"#ff003c";
        const div = document.createElement('div'); div.className = "trans-item";
        div.innerHTML = `<span style="color:#888">${n}</span><span style="color:${color}; font-weight:bold;">${side}</span><span style="color:#fff">$${amt}k</span>`;
        box.prepend(div); if(box.children.length > 8) box.lastChild.remove();
    }, 1500);
}

// --- 7. BIG ROAD LOGIC ---
function renderBigRoadGrid(rawHistory) {
    const grid = document.getElementById('bigRoadGrid'); 
    if(!grid) return;
    let cleanData = [];
    if(rawHistory.length > 0) {
        if(rawHistory[0] !== 'T') cleanData.push({type: rawHistory[0], hasTie: false});
        for(let i=1; i<rawHistory.length; i++) {
            let char = rawHistory[i];
            if(char === 'T') { if(cleanData.length > 0) cleanData[cleanData.length - 1].hasTie = true; } 
            else { cleanData.push({type: char, hasTie: false}); }
        }
    }
    let columns = []; let currentCol = []; let lastType = null;
    cleanData.forEach(item => {
        if(lastType !== null && item.type !== lastType) { columns.push(currentCol); currentCol = []; }
        if(currentCol.length >= 6) { columns.push(currentCol); currentCol = []; }
        currentCol.push(item); lastType = item.type;
    });
    if(currentCol.length > 0) columns.push(currentCol);
    
    const MAX_COLS = 20; 
    let displayCols = [];
    if(columns.length > MAX_COLS) displayCols = columns.slice(columns.length - MAX_COLS);
    else { displayCols = columns; while(displayCols.length < MAX_COLS) displayCols.push([]); }
    
    let html = '';
    displayCols.forEach(col => {
        html += '<div class="tool-road-col">';
        for(let r = 0; r < 6; r++) {
            let node = col[r]; let inner = '';
            if(node) {
                let cls = node.type === 'P' ? 'tool-p' : 'tool-b';
                let tieClass = node.hasTie ? 'has-tie' : '';
                inner = `<div class="tool-bead ${cls} ${tieClass}"></div>`;
            }
            html += `<div class="tool-road-cell">${inner}</div>`;
        }
        html += '</div>';
    });
    grid.innerHTML = html;
}

// --- 8. BEAD PLATE (UPDATED: 5x5 - TRÁI SANG PHẢI) ---
/* --- TRONG FILE script.js --- */

function renderBeadPlate(res) {
    const grid = document.getElementById('beadPlateGrid');
    if(!grid) return;

    const totalCells = 25; // 5x5

    // LOGIC CẮT DỮ LIỆU ĐỂ TẠO HIỆU ỨNG TRÔI:
    // Luôn lấy tối đa 25 phần tử CUỐI CÙNG của mảng lịch sử.
    let displayData = [];
    if (res.length > totalCells) {
        // Ví dụ: Có 30 kết quả -> Lấy từ index 5 đến 30.
        // Cột 1 (index 0-4 cũ) sẽ bị loại bỏ.
        displayData = res.slice(res.length - totalCells, res.length);
    } else {
        // Nếu chưa đủ 25 kết quả, hiển thị từ đầu.
        // Nó sẽ điền cột 1, rồi cột 2... các cột bên phải sẽ trống.
        displayData = res;
    }
    
    let html = '';

    // Render đúng 25 ô
    for(let i = 0; i < totalCells; i++) {
        const item = displayData[i]; // Lấy dữ liệu
        
        if (item) {
            let cls = ''; let txt = '';
            if (item === 'P') { cls = 'bead-p'; txt = 'P'; }
            else if (item === 'B') { cls = 'bead-b'; txt = 'B'; }
            else if (item === 'T') { cls = 'bead-t'; txt = 'T'; }
            
            html += `<div class="bead-cell"><div class="bead-circle ${cls}">${txt}</div></div>`;
        } else {
            // Render ô trống nếu chưa có dữ liệu
            html += `<div class="bead-cell"></div>`;
        }
    }
    
    grid.innerHTML = html;
}
// Vẽ lại khi resize
window.addEventListener('resize', () => { if(history.length > 0) renderBeadPlate(history); });

/* =========================================
   NEW WAVE CHART: STATEFUL
   ========================================= */
let waveCanvas, waveCtx;
let waveFrame = 0;
let waveW, waveH;

let waveConfig = {
    pAmp: 20,       // Độ cao hiện tại Player
    bAmp: 20,       // Độ cao hiện tại Banker
    targetP: 20,    // Đích đến Player
    targetB: 20,    // Đích đến Banker
    speed: 0.08,    
    pColor: "rgba(0, 243, 255, 0.6)", 
    bColor: "rgba(255, 0, 60, 0.6)"   
};

function startWaveChartLoop() {
    waveCanvas = document.getElementById('trendChart');
    if (!waveCanvas) return;
    waveCtx = waveCanvas.getContext('2d');

    function resize() {
        if (waveCanvas.parentElement) {
            waveCanvas.width = waveCanvas.parentElement.clientWidth;
            waveCanvas.height = waveCanvas.parentElement.clientHeight;
            waveW = waveCanvas.width;
            waveH = waveCanvas.height;
        }
    }
    window.addEventListener('resize', resize);
    resize();
    animateWave();
}

function animateWave() {
    if (!waveCtx) return;
    waveCtx.clearRect(0, 0, waveW, waveH);
    
    waveConfig.pAmp += (waveConfig.targetP - waveConfig.pAmp) * 0.05;
    waveConfig.bAmp += (waveConfig.targetB - waveConfig.bAmp) * 0.05;

    waveCtx.globalCompositeOperation = 'screen';

    // Banker Wave
    if(waveConfig.bAmp > waveConfig.pAmp) { waveCtx.shadowBlur = 20; waveCtx.shadowColor = "#ff003c"; } 
    else { waveCtx.shadowBlur = 0; }
    drawSineWave(waveConfig.bAmp, 0.02, 1.5, waveConfig.bColor);

    // Player Wave
    if(waveConfig.pAmp > waveConfig.bAmp) { waveCtx.shadowBlur = 20; waveCtx.shadowColor = "#00f3ff"; } 
    else { waveCtx.shadowBlur = 0; }
    drawSineWave(waveConfig.pAmp, 0.025, 0, waveConfig.pColor);

    waveCtx.shadowBlur = 0;
    waveCtx.globalCompositeOperation = 'source-over';

    waveFrame += waveConfig.speed;
    requestAnimationFrame(animateWave);
}

function drawSineWave(amplitude, frequency, phaseShift, color) {
    waveCtx.beginPath();
    waveCtx.moveTo(0, waveH);
    let grad = waveCtx.createLinearGradient(0, 0, 0, waveH);
    grad.addColorStop(0, color.replace("0.6", "0.9"));
    grad.addColorStop(1, "rgba(0,0,0,0)"); 

    waveCtx.fillStyle = grad;
    for (let x = 0; x <= waveW; x += 5) {
        let y = (waveH / 1.3) + Math.sin(x * frequency + waveFrame + phaseShift) * -amplitude;
        waveCtx.lineTo(x, y);
    }
    waveCtx.lineTo(waveW, waveH);
    waveCtx.lineTo(0, waveH);
    waveCtx.closePath();
    waveCtx.fill();
}

function updateChartData(hist) {
    if (!hist || hist.length === 0) return;
    const lastResult = hist[hist.length - 1];
    if (lastResult === 'P') { waveConfig.targetP = 80; waveConfig.targetB = 15; } 
    else if (lastResult === 'B') { waveConfig.targetB = 80; waveConfig.targetP = 15; } 
    else { waveConfig.targetP = 40; waveConfig.targetB = 40; }
}