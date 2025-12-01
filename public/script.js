/* =========================================
   HACKER ENGINE V12 - FULL LOGIC + ANIMATION
   ========================================= */

let currentTableId = null;
let history = [];
let isProcessing = false;
const socket = io();

// --- INIT ---
window.addEventListener('DOMContentLoaded', () => {
    // 1. Setup Canvas Matrix
    initCardRain();
    
    // 2. Lấy param
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "UNKNOWN");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();
    
    addLog(`SYSTEM READY: ${tName}`);
    
    // 3. Khởi tạo các ô bài (Vẽ mặt lưng màu xanh trước)
    resetCardsUI();
});

// --- UI HELPERS ---
function initCardRain() {
    const c = document.getElementById('cardRain');
    if(!c) return;
    const ctx = c.getContext('2d');
    function resize() { 
        if(c.parentElement) { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; }
    }
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

function addLog(msg) {
    const box = document.getElementById('systemLog');
    const time = new Date().toLocaleTimeString();
    box.innerHTML += `<div style="border-bottom:1px solid #222; padding:2px;">[${time}] <span style="color:#fff">${msg}</span></div>`;
    box.scrollTop = box.scrollHeight;
}

// --- CORE SOCKET LOGIC ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;
    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverRes = (tableData.result || "").split('');
        
        // Nếu có dữ liệu mới
        if (serverRes.length > history.length || history.length === 0) {
            history = serverRes;
            
            // 1. Vẽ lại bảng cầu dưới
            renderBigRoadGrid(history);
            
            // 2. Nếu vừa có kết quả mới -> Reset bài và hiển thị kết quả
            if (history.length > 0) {
                const lastWin = history[history.length - 1];
                addLog(`>> KẾT QUẢ MỚI: [ ${lastWin==='P'?'PLAYER':(lastWin==='B'?'BANKER':'TIE')} ]`);
                
                // Chạy phân tích Tay Sau (Next Hand)
                runPredictionSystem(history);
            }
        }
    }
});

// --- THUẬT TOÁN DỰ ĐOÁN (ALGORITHM) ---
function runPredictionSystem(historyArr) {
    isProcessing = true;
    resetCardsUI(); // Úp bài lại
    
    // UI: Đang phân tích
    const adviceEl = document.getElementById('aiAdvice');
    const predEl = document.getElementById('aiPredText');
    adviceEl.innerText = "SCANNING PATTERN...";
    adviceEl.style.color = "#ffff00";
    predEl.innerText = "WAIT...";
    predEl.className = "pred-result res-wait";
    
    // --- LOGIC SOI CẦU ---
    // 1. Lấy dữ liệu sạch (bỏ Tie)
    const cleanHist = historyArr.filter(x => x !== 'T');
    
    // 2. Phân tích
    let prediction = 'B'; // Mặc định
    let reason = "RANDOM";
    let confidence = 50;
    
    if (cleanHist.length >= 3) {
        const len = cleanHist.length;
        const last1 = cleanHist[len-1];
        const last2 = cleanHist[len-2];
        const last3 = cleanHist[len-3];
        
        // Logic Bệt (Dragon): Nếu 3 tay gần nhất giống nhau
        if (last1 === last2 && last2 === last3) {
            prediction = last1; 
            reason = `STRONG DRAGON (${last1})`; 
            confidence = 95;
        }
        // Logic 1-1 (Ping Pong): Nếu P-B-P hoặc B-P-B
        else if (last1 !== last2 && last2 !== last3) {
            prediction = (last1 === 'P') ? 'B' : 'P';
            reason = "PING PONG DETECTED";
            confidence = 88;
        }
        // Logic Bẻ Cầu 2-1: Nếu BB-P hoặc PP-B -> Dự đoán quay lại
        else if (last1 !== last2 && last2 === last3) {
            prediction = last2; // Theo lại cầu cũ
            reason = "REPEAT PATTERN";
            confidence = 75;
        }
        // Mặc định Random thông minh
        else {
            prediction = (Math.random() > 0.5) ? 'P' : 'B';
            reason = "AI DEEP LEARN";
            confidence = 65;
        }
    }

    // 3. Hiển thị kết quả dự đoán sau 1.5 giây (Giả lập tính toán)
    setTimeout(() => {
        // Cập nhật text Robot
        adviceEl.innerText = `SIGNAL: ${reason}`;
        adviceEl.style.color = "#00ff41";
        
        predEl.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        predEl.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        
        // Cập nhật thanh %
        let confP = (prediction === 'P') ? confidence : (100 - confidence);
        let confB = (prediction === 'B') ? confidence : (100 - confidence);
        document.getElementById('confP').innerText = confP + "%"; document.getElementById('barP').style.width = confP + "%";
        document.getElementById('confB').innerText = confB + "%"; document.getElementById('barB').style.width = confB + "%";

        addLog(`BOT: Dự đoán tay sau -> ${prediction} (${confidence}%)`);

        // 4. Mở bài giả lập (Lật bài 3D)
        simulateHandReveal(prediction);
        
    }, 1500);
}

// --- HỆ THỐNG GIẢ LẬP BÀI (CARD ENGINE) ---
function simulateHandReveal(targetWinner) {
    // Tạo bộ bài ngẫu nhiên khớp với kết quả dự đoán
    const hand = generateFakeHand(targetWinner);
    
    // Lần lượt lật bài (Flip effect)
    // Player 1
    setTimeout(() => revealCard('p1', hand.p[0]), 500);
    // Banker 1
    setTimeout(() => revealCard('b1', hand.b[0]), 1000);
    // Player 2
    setTimeout(() => revealCard('p2', hand.p[1]), 1500);
    // Banker 2
    setTimeout(() => revealCard('b2', hand.b[1]), 2000);
    
    // Lá thứ 3 (nếu có)
    setTimeout(() => {
        if(hand.p[2]) revealCard('p3', hand.p[2]);
        if(hand.b[2]) revealCard('b3', hand.b[2]);
        
        // Cập nhật điểm số cuối cùng
        document.getElementById('playerScore').innerText = hand.pScore;
        document.getElementById('bankerScore').innerText = hand.bScore;
        
        // Highlight bên thắng
        const pBox = document.querySelector('.p-side');
        const bBox = document.querySelector('.b-side');
        pBox.classList.remove('winner-p', 'winner-b');
        bBox.classList.remove('winner-p', 'winner-b');
        
        if (hand.pScore > hand.bScore) pBox.classList.add('winner-p');
        else if (hand.bScore > hand.pScore) bBox.classList.add('winner-b');
        
        isProcessing = false;
        
    }, 3000);
}

function revealCard(slotId, cardData) {
    const slot = document.getElementById(slotId);
    if (!slot || !cardData) return;
    
    // Tìm mặt trước (card-front) và gán giá trị
    const frontFace = slot.querySelector('.card-front');
    
    // Xử lý hiển thị J, Q, K, A
    let displayVal = cardData.raw;
    if (displayVal === 1) displayVal = "A";
    else if (displayVal === 11) displayVal = "J";
    else if (displayVal === 12) displayVal = "Q";
    else if (displayVal === 13) displayVal = "K";
    
    // Gán suit icon
    let suitIcon = "♠";
    if (cardData.suit === 'hearts') suitIcon = "♥";
    else if (cardData.suit === 'diamonds') suitIcon = "♦";
    else if (cardData.suit === 'clubs') suitIcon = "♣";
    
    frontFace.innerHTML = `<div>${displayVal}</div><div style="font-size:1.5rem">${suitIcon}</div>`;
    frontFace.className = `card-front ${cardData.suit}`; // Thêm class màu đỏ/đen
    
    // Thêm class 'flipped' để CSS xoay lá bài 180 độ
    slot.classList.add('flipped');
}

function resetCardsUI() {
    // Reset điểm
    document.getElementById('playerScore').innerText = "0";
    document.getElementById('bankerScore').innerText = "0";
    document.querySelector('.p-side').classList.remove('winner-p');
    document.querySelector('.b-side').classList.remove('winner-b');
    
    // Tạo cấu trúc HTML cho lá bài 3D (Mặt sau + Mặt trước)
    const slots = ['p1','p2','p3','b1','b2','b3'];
    slots.forEach(id => {
        const el = document.getElementById(id);
        el.className = "card-slot"; // Xóa class flipped
        // HTML structure cho 3D flip
        el.innerHTML = `
            <div class="card-back"></div>
            <div class="card-front"></div>
        `;
    });
}

// --- LOGIC TẠO BỘ BÀI (MATH) ---
function getCard() {
    const raw = Math.floor(Math.random() * 13) + 1;
    const value = raw >= 10 ? 0 : raw;
    const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
    return { raw, value, suit: suits[Math.floor(Math.random()*4)] };
}
function calc(cards) { return cards.reduce((a,b)=>a+b.value,0) % 10; }

function generateFakeHand(target) {
    // Thử tạo bài ngẫu nhiên cho đến khi khớp kết quả dự đoán
    for(let i=0; i<500; i++) {
        let p = [getCard(), getCard()];
        let b = [getCard(), getCard()];
        let pS = calc(p);
        let bS = calc(b);
        
        // Logic rút lá 3 đơn giản hóa
        if (pS <= 5) { p.push(getCard()); pS = calc(p); }
        if (bS <= 5) { b.push(getCard()); bS = calc(b); }
        
        let winner = pS > bS ? 'P' : (bS > pS ? 'B' : 'T');
        
        if (winner === target || target === 'T') {
            return { p, b, pScore: pS, bScore: bS };
        }
    }
    // Fallback
    return { 
        p:[getCard(), getCard()], 
        b:[getCard(), getCard()], 
        pScore:0, bScore:0 
    };
}

// --- LOGIC VẼ CẦU DƯỚI (BIG ROAD) ---
function renderBigRoadGrid(res) {
    const grid = document.getElementById('bigRoadGrid');
    if(!grid) return;
    
    // Xử lý Tie
    let processed = [];
    res.forEach(c => {
        if(c==='T') { if(processed.length>0) processed[processed.length-1].hasTie=true; }
        else processed.push({type:c, hasTie:false});
    });
    
    // Chia cột
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