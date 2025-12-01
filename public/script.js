/* =========================================
   BACCARAT HACKER ENGINE - V3.0 PRO
   ========================================= */

let currentTableId = null; 
let history = []; 
let isProcessing = false; 
const socket = io(); 

// TIMER CONFIG
let deductionTimer = null;
const DEDUCTION_INTERVAL = 30000; // 30 giây trừ tiền 1 lần

window.addEventListener('DOMContentLoaded', () => {
    // 1. Cập nhật Token
    const savedTokens = localStorage.getItem('tokens') || 0;
    updateTokenUI(savedTokens);

    // 2. Lấy thông tin bàn
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tableName = urlParams.get('tableName') || "UNKNOWN";
    
    tableName = decodeURIComponent(tableName);
    tableName = tableName.replace(/BÀN(\s+SỐ)?/i, "BÀN BACCARAT");
    tableName = tableName.toUpperCase();
    
    document.getElementById('tableNameDisplay').innerHTML = tableName;
    addLog(`CONNECTED: ${tableName} [SECURE SOCKET]`);
    
    // 3. Hiệu ứng nền
    setInterval(updateSystemStats, 1000);
    setInterval(generateMatrixCode, 80);

    // 4. Trừ tiền
    startTokenDeduction();
});

// --- UI HELPERS ---
function updateTokenUI(amount) {
    const el = document.getElementById('liveTokenDisplay');
    if(el) {
        if(amount === 'VIP' || amount === 'unlimited') {
            el.innerText = "VIP"; el.style.color = "#ff003c"; el.style.textShadow = "0 0 10px #ff003c";
        } else {
            el.innerText = amount; el.style.color = "#00ff41"; el.style.textShadow = "none";
        }
    }
}

function updateSystemStats() {
    // Giả lập thông số CPU nhảy nhảy cho nguy hiểm
    const el = document.getElementById('cpuVal');
    if(el) el.innerText = Math.floor(Math.random() * 30) + 10;
}

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
    const div = document.createElement('div');
    div.className = "log-line";
    const now = new Date();
    div.innerHTML = `<span class="log-time">[${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}:${String(now.getSeconds()).padStart(2,'0')}]</span> ${msg}`;
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
                if(data.remaining !== 'VIP') {
                    // addLog(`SYSTEM: Phí duy trì -3 Token. Còn lại: ${data.remaining}`);
                }
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
                KẾT NỐI BỊ NGẮT DO HẾT TOKEN!<br>Vui lòng liên hệ Đại lý.
            </p>
            <button onclick="window.location.href='index.html'" style="background: #ff003c; color: white; border: none; padding: 15px 30px; font-weight: bold; cursor: pointer; font-family: 'Orbitron'; font-size: 1rem;">QUAY VỀ SẢNH</button>
        </div>
    `;
    document.body.appendChild(modal);
}

// --- GAME LOGIC ---
socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;

    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverHistoryArr = (tableData.result || "").split('');

        // 1. CÓ KẾT QUẢ MỚI
        if (serverHistoryArr.length > history.length) {
            const newResult = serverHistoryArr[serverHistoryArr.length - 1];
            history = serverHistoryArr; 
            processNewResult(newResult);
        }
        // 2. BÀN BỊ RESET HOẶC MỚI VÀO
        else if (serverHistoryArr.length < history.length || history.length === 0) {
            history = serverHistoryArr;
            renderBigRoadGrid(history);
            
            // Nếu mới vào, chạy phân tích ngay cho ván tiếp theo
            if(history.length > 0) {
                analyzeNextTurn(history);
            }
        }
    }
});

function processNewResult(winner) {
    isProcessing = true; 
    renderBigRoadGrid(history);
    addLog(">> NHẬN TÍN HIỆU GÓI TIN MỚI...");
    
    // Clear effects
    document.querySelector('.p-side').classList.remove('side-active-p');
    document.querySelector('.b-side').classList.remove('side-active-b');
    const bar = document.querySelector('.prediction-bar');
    if(bar) bar.classList.remove('win-p', 'win-b');
    
    const hand = simulateRealBaccaratHand(winner);
    
    // Reset bài
    document.querySelectorAll('.card-slot').forEach(c => { c.className = "card-slot"; c.innerText = ""; });
    document.getElementById('playerScore').innerText = "0";
    document.getElementById('bankerScore').innerText = "0";

    // Mở bài animation
    renderSingleCard('p1', hand.pCards[0], 0);
    renderSingleCard('p2', hand.pCards[1], 200);
    renderSingleCard('b1', hand.bCards[0], 400);
    renderSingleCard('b2', hand.bCards[1], 600);

    setTimeout(() => {
        if(hand.pCards[2]) renderSingleCard('p3', hand.pCards[2], 0);
        if(hand.bCards[2]) renderSingleCard('b3', hand.bCards[2], 200);
        
        document.getElementById('playerScore').innerText = hand.pScore;
        document.getElementById('bankerScore').innerText = hand.bScore;
        
        let winText = (hand.pScore > hand.bScore) ? "NHÀ CON THẮNG" : (hand.bScore > hand.pScore ? "NHÀ CÁI THẮNG" : "HÒA");
        addLog(`>> KẾT QUẢ: [ ${winText} ]`);

        setTimeout(() => {
            // SAU KHI CÓ KẾT QUẢ -> CHẠY PHÂN TÍCH VÁN TIẾP THEO
            analyzeNextTurn(history);
            isProcessing = false;
        }, 1000);
    }, 1200);
}

// --- THUẬT TOÁN SOI CẦU & DỰ ĐOÁN (MỚI) ---
function analyzeNextTurn(historyArr) {
    const textEl = document.getElementById('aiPredText');
    const adviceEl = document.getElementById('aiAdvice');
    const barEl = document.querySelector('.prediction-bar');
    const pContainer = document.querySelector('.p-side');
    const bContainer = document.querySelector('.b-side');

    textEl.innerHTML = 'ANALYZING...';
    textEl.className = "pred-result blink";

    setTimeout(() => {
        // 1. Phân tích cầu từ lịch sử
        const analysis = getAdvancedAlgorithm(historyArr);
        const prediction = analysis.side; // 'P' hoặc 'B'
        const algoName = analysis.name;
        const reason = analysis.reason;

        // 2. Tính tỷ lệ thắng (70% - 90%)
        let confidence = Math.floor(Math.random() * (90 - 70 + 1)) + 70;
        
        // 3. Hiển thị UI
        let winName = '';
        barEl.classList.remove('win-p', 'win-b');
        textEl.classList.remove('res-P', 'res-B', 'blink');
        pContainer.classList.remove('side-active-p');
        bContainer.classList.remove('side-active-b');

        if (prediction === 'P') { 
            winName = 'NHÀ CON (PLAYER)';
            textEl.classList.add('res-P'); barEl.classList.add('win-p');
            pContainer.classList.add('side-active-p');
        } else { 
            winName = 'NHÀ CÁI (BANKER)';
            textEl.classList.add('res-B'); barEl.classList.add('win-b');
            bContainer.classList.add('side-active-b');
        }
        
        textEl.innerHTML = winName;
        adviceEl.innerHTML = `<span style="color:#fff; font-weight:bold;">[${algoName}]</span>: ${reason}`;
        
        // Update thanh phần trăm
        let confP = (prediction === 'P') ? confidence : (100 - confidence);
        let confB = (prediction === 'B') ? confidence : (100 - confidence);
        
        document.getElementById('confP').innerText = confP + "%"; document.getElementById('barP').style.width = confP + "%";
        document.getElementById('confB').innerText = confB + "%"; document.getElementById('barB').style.width = confB + "%";
        
        addLog(`DỰ ĐOÁN VÁN SAU: ${winName} - Tỷ lệ: ${confidence}%`);
    }, 500);
}

// --- LOGIC THUẬT TOÁN BACCARAT ---
function getAdvancedAlgorithm(history) {
    if (!history || history.length < 3) {
        return { side: (Math.random()>0.5?'P':'B'), name: "KHỞI TẠO AI", reason: "Dữ liệu chưa đủ, chạy ngẫu nhiên." };
    }

    // Lọc bỏ Hòa (T) để soi cầu chính xác hơn
    const cleanHistory = history.filter(x => x !== 'T');
    const len = cleanHistory.length;
    if (len < 3) return { side: 'B', name: "AI BASIC", reason: "Ưu tiên Nhà Cái khi cầu mới." };

    const last1 = cleanHistory[len - 1];
    const last2 = cleanHistory[len - 2];
    const last3 = cleanHistory[len - 3];

    // 1. THUẬT TOÁN: CẦU BỆT (STREAK)
    // Nếu ra 3 ván giống nhau liên tiếp -> Đánh theo tiếp
    if (last1 === last2 && last2 === last3) {
        return { 
            side: last1, 
            name: "CẦU BỆT RỒNG", 
            reason: `Phát hiện bệt ${last1==='P'?'Con':'Cái'} dài, bám theo cầu.` 
        };
    }

    // 2. THUẬT TOÁN: CẦU 1-1 (PING PONG)
    // P - B - P -> Đánh B
    if (last1 !== last2 && last2 !== last3) {
        const nextSide = (last1 === 'P') ? 'B' : 'P';
        return { 
            side: nextSide, 
            name: "CẦU CHUYỀN 1-1", 
            reason: "Nhịp 1-1 đang ổn định, đánh nghịch lại." 
        };
    }

    // 3. THUẬT TOÁN: BẺ CẦU 2-1 (1-2)
    // Ví dụ: B - B - P -> Khả năng về lại B (Cầu 2-1-2) hoặc P (Cầu 2-2)
    // Ở đây ta dùng chiến thuật "Nuôi Tụ" (Follow winner)
    if (last2 === last3 && last1 !== last2) {
        return { 
            side: last1, 
            name: "NUÔI TỤ (FOLLOW)", 
            reason: "Cầu gãy nhịp, ưu tiên theo tay vừa thắng." 
        };
    }

    // 4. THUẬT TOÁN: LỰC NẾN (GIẢ LẬP)
    // Nếu không vào các thế bài trên, dùng Logic Fibonacci giả lập
    const rand = Math.random();
    if (rand > 0.5) {
        return { side: 'B', name: "FIBONACCI MATRIX", reason: "Lực nến nghiêng về Nhà Cái." };
    } else {
        return { side: 'P', name: "CÔNG THỨC 3-2-1", reason: "Biểu đồ nhiệt báo Nhà Con." };
    }
}

// --- CARD RENDERING HELPER ---
function renderSingleCard(slotId, cardData, delay) {
    setTimeout(() => {
        const el = document.getElementById(slotId);
        el.className = 'card-slot'; 
        void el.offsetWidth; 
        el.className = `card-slot revealed ${cardData.suit}`; 
        
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
    while (true) {
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
        if (pScore === bScore && targetWinner !== 'T') continue; 
        let winner = pScore > bScore ? 'P' : (bScore > pScore ? 'B' : 'T');
        if (targetWinner === 'T') return { pCards: p, bCards: b, pScore, bScore }; 
        else if (winner === targetWinner) return { pCards: p, bCards: b, pScore, bScore };
    }
}

// --- BIG ROAD GRID ---
function renderBigRoadGrid(resultArr) {
    const gridEl = document.getElementById('bigRoadGrid');
    if(!gridEl) return;
    
    let processedData = [];
    let data = resultArr;
    if(data.length > 150) data = data.slice(-150);

    for(let char of data) {
        if (char === 'T') {
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true;
        } else {
            processedData.push({ type: char, hasTie: false });
        }
    }

    let columns = []; let currentCol = []; let lastType = null;
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) {
            columns.push(currentCol); currentCol = [];
        }
        currentCol.push(item); lastType = item.type;
        if(currentCol.length >= 6) {
             columns.push(currentCol); currentCol = []; lastType = null;
        }
    });
    if (currentCol.length > 0) columns.push(currentCol);
    while(columns.length < 30) { columns.push([]); }

    let html = '';
    let displayCols = columns; 
    if(displayCols.length > 60) displayCols = displayCols.slice(-60);

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
    setTimeout(() => { gridEl.scrollLeft = gridEl.scrollWidth; }, 50);
}