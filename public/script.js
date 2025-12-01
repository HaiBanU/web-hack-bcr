/* =========================================
   BACCARAT HACKER ENGINE - V8 ULTIMATE
   (INTEGRATED VISUALS & LOGIC)
   ========================================= */

let currentTableId = null; 
let history = []; 
let isProcessing = false; 
const socket = io(); 

// CẤU HÌNH TIMER TRỪ TIỀN
let deductionTimer = null;
const DEDUCTION_INTERVAL = 30000; // 30 giây trừ 1 lần

// KHỞI CHẠY KHI LOAD TRANG
window.addEventListener('DOMContentLoaded', () => {
    // 1. Cập nhật Token từ LocalStorage
    const savedTokens = localStorage.getItem('tokens') || 0;
    updateTokenUI(savedTokens);

    // 2. Lấy thông tin bàn từ URL
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tableName = urlParams.get('tableName') || "UNKNOWN";
    
    // Format tên bàn cho đẹp
    tableName = decodeURIComponent(tableName);
    tableName = tableName.replace(/BÀN(\s+SỐ)?/i, "BÀN BACCARAT");
    tableName = tableName.toUpperCase();
    
    document.getElementById('tableNameDisplay').innerHTML = tableName;
    addLog(`CONNECTED: ${tableName} [SECURE SOCKET]`);
    
    // 3. Chạy các hiệu ứng nền
    setInterval(updateSystemStats, 1000);
    setInterval(generateMatrixCode, 80);
    startFakeTransactions(); // Chạy log tiền ảo

    // 4. Bắt đầu trừ tiền
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

function updateSystemStats() {
    // Hàm này giữ chỗ để update CPU/RAM ảo nếu cần sau này
}

function generateMatrixCode() {
    const chars = "0123456789ABCDEF_HACK_SYSTEM_CONNECT";
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
    div.innerHTML = `<span class="log-time">[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]</span> ${msg}`;
    box.appendChild(div);
    if (box.children.length > 50) box.removeChild(box.firstChild);
    box.scrollTop = box.scrollHeight;
}

// --- LOGIC TRỪ TIỀN (TOKEN) ---
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
    const modal = document.createElement('div');
    modal.style.cssText = `
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0,0,0,0.95); z-index: 99999;
        display: flex; justify-content: center; align-items: center;
        flex-direction: column;
    `;
    modal.innerHTML = `
        <div style="border: 2px solid #ff003c; padding: 40px; background: #000; text-align: center; max-width: 450px; box-shadow: 0 0 50px #ff003c;">
            <h1 style="color: #ff003c; font-family: 'Orbitron'; margin-bottom: 20px; font-size: 2rem;">⚠️ SYSTEM HALTED</h1>
            <p style="color: #fff; font-family: monospace; font-size: 1.1rem; margin-bottom: 30px; line-height: 1.5;">
                KẾT NỐI BỊ NGẮT DO HẾT TOKEN!<br>Vui lòng liên hệ Đại lý để nạp thêm.
            </p>
            <button onclick="window.location.href='index.html'" style="background: #ff003c; color: white; border: none; padding: 15px 30px; font-weight: bold; cursor: pointer; font-family: 'Orbitron'; font-size: 1rem;">QUAY VỀ SẢNH</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// --- CORE GAME LOGIC ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;

    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverHistoryArr = (tableData.result || "").split('');

        // Chỉ xử lý khi có kết quả mới hoặc lần đầu load
        if (serverHistoryArr.length > history.length || history.length === 0) {
            
            const realResult = serverHistoryArr[serverHistoryArr.length - 1];
            history = serverHistoryArr; 
            
            // 1. Vẽ lại Bảng Cầu (Roadmap)
            renderBigRoadGrid(history);

            // 2. Vẽ lại Biểu đồ (Chart)
            drawTrendChart(history);

            if(realResult) {
                let winText = (realResult === 'P') ? "CON" : (realResult === 'B' ? "CÁI" : "HÒA");
                addLog(`>> KẾT QUẢ THỰC TẾ: [ ${winText} ] -> Cập nhật cầu.`);
            }

            // 3. Chạy phân tích dự đoán
            analyzeAndRenderFuture(history);
        }
    }
});

// --- PHÂN TÍCH & HIỂN THỊ DỰ ĐOÁN ---
function analyzeAndRenderFuture(historyArr) {
    isProcessing = true;
    
    // Reset UI Cards
    document.querySelectorAll('.card-slot').forEach(c => { 
        c.className = "card-slot"; 
        c.innerText = ""; 
        c.classList.remove('revealed');
    });
    document.getElementById('playerScore').innerText = "0";
    document.getElementById('bankerScore').innerText = "0";
    
    // Reset Effects
    const barEl = document.querySelector('.prediction-bar');
    if(barEl) barEl.classList.remove('win-p', 'win-b');

    const textEl = document.getElementById('aiPredText');
    const adviceEl = document.getElementById('aiAdvice');

    if(textEl) {
        textEl.innerHTML = "..."; 
        textEl.className = "pred-result blink";
    }

    // Chạy thuật toán AI
    const analysis = getAdvancedAlgorithm(historyArr);
    const predictedSide = analysis.side; 
    
    // Giả lập bài (tạo ra bộ bài sẽ thắng theo dự đoán)
    const futureHand = simulateRealBaccaratHand(predictedSide);

    // Hiệu ứng chia bài (Delay từng lá)
    setTimeout(() => {
        renderSingleCard('p1', futureHand.pCards[0], 0);
        renderSingleCard('p2', futureHand.pCards[1], 150);
        renderSingleCard('b1', futureHand.bCards[0], 300);
        renderSingleCard('b2', futureHand.bCards[1], 450);

        setTimeout(() => {
            // Lá thứ 3 (nếu có)
            if(futureHand.pCards[2]) renderSingleCard('p3', futureHand.pCards[2], 0);
            if(futureHand.bCards[2]) renderSingleCard('b3', futureHand.bCards[2], 150);
            
            document.getElementById('playerScore').innerText = futureHand.pScore;
            document.getElementById('bankerScore').innerText = futureHand.bScore;

            // --- HIỂN THỊ KẾT QUẢ DỰ ĐOÁN ---
            let confidence = Math.floor(Math.random() * (98 - 75 + 1)) + 75; 
            
            if(textEl) {
                textEl.classList.remove('res-P', 'res-B', 'blink', 'pred-result');
                
                if (predictedSide === 'P') { 
                    textEl.innerHTML = "PLAYER";
                    textEl.className = "pred-result res-char-p"; 
                    if(barEl) barEl.classList.add('win-p');
                } else { 
                    textEl.innerHTML = "BANKER";
                    textEl.className = "pred-result res-char-b"; 
                    if(barEl) barEl.classList.add('win-b');
                }
            }
            
            if(adviceEl) adviceEl.innerHTML = `<span style="color:#fff;">${analysis.name} (${analysis.reason})</span>`;

            // Thanh % Thắng
            let confP = (predictedSide === 'P') ? confidence : (100 - confidence);
            let confB = (predictedSide === 'B') ? confidence : (100 - confidence);
            
            document.getElementById('confP').innerText = confP + "%"; 
            document.getElementById('barP').style.width = confP + "%";
            document.getElementById('confB').innerText = confB + "%"; 
            document.getElementById('barB').style.width = confB + "%";

            addLog(`SYSTEM: Dự đoán -> ${predictedSide} (${confidence}%)`);
            isProcessing = false;

        }, 800);
    }, 500);
}

// --- THUẬT TOÁN DỰ ĐOÁN (AI PSEUDO-LOGIC) ---
function getAdvancedAlgorithm(history) {
    if (!history || history.length < 3) {
        return { side: (Math.random()>0.5?'P':'B'), name: "AI RANDOM", reason: "Wait Data..." };
    }
    const cleanHistory = history.filter(x => x !== 'T');
    const len = cleanHistory.length;
    if (len < 3) return { side: 'B', name: "BASIC", reason: "Init..." };
    
    const last1 = cleanHistory[len - 1];
    const last2 = cleanHistory[len - 2];
    const last3 = cleanHistory[len - 3];
    
    // Logic cơ bản (Bệt, 1-1, 2-1)
    if (last1 === last2 && last2 === last3) return { side: last1, name: "DRAGON", reason: "Bệt Dài" };
    if (last1 !== last2 && last2 !== last3) return { side: (last1 === 'P' ? 'B' : 'P'), name: "PING-PONG", reason: "Cầu 1-1" };
    if (last2 === last3 && last1 !== last2) return { side: last1, name: "FOLLOW", reason: "Nuôi Tụ" };
    
    // Random nâng cao
    return (Math.random() > 0.5) 
        ? { side: 'B', name: "MATRIX AI", reason: "Lực Nến" } 
        : { side: 'P', name: "SIGNAL V8", reason: "Biểu Đồ" };
}

// --- HỆ THỐNG BÀI ẢO (CARD SIMULATION) ---
function renderSingleCard(slotId, cardData, delay) {
    setTimeout(() => {
        const el = document.getElementById(slotId);
        if(!el) return;
        
        // Reset class cũ
        el.className = "card-slot";
        void el.offsetWidth; // Trigger reflow

        // Gán class mới
        el.classList.add(cardData.suit); 
        el.classList.add('revealed');
        
        // Hiển thị ký tự (J, Q, K, A)
        let txt = cardData.raw;
        if(cardData.raw===1) txt="A"; 
        else if(cardData.raw===11) txt="J"; 
        else if(cardData.raw===12) txt="Q"; 
        else if(cardData.raw===13) txt="K";
        el.innerText = txt;
    }, delay);
}

function getCard() {
    const raw = Math.floor(Math.random() * 13) + 1;
    const value = raw >= 10 ? 0 : raw; // Baccarat: 10, J, Q, K = 0 điểm
    const suits = ['spades', 'hearts', 'clubs', 'diamonds'];
    const suit = suits[Math.floor(Math.random() * 4)];
    return { raw, value, suit };
}

function calc(cards) { 
    return cards.reduce((sum, c) => sum + c.value, 0) % 10; 
}

// Giả lập ván bài sao cho người thắng khớp với dự đoán
function simulateRealBaccaratHand(targetWinner) {
    while (true) {
        let p = [getCard(), getCard()]; 
        let b = [getCard(), getCard()];
        let pScore = calc(p); 
        let bScore = calc(b);
        let finished = false;

        // Luật Natural Win
        if (pScore >= 8 || bScore >= 8) finished = true; 
        
        if (!finished) {
            let p3 = null;
            // Luật rút bài Player
            if (pScore <= 5) { 
                p3 = getCard(); p.push(p3); pScore = calc(p); 
            }
            
            // Luật rút bài Banker (Phức tạp)
            let bDraws = false;
            if (p3 === null) { 
                if (bScore <= 5) bDraws = true; 
            } else {
                const val3 = p3.value;
                if (bScore <= 2) bDraws = true;
                else if (bScore === 3 && val3 !== 8) bDraws = true;
                else if (bScore === 4 && val3 >= 2 && val3 <= 7) bDraws = true;
                else if (bScore === 5 && val3 >= 4 && val3 <= 7) bDraws = true;
                else if (bScore === 6 && (val3 === 6 || val3 === 7)) bDraws = true;
            }

            if (bDraws) { 
                b.push(getCard()); bScore = calc(b); 
            }
        }

        let winner = pScore > bScore ? 'P' : (bScore > pScore ? 'B' : 'T');
        
        // Nếu kết quả random trùng với mục tiêu AI dự đoán thì trả về
        if (targetWinner === 'T') return { pCards: p, bCards: b, pScore, bScore }; 
        if (winner === targetWinner) return { pCards: p, bCards: b, pScore, bScore };
    }
}

// --- VẼ BẢNG CẦU (ROADMAP) ---
function renderBigRoadGrid(resultArr) {
    const gridEl = document.getElementById('bigRoadGrid');
    if(!gridEl) return;
    
    let processedData = [];
    let data = resultArr;
    
    // Chỉ lấy 150 kết quả cuối
    if(data.length > 150) data = data.slice(-150);
    
    for(let char of data) {
        if (char === 'T') { 
            // Nếu Hòa, đánh dấu vào kết quả trước đó
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; 
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    }

    // Logic Big Road (Xuống dòng khi đổi màu)
    let columns = []; 
    let currentCol = []; 
    let lastType = null;
    
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { 
            columns.push(currentCol); 
            currentCol = []; 
        }
        currentCol.push(item); 
        lastType = item.type;
        
        // Nếu cột đầy (6 ô) -> Sang cột mới (đơn giản hóa)
        if(currentCol.length >= 6) { 
            columns.push(currentCol); 
            currentCol = []; 
            lastType = null; 
        }
    });
    if (currentCol.length > 0) columns.push(currentCol);
    
    // Fill thêm cột trống cho đẹp
    while(columns.length < 30) { columns.push([]); }
    
    // Render HTML
    let html = '';
    let displayCols = columns; 
    if(displayCols.length > 60) displayCols = displayCols.slice(-60); // Max hiển thị

    displayCols.forEach(col => {
        html += '<div class="tool-road-col">'; 
        for (let r = 0; r < 6; r++) { 
            let cellContent = '';
            let node = col[r];
            if (node) {
                let colorClass = (node.type === 'P') ? 'tool-p' : 'tool-b';
                let tieClass = node.hasTie ? 'tie-slash' : '';
                cellContent = `<div class="tool-bead ${colorClass} ${tieClass}"></div>`;
            }
            html += `<div class="tool-road-cell">${cellContent}</div>`;
        }
        html += '</div>'; 
    });
    
    gridEl.innerHTML = html;
    // Tự động cuộn sang phải
    setTimeout(() => { gridEl.scrollLeft = gridEl.scrollWidth; }, 50);
}

// --- VẼ BIỂU ĐỒ (CHART - V8 STYLE) ---
function drawTrendChart(historyArr) {
    const canvas = document.getElementById('trendChart');
    if (!canvas) return;
    
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width;
    canvas.height = rect.height;
    
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;
    
    ctx.clearRect(0, 0, w, h);

    let data = historyArr.slice(-30); 
    if(data.length < 2) return;

    let points = [];
    let currentVal = h / 2;
    let stepX = w / data.length; 
    const amplitude = 12; 

    data.forEach((char, index) => {
        if (char === 'B') currentVal -= amplitude; 
        else if (char === 'P') currentVal += amplitude; 
        
        if (currentVal < 20) currentVal = 20;
        if (currentVal > h - 20) currentVal = h - 20;
        
        points.push({ x: (index * stepX) + (stepX/2), y: currentVal, type: char });
    });

    // Vẽ đường nối neon mờ
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
        const xc = (points[i].x + points[i - 1].x) / 2;
        const yc = (points[i].y + points[i - 1].y) / 2;
        ctx.quadraticCurveTo(points[i - 1].x, points[i - 1].y, xc, yc);
    }
    ctx.lineTo(points[points.length-1].x, points[points.length-1].y);
    ctx.lineWidth = 2;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
    ctx.stroke();

    // Vẽ các chấm tròn
    points.forEach(p => {
        ctx.beginPath();
        ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
        
        if (p.type === 'P') {
            ctx.fillStyle = '#00f3ff';
            ctx.shadowColor = '#00f3ff';
        } else if (p.type === 'B') {
            ctx.fillStyle = '#ff003c';
            ctx.shadowColor = '#ff003c';
        } else {
            ctx.fillStyle = '#00ff41';
            ctx.shadowColor = '#00ff41';
        }
        ctx.shadowBlur = 8;
        ctx.fill();
        ctx.shadowBlur = 0;
    });
}

// --- GIẢ LẬP GIAO DỊCH (FAKE TRANSACTION) ---
function startFakeTransactions() {
    const box = document.getElementById('transLog');
    if(!box) return;

    const names = ["User99**", "VipPro", "HackerVN", "Bot_AI", "Master88", "Dragon9", "Ghost_X", "SystemV8", "Admin_01"];
    
    setInterval(() => {
        const name = names[Math.floor(Math.random() * names.length)];
        const side = Math.random() > 0.5 ? 'P' : 'B';
        const amt = Math.floor(Math.random() * 500) + 10; // 10k - 500k
        
        const div = document.createElement('div');
        div.className = 'trans-item';
        div.innerHTML = `
            <span style="color:#888">${name}</span>
            <span class="${side === 'P' ? 'trans-p' : 'trans-b'}">
                ${side === 'P' ? 'PLAYER' : 'BANKER'}
            </span>
            <span class="trans-amt">$${amt}k</span>
        `;
        
        box.appendChild(div);
        if(box.children.length > 8) box.removeChild(box.firstChild);
    }, 1200);
}