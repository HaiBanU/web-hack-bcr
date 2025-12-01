/* =========================================
   LOBBY MANAGER - V10 (FIXED GRID)
   ========================================= */

// --- LOGIC TỶ LỆ ---
let rateManager = {
    lastUpdate: 0,
    rates: {}, 
    goldTables: [] 
};

function updateWinRates(tables) {
    const now = Date.now();
    if (Object.keys(rateManager.rates).length === 0 || now - rateManager.lastUpdate > 120000) {
        rateManager.rates = {};
        rateManager.goldTables = [];
        let allIds = tables.map(t => t.table_id);
        
        if (allIds.length >= 2) {
            while (rateManager.goldTables.length < 2) {
                let r = allIds[Math.floor(Math.random() * allIds.length)];
                if (!rateManager.goldTables.includes(r)) rateManager.goldTables.push(r);
            }
        } else {
            rateManager.goldTables = allIds;
        }

        allIds.forEach(id => {
            let rate;
            if (rateManager.goldTables.includes(id)) {
                rate = Math.floor(Math.random() * (98 - 92 + 1)) + 92;
            } else {
                rate = Math.floor(Math.random() * (85 - 30 + 1)) + 30;
            }
            rateManager.rates[id] = rate;
        });

        rateManager.lastUpdate = now;
    }
}

// --- LOGIC VẼ CẦU MỚI (18 CỘT CHO ĐẸP) ---
function generateGridHTML(resultStr) {
    let rawData = resultStr.split('');
    // Lấy nhiều dữ liệu hơn để lấp đầy card
    let maxDisplay = 108; // 18 cột * 6 dòng
    if(rawData.length > maxDisplay) rawData = rawData.slice(-maxDisplay);

    let processedData = [];
    rawData.forEach(char => {
        if (char === 'T') { 
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; 
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    });

    let columns = []; let currentCol = []; let lastType = null;
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { columns.push(currentCol); currentCol = []; }
        currentCol.push(item); lastType = item.type;
        if (currentCol.length >= 6) { columns.push(currentCol); currentCol = []; lastType = null; }
    });
    if (currentCol.length > 0) columns.push(currentCol);

    // Fill đủ 18 cột
    while(columns.length < 18) { columns.push([]); }
    
    // Lấy 18 cột cuối
    let displayCols = columns.slice(-18); 

    let html = '<div class="road-grid-wrapper">';
    displayCols.forEach(col => {
        html += '<div class="road-col">';
        for (let r = 0; r < 6; r++) {
            let cellContent = ''; let node = col[r];
            if (node) {
                let colorClass = (node.type === 'P') ? 'p' : 'b';
                html += `<div class="road-cell"><div class="bead ${colorClass}"></div></div>`;
            } else {
                html += `<div class="road-cell"></div>`;
            }
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

const grid = document.getElementById('tablesGrid');
let socket;
try { socket = io(); } catch(e) {}

if (socket) {
    socket.on('server_update', (data) => {
        if (data && data.length > 0) renderTables(data);
    });
}

function renderTables(data) {
    if(!grid) return;
    updateWinRates(data);

    grid.innerHTML = ''; 
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        let isInterrupted = (!resultStr || resultStr.length < 5 || item.status === 0);
        let winRate = rateManager.rates[item.table_id] || 50;
        let isGold = rateManager.goldTables.includes(item.table_id);
        
        let sortScore = (isGold ? 1000 : 0) + winRate;
        if (isInterrupted) sortScore = -1;

        let displayName = item.table_name.toUpperCase().replace("BACCARAT", "").trim();
        if (!displayName.startsWith("BÀN")) displayName = "BÀN " + displayName;

        return { ...item, resultStr, isInterrupted, winRate, isGold, sortScore, displayName };
    });

    processedData.sort((a, b) => b.sortScore - a.sortScore);

    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, isGold, displayName } = item;
        
        let cardClass = 'casino-card';
        if (isGold && !isInterrupted) cardClass += ' gold-tier';
        
        const card = document.createElement('div');
        card.className = cardClass;
        
        card.onclick = () => {
            if (isInterrupted) return;
            window.location.href = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
        };

        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const liveStatus = isInterrupted ? 'OFF' : 'LIVE ●';
        const liveColor = isInterrupted ? '#666' : '#0f0';
        
        let aiTag = isGold ? '<span style="color:#ffd700; font-weight:bold;">★ VIP ★</span>' : 'AI GỢI Ý';

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="font-size:0.6rem; color:#aaa; margin-bottom:2px;">${aiTag}</span>
                    <span style="font-size:0.7rem; margin-bottom:5px; color:#fff;">CẦU ĐẸP</span>
                    <div class="cc-rate">${rateDisplay}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}