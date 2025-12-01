/* --- START OF FILE script.js --- */

/* =========================================
   HACKER ENGINE V14 - FULL LOGIC & FEATURES
   ========================================= */

let currentTableId = null;
let history = [];
let isProcessing = false;
const socket = io();

// --- INIT: KHỞI TẠO ---
window.addEventListener('DOMContentLoaded', () => {
    // 1. Matrix Background & Card Rain
    initCardRain();
    
    // 2. Load Token & Table Info
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "UNKNOWN");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();
    
    // 3. HIỂN THỊ TOKEN (Quan trọng)
    const myTokens = localStorage.getItem('tokens') || "0";
    document.getElementById('headerTokenDisplay').innerText = Math.floor(myTokens).toLocaleString('vi-VN');

    addLog(`SYSTEM CONNECTED: ${tName}`);
    
    // 4. Start Background Tasks
    setInterval(generateMatrixCode, 100);     // Chạy mã Matrix góc phải
    startFakeTransactions();                  // Chạy log giao dịch
    resetCardsUI();                           // Reset bài về trạng thái úp
});

// --- CORE SOCKET: NHẬN DỮ LIỆU ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;
    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverRes = (tableData.result || "").split('');
        if (serverRes.length > history.length || history.length === 0) {
            history = serverRes;
            
            // Render Footer Elements (Bảng cầu & Biểu đồ)
            renderBigRoadGrid(history);
            drawTrendChart(history); 
            
            if (history.length > 0) {
                const lastWin = history[history.length - 1];
                addLog(`>> KẾT QUẢ MỚI: [ ${lastWin} ]`);
                // Chạy dự đoán cho tay sau
                runPredictionSystem(history);
            }
        }
    }
});

// --- PREDICTION SYSTEM: SOI CẦU & DỰ ĐOÁN ---
function runPredictionSystem(historyArr) {
    isProcessing = true;
    resetCardsUI();
    
    const adviceEl = document.getElementById('aiAdvice');
    const predEl = document.getElementById('aiPredText');
    adviceEl.innerText = "CALCULATING PROBABILITY...";
    adviceEl.style.color = "#ffff00";
    predEl.innerText = "SCANNING...";
    predEl.className = "pred-result res-wait";
    
    // Logic soi cầu
    const cleanHist = historyArr.filter(x => x !== 'T');
    let prediction = 'B';
    let reason = "RANDOM";
    let confidence = 50;

    if (cleanHist.length >= 3) {
        const len = cleanHist.length;
        const last1 = cleanHist[len-1];
        const last2 = cleanHist[len-2];
        const last3 = cleanHist[len-3];
        
        // Bắt bệt (Dragon)
        if (last1 === last2 && last2 === last3) {
            prediction = last1; 
            reason = "DRAGON DETECTED"; 
            confidence = 92;
        } 
        // Bắt 1-1 (Ping Pong)
        else if (last1 !== last2 && last2 !== last3) {
            prediction = (last1==='P')?'B':'P'; 
            reason = "PING-PONG PATTERN"; 
            confidence = 85;
        } 
        // Logic AI ngẫu nhiên thông minh
        else {
            prediction = (Math.random()>0.5)?'P':'B'; 
            reason = "AI ANALYSIS"; 
            confidence = 65;
        }
    }

    // Delay giả lập tính toán
    setTimeout(() => {
        adviceEl.innerText = `SIGNAL: ${reason}`;
        adviceEl.style.color = "#00ff41";
        predEl.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        predEl.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        
        // Cập nhật thanh %
        let confP = (prediction==='P') ? confidence : (100-confidence);
        let confB = (prediction==='B') ? confidence : (100-confidence);
        document.getElementById('confP').innerText = confP+"%"; document.getElementById('barP').style.width = confP+"%";
        document.getElementById('confB').innerText = confB+"%"; document.getElementById('barB').style.width = confB+"%";

        // BẮT ĐẦU MỞ BÀI GIẢ LẬP
        simulateHandReveal(prediction);
    }, 1500);
}

// --- CARD SIMULATION (LOGIC 3 LÁ ĐẦY ĐỦ) ---
function simulateHandReveal(target) {
    const hand = generateFakeHand(target);
    
    // Lật 2 lá đầu tiên (P1, B1, P2, B2)
    setTimeout(() => revealCard('p1', hand.p[0]), 500);
    setTimeout(() => revealCard('b1', hand.b[0]), 1000);
    setTimeout(() => revealCard('p2', hand.p[1]), 1500);
    setTimeout(() => revealCard('b2', hand.b[1]), 2000);
    
    // Lật lá thứ 3 (Nếu cần thiết theo luật Baccarat)
    setTimeout(() => {
        if(hand.p[2]) revealCard('p3', hand.p[2]); // Slot 3 Player
        if(hand.b[2]) revealCard('b3', hand.b[2]); // Slot 3 Banker
        
        // Hiển thị điểm số cuối cùng
        document.getElementById('playerScore').innerText = hand.pScore;
        document.getElementById('bankerScore').innerText = hand.bScore;
        
        // Hiệu ứng thắng cuộc
        document.querySelector('.p-side').classList.remove('winner-p','winner-b');
        document.querySelector('.b-side').classList.remove('winner-p','winner-b');
        
        if(hand.pScore > hand.bScore) document.querySelector('.p-side').classList.add('winner-p');
        else if(hand.bScore > hand.pScore) document.querySelector('.b-side').classList.add('winner-b');
        
        isProcessing = false;
    }, 3000);
}

// Hàm lật 1 lá bài cụ thể
function revealCard(id, card) {
    if(!card) return;
    const slot = document.getElementById(id);
    const front = slot.querySelector('.card-front');
    
    // Chuyển đổi số thành ký tự J, Q, K, A
    let val = card.raw;
    if(val===1) val='A'; else if(val===11) val='J'; else if(val===12) val='Q'; else if(val===13) val='K';
    
    let suit = (card.suit==='hearts'?'♥':(card.suit==='diamonds'?'♦':(card.suit==='clubs'?'♣':'♠')));
    
    front.innerHTML = `<div>${val}</div><div style="font-size:1.5rem">${suit}</div>`;
    front.className = `card-front ${card.suit}`;
    slot.classList.add('flipped'); // Kích hoạt CSS xoay 3D
}

function resetCardsUI() {
    document.getElementById('playerScore').innerText = "0";
    document.getElementById('bankerScore').innerText = "0";
    document.querySelector('.p-side').classList.remove('winner-p');
    document.querySelector('.b-side').classList.remove('winner-b');
    
    // Reset bài về trạng thái úp
    ['p1','p2','p3','b1','b2','b3'].forEach(id => {
        const el = document.getElementById(id);
        el.className = "card-slot";
        el.innerHTML = `<div class="card-back"></div><div class="card-front"></div>`;
    });
}

// Hàm tạo bộ bài giả khớp với kết quả dự đoán
function generateFakeHand(target) {
    for(let i=0; i<500; i++) {
        let p = [getCard(), getCard()];
        let b = [getCard(), getCard()];
        let pS = calc(p); let bS = calc(b);
        
        // Logic rút lá 3 đơn giản (Để tạo cảm giác thật)
        if(pS <= 5) { p.push(getCard()); pS = calc(p); }
        if(bS <= 5) { b.push(getCard()); bS = calc(b); }
        
        let w = pS > bS ? 'P' : (bS > pS ? 'B' : 'T');
        // Nếu kết quả khớp với dự đoán (target) thì trả về bộ bài này
        if(w === target || target === 'T') return { p, b, pScore:pS, bScore:bS };
    }
    // Fallback nếu không tìm được
    return { p:[getCard(),getCard()], b:[getCard(),getCard()], pScore:0, bScore:0 };
}

function getCard() {
    const raw = Math.floor(Math.random()*13)+1;
    return { raw, value: raw>=10?0:raw, suit: ['spades','hearts','clubs','diamonds'][Math.floor(Math.random()*4)] };
}
function calc(cards) { return cards.reduce((a,b)=>a+b.value,0)%10; }

// --- UI EXTRAS (CHART, LOG, MATRIX) ---
function addLog(msg) {
    const box = document.getElementById('systemLog');
    const time = new Date().toLocaleTimeString();
    box.innerHTML += `<div style="border-bottom:1px solid #222; padding:2px;">[${time}] ${msg}</div>`;
    box.scrollTop = box.scrollHeight;
}

function generateMatrixCode() {
    const el = document.getElementById('matrixCode');
    if(el) {
        const chars = "010101XYZ_HACK_SYSTEM_LOADING...";
        el.innerText += chars[Math.floor(Math.random()*chars.length)];
        if(el.innerText.length > 500) el.innerText = el.innerText.substring(100);
        el.scrollTop = el.scrollHeight;
    }
}

function startFakeTransactions() {
    const names = ["VipUser99", "DragonKiller", "MasterPro", "HiddenBot", "WinBig88"];
    const box = document.getElementById('transLog');
    setInterval(() => {
        const n = names[Math.floor(Math.random()*names.length)];
        const s = Math.random()>0.5 ? "PLAYER" : "BANKER";
        const m = Math.floor(Math.random()*500)+50;
        const color = s==="PLAYER"?"#00f3ff":"#ff003c";
        const div = document.createElement('div');
        div.className = "trans-item";
        div.innerHTML = `<span style="color:#aaa">${n}</span><span style="color:${color}">${s}</span><span style="color:#fff">$${m}k</span>`;
        box.prepend(div);
        if(box.children.length > 6) box.lastChild.remove();
    }, 2000);
}

function drawTrendChart(hist) {
    const c = document.getElementById('trendChart');
    if(!c) return;
    if(c.parentElement) { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; }
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx.clearRect(0,0,w,h);
    
    // Vẽ đường
    const data = hist.slice(-30);
    if(data.length<2) return;
    
    ctx.beginPath();
    let step = w / (data.length-1);
    let y = h/2;
    ctx.moveTo(0, y);
    
    for(let i=0; i<data.length; i++) {
        if(data[i]==='P') y -= 10; else if(data[i]==='B') y += 10;
        if(y<5) y=5; if(y>h-5) y=h-5;
        ctx.lineTo(i*step, y);
    }
    ctx.strokeStyle = '#00ff41'; ctx.lineWidth = 2; ctx.stroke();
}

function renderBigRoadGrid(res) {
    const grid = document.getElementById('bigRoadGrid');
    if(!grid) return;
    let processed = [];
    res.forEach(c => {
        if(c==='T') { if(processed.length>0) processed[processed.length-1].hasTie=true; }
        else processed.push({type:c, hasTie:false});
    });
    
    let cols = []; let cur = []; let last = null;
    processed.forEach(item => {
        if(last!==null && item.type!==last) { cols.push(cur); cur=[]; }
        if(cur.length>=6) { cols.push(cur); cur=[]; }
        cur.push(item); last=item.type;
    });
    if(cur.length>0) cols.push(cur);
    while(cols.length<30) cols.push([]);
    
    let html = '';
    cols.slice(-30).forEach(col => {
        html += '<div class="tool-road-col">';
        for(let i=0; i<6; i++) {
            let node = col[i];
            let inner = '';
            if(node) {
                let cls = node.type==='P'?'tool-p':'tool-b';
                let tie = node.hasTie?'has-tie':'';
                inner = `<div class="tool-bead ${cls} ${tie}"></div>`;
            }
            html += `<div class="tool-road-cell">${inner}</div>`;
        }
        html += '</div>';
    });
    grid.innerHTML = html;
}

function initCardRain() { 
    const c = document.getElementById('cardRain');
    if(!c) return;
    const ctx = c.getContext('2d');
    function resize() { if(c.parentElement) { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; } }
    window.addEventListener('resize', resize); resize();
    const chars = "XY_01_WIN_$$";
    const drops = Array(Math.floor(c.width/15)).fill(1);
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