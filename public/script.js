/* --- START OF FILE script.js (FIXED TOKEN & LOG) --- */

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
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();
    
    // 2. Hiển thị token ban đầu từ LocalStorage (để người dùng đỡ sốt ruột)
    updateTokenUI(localStorage.getItem('tokens') || 0);

    addLog(`SYSTEM CONNECTED: ${tName}`);
    addLog(`>> CONNECTING TO SERVER... [OK]`);

    // 3. TRỪ TIỀN VÀO BÀN (3 Token)
    deductToken('entry');

    // 4. Bắt đầu đếm ngược trừ tiền duy trì (30s trừ 1 lần)
    startPeriodicDeduction();

    // 5. Chạy các hiệu ứng nền
    setInterval(generateMatrixCode, 50);     
    startFakeTransactions();                  
    resetCardsUI();                           
});

// --- LOGIC TRỪ TIỀN (QUAN TRỌNG) ---
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
            // Cập nhật số dư mới nhất từ Server
            let remaining = data.remaining; 
            if(remaining === 'VIP') remaining = 999999; // Nếu là SuperAdmin

            updateTokenUI(remaining);
            
            // Ghi Log trừ tiền
            if (type === 'entry') {
                addLog(`>> ENTRY FEE: -3 TOKENS`);
            } else {
                addLog(`>> MAINTENANCE FEE: -3 TOKENS`);
            }
        } else {
            // Hết tiền hoặc lỗi
            alert("❌ HẾT TOKEN! Vui lòng liên hệ Admin để nạp thêm.");
            window.location.href = 'index.html';
        }
    } catch (e) {
        console.error(e);
        // Nếu mất mạng hoặc lỗi server thì không đá ra ngay, cho chơi nốt ván
    }
}

function startPeriodicDeduction() {
    if (tokenInterval) clearInterval(tokenInterval);
    // Cứ 30 giây (30000ms) gọi hàm trừ tiền 1 lần
    tokenInterval = setInterval(() => {
        deductToken('periodic');
    }, 30000);
}

function updateTokenUI(amount) {
    // Lưu lại vào LocalStorage để đồng bộ
    localStorage.setItem('tokens', amount);
    // Update giao diện
    const displayAmt = Math.floor(amount).toLocaleString('vi-VN');
    document.getElementById('headerTokenDisplay').innerText = displayAmt;
}


// --- SOCKET LISTENER: NHẬN KẾT QUẢ TỪ SERVER ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;
    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverRes = (tableData.result || "").split('');
        // Nếu có kết quả mới so với lịch sử hiện tại
        if (serverRes.length > history.length || history.length === 0) {
            history = serverRes;
            
            // Vẽ lại cầu và biểu đồ
            renderBigRoadGrid(history);
            drawTrendChart(history); 
            
            if (history.length > 0) {
                const lastWin = history[history.length - 1];
                addLog(`-------------------------------`);
                addLog(`>> KẾT QUẢ VỪA RA: [ ${lastWin} ]`);
                
                // CHẠY PHÂN TÍCH DỰ ĐOÁN CHO TAY SAU
                runPredictionSystem(history);
            }
        }
    }
});

// --- HỆ THỐNG DỰ ĐOÁN & GHI LOG CHI TIẾT ---
function runPredictionSystem(historyArr) {
    isProcessing = true;
    resetCardsUI(); // Úp bài lại chuẩn bị cho ván mới
    
    const adviceEl = document.getElementById('aiAdvice');
    const predEl = document.getElementById('aiPredText');
    
    // Hiệu ứng "Đang tính toán"
    adviceEl.innerText = "CALCULATING...";
    adviceEl.style.color = "#ffff00";
    predEl.innerText = "SCANNING...";
    predEl.className = "pred-result res-wait";
    
    // 1. LOGIC SOI CẦU GIẢ LẬP
    const cleanHist = historyArr.filter(x => x !== 'T'); // Bỏ hòa để soi
    let prediction = 'B'; 
    let confidence = 50;
    let reason = "AI RANDOM SCAN"; // Lý do mặc định

    if (cleanHist.length >= 3) {
        const len = cleanHist.length;
        const last1 = cleanHist[len-1];
        const last2 = cleanHist[len-2];
        const last3 = cleanHist[len-3];

        // LOGIC 1: Bắt Cầu Bệt (Dragon) - Nếu 3 tay gần nhất giống nhau
        if (last1 === last2 && last2 === last3) {
            prediction = last1; 
            confidence = Math.floor(Math.random() * (95 - 85) + 85); // 85-95%
            reason = `DETECTED DRAGON (${last1})`;
        } 
        // LOGIC 2: Bắt Cầu 1-1 (Ping Pong) - Nếu thay đổi liên tục
        else if (last1 !== last2 && last2 !== last3) {
            prediction = (last1 === 'P') ? 'B' : 'P';
            confidence = Math.floor(Math.random() * (90 - 80) + 80); // 80-90%
            reason = "PING-PONG PATTERN";
        }
        // LOGIC 3: Bẻ cầu (Nếu bệt dài quá 6 tay -> bẻ)
        else if (cleanHist.length >= 6) {
            // Kiểm tra 6 tay cuối có giống nhau không
            const last6 = cleanHist.slice(-6);
            if (last6.every(v => v === last1)) {
                prediction = (last1 === 'P') ? 'B' : 'P';
                confidence = 98;
                reason = "BREAK LONG DRAGON";
            } else {
                 // Logic Random thông minh
                prediction = (Math.random() > 0.5) ? 'P' : 'B'; 
                confidence = Math.floor(Math.random() * (75 - 60) + 60);
                reason = "MATRIX ANALYSIS V12";
            }
        }
        else {
             // Logic Random
             prediction = (Math.random() > 0.5) ? 'P' : 'B'; 
             confidence = 65;
             reason = "HISTORY PROBABILITY";
        }
    } else {
        // Ít dữ liệu quá thì random
        prediction = (Math.random() > 0.5) ? 'P' : 'B';
        reason = "WAITING DATA...";
    }

    // 2. GHI LOG QUÁ TRÌNH PHÂN TÍCH (DELAY ĐỂ TẠO CẢM GIÁC THẬT)
    setTimeout(() => {
        addLog(`>> ANALYZING NEXT ROUND...`);
    }, 500);

    setTimeout(() => {
        addLog(`>> ALGORITHM: ${reason}`);
    }, 1000);

    setTimeout(() => {
        // Cập nhật giao diện kết quả
        adviceEl.innerText = reason;
        adviceEl.style.color = "#00ff41";
        predEl.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        predEl.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        
        let confP = (prediction==='P') ? confidence : (100-confidence);
        let confB = (prediction==='B') ? confidence : (100-confidence);
        
        document.getElementById('confP').innerText = confP+"%"; document.getElementById('barP').style.width = confP+"%";
        document.getElementById('confB').innerText = confB+"%"; document.getElementById('barB').style.width = confB+"%";

        // Ghi log kết quả dự đoán
        addLog(`>> PREDICTION: [ ${prediction} ] (RATE: ${confidence}%)`);

        // BẮT ĐẦU LẬT BÀI MÔ PHỎNG
        simulateHandReveal(prediction);
    }, 2000);
}

// --- CARD SIMULATION (LOGIC BACCARAT CHUẨN) ---
function getCardValue(card) {
    if (card.raw >= 10) return 0;
    return card.raw;
}

function calculateHandScore(hand) {
    return hand.reduce((sum, card) => sum + getCardValue(card), 0) % 10;
}

function generateFakeHand(targetWinner) {
    let attempts = 0;
    while(attempts < 5000) {
        attempts++;
        let pHand = [getCard(), getCard()];
        let bHand = [getCard(), getCard()];
        let pScore = calculateHandScore(pHand);
        let bScore = calculateHandScore(bHand);
        
        // LUẬT: Nếu 8 hoặc 9 điểm (Natural) -> Dừng luôn, không bốc
        let isNatural = (pScore >= 8 || bScore >= 8);
        
        if (!isNatural) {
            // Luật rút bài Player
            let p3 = null;
            if (pScore <= 5) {
                p3 = getCard();
                pHand.push(p3);
                pScore = calculateHandScore(pHand);
            }

            // Luật rút bài Banker
            let bDraws = false;
            if (pHand.length === 2) { 
                if (bScore <= 5) bDraws = true; 
            } else {
                let p3Val = getCardValue(p3);
                if (bScore <= 2) bDraws = true;
                else if (bScore === 3 && p3Val !== 8) bDraws = true;
                else if (bScore === 4 && [2,3,4,5,6,7].includes(p3Val)) bDraws = true;
                else if (bScore === 5 && [4,5,6,7].includes(p3Val)) bDraws = true;
                else if (bScore === 6 && [6,7].includes(p3Val)) bDraws = true;
            }
            if (bDraws) {
                bHand.push(getCard());
                bScore = calculateHandScore(bHand);
            }
        }

        let actualResult = 'T';
        if (pScore > bScore) actualResult = 'P';
        else if (bScore > pScore) actualResult = 'B';

        if (actualResult === targetWinner || targetWinner === 'T') {
            return { p: pHand, b: bHand, pScore, bScore };
        }
    }
    return { p:[getCard(), getCard()], b:[getCard(), getCard()], pScore:0, bScore:0 };
}

function simulateHandReveal(target) {
    const hand = generateFakeHand(target);
    
    document.querySelector('.p-side').classList.remove('winner-p','winner-b');
    document.querySelector('.b-side').classList.remove('winner-p','winner-b');

    // Lật bài từ từ
    setTimeout(() => revealCard('p1', hand.p[0]), 500);
    setTimeout(() => revealCard('b1', hand.b[0]), 1000);
    setTimeout(() => revealCard('p2', hand.p[1]), 1500);
    setTimeout(() => revealCard('b2', hand.b[1]), 2000);
    
    // Lật lá thứ 3
    setTimeout(() => {
        if(hand.p[2]) revealCard('p3', hand.p[2]);
        else document.getElementById('p3').style.opacity = '0.3';

        if(hand.b[2]) revealCard('b3', hand.b[2]);
        else document.getElementById('b3').style.opacity = '0.3';

        document.getElementById('playerScore').innerText = hand.pScore;
        document.getElementById('bankerScore').innerText = hand.bScore;
        
        if(hand.pScore > hand.bScore) document.querySelector('.p-side').classList.add('winner-p');
        else if(hand.bScore > hand.pScore) document.querySelector('.b-side').classList.add('winner-b');
        
        isProcessing = false;
    }, 3000);
}

// --- UI HELPER FUNCTIONS ---
function revealCard(id, card) {
    const slot = document.getElementById(id);
    slot.style.opacity = '1';
    const front = slot.querySelector('.card-front');
    let val = card.raw;
    if(val===1) val='A'; else if(val===11) val='J'; else if(val===12) val='Q'; else if(val===13) val='K';
    let suit = (card.suit==='hearts'?'♥':(card.suit==='diamonds'?'♦':(card.suit==='clubs'?'♣':'♠')));
    let color = (card.suit==='hearts' || card.suit==='diamonds') ? '#ff003c' : '#000';
    front.innerHTML = `<div style="color:${color}">${val}</div><div style="font-size:1.5rem; color:${color}">${suit}</div>`;
    slot.classList.add('flipped');
}

function resetCardsUI() {
    document.getElementById('playerScore').innerText = "?";
    document.getElementById('bankerScore').innerText = "?";
    document.querySelector('.p-side').classList.remove('winner-p','winner-b');
    document.querySelector('.b-side').classList.remove('winner-p','winner-b');
    ['p1','p2','p3','b1','b2','b3'].forEach(id => {
        const el = document.getElementById(id);
        el.className = "card-slot";
        el.style.opacity = '1';
        el.innerHTML = `<div class="card-back"></div><div class="card-front"></div>`;
    });
}

function getCard() {
    const raw = Math.floor(Math.random()*13)+1;
    return { raw, value: raw>=10?0:raw, suit: ['spades','hearts','clubs','diamonds'][Math.floor(Math.random()*4)] };
}

function addLog(msg) {
    const box = document.getElementById('systemLog');
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false }); // Định dạng 24h
    const div = document.createElement('div');
    // Style cho từng dòng log để dễ nhìn hơn
    div.style.borderBottom = "1px solid #111";
    div.style.padding = "3px 0";
    div.style.fontFamily = "monospace";
    div.style.fontSize = "0.75rem";
    
    // Màu sắc log dựa trên nội dung
    let color = "#fff";
    if(msg.includes("PLAYER")) color = "#00f3ff";
    else if(msg.includes("BANKER")) color = "#ff003c";
    else if(msg.includes("FEE")) color = "#ff9800"; // Màu cam cho tiền nong
    else if(msg.includes("ALGORITHM")) color = "#00ff41"; // Màu xanh cho thuật toán

    div.innerHTML = `<span style="color:#666">[${time}]</span> <span style="color:${color}">${msg}</span>`;
    box.appendChild(div);
    box.scrollTop = box.scrollHeight; // Tự cuộn xuống dưới
}

function generateMatrixCode() {
    const el = document.getElementById('matrixCode');
    if(el) {
        const lines = ["DECRYPTING...", "BYPASS_FIREWALL...", "CALCULATING_ODDS...", "PACKET_SNIFFING...", "inject_sql_v2..."];
        const div = document.createElement('div');
        div.innerText = "> " + lines[Math.floor(Math.random()*lines.length)] + " " + Math.random().toString(36).substring(7);
        el.appendChild(div);
        el.scrollTop = el.scrollHeight;
        if(el.children.length > 20) el.removeChild(el.firstChild);
    }
}

function startFakeTransactions() {
    const box = document.getElementById('transLog');
    const names = ["User99", "HackerVN", "ProPlayer", "Bot_AI", "Winner88"];
    setInterval(() => {
        const n = names[Math.floor(Math.random()*names.length)];
        const side = Math.random()>0.5 ? "PLAYER" : "BANKER";
        const amt = Math.floor(Math.random()*500)+100;
        const color = side==="PLAYER"?"#00f3ff":"#ff003c";
        const div = document.createElement('div');
        div.className = "trans-item";
        div.innerHTML = `<span style="color:#aaa">${n}</span><span style="color:${color}">${side}</span><span style="color:#fff">$${amt}k</span>`;
        box.prepend(div);
        if(box.children.length > 6) box.lastChild.remove();
    }, 2500);
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

// Chart Vẽ Chấm Tròn
function drawTrendChart(hist) {
    const c = document.getElementById('trendChart');
    if(!c) return;
    if(c.parentElement) { c.width = c.parentElement.clientWidth; c.height = c.parentElement.clientHeight; }
    const ctx = c.getContext('2d');
    const w = c.width, h = c.height;
    ctx.clearRect(0,0,w,h);
    const data = hist.slice(-25);
    if(data.length<2) return;
    ctx.lineWidth = 2;
    let step = w / (data.length-1);
    let y = h/2;
    let points = [];
    for(let i=0; i<data.length; i++) {
        if(data[i]==='P') y -= 15; else if(data[i]==='B') y += 15;
        if(y<10) y=10; if(y>h-10) y=h-10;
        points.push({x: i*step, y: y, res: data[i]});
    }
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for(let i=1; i<points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    ctx.strokeStyle = 'rgba(0, 255, 65, 0.5)';
    ctx.stroke();
    points.forEach(p => {
        ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2);
        if(p.res === 'P') ctx.fillStyle = '#00f3ff';
        else if(p.res === 'B') ctx.fillStyle = '#ff003c';
        else ctx.fillStyle = '#00ff41';
        ctx.fill(); ctx.stroke();
    });
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