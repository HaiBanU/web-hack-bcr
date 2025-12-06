// --- START OF FULLY UPDATED script.js (V12 - SESSION HISTORY STORAGE) ---

let currentTableId = null;
let history = [];
let isProcessing = false;
let tokenInterval = null;
const socket = io();

let lastPrediction = null; 
let predictionHistoryLog = []; 
let chartHistory = []; 

// Biến cờ để đảm bảo lịch sử ban đầu chỉ được tạo một lần duy nhất
let isInitialHistoryGenerated = false;


function generateSessionId(roundNumber) {
    const now = new Date();
    const day = String(now.getDate()).padStart(2, '0');
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const paddedTableId = String(currentTableId).padStart(2, '0');
    return `#${day}${month}${paddedTableId}${roundNumber}`;
}

// ==================================================================
// === LOGIC TẠO LỊCH SỬ FAKE (ĐÃ SỬA ĐỔI ĐỂ LƯU TRỮ PHIÊN)      ===
// ==================================================================
function generateAndRenderInitialHistory(realHistory) {
    // TẠO KEY LƯU TRỮ RIÊNG CHO TỪNG BÀN
    const storageKey = `predictionHistory_${currentTableId}`;
    const savedHistory = sessionStorage.getItem(storageKey);

    // NẾU ĐÃ CÓ LỊCH SỬ ĐƯỢC LƯU, TẢI LẠI NÓ VÀ KHÔNG LÀM GÌ THÊM
    if (savedHistory) {
        predictionHistoryLog = JSON.parse(savedHistory);
        // Chuyển đổi chuỗi thời gian về lại đối tượng Date
        predictionHistoryLog.forEach(entry => {
            entry.time = new Date(entry.time);
        });
        renderPredictionHistory();
        return; // Dừng hàm tại đây
    }

    // NẾU CHƯA CÓ, TIẾN HÀNH TẠO LỊCH SỬ GIẢ NHƯ CŨ
    predictionHistoryLog = []; // Xóa log cũ
    const historyToProcess = realHistory.slice(-30);
    const opponent = (side) => (side === 'P' ? 'B' : 'P');
    
    const targetWinRate = (Math.floor(Math.random() * 11) + 60) / 100;
    
    let tempLog = [];
    const startingRound = realHistory.length - historyToProcess.length + 1;

    historyToProcess.forEach((result, index) => {
        let fakePrediction;
        let outcome;
        if (result === 'T') {
            outcome = 'tie';
            fakePrediction = Math.random() > 0.5 ? 'P' : 'B';
        } else {
            if (Math.random() < targetWinRate) {
                outcome = 'win';
                fakePrediction = result;
            } else {
                outcome = 'loss';
                fakePrediction = opponent(result);
            }
        }
        
        const roundNumber = startingRound + index;
        tempLog.push({ 
            prediction: fakePrediction, 
            result: result, 
            outcome: outcome,
            session: generateSessionId(roundNumber)
        });
    });

    let currentTime = new Date();
    for (let i = tempLog.length - 1; i >= 0; i--) {
        let entry = tempLog[i];
        entry.time = new Date(currentTime.getTime()); 
        currentTime.setSeconds(currentTime.getSeconds() - (Math.floor(Math.random() * 46) + 45));
    }
    
    predictionHistoryLog = tempLog.reverse();

    // LƯU LỊCH SỬ VỪA TẠO VÀO sessionStorage
    sessionStorage.setItem(storageKey, JSON.stringify(predictionHistoryLog));
    
    renderPredictionHistory();
}

window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "BÀN KHÔNG XÁC ĐỊNH");
    if (!tName.includes("BACCARAT")) tName = tName.replace("BÀN", "BÀN BACCARAT");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();
    
    async function initializeTool() {
        initCardRain();
        updateTokenUI(localStorage.getItem('tokens') || 0);
        
        renderPredictionHistory();

        addLog(`HỆ THỐNG ĐÃ KẾT NỐI: ${tName}`);
        addLog(`>> KẾT NỐI MÁY CHỦ... [OK]`);
        deductToken('entry');
        startPeriodicDeduction();
        setInterval(generateMatrixCode, 100); 
    }

    await initializeTool();
    
    const returnBtn = document.getElementById('returnToLobbyBtn');
    if (returnBtn) {
        returnBtn.onclick = () => {
            window.location.href = 'index.html';
        };
    }
});

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
            if (type === 'entry') addLog(`>> PHÍ VÀO BÀN: -5 TOKENS`);
            else addLog(`>> PHÍ DUY TRÌ: -5 TOKENS`);
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

socket.on('server_update', (allTables) => {
    if (isProcessing || !currentTableId) return;
    const tableData = allTables.find(t => t.table_id == currentTableId);
    
    if (tableData) {
        const serverRes = (tableData.result || "").split('');
        const newLength = serverRes.length;
        const oldLength = history.length;

        if (oldLength > 10 && newLength < 5) {
            const modal = document.getElementById('resetModalOverlay');
            if (modal) modal.style.display = 'flex';
            if (tokenInterval) clearInterval(tokenInterval);
            return;
        }

        if (!isInitialHistoryGenerated && serverRes.length > 0) {
            generateAndRenderInitialHistory(serverRes);
            isInitialHistoryGenerated = true;
        }

        if (newLength > oldLength && isInitialHistoryGenerated) {
            if (lastPrediction && history.length > 0) {
                const newResult = serverRes[serverRes.length - 1];
                updatePredictionHistory(lastPrediction.side, newResult);

                if (newResult === 'T') {
                    chartHistory.push({ type: 'tie' });
                } else {
                    const outcome = (newResult === lastPrediction.side) ? 'win' : 'loss';
                    chartHistory.push({ type: outcome });
                }
            }
        }
        
        if (newLength > oldLength || oldLength === 0) {
            history = serverRes;
            updateGameStats(history);
            renderBigRoadGrid(history);
            renderBeadPlate(history);

            if (history.length > 0) {
                const lastWin = history[history.length - 1];
                if (oldLength > 0) { 
                    addLog(`-------------------------------`);
                    addLog(`>> KẾT QUẢ VỪA RA: [ ${lastWin} ]`);
                }
                runPredictionSystem(history);
            }
        }
    }
});


function runPredictionSystem(historyArr) {
    isProcessing = true;
    
    const ui = {
        advice: document.getElementById('aiAdvice'),
        pred: document.getElementById('aiPredText'),
        gaugeValue: document.getElementById('gaugeValue'),
        gaugeContainer: document.getElementById('predGauge'),
        gaugeFill: document.getElementById('gaugeFill')
    };
    
    const circumference = 2 * Math.PI * 54;

    ui.advice.innerText = "PHÂN TÍCH MA TRẬN...";
    ui.pred.innerText = "ĐANG CHỜ";
    ui.pred.className = "pred-result res-wait";
    
    ui.gaugeValue.innerHTML = `0<span class="percent-sign">%</span>`;
    ui.gaugeContainer.classList.remove('gauge-player', 'gauge-banker');
    ui.gaugeFill.style.transition = 'none';
    ui.gaugeFill.style.strokeDashoffset = circumference;

    const cleanHist = historyArr.filter(x => x !== 'T');
    const len = cleanHist.length;
    let prediction = null, confidence = 70;

    if (len > 3) {
        const last1 = cleanHist[len - 1], last2 = cleanHist[len - 2], last3 = cleanHist[len - 3], last4 = cleanHist[len - 4];
        const opponent = (side) => (side === 'P' ? 'B' : 'P');
        let streak = 0;
        for (let i = len - 1; i >= 0; i--) { if (cleanHist[i] === last1) streak++; else break; }

        if (streak >= 8) { prediction = opponent(last1); confidence = 98; }
        else if (streak >= 3 && streak < 8) { prediction = last1; confidence = 85 + (streak * 2); }
        else if (len >= 4 && last1 === last2 && last3 === last4 && last1 !== last3) { prediction = last1; confidence = 92; }
        else if (len >= 6 && last1===last2 && last2==last3 && last4===cleanHist[len-5] && cleanHist[len-5]==cleanHist[len-6] && last1 !== last4) { prediction = last1; confidence = 94; }
        else if (len >= 3 && last1 !== last2 && last2 === last3) { prediction = last1; confidence = 88; }
        else if (len >= 3 && last1 === last2 && last1 !== last3) { prediction = last3; confidence = 90; }
        else if (len >= 4 && last1 !== last2 && last2 === last3 && last3 === last4) { prediction = last1; confidence = 89; }
        else if (len >= 4 && last1 === last2 && last2 === last3 && last1 !== last4) { prediction = last4; confidence = 91; }
        else if (len >= 4 && last1 !== last2 && last2 !== last3 && last3 !== last4) { prediction = opponent(last1); confidence = 93; }
        else { prediction = last1; confidence = 78; }
    } 
    
    if (!prediction) {
        if (len > 0) prediction = cleanHist[len - 1]; else prediction = 'B';
        confidence = 75;
    }

    setTimeout(() => { addLog(`>> PHÂN TÍCH VÁN TIẾP THEO...`); }, 500);
    setTimeout(() => {
        ui.advice.innerText = "DỰ ĐOÁN VÁN TIẾP THEO";
        ui.advice.classList.remove("typing-effect");
        void ui.advice.offsetWidth; 
        ui.advice.classList.add("typing-effect");

        ui.pred.innerText = (prediction === 'P') ? "PLAYER" : "BANKER";
        ui.pred.className = (prediction === 'P') ? "pred-result res-p" : "pred-result res-b";
        
        if (prediction === 'P') {
            ui.gaugeContainer.classList.add('gauge-player');
        } else {
            ui.gaugeContainer.classList.add('gauge-banker');
        }

        const offset = circumference - (confidence / 100) * circumference;
        ui.gaugeFill.style.transition = 'stroke-dashoffset 1s cubic-bezier(0.25, 1, 0.5, 1)';
        ui.gaugeFill.style.strokeDashoffset = offset;
        
        let start = 0;
        const end = confidence;
        const duration = 1000;
        const stepTime = Math.max(1, Math.floor(duration / (end || 1)));
        
        let timer = setInterval(() => {
            start += 1;
            ui.gaugeValue.innerHTML = `${start}<span class="percent-sign">%</span>`;
            if (start >= end) {
                clearInterval(timer);
                ui.gaugeValue.innerHTML = `${end}<span class="percent-sign">%</span>`;
            }
        }, stepTime);
        
        addLog(`>> DỰ ĐOÁN: [ ${prediction} ] (TỶ LỆ: ${confidence}%)`);
        lastPrediction = { side: prediction };
        
        if (window.AppInventor) {
            var tenBan = document.getElementById('tableNameDisplay').innerText;
            var dataGuiDi = tenBan + "|" + prediction + "|" + confidence + "%";
            window.AppInventor.setWebViewString(dataGuiDi);
        }
        displayScorePredictions(prediction);
    }, 1500);
}


function generateScoreProbabilities(side, predictedWinner, scenario) {
    let baseProbs = [7, 7, 8, 8, 9, 9, 10, 10, 9, 8]; 

    switch(scenario.type) {
        case 'HIGH_VS_LOW':
            if (side === predictedWinner) {
                baseProbs[7] *= 1.6; baseProbs[8] *= 2.2; baseProbs[9] *= 2.0;
            } else {
                baseProbs[0] *= 1.8; baseProbs[1] *= 1.6; baseProbs[2] *= 1.4;
                baseProbs[8] *= 0.5; baseProbs[9] *= 0.4;
            }
            break;
        case 'CLOSE_GAME':
            baseProbs[4] *= 1.5; baseProbs[5] *= 1.8; baseProbs[6] *= 2.0; baseProbs[7] *= 1.8;
            if (side === predictedWinner) {
                baseProbs[6] *= 1.2; baseProbs[7] *= 1.2;
            } else {
                baseProbs[4] *= 1.1; baseProbs[5] *= 1.1;
            }
            break;
        case 'LOW_WIN':
            baseProbs[0] *= 1.5; baseProbs[1] *= 1.8; baseProbs[2] *= 2.0;
            baseProbs[3] *= 1.8; baseProbs[4] *= 1.5;
            if (side === predictedWinner) {
                baseProbs[2] *= 1.1; baseProbs[3] *= 1.2; baseProbs[4] *= 1.3;
            } else {
                baseProbs[0] *= 1.3; baseProbs[1] *= 1.2;
            }
            baseProbs[8] *= 0.3; baseProbs[9] *= 0.2;
            break;
    }
    baseProbs = baseProbs.map(p => Math.max(0, p + (Math.random() - 0.5) * 3));
    const total = baseProbs.reduce((a, b) => a + b, 0);
    if (total === 0) return Array(10).fill(10).map((prob, score) => ({ score, prob })); 
    let probabilities = baseProbs.map(p => (p / total) * 100);
    const MAX_PROB = 40;
    let excess = 0;
    probabilities = probabilities.map(p => {
        if (p > MAX_PROB) {
            excess += p - MAX_PROB;
            return MAX_PROB;
        }
        return p;
    });
    if (excess > 0) {
        const nonMaxIndices = probabilities.map((p, i) => p < MAX_PROB ? i : -1).filter(i => i !== -1);
        if (nonMaxIndices.length > 0) {
            const share = excess / nonMaxIndices.length;
            nonMaxIndices.forEach(i => probabilities[i] += share);
        }
    }
    let roundedProbs = probabilities.map(p => Math.round(p));
    let sum = roundedProbs.reduce((a, b) => a + b, 0);
    let diff = 100 - sum;
    if (diff !== 0) {
        let maxIdx = 0;
        roundedProbs.forEach((p, i) => { if (p > roundedProbs[maxIdx]) maxIdx = i; });
        roundedProbs[maxIdx] += diff;
    }
    return roundedProbs.map((prob, score) => ({ score, prob }));
}

function displayScorePredictions(predictedWinner) {
    const rand = Math.random();
    let scenario;
    if (rand < 0.60) { scenario = { type: 'HIGH_VS_LOW' }; } 
    else if (rand < 0.85) { scenario = { type: 'CLOSE_GAME' }; } 
    else { scenario = { type: 'LOW_WIN' }; }

    const playerProbs = generateScoreProbabilities('P', predictedWinner, scenario);
    const bankerProbs = generateScoreProbabilities('B', predictedWinner, scenario);
    
    const playerContainer = document.querySelector('.p-side');
    const bankerContainer = document.querySelector('.b-side');
    
    const highestPlayerProb = Math.max(...playerProbs.map(p => p.prob));
    const highestBankerProb = Math.max(...bankerProbs.map(p => p.prob));
    
    let playerHtml = `<div class="score-analysis-title" style="color:#00f3ff;">AI DỰ ĐOÁN ĐIỂM PLAYER</div><div class="score-probability-list">`;
    playerProbs.forEach(item => {
        const isHighest = item.prob === highestPlayerProb;
        playerHtml += `<div class="prob-item ${isHighest ? 'highest-p' : ''}">
                <span>ĐIỂM ${item.score}</span>
                <span style="font-weight:bold;">${item.prob}%</span>
            </div>`;
    });
    playerHtml += `</div>`;
    
    let bankerHtml = `<div class="score-analysis-title" style="color:#ff003c;">AI DỰ ĐOÁN ĐIỂM BANKER</div><div class="score-probability-list">`;
    bankerProbs.forEach(item => {
        const isHighest = item.prob === highestBankerProb;
        bankerHtml += `<div class="prob-item ${isHighest ? 'highest-b' : ''}">
                <span>ĐIỂM ${item.score}</span>
                <span style="font-weight:bold;">${item.prob}%</span>
            </div>`;
    });
    bankerHtml += `</div>`;
    
    playerContainer.innerHTML = '';
    bankerContainer.innerHTML = '';
    playerContainer.classList.remove('winner-p', 'winner-b');
    bankerContainer.classList.remove('winner-p', 'winner-b');

    setTimeout(() => {
        playerContainer.innerHTML = playerHtml;
        if (predictedWinner === 'P') playerContainer.classList.add('winner-p');
    }, 500);
    
    setTimeout(() => {
        bankerContainer.innerHTML = bankerHtml;
        if (predictedWinner === 'B') bankerContainer.classList.add('winner-b');
        isProcessing = false;
    }, 1000);
}

function updatePredictionHistory(prediction, result) {
    let outcome = 'tie';
    if (result !== 'T') {
        outcome = (prediction === result) ? 'win' : 'loss';
    }

    const newRoundNumber = history.length; // Sửa lại để lấy số round chính xác hơn

    const newHistoryEntry = {
        session: generateSessionId(newRoundNumber),
        prediction: prediction,
        result: result,
        outcome: outcome,
        time: new Date()
    };
    
    predictionHistoryLog.unshift(newHistoryEntry); 
    if (predictionHistoryLog.length > 30) {
        predictionHistoryLog.pop(); 
    }
    
    // CẬP NHẬT LẠI DỮ LIỆU TRONG sessionStorage
    const storageKey = `predictionHistory_${currentTableId}`;
    sessionStorage.setItem(storageKey, JSON.stringify(predictionHistoryLog));
    
    renderPredictionHistory();
}

function renderPredictionHistory() {
    const container = document.querySelector('#predictionHistoryPanel .history-table-container');
    if (!container) return;

    if (predictionHistoryLog.length === 0) {
        container.innerHTML = '<div style="text-align: center; padding-top: 50px; color: #666;">Đang chờ dữ liệu phiên...</div>';
        return;
    }

    let html = `
        <table class="history-table">
            <thead>
                <tr>
                    <th>Phiên</th>
                    <th>Dự Đoán</th>
                    <th>Kết Quả</th>
                    <th>Đánh Giá</th>
                    <th>Thời Gian</th>
                </tr>
            </thead>
            <tbody>
    `;

    predictionHistoryLog.forEach(entry => {
        const predClass = entry.prediction === 'P' ? 'player' : 'banker';
        const resultClass = entry.result === 'P' ? 'player' : (entry.result === 'B' ? 'banker' : 'tie');
        const outcomeText = entry.outcome === 'win' ? 'THẮNG' : (entry.outcome === 'loss' ? 'THUA' : 'HÒA');
        
        const timeString = entry.time.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });

        html += `
            <tr class="outcome-${entry.outcome}">
                <td class="col-session">${entry.session}</td>
                <td><span class="pill ${predClass}">${entry.prediction === 'P' ? 'PLAYER' : 'BANKER'}</span></td>
                <td><span class="pill ${resultClass}">${entry.result === 'P' ? 'PLAYER' : (entry.result === 'B' ? 'BANKER' : 'HÒA')}</span></td>
                <td><span class="outcome ${entry.outcome}">${outcomeText}</span></td>
                <td class="col-time">${timeString}</td>
            </tr>
        `;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
    renderPredictionHistoryIcons();
}

function renderPredictionHistoryIcons() {
    const container = document.getElementById('prediction-history-icons');
    if (!container) return;
    const recentHistory = predictionHistoryLog.slice(0, 12);
    let html = '';
    recentHistory.reverse().forEach(entry => {
        let iconClass = '';
        let iconContent = '';
        switch (entry.outcome) {
            case 'win': iconClass = 'icon-win'; iconContent = '✔'; break;
            case 'loss': iconClass = 'icon-loss'; iconContent = '✖'; break;
            case 'tie': iconClass = 'icon-tie'; iconContent = '!'; break;
        }
        if (iconClass) {
            html += `<div class="history-icon ${iconClass}">${iconContent}</div>`;
        }
    });
    container.innerHTML = html;
}

function addLog(msg) {
    const box = document.getElementById('systemLog');
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const div = document.createElement('div');
    div.style.borderBottom = "1px solid #111"; div.style.padding = "3px 0"; div.style.fontSize = "0.75rem";
    let color = "#fff";
    if(msg.includes("PLAYER")) color = "#00f3ff"; else if(msg.includes("BANKER")) color = "#ff003c"; else if(msg.includes("FEE") || msg.includes("PHÍ")) color = "#ff9800";
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
        const lines = ["GIẢI MÃ GÓI TIN...", "VƯỢT TƯỜNG LỬA...", "TÍNH TOÁN TỶ LỆ...", "THEO DÕI GÓI TIN...", "inject_sql_v2... OK", "QUÉT DỮ LIỆU BÀN...", "AI DỰ ĐOÁN: ĐANG TẢI", "MÁY CHỦ PHẢN HỒI: 200 OK"];
        const div = document.createElement('div');
        div.style.marginBottom = "2px";
        div.innerText = "> " + lines[Math.floor(Math.random()*lines.length)] + " [" + Math.random().toString(16).substring(2,6).toUpperCase() + "]";
        el.prepend(div); 
        if(el.children.length > 25) el.lastChild.remove();
    }
}

function renderBigRoadGrid(rawHistory) {
    const grid = document.getElementById('bigRoadGrid');
    if (!grid) return;
    let processedData = [];
    rawHistory.forEach(char => {
        if (char === 'T') {
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true;
        } else if (char === 'P' || char === 'B') {
            processedData.push({ type: char, hasTie: false });
        }
    });
    let columns = [];
    if (processedData.length > 0) {
        let currentCol = [];
        let lastType = null;
        processedData.forEach(item => {
            if (item.type !== lastType) {
                if (currentCol.length > 0) columns.push(currentCol);
                currentCol = [item];
                lastType = item.type;
            } else {
                currentCol.push(item);
            }
        });
        if (currentCol.length > 0) columns.push(currentCol);
    }
    const isMobile = window.innerWidth <= 1024;
    const MAX_COLS = isMobile ? 10 : 20;
    const numRows = 6;
    let displayGrid = Array(numRows).fill(null).map(() => Array(MAX_COLS).fill(null));
    let currentGridCol = 0;
    for (const columnData of columns.slice(-MAX_COLS)) {
        if (currentGridCol >= MAX_COLS) break;
        for (let i = 0; i < columnData.length; i++) {
            const item = columnData[i];
            if (i < numRows) {
                displayGrid[i][currentGridCol] = item;
            } else {
                let turnCol = currentGridCol + (i - (numRows - 1));
                if (turnCol < MAX_COLS) {
                    displayGrid[numRows - 1][turnCol] = item;
                }
            }
        }
        currentGridCol++;
    }
    let html = '';
    for (let c = 0; c < MAX_COLS; c++) {
        html += '<div class="tool-road-col">';
        for (let r = 0; r < numRows; r++) {
            const node = displayGrid[r][c];
            let inner = '';
            if (node) {
                let cls = node.type === 'P' ? 'tool-p' : 'tool-b';
                let tieClass = node.hasTie ? 'has-tie' : '';
                inner = `<div class="tool-bead ${cls} ${tieClass}"></div>`;
            }
            html += `<div class="tool-road-cell">${inner}</div>`;
        }
        html += '</div>';
    }
    grid.innerHTML = html;
}

function renderBeadPlate(res) {
    const grid = document.getElementById('beadPlateGrid');
    if(!grid) return;
    const totalCells = 36;
    let displayData = (res.length > totalCells) ? res.slice(res.length - totalCells) : res;
    let html = '';
    for(let i = 0; i < totalCells; i++) {
        const item = displayData[i];
        if (item) {
            let cls = '', txt = '';
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

function updateGameStats(historyArr) {
    const playerWinsEl = document.getElementById('playerWins');
    const bankerWinsEl = document.getElementById('bankerWins');
    const tieWinsEl = document.getElementById('tieWins');
    if (!playerWinsEl || !bankerWinsEl || !tieWinsEl) return;
    let pCount = 0, bCount = 0, tCount = 0;
    historyArr.forEach(result => {
        if (result === 'P') pCount++;
        else if (result === 'B') bCount++;
        else if (result === 'T') tCount++;
    });
    playerWinsEl.innerText = pCount;
    bankerWinsEl.innerText = bCount;
    tieWinsEl.innerText = tCount;
}