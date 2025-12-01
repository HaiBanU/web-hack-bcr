/* --- START OF FILE script.js --- */

let currentTableId = null;
let history = [];
let isProcessing = false;
let tokenInterval = null;
const socket = io();

// --- INIT: KHỞI TẠO ---
window.addEventListener('DOMContentLoaded', () => {
    initCardRain();
    
    // 1. Lấy thông tin bàn từ URL
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "UNKNOWN");
    if (!tName.includes("BACCARAT")) tName = tName.replace("BÀN", "BÀN BACCARAT");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();
    
    // 2. Token
    updateTokenUI(localStorage.getItem('tokens') || 0);
    addLog(`SYSTEM CONNECTED: ${tName}`);
    addLog(`>> CONNECTING TO SERVER... [OK]`);

    // 3. TRỪ 5 TOKEN KHI VÀO
    deductToken('entry');

    // 4. Đếm ngược trừ tiền 30s
    startPeriodicDeduction();

    // 5. Hiệu ứng
    setInterval(generateMatrixCode, 50);     
    resetCardsUI();      
    
    // Bắt đầu Animation Chart
    startWaveChartLoop();
});

// --- LOGIC TRỪ TIỀN (SỬA THÀNH 5) ---
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
            alert("❌ HẾT TOKEN (Cần 5)! Vui lòng liên hệ Admin.");
            window.location.href = 'index.html';
        }
    } catch (e) { console.error(e); }
}

function startPeriodicDeduction() {
    if (tokenInterval) clearInterval(tokenInterval);
    tokenInterval = setInterval(() => {
        deductToken('periodic');
    }, 30000);
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
            
            // Render Cầu Lớn (Big Road)
            renderBigRoadGrid(history);
            // Render Cầu Giọt Nước (Bead Plate) - MỚI
            renderBeadPlate(history);
            // Cập nhật dữ liệu cho Chart (nhưng vẽ bằng Loop riêng)
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

// --- LOGIC DỰ ĐOÁN & GAUGE ---
function runPredictionSystem(historyArr) {
    isProcessing = true;
    resetCardsUI();
    
    const adviceEl = document.getElementById('aiAdvice');
    const predEl = document.getElementById('aiPredText');
    const gaugePath = document.getElementById('gaugePath');
    const gaugeValue = document.getElementById('gaugeValue');
    const gaugeContainer = document.querySelector('.pred-gauge');
    
    adviceEl.innerText = "CALCULATING..."; adviceEl.style.color = "#ffff00";
    predEl.innerText = "SCANNING..."; predEl.className = "pred-result res-wait";
    gaugePath.setAttribute("stroke-dasharray", "0, 100"); gaugeValue.innerText = "0%";
    gaugeContainer.classList.remove('active');
    
    const cleanHist = historyArr.filter(x => x !== 'T');
    let prediction = 'B'; let confidence = 50; let reason = "AI RANDOM SCAN";

    // Logic giả lập phân tích
    if (cleanHist.length >= 3) {
        const len = cleanHist.length;
        const last1 = cleanHist[len-1]; const last2 = cleanHist[len-2]; const last3 = cleanHist[len-3];
        if (last1 === last2 && last2 === last3) { prediction = last1; confidence = Math.floor(Math.random() * (95 - 85) + 85); reason = `DETECTED DRAGON (${last1})`; } 
        else if (last1 !== last2 && last2 !== last3) { prediction = (last1 === 'P') ? 'B' : 'P'; confidence = Math.floor(Math.random() * (90 - 80) + 80); reason = "PING-PONG PATTERN"; } 
        else { prediction = (Math.random() > 0.5) ? 'P' : 'B'; confidence = Math.floor(Math.random() * (75 - 60) + 60); reason = "MATRIX ANALYSIS V18"; }
    } else { prediction = (Math.random() > 0.5) ? 'P' : 'B'; reason = "WAITING DATA..."; }

    setTimeout(() => { addLog(`>> ANALYZING NEXT ROUND...`); }, 500);
    setTimeout(() => { addLog(`>> ALGORITHM: ${reason}`); }, 1000);

    setTimeout(() => {
        adviceEl.innerText = reason; adviceEl.style.color = "#00ff41";
        predEl.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        predEl.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        
        gaugeValue.innerText = confidence + "%";
        gaugePath.setAttribute("stroke-dasharray", `${confidence}, 100`);
        if (prediction === 'P') { gaugePath.className.baseVal = "circle stroke-p"; gaugeContainer.style.setProperty('--target-color', '#00f3ff'); } 
        else { gaugePath.className.baseVal = "circle stroke-b"; gaugeContainer.style.setProperty('--target-color', '#ff003c'); }
        gaugeContainer.classList.add('active');

        let confP = (prediction==='P') ? confidence : (100-confidence);
        let confB = (prediction==='B') ? confidence : (100-confidence);
        document.getElementById('confP').innerText = confP+"%"; document.getElementById('barP').style.width = confP+"%";
        document.getElementById('confB').innerText = confB+"%"; document.getElementById('barB').style.width = confB+"%";
        addLog(`>> PREDICTION: [ ${prediction} ] (RATE: ${confidence}%)`);
        simulateHandReveal(prediction);
    }, 2000);
}

// --- GIẢ LẬP LẬT BÀI ---
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
function generateMatrixCode() {
    const el = document.getElementById('matrixCode');
    if(el) {
        const lines = ["DECRYPTING...", "BYPASS_FIREWALL...", "CALCULATING_ODDS...", "PACKET_SNIFFING...", "inject_sql_v2..."];
        const div = document.createElement('div');
        div.innerText = "> " + lines[Math.floor(Math.random()*lines.length)] + " " + Math.random().toString(36).substring(7);
        el.appendChild(div); el.scrollTop = el.scrollHeight; if(el.children.length > 20) el.removeChild(el.firstChild);
    }
}
function initCardRain() {
    const c = document.getElementById('cardRain'); if(!c) return;
    const ctx = c.getContext('2d');
    function resize() { if(c.parentElement) { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; } }
    window.addEventListener('resize', resize); resize();
    const chars = "XY_01_WIN_$$"; const drops = Array(Math.floor(c.width/15)).fill(1);
    setInterval(() => {
        ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; ctx.fillRect(0, 0, c.width, c.height);
        ctx.fillStyle = "#003300"; ctx.font = "10px monospace";
        for(let i=0; i<drops.length; i++){
            ctx.fillText(chars[Math.floor(Math.random()*chars.length)], i*15, drops[i]*15);
            if(drops[i]*15 > c.height && Math.random()>0.98) drops[i]=0;
            drops[i]++;
        }
    }, 50);
}

// ============================================
// LOGIC CẦU LỚN (BIG ROAD) - BÊN PHẢI
// ============================================
function renderBigRoadGrid(res) {
    const grid = document.getElementById('bigRoadGrid'); if(!grid) return;
    let processed = []; res.forEach(c => { if(c==='T') { if(processed.length>0) processed[processed.length-1].hasTie=true; } else processed.push({type:c, hasTie:false}); });
    let cols = []; let cur = []; let last = null;
    processed.forEach(item => { if(last!==null && item.type!==last) { cols.push(cur); cur=[]; } if(cur.length>=6) { cols.push(cur); cur=[]; } cur.push(item); last=item.type; });
    if(cur.length>0) cols.push(cur); while(cols.length<30) cols.push([]);
    let html = '';
    cols.slice(-30).forEach(col => {
        html += '<div class="tool-road-col">';
        for(let i=0; i<6; i++) {
            let node = col[i]; let inner = '';
            if(node) { let cls = node.type==='P'?'tool-p':'tool-b'; let tie = node.hasTie?'has-tie':''; inner = `<div class="tool-bead ${cls} ${tie}"></div>`; }
            html += `<div class="tool-road-cell">${inner}</div>`;
        }
        html += '</div>';
    });
    grid.innerHTML = html;
}

// ============================================
// LOGIC CẦU GIỌT NƯỚC (BEAD PLATE) - BÊN TRÁI
// ============================================
function renderBeadPlate(res) {
    const grid = document.getElementById('beadPlateGrid');
    if(!grid) return;
    
    // Bead Plate hiển thị theo cột dọc: Cột 1 (0-5), Cột 2 (6-11)...
    // Chúng ta sẽ vẽ 6 hàng x N cột
    let rows = 6;
    let cols = 15; // Số cột tối thiểu hiển thị
    let totalCells = rows * cols;
    
    // Lấy dữ liệu gần nhất để điền (nếu dài quá thì cắt)
    // Bead plate thường show lịch sử từ đầu hoặc trượt theo
    // Ở đây ta hiển thị history từ đầu, nếu tràn thì scroll
    
    let html = '';
    
    // Tính toán số cột cần thiết dựa trên history
    let requiredCols = Math.ceil(res.length / rows);
    if (requiredCols < cols) requiredCols = cols;
    
    // Tạo lưới bằng Grid CSS (đã set trong CSS)
    // Chỉ cần append các cell vào
    // Bead Plate điền: Hàng 0->5 của Cột 0, sau đó Hàng 0->5 của Cột 1...
    
    // Vì CSS Grid đang set `grid-auto-flow: column`, ta chỉ cần append div theo thứ tự history
    // là nó tự động nhảy xuống hàng, hết hàng nhảy qua cột
    
    // Tuy nhiên, logic chuẩn Bead Plate là: 
    // Cell 1: Col 1 Row 1
    // Cell 2: Col 1 Row 2
    // ...
    // Nên chỉ cần loop qua history và render
    
    res.forEach(item => {
        let cls = '';
        let txt = '';
        if (item === 'P') { cls = 'bead-p'; txt = 'P'; }
        else if (item === 'B') { cls = 'bead-b'; txt = 'B'; }
        else if (item === 'T') { cls = 'bead-t'; txt = 'T'; }
        
        html += `
            <div class="bead-cell">
                <div class="bead-circle ${cls}">${txt}</div>
            </div>
        `;
    });
    
    // Điền thêm ô trống cho đẹp grid
    let fillCount = (requiredCols * rows) - res.length;
    for(let i=0; i<fillCount; i++) {
         html += `<div class="bead-cell"></div>`;
    }
    
    grid.innerHTML = html;
    
    // Auto scroll tới cuối
    grid.scrollLeft = grid.scrollWidth;
}


// ============================================
// CHART GỢN SÓNG (WAVE ANIMATION)
// ============================================
let chartPoints = []; // Dữ liệu điểm vẽ
let waveOffset = 0;   // Biến tạo chuyển động sóng
let ctxChart = null;
let canvasChart = null;

function updateChartData(hist) {
    if(!hist || hist.length < 2) return;
    let dataSlice = hist.slice(-30); // Lấy 30 ván gần nhất
    let currentVal = 0;
    chartPoints = [{val: 0, type: 'start'}];
    
    dataSlice.forEach(r => {
        if(r === 'P') currentVal += 1;
        else if(r === 'B') currentVal -= 1;
        chartPoints.push({val: currentVal, type: r});
    });
}

function startWaveChartLoop() {
    canvasChart = document.getElementById('trendChart');
    if(!canvasChart) return;
    ctxChart = canvasChart.getContext('2d');
    
    // Resize canvas
    function resize() {
        if(canvasChart.parentElement) {
            canvasChart.width = canvasChart.parentElement.clientWidth;
            canvasChart.height = canvasChart.parentElement.clientHeight;
        }
    }
    window.addEventListener('resize', resize);
    resize();
    
    // Loop vẽ
    function loop() {
        drawWaveChart();
        waveOffset += 0.08; // Tốc độ sóng
        requestAnimationFrame(loop);
    }
    loop();
}

function drawWaveChart() {
    if(!ctxChart || chartPoints.length < 2) return;
    const w = canvasChart.width;
    const h = canvasChart.height;
    
    ctxChart.clearRect(0,0,w,h);
    
    // 1. Vẽ nền Sóng (Background Wave)
    const grd = ctxChart.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, "rgba(0, 243, 255, 0.1)");
    grd.addColorStop(1, "rgba(255, 0, 60, 0.1)");
    
    ctxChart.beginPath();
    ctxChart.moveTo(0, h);
    for(let i=0; i<=w; i+=10) {
        // Hàm Sin tạo sóng: y = amplitude * sin(frequency * x + phase)
        let y = h/2 + Math.sin(i * 0.02 + waveOffset) * 20;
        ctxChart.lineTo(i, y);
    }
    ctxChart.lineTo(w, h);
    ctxChart.fillStyle = grd;
    ctxChart.fill();
    
    // 2. Vẽ Đường Trend (Line Chart)
    // Tính toán tỷ lệ
    const vals = chartPoints.map(p => p.val);
    let min = Math.min(...vals); let max = Math.max(...vals);
    let range = max - min; if(range < 4) range = 4; 
    let padding = 30;
    let stepX = w / (chartPoints.length - 1);
    
    const getY = (v) => h - padding - ((v - min) / range) * (h - 2*padding);
    
    ctxChart.beginPath();
    // Tạo hiệu ứng đường line cũng "thở" nhẹ theo sóng
    let breathe = Math.sin(waveOffset) * 2; 
    
    chartPoints.forEach((p, i) => {
        let x = i * stepX;
        let y = getY(p.val) + breathe;
        if(i===0) ctxChart.moveTo(x, y);
        else {
            // Bezier curve cho mượt
            let prevX = (i-1) * stepX;
            let prevY = getY(chartPoints[i-1].val) + breathe;
            let cpX = (prevX + x) / 2;
            ctxChart.quadraticCurveTo(prevX, prevY, cpX, (prevY+y)/2); // Đơn giản hóa curve
            ctxChart.lineTo(x, y);
        }
    });
    
    ctxChart.lineWidth = 3;
    ctxChart.strokeStyle = "#fff";
    ctxChart.shadowBlur = 10;
    ctxChart.shadowColor = "#00ff41";
    ctxChart.stroke();
    
    // 3. Vẽ Điểm (Dots)
    chartPoints.forEach((p, i) => {
        if(i===0) return;
        let x = i * stepX;
        let y = getY(p.val) + breathe;
        
        ctxChart.beginPath();
        ctxChart.arc(x, y, 4, 0, Math.PI*2);
        if(p.type === 'P') { ctxChart.fillStyle = '#00f3ff'; ctxChart.shadowColor = '#00f3ff'; }
        else if(p.type === 'B') { ctxChart.fillStyle = '#ff003c'; ctxChart.shadowColor = '#ff003c'; }
        else { ctxChart.fillStyle = '#0f0'; }
        
        ctxChart.fill();
    });
}