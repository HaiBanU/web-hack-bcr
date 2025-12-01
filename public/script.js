/* --- START OF FILE script.js --- */

let currentTableId = null;
let history = [];
let isProcessing = false;
let tokenInterval = null;
const socket = io();

// --- INIT ---
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
    startWaveChartLoop();
    startFakeTransactions();
});

// --- TOKEN LOGIC ---
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

// --- SOCKET LISTENER ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;
    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverRes = (tableData.result || "").split('');
        if (serverRes.length > history.length || history.length === 0) {
            history = serverRes;
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

// --- PREDICTION LOGIC (SYSTEM AI V1.0.26) ---
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

    // Fake Logic
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

// --- CARD SIMULATION ---
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
    
    function resize() { 
        if(c.parentElement) { 
            c.width = c.parentElement.clientWidth; 
            c.height = c.parentElement.clientHeight; 
        } 
    }
    window.addEventListener('resize', resize); 
    resize();

    // Ký tự muốn hiển thị (Số, Tiền, Win...)
    const chars = "01_XY_WIN_$$__HACK_$$"; 
    const fontSize = 14; // Tăng size chữ lên 14px cho rõ
    const drops = Array(Math.floor(c.width / fontSize)).fill(1);

    setInterval(() => {
        // Tạo lớp phủ mờ để tạo hiệu ứng đuôi dài
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; 
        ctx.fillRect(0, 0, c.width, c.height);

        // MÀU CHỮ: Đổi từ tối sang XANH NEON SÁNG
        ctx.fillStyle = "#00ff41"; 
        ctx.font = fontSize + "px monospace";
        ctx.shadowBlur = 0; // Bỏ bóng mờ để chữ sắc nét hơn

        for(let i = 0; i < drops.length; i++){
            const text = chars[Math.floor(Math.random() * chars.length)];
            ctx.fillText(text, i * fontSize, drops[i] * fontSize);

            // Reset giọt mưa khi chạm đáy ngẫu nhiên
            if(drops[i] * fontSize > c.height && Math.random() > 0.98) {
                drops[i] = 0;
            }
            drops[i]++;
        }
    }, 40); // Tốc độ rơi (càng nhỏ càng nhanh)
}

// --- BIG ROAD LOGIC (FIXED) ---
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

// --- BEAD PLATE (36) ---
/* --- TRONG FILE script.js --- */

// --- BEAD PLATE (CẬP NHẬT: DỌC TRƯỚC NGANG SAU, MOBILE 6x5) ---
function renderBeadPlate(res) {
    const grid = document.getElementById('beadPlateGrid');
    if (!grid) return;

    // 1. Xác định số cột dựa vào màn hình
    // Nếu màn hình nhỏ hơn 1024px (Mobile/Tablet dọc) thì 5 cột, ngược lại 6 cột
    const isMobile = window.innerWidth <= 1024;
    const rows = 6; // Cố định 6 dòng
    const cols = isMobile ? 5 : 6; 
    const totalCells = rows * cols; // Mobile: 30, Desktop: 36

    // 2. Lấy đúng số lượng kết quả mới nhất
    let displayData = res.slice(-totalCells); 
    
    // Nếu dữ liệu ít hơn số ô, ta cần padding (đẩy dữ liệu về phía sau hoặc giữ nguyên tùy logic)
    // Ở đây ta giữ nguyên, Grid CSS sẽ tự sắp xếp
    
    let html = '';
    
    // Render các ô có dữ liệu
    displayData.forEach(item => {
        let cls = ''; let txt = '';
        if (item === 'P') { cls = 'bead-p'; txt = 'P'; }
        else if (item === 'B') { cls = 'bead-b'; txt = 'B'; }
        else if (item === 'T') { cls = 'bead-t'; txt = 'T'; }
        
        html += `<div class="bead-cell"><div class="bead-circle ${cls}">${txt}</div></div>`;
    });

    // Render các ô trống còn thiếu để lấp đầy bảng (để giữ khung đẹp)
    const emptyCount = totalCells - displayData.length;
    for (let i = 0; i < emptyCount; i++) {
        html += `<div class="bead-cell"></div>`;
    }

    grid.innerHTML = html;
}

// Bắt sự kiện resize để vẽ lại bảng khi xoay màn hình hoặc đổi kích thước
window.addEventListener('resize', () => {
    if(history && history.length > 0) renderBeadPlate(history);
});

// --- MATRIX & TRANS ---
function generateMatrixCode() {
    const el = document.getElementById('matrixCode');
    if(el) {
        const lines = ["DECRYPTING PACKET...", "BYPASS_FIREWALL...", "CALCULATING_ODDS...", "PACKET_SNIFFING...", "inject_sql_v2... OK", "SCANNING TABLE DATA...", "AI PREDICTION: LOADING", "SERVER RESPONSE: 200 OK"];
        const div = document.createElement('div');
        div.style.marginBottom = "2px";
        div.innerText = "> " + lines[Math.floor(Math.random()*lines.length)] + " [" + Math.random().toString(16).substring(2,6).toUpperCase() + "]";
        el.prepend(div); 
        
        // --- SỬA SỐ 12 THÀNH 25 ĐỂ LẤP ĐẦY KHUNG CAO ---
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

// --- WAVE CHART ---
let chartPoints = []; let waveOffset = 0; let ctxChart = null; let canvasChart = null;
function updateChartData(hist) {
    if(!hist || hist.length < 2) return;
    let dataSlice = hist.slice(-30);
    let currentVal = 0; chartPoints = [{val: 0, type: 'start'}];
    dataSlice.forEach(r => { if(r === 'P') currentVal += 1; else if(r === 'B') currentVal -= 1; chartPoints.push({val: currentVal, type: r}); });
}
function startWaveChartLoop() {
    canvasChart = document.getElementById('trendChart'); if(!canvasChart) return;
    ctxChart = canvasChart.getContext('2d');
    function resize() { if(canvasChart.parentElement) { canvasChart.width = canvasChart.parentElement.clientWidth; canvasChart.height = canvasChart.parentElement.clientHeight; } }
    window.addEventListener('resize', resize); resize();
    function loop() { drawWaveChart(); waveOffset += 0.08; requestAnimationFrame(loop); }
    loop();
}
function drawWaveChart() {
    if(!ctxChart || chartPoints.length < 2) return;
    const w = canvasChart.width; const h = canvasChart.height;
    ctxChart.clearRect(0,0,w,h);
    const grd = ctxChart.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(0, 243, 255, 0.1)"); grd.addColorStop(1, "rgba(255, 0, 60, 0.1)");
    ctxChart.beginPath(); ctxChart.moveTo(0, h);
    for(let i=0; i<=w; i+=10) { let y = h/2 + Math.sin(i * 0.02 + waveOffset) * 20; ctxChart.lineTo(i, y); }
    ctxChart.lineTo(w, h); ctxChart.fillStyle = grd; ctxChart.fill();
    const vals = chartPoints.map(p => p.val);
    let min = Math.min(...vals); let max = Math.max(...vals); let range = max - min; if(range < 4) range = 4; 
    let padding = 20; let stepX = w / (chartPoints.length - 1);
    const getY = (v) => h - padding - ((v - min) / range) * (h - 2*padding);
    let breathe = Math.sin(waveOffset) * 2; 
    ctxChart.beginPath();
    chartPoints.forEach((p, i) => {
        let x = i * stepX; let y = getY(p.val) + breathe;
        if(i===0) ctxChart.moveTo(x, y);
        else {
            let prevX = (i-1) * stepX; let prevY = getY(chartPoints[i-1].val) + breathe;
            let cpX = (prevX + x) / 2; ctxChart.quadraticCurveTo(prevX, prevY, cpX, (prevY+y)/2); ctxChart.lineTo(x, y);
        }
    });
    ctxChart.lineWidth = 3; ctxChart.strokeStyle = "#fff"; ctxChart.shadowBlur = 10; ctxChart.shadowColor = "#00ff41"; ctxChart.stroke();
    chartPoints.forEach((p, i) => {
        if(i===0) return; let x = i * stepX; let y = getY(p.val) + breathe;
        ctxChart.beginPath(); ctxChart.arc(x, y, 4, 0, Math.PI*2);
        if(p.type === 'P') { ctxChart.fillStyle = '#00f3ff'; ctxChart.shadowColor = '#00f3ff'; }
        else if(p.type === 'B') { ctxChart.fillStyle = '#ff003c'; ctxChart.shadowColor = '#ff003c'; }
        else { ctxChart.fillStyle = '#0f0'; }
        ctxChart.fill();
    });
}