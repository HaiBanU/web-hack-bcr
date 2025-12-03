/* --- START OF FILE script.js (VERSION 4.0 - DYNAMIC FAKE HISTORY) --- */

let currentTableId = null;
let history = [];
let isProcessing = false;
let tokenInterval = null;
const socket = io();

let lastPrediction = null; 
let predictionOutcomes = []; 
let chartHistory = []; 

// === HÀM TẠO DỮ LIỆU GIẢ (ĐÃ NÂNG CẤP) ===
// Hàm này giờ sẽ nhận vào tổng số ván cần tạo
function generateInitialChartHistory(totalRounds) {
    if (totalRounds <= 0) return [];

    // Tỷ lệ mong muốn: ~70% thắng, 25% thua, 5% hòa
    const winCount = Math.round(totalRounds * 0.70);
    const tieCount = Math.round(totalRounds * 0.05);
    const lossCount = totalRounds - winCount - tieCount;

    let initialData = [];
    for (let i = 0; i < winCount; i++) initialData.push({ type: 'win' });
    for (let i = 0; i < lossCount; i++) initialData.push({ type: 'loss' });
    for (let i = 0; i < tieCount; i++) initialData.push({ type: 'tie' });

    // Xáo trộn mảng để kết quả trông ngẫu nhiên
    for (let i = initialData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [initialData[i], initialData[j]] = [initialData[j], initialData[i]];
    }
    
    return initialData;
}


// --- 1. INIT & SETUP (ĐÃ VIẾT LẠI HOÀN TOÀN) ---
window.addEventListener('DOMContentLoaded', async () => {
    // Lấy thông tin bàn từ URL trước
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "UNKNOWN");
    if (!tName.includes("BACCARAT")) tName = tName.replace("BÀN", "BÀN BACCARAT");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();

    // Hàm khởi tạo chính
    async function initializeTool() {
        try {
            // Bước 1: Gọi API để lấy trạng thái hiện tại của tất cả các bàn
            const response = await fetch('/api/tables');
            const data = await response.json();

            if (data.status === 'success' && data.data) {
                const currentTable = data.data.find(t => t.table_id == currentTableId);
                
                // Bước 2: Nếu tìm thấy bàn, lấy số ván đã chơi
                if (currentTable && currentTable.result) {
                    const numRounds = currentTable.result.length;
                    // Bước 3: Tạo lịch sử đồ thị giả mạo với đúng số ván
                    chartHistory = generateInitialChartHistory(numRounds);
                }
            }
        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu ban đầu, sẽ dùng mảng rỗng:", error);
            chartHistory = []; // Nếu lỗi, bắt đầu với đồ thị trống
        }

        // Bước 4: Khởi tạo tất cả các thành phần giao diện khác
        initCardRain();
        updateTokenUI(localStorage.getItem('tokens') || 0);
        addLog(`SYSTEM CONNECTED: ${tName}`);
        addLog(`>> CONNECTING TO SERVER... [OK]`);
        deductToken('entry');
        startPeriodicDeduction();
        setInterval(generateMatrixCode, 100); 
        resetCardsUI();      
        startWaveChartLoop(); // Bây giờ, hàm này sẽ vẽ đồ thị với dữ liệu giả đã được tạo
        startFakeTransactions();
    }

    // Chạy hàm khởi tạo
    await initializeTool();
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
        if (serverRes.length > history.length || history.length === 0) {
            
            if (lastPrediction && history.length > 0) {
                const newResult = serverRes[serverRes.length - 1];
                if (newResult === 'T') {
                    chartHistory.push({ type: 'tie' });
                } else {
                    const outcome = (newResult === lastPrediction.side) ? 'win' : 'loss';
                    predictionOutcomes.push(outcome);
                    chartHistory.push({ type: outcome });
                }
            }
            
            history = serverRes;
            updateGameStats(history);
            renderBigRoadGrid(history);
            renderBeadPlate(history);
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

// =======================================================
// --- 4. ADVANCED PREDICTION LOGIC ---
// =======================================================
function runPredictionSystem(historyArr) {
    isProcessing = true;
    resetCardsUI();
    
    const ui = {
        advice: document.getElementById('aiAdvice'),
        pred: document.getElementById('aiPredText'),
        gaugePath: document.getElementById('gaugePath'),
        gaugeValue: document.getElementById('gaugeValue'),
        gaugeContainer: document.querySelector('.pred-gauge')
    };

    ui.advice.innerText = "MATRIX ANALYSIS V20"; ui.advice.style.color = "#00ff41";
    ui.pred.innerText = "WAITING"; ui.pred.className = "pred-result res-wait";
    ui.gaugePath.setAttribute("stroke-dasharray", "0, 100"); ui.gaugeValue.innerText = "0%";
    ui.gaugeContainer.classList.remove('active');

    const cleanHist = historyArr.filter(x => x !== 'T');
    const len = cleanHist.length;
    let prediction = null, confidence = 70, reason = "ANALYZING...";

    if (len > 3) {
        const last1 = cleanHist[len - 1];
        const last2 = cleanHist[len - 2];
        const last3 = cleanHist[len - 3];
        const last4 = cleanHist[len - 4];
        const opponent = (side) => (side === 'P' ? 'B' : 'P');
        let streak = 0;
        for (let i = len - 1; i >= 0; i--) {
            if (cleanHist[i] === last1) streak++;
            else break;
        }

        if (streak === 7) {
            prediction = opponent(last1);
            confidence = 96;
            reason = `BREAKING DRAGON (7)`;
        }
        else if (streak >= 3 && streak < 7) {
            prediction = last1;
            confidence = 85 + (streak * 2);
            reason = `DRAGON PATTERN (${last1} x${streak})`;
        }
        else if (len >= 4 && last1 === last2 && last3 === last4 && last1 !== last3) {
            prediction = last1;
            confidence = 92;
            reason = `PATTERN (2-2)`;
        }
        else if (len >= 6 && last1===last2 && last2==last3 && last4===cleanHist[len-5] && cleanHist[len-5]==cleanHist[len-6] && last1 !== last4) {
            prediction = last1;
            confidence = 94;
            reason = `PATTERN (3-3)`;
        }
        else if (len >= 3 && last1 !== last2 && last2 === last3) {
            prediction = last1;
            confidence = 88;
            reason = `PATTERN (2-1)`;
        }
        else if (len >= 3 && last1 === last2 && last1 !== last3) {
            prediction = last3;
            confidence = 90;
            reason = `PATTERN (1-2)`;
        }
        else if (len >= 4 && last1 !== last2 && last2 === last3 && last3 === last4) {
            prediction = last1;
            confidence = 89;
            reason = `PATTERN (3-1)`;
        }
        else if (len >= 4 && last1 === last2 && last2 === last3 && last1 !== last4) {
            prediction = last4;
            confidence = 91;
            reason = `PATTERN (1-3)`;
        }
        else if (len >= 4 && last1 !== last2 && last2 !== last3 && last3 !== last4) {
            prediction = opponent(last1);
            confidence = 93;
            reason = `PING-PONG PATTERN`;
        }
        else {
            prediction = last1;
            confidence = 78;
            reason = "FOLLOWING RECENT TREND";
        }
    } 
    
    if (!prediction) {
        if (len > 0) prediction = cleanHist[len - 1];
        else prediction = 'B';
        confidence = 75;
        reason = "INITIALIZING DATA...";
    }

    setTimeout(() => { addLog(`>> ANALYZING NEXT ROUND...`); }, 500);
    setTimeout(() => {
        ui.advice.innerText = reason;
        ui.pred.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        ui.pred.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        ui.gaugeValue.innerText = confidence + "%";
        ui.gaugePath.setAttribute("stroke-dasharray", `${confidence}, 100`);
        
        let color = (prediction === 'P') ? '#00f3ff' : '#ff003c';
        ui.gaugePath.className.baseVal = (prediction === 'P') ? "circle stroke-p" : "circle stroke-b";
        ui.gaugeContainer.style.setProperty('--target-color', color);
        ui.gaugeContainer.classList.add('active');

        let confP = (prediction === 'P') ? confidence : (100 - confidence);
        let confB = (prediction === 'B') ? confidence : (100 - confidence);
        document.getElementById('confP').innerText = confP + "%"; document.getElementById('barP').style.width = confP + "%";
        document.getElementById('confB').innerText = confB + "%"; document.getElementById('barB').style.width = confB + "%";
        
        addLog(`>> PREDICTION: [ ${prediction} ] (RATE: ${confidence}%)`);
        
        lastPrediction = { side: prediction };
        
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

// --- 7. BIG ROAD & BEAD PLATE LOGIC ---
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
    const isMobile = window.innerWidth <= 1024;
    const MAX_COLS = isMobile ? 10 : 20; 
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
function renderBeadPlate(res) {
    const grid = document.getElementById('beadPlateGrid');
    if(!grid) return;
    // THAY ĐỔI: Chuyển tổng số ô từ 25 thành 36
    const totalCells = 36;
    let displayData = [];
    if (res.length > totalCells) {
        displayData = res.slice(res.length - totalCells, res.length);
    } else {
        displayData = res;
    }
    let html = '';
    for(let i = 0; i < totalCells; i++) {
        const item = displayData[i];
        if (item) {
            let cls = ''; let txt = '';
            if (item === 'P') { cls = 'bead-p'; txt = 'P'; }
            else if (item === 'B') { cls = 'bead-b'; txt = 'B'; }
            else if (item === 'T') { cls = 'bead-t'; txt = 'T'; }
            html += `<div class="bead-cell"><div class="bead-circle ${cls}">${txt}</div></div>`;
        } else {
            html += `<div class="bead-cell"></div>`;
        }
    }
    grid.innerHTML = html;
}
window.addEventListener('resize', () => { if(history.length > 0) renderBeadPlate(history); });


// =======================================================
// --- 8. WAVE CHART & CANDLES ---
// =======================================================
let waveCanvas, waveCtx;
let waveW, waveH;

let waveConfig = {
    pAmp: 20, targetP: 20, bAmp: 20, targetB: 20,
    speed: 0.08, pColor: "rgba(0, 243, 255, 0.6)", bColor: "rgba(255, 0, 60, 0.6)"
};

function startWaveChartLoop() {
    waveCanvas = document.getElementById('trendChart');
    if (!waveCanvas) return;
    waveCtx = waveCanvas.getContext('2d');
    function resize() {
        if (waveCanvas.parentElement) {
            waveCanvas.width = waveCanvas.parentElement.clientWidth;
            waveCanvas.height = waveCanvas.parentElement.clientHeight;
            waveW = waveCanvas.width; waveH = waveCanvas.height;
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

    drawHistoryCandles();

    waveCtx.globalCompositeOperation = 'screen';
    if(waveConfig.bAmp > waveConfig.pAmp) { waveCtx.shadowBlur = 20; waveCtx.shadowColor = "#ff003c"; } else { waveCtx.shadowBlur = 0; }
    drawSineWave(waveConfig.bAmp, 0.02, 1.5, waveConfig.bColor);
    if(waveConfig.pAmp > waveConfig.bAmp) { waveCtx.shadowBlur = 20; waveCtx.shadowColor = "#00f3ff"; } else { waveCtx.shadowBlur = 0; }
    drawSineWave(waveConfig.pAmp, 0.025, 0, waveConfig.pColor);
    waveCtx.shadowBlur = 0;
    waveCtx.globalCompositeOperation = 'source-over';

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
        let y = (waveH / 1.3) + Math.sin(x * frequency + Date.now() * 0.001 + phaseShift) * -amplitude;
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

function drawHistoryCandles() {
    const spacing = 16;
    const candleWidth = 14;
    const minHeight = 15;
    const maxHeight = 45;
    const heightStep = 5;

    let processedData = [];
    let streakCounter = 0;
    let lastResultType = null;

    for (const result of chartHistory) {
        if (result.type === 'tie') {
            processedData.push({ type: 'tie', streak: 0 });
            continue;
        }
        if (result.type === lastResultType) {
            streakCounter++;
        } else {
            streakCounter = 1;
        }
        processedData.push({ type: result.type, streak: streakCounter });
        lastResultType = result.type;
    }

    const centerY = waveH / 2;
    waveCtx.beginPath();
    waveCtx.moveTo(0, centerY);
    waveCtx.lineTo(waveW, centerY);
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
    waveCtx.lineWidth = 1;
    waveCtx.shadowBlur = 0;
    waveCtx.stroke();

    const maxCandles = Math.floor(waveW / spacing);
    const dataToDraw = processedData.slice(-maxCandles);

    dataToDraw.forEach((item, i) => {
        const x = waveW - (dataToDraw.length - i) * spacing + (spacing / 2);

        if (item.type === 'tie') {
            waveCtx.beginPath();
            waveCtx.arc(x, centerY, 4, 0, Math.PI * 2);
            waveCtx.fillStyle = '#00ff41';
            waveCtx.shadowColor = '#00ff41';
            waveCtx.shadowBlur = 8;
            waveCtx.fill();
            return;
        }
        const candleHeight = Math.min(maxHeight, minHeight + (item.streak - 1) * heightStep);
        waveCtx.beginPath();
        waveCtx.lineWidth = candleWidth;
        waveCtx.shadowBlur = 8;
        
        if (item.type === 'win') {
            waveCtx.strokeStyle = '#00ff41';
            waveCtx.shadowColor = '#00ff41';
            waveCtx.moveTo(x, centerY);
            waveCtx.lineTo(x, centerY - candleHeight);
        } else {
            waveCtx.strokeStyle = '#ff003c';
            waveCtx.shadowColor = '#ff003c';
            waveCtx.moveTo(x, centerY);
            waveCtx.lineTo(x, centerY + candleHeight);
        }
        waveCtx.stroke();
    });
    waveCtx.shadowBlur = 0;
}


// =======================================================
// --- 9. GAME STATS COUNTER ---
// =======================================================
function updateGameStats(historyArr) {
    const playerWinsEl = document.getElementById('playerWins');
    const bankerWinsEl = document.getElementById('bankerWins');
    const tieWinsEl = document.getElementById('tieWins');

    if (!playerWinsEl || !bankerWinsEl || !tieWinsEl) return;

    let pCount = 0;
    let bCount = 0;
    let tCount = 0;

    historyArr.forEach(result => {
        if (result === 'P') pCount++;
        else if (result === 'B') bCount++;
        else if (result === 'T') tCount++;
    });

    playerWinsEl.innerText = pCount;
    bankerWinsEl.innerText = bCount;
    tieWinsEl.innerText = tCount;
}