// --- START OF FULLY UPDATED script.js (v4.3 - Prediction Consistency Fix) ---

let currentTableId = null;
let history = [];
let isProcessing = false;
let tokenInterval = null;
const socket = io();

let lastPrediction = null; 
let predictionOutcomes = []; 
let chartHistory = []; 

function generateInitialChartHistory(totalRounds) {
    if (totalRounds <= 0) return [];
    const winCount = Math.round(totalRounds * 0.70);
    const tieCount = Math.round(totalRounds * 0.05);
    const lossCount = totalRounds - winCount - tieCount;
    let initialData = [];
    for (let i = 0; i < winCount; i++) initialData.push({ type: 'win' });
    for (let i = 0; i < lossCount; i++) initialData.push({ type: 'loss' });
    for (let i = 0; i < tieCount; i++) initialData.push({ type: 'tie' });
    for (let i = initialData.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [initialData[i], initialData[j]] = [initialData[j], initialData[i]];
    }
    return initialData;
}

window.addEventListener('DOMContentLoaded', async () => {
    const urlParams = new URLSearchParams(window.location.search);
    currentTableId = urlParams.get('tableId');
    let tName = decodeURIComponent(urlParams.get('tableName') || "BÀN KHÔNG XÁC ĐỊNH");
    if (!tName.includes("BACCARAT")) tName = tName.replace("BÀN", "BÀN BACCARAT");
    document.getElementById('tableNameDisplay').innerText = tName.toUpperCase();

    async function initializeTool() {
        try {
            const response = await fetch('/api/tables');
            const data = await response.json();
            if (data.status === 'success' && data.data) {
                const currentTable = data.data.find(t => t.table_id == currentTableId);
                if (currentTable && currentTable.result) {
                    const numRounds = currentTable.result.length;
                    chartHistory = generateInitialChartHistory(numRounds);
                }
            }
        } catch (error) {
            console.error("Lỗi khi lấy dữ liệu ban đầu:", error);
            chartHistory = [];
        }

        initCardRain();
        updateTokenUI(localStorage.getItem('tokens') || 0);
        addLog(`HỆ THỐNG ĐÃ KẾT NỐI: ${tName}`);
        addLog(`>> KẾT NỐI MÁY CHỦ... [OK]`);
        deductToken('entry');
        startPeriodicDeduction();
        setInterval(generateMatrixCode, 100); 
        startWaveChartLoop();
        startFakeTransactions();
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

        if (newLength > oldLength || oldLength === 0) {
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

function runPredictionSystem(historyArr) {
    isProcessing = true;
    
    const ui = {
        advice: document.getElementById('aiAdvice'),
        pred: document.getElementById('aiPredText'),
        gaugePath: document.getElementById('gaugePath'),
        gaugeValue: document.getElementById('gaugeValue'),
        gaugeContainer: document.querySelector('.pred-gauge')
    };

    ui.advice.innerText = "PHÂN TÍCH MA TRẬN V20"; ui.advice.style.color = "#00ff41";
    ui.pred.innerText = "ĐANG CHỜ"; ui.pred.className = "pred-result res-wait";
    ui.gaugePath.setAttribute("stroke-dasharray", "0, 100"); ui.gaugeValue.innerText = "0%";
    ui.gaugeContainer.classList.remove('active');

    const cleanHist = historyArr.filter(x => x !== 'T');
    const len = cleanHist.length;
    let prediction = null, confidence = 70, reason = "ĐANG PHÂN TÍCH...";

    if (len > 3) {
        const last1 = cleanHist[len - 1], last2 = cleanHist[len - 2], last3 = cleanHist[len - 3], last4 = cleanHist[len - 4];
        const opponent = (side) => (side === 'P' ? 'B' : 'P');
        let streak = 0;
        for (let i = len - 1; i >= 0; i--) { if (cleanHist[i] === last1) streak++; else break; }

        if (streak === 7) { prediction = opponent(last1); confidence = 96; reason = `BẺ CẦU RỒNG (7)`; }
        else if (streak >= 3 && streak < 7) { prediction = last1; confidence = 85 + (streak * 2); reason = `CẦU BỆT (${last1} x${streak})`; }
        else if (len >= 4 && last1 === last2 && last3 === last4 && last1 !== last3) { prediction = last1; confidence = 92; reason = `CẦU (2-2)`; }
        else if (len >= 6 && last1===last2 && last2==last3 && last4===cleanHist[len-5] && cleanHist[len-5]==cleanHist[len-6] && last1 !== last4) { prediction = last1; confidence = 94; reason = `CẦU (3-3)`; }
        else if (len >= 3 && last1 !== last2 && last2 === last3) { prediction = last1; confidence = 88; reason = `CẦU (2-1)`; }
        else if (len >= 3 && last1 === last2 && last1 !== last3) { prediction = last3; confidence = 90; reason = `CẦU (1-2)`; }
        else if (len >= 4 && last1 !== last2 && last2 === last3 && last3 === last4) { prediction = last1; confidence = 89; reason = `CẦU (3-1)`; }
        else if (len >= 4 && last1 === last2 && last2 === last3 && last1 !== last4) { prediction = last4; confidence = 91; reason = `CẦU (1-3)`; }
        else if (len >= 4 && last1 !== last2 && last2 !== last3 && last3 !== last4) { prediction = opponent(last1); confidence = 93; reason = `CẦU 1-1`; }
        else { prediction = last1; confidence = 78; reason = "THEO XU HƯỚNG"; }
    } 
    
    if (!prediction) {
        if (len > 0) prediction = cleanHist[len - 1]; else prediction = 'B';
        confidence = 75; reason = "KHỞI TẠO DỮ LIỆU...";
    }

    setTimeout(() => { addLog(`>> PHÂN TÍCH VÁN TIẾP THEO...`); }, 500);
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
        
        addLog(`>> DỰ ĐOÁN: [ ${prediction} ] (TỶ LỆ: ${confidence}%)`);
        lastPrediction = { side: prediction };
        
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

    let playerProbs = generateScoreProbabilities('P', predictedWinner, scenario);
    let bankerProbs = generateScoreProbabilities('B', predictedWinner, scenario);
    
    // --- START: LOGIC SỬA LỖI MÂU THUẪN DỰ ĐOÁN ---
    const getHighestProbItem = (probs) => probs.reduce((max, item) => item.prob > max.prob ? item : max, probs[0]);
    
    let highestPlayerItem = getHighestProbItem(playerProbs);
    let highestBankerItem = getHighestProbItem(bankerProbs);

    if (highestPlayerItem.score === highestBankerItem.score) {
        let probsToAdjust = (predictedWinner === 'P') ? bankerProbs : playerProbs;
        
        const sortedProbs = [...probsToAdjust].sort((a, b) => b.prob - a.prob);
        const secondHighestItem = sortedProbs[1];
        
        const originalHighest = probsToAdjust.find(p => p.score === highestPlayerItem.score);
        const originalSecondHighest = probsToAdjust.find(p => p.score === secondHighestItem.score);

        if (originalHighest && originalSecondHighest) {
            [originalHighest.prob, originalSecondHighest.prob] = [originalSecondHighest.prob, originalHighest.prob];
        }
    }
    // --- END: LOGIC SỬA LỖI ---
    
    const playerContainer = document.querySelector('.p-side');
    const bankerContainer = document.querySelector('.b-side');
    
    // Lấy lại giá trị cao nhất sau khi có thể đã điều chỉnh
    const finalHighestPlayerProb = Math.max(...playerProbs.map(p => p.prob));
    const finalHighestBankerProb = Math.max(...bankerProbs.map(p => p.prob));
    
    let playerHtml = `<div class="side-container-inner">
                        <div class="score-analysis-title" style="color:#00f3ff;">PHÂN TÍCH ĐIỂM PLAYER</div>
                        <div class="score-probability-list">`;
    playerProbs.forEach(item => {
        const isHighest = item.prob === finalHighestPlayerProb;
        playerHtml += `<div class="prob-item ${isHighest ? 'highest-p' : ''}">
                <span>ĐIỂM ${item.score}</span>
                <span style="font-weight:bold;">${item.prob}%</span>
            </div>`;
    });
    playerHtml += `</div></div>`;
    
    let bankerHtml = `<div class="side-container-inner">
                        <div class="score-analysis-title" style="color:#ff003c;">PHÂN TÍCH ĐIỂM BANKER</div>
                        <div class="score-probability-list">`;
    bankerProbs.forEach(item => {
        const isHighest = item.prob === finalHighestBankerProb;
        bankerHtml += `<div class="prob-item ${isHighest ? 'highest-b' : ''}">
                <span>ĐIỂM ${item.score}</span>
                <span style="font-weight:bold;">${item.prob}%</span>
            </div>`;
    });
    bankerHtml += `</div></div>`;
    
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

function addLog(msg) {
    const box = document.getElementById('systemLog');
    const time = new Date().toLocaleTimeString('vi-VN', { hour12: false });
    const div = document.createElement('div');
    div.style.borderBottom = "1px solid #111"; div.style.padding = "3px 0"; div.style.fontFamily = "monospace"; div.style.fontSize = "0.75rem";
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

let waveCanvas, waveCtx;
let waveW, waveH;
let waveConfig = { pAmp: 20, targetP: 20, bAmp: 20, targetB: 20, speed: 0.08, pColor: "rgba(0, 243, 255, 0.6)", bColor: "rgba(255, 0, 60, 0.6)" };

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
    const spacing = 16, candleWidth = 14, minHeight = 15, maxHeight = 45, heightStep = 5;
    let processedData = []; let streakCounter = 0; let lastResultType = null;
    for (const result of chartHistory) {
        if (result.type === 'tie') { processedData.push({ type: 'tie', streak: 0 }); continue; }
        if (result.type === lastResultType) streakCounter++; else streakCounter = 1;
        processedData.push({ type: result.type, streak: streakCounter });
        lastResultType = result.type;
    }
    const centerY = waveH / 2;
    waveCtx.beginPath();
    waveCtx.moveTo(0, centerY); waveCtx.lineTo(waveW, centerY);
    waveCtx.strokeStyle = 'rgba(255, 255, 255, 0.2)'; waveCtx.lineWidth = 1; waveCtx.shadowBlur = 0; waveCtx.stroke();
    const maxCandles = Math.floor(waveW / spacing);
    const dataToDraw = processedData.slice(-maxCandles);
    dataToDraw.forEach((item, i) => {
        const x = waveW - (dataToDraw.length - i) * spacing + (spacing / 2);
        if (item.type === 'tie') {
            waveCtx.beginPath(); waveCtx.arc(x, centerY, 4, 0, Math.PI * 2);
            waveCtx.fillStyle = '#00ff41'; waveCtx.shadowColor = '#00ff41'; waveCtx.shadowBlur = 8; waveCtx.fill();
            return;
        }
        const candleHeight = Math.min(maxHeight, minHeight + (item.streak - 1) * heightStep);
        waveCtx.beginPath(); waveCtx.lineWidth = candleWidth; waveCtx.shadowBlur = 8;
        if (item.type === 'win') {
            waveCtx.strokeStyle = '#00ff41'; waveCtx.shadowColor = '#00ff41';
            waveCtx.moveTo(x, centerY); waveCtx.lineTo(x, centerY - candleHeight);
        } else {
            waveCtx.strokeStyle = '#ff003c'; waveCtx.shadowColor = '#ff003c';
            waveCtx.moveTo(x, centerY); waveCtx.lineTo(x, centerY + candleHeight);
        }
        waveCtx.stroke();
    });
    waveCtx.shadowBlur = 0;
}

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