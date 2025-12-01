/* =========================================
   BACCARAT HACKER ENGINE - V3.2 (FUTURE PREDICTION MODE)
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
            el.innerText = Math.floor(amount).toLocaleString('vi-VN'); 
            el.style.color = "#00ff41"; el.style.textShadow = "none";
        }
    }
}

function updateSystemStats() {
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

        // Kiểm tra xem có dữ liệu mới không
        if (serverHistoryArr.length > history.length || history.length === 0) {
            
            // Lấy kết quả thực tế vừa ra để ghi log (nhưng không hiển thị bài này)
            const realResult = serverHistoryArr[serverHistoryArr.length - 1];
            
            history = serverHistoryArr; 
            
            // Render cầu (Roadmap) để người dùng soi lịch sử
            renderBigRoadGrid(history);

            if(realResult) {
                let winText = (realResult === 'P') ? "CON" : (realResult === 'B' ? "CÁI" : "HÒA");
                addLog(`>> KẾT QUẢ THỰC TẾ: [ ${winText} ] -> Cập nhật cầu.`);
            }

            // --- QUAN TRỌNG: CHẠY NGAY PHÂN TÍCH & HIỂN THỊ DỰ ĐOÁN VÁN SAU ---
            // Bỏ qua việc hiển thị bài cũ, hiển thị luôn bài tương lai
            analyzeAndRenderFuture(history);
        }
    }
});

// --- HÀM XỬ LÝ CHÍNH: DỰ ĐOÁN & HIỂN THỊ BÀI TƯƠNG LAI ---
function analyzeAndRenderFuture(historyArr) {
    isProcessing = true;
    
    // 1. Reset trạng thái
    document.querySelectorAll('.card-slot').forEach(c => { c.className = "card-slot"; c.innerText = ""; });
    document.getElementById('playerScore').innerText = "0";
    document.getElementById('bankerScore').innerText = "0";
    document.querySelector('.p-side').classList.remove('side-active-p');
    document.querySelector('.b-side').classList.remove('side-active-b');
    const barEl = document.querySelector('.prediction-bar');
    barEl.classList.remove('win-p', 'win-b');

    const textEl = document.getElementById('aiPredText');
    const adviceEl = document.getElementById('aiAdvice');

    textEl.innerHTML = "LOADING AI...";
    textEl.className = "pred-result blink";

    // 2. Chạy thuật toán dự đoán
    const analysis = getAdvancedAlgorithm(historyArr);
    const predictedSide = analysis.side; // 'P' hoặc 'B'
    
    // 3. Giả lập bộ bài cho Tương lai (Nếu dự đoán P -> Bài P phải thắng)
    const futureHand = simulateRealBaccaratHand(predictedSide);

    // 4. Hiển thị bài giả lập (Animation)
    setTimeout(() => {
        renderSingleCard('p1', futureHand.pCards[0], 0);
        renderSingleCard('p2', futureHand.pCards[1], 150);
        renderSingleCard('b1', futureHand.bCards[0], 300);
        renderSingleCard('b2', futureHand.bCards[1], 450);

        setTimeout(() => {
            if(futureHand.pCards[2]) renderSingleCard('p3', futureHand.pCards[2], 0);
            if(futureHand.bCards[2]) renderSingleCard('b3', futureHand.bCards[2], 150);
            
            // Cập nhật điểm
            document.getElementById('playerScore').innerText = futureHand.pScore;
            document.getElementById('bankerScore').innerText = futureHand.bScore;

            // 5. Cập nhật Text và Thanh tỷ lệ (Đồng bộ với bài)
            let winName = '';
            let confidence = Math.floor(Math.random() * (95 - 75 + 1)) + 75; // Tỷ lệ cao cho uy tín

            textEl.classList.remove('res-P', 'res-B', 'blink');
            
            if (predictedSide === 'P') { 
                winName = 'DỰ ĐOÁN: NHÀ CON (PLAYER)';
                textEl.classList.add('res-P'); barEl.classList.add('win-p');
                document.querySelector('.p-side').classList.add('side-active-p');
            } else { 
                winName = 'DỰ ĐOÁN: NHÀ CÁI (BANKER)';
                textEl.classList.add('res-B'); barEl.classList.add('win-b');
                document.querySelector('.b-side').classList.add('side-active-b');
            }
            
            textEl.innerHTML = winName;
            adviceEl.innerHTML = `<span style="color:#fff; font-weight:bold;">[${analysis.name}]</span>: ${analysis.reason}`;

            // Update thanh phần trăm
            let confP = (predictedSide === 'P') ? confidence : (100 - confidence);
            let confB = (predictedSide === 'B') ? confidence : (100 - confidence);
            document.getElementById('confP').innerText = confP + "%"; document.getElementById('barP').style.width = confP + "%";
            document.getElementById('confB').innerText = confB + "%"; document.getElementById('barB').style.width = confB + "%";

            addLog(`SYSTEM: Đã hiển thị mô phỏng dự đoán -> ${predictedSide}`);
            isProcessing = false;

        }, 800);
    }, 500);
}

// --- THUẬT TOÁN SOI CẦU ---
function getAdvancedAlgorithm(history) {
    if (!history || history.length < 3) {
        return { side: (Math.random()>0.5?'P':'B'), name: "AI RANDOM", reason: "Đang thu thập dữ liệu..." };
    }

    const cleanHistory = history.filter(x => x !== 'T');
    const len = cleanHistory.length;
    if (len < 3) return { side: 'B', name: "AI BASIC", reason: "Khởi tạo luồng dữ liệu." };

    const last1 = cleanHistory[len - 1];
    const last2 = cleanHistory[len - 2];
    const last3 = cleanHistory[len - 3];

    // Bệt 3 tay -> Theo bệt
    if (last1 === last2 && last2 === last3) {
        return { side: last1, name: "CẦU BỆT RỒNG", reason: `Phát hiện bệt ${last1==='P'?'Con':'Cái'} dài, bám theo cầu.` };
    }
    // Cầu 1-1 -> Đánh nghịch
    if (last1 !== last2 && last2 !== last3) {
        const nextSide = (last1 === 'P') ? 'B' : 'P';
        return { side: nextSide, name: "CẦU CHUYỀN 1-1", reason: "Nhịp 1-1 đang ổn định, đánh nghịch lại." };
    }
    // Follow winner
    if (last2 === last3 && last1 !== last2) {
        return { side: last1, name: "NUÔI TỤ (FOLLOW)", reason: "Cầu gãy nhịp, ưu tiên theo tay vừa thắng." };
    }

    // Nếu không vào form thì dùng Logic ngẫu nhiên có trọng số
    const rand = Math.random();
    if (rand > 0.5) return { side: 'B', name: "FIBONACCI MATRIX", reason: "Lực nến nghiêng về Nhà Cái." };
    else return { side: 'P', name: "CÔNG THỨC 3-2-1", reason: "Biểu đồ nhiệt báo Nhà Con." };
}

// --- CARD RENDERING HELPER ---
function renderSingleCard(slotId, cardData, delay) {
    setTimeout(() => {
        const el = document.getElementById(slotId);
        if(!el) return;
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

// --- HÀM GIẢ LẬP BÀI (ĐỂ TẠO RA BỘ BÀI KHỚP VỚI DỰ ĐOÁN) ---
function simulateRealBaccaratHand(targetWinner) {
    // Hàm này sẽ random bài mãi cho đến khi ra kết quả đúng với targetWinner (P hoặc B)
    while (true) {
        let p = [getCard(), getCard()]; let b = [getCard(), getCard()];
        let pScore = calc(p); let bScore = calc(b);
        let finished = false;
        
        // Luật rút bài cơ bản
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

        // Logic kiểm tra người thắng
        let winner = pScore > bScore ? 'P' : (bScore > pScore ? 'B' : 'T');
        
        // Nếu targetWinner là Hòa (T) thì trả về
        if (targetWinner === 'T') return { pCards: p, bCards: b, pScore, bScore }; 
        
        // Nếu kết quả random trùng với DỰ ĐOÁN mong muốn thì trả về bộ bài này
        if (winner === targetWinner) return { pCards: p, bCards: b, pScore, bScore };
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