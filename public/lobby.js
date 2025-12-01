/* =========================================
   LOBBY MANAGER - V9.5 (ALGORITHM UPGRADE)
   ========================================= */

// --- QUẢN LÝ TỶ LỆ THẮNG (2 PHÚT RANDOM 1 LẦN) ---
let rateManager = {
    lastUpdate: 0,
    rates: {}, // Lưu tỷ lệ theo table_id
    goldTables: [] // Lưu danh sách id của 2 bàn VIP
};

function updateWinRates(tables) {
    const now = Date.now();
    // Nếu chưa có data hoặc đã qua 2 phút (120000ms)
    if (Object.keys(rateManager.rates).length === 0 || now - rateManager.lastUpdate > 120000) {
        
        rateManager.rates = {};
        rateManager.goldTables = [];
        let allIds = tables.map(t => t.table_id);
        
        // 1. Chọn ngẫu nhiên 2 bàn làm Gold Tier (>90%)
        if (allIds.length >= 2) {
            while (rateManager.goldTables.length < 2) {
                let r = allIds[Math.floor(Math.random() * allIds.length)];
                if (!rateManager.goldTables.includes(r)) rateManager.goldTables.push(r);
            }
        } else {
            rateManager.goldTables = allIds; // Nếu ít bàn quá thì cho hết
        }

        // 2. Gán tỷ lệ cho từng bàn
        allIds.forEach(id => {
            let rate;
            if (rateManager.goldTables.includes(id)) {
                // Tỷ lệ VIP: 91% - 98%
                rate = Math.floor(Math.random() * (98 - 91 + 1)) + 91;
            } else {
                // Tỷ lệ Thường: 30% - 85%
                rate = Math.floor(Math.random() * (85 - 30 + 1)) + 30;
            }
            rateManager.rates[id] = rate;
        });

        rateManager.lastUpdate = now;
        console.log(">>> UPDATED WIN RATES (2 MINS) <<<");
    }
}

// --- XỬ LÝ HIỂN THỊ CẦU (KHÔNG CUỘN) ---
function generateGridHTML(resultStr) {
    // Chỉ lấy tối đa 72 ký tự cuối (tương đương 12 cột x 6 dòng)
    let rawData = resultStr.split('');
    let maxDisplay = 72; 
    if(rawData.length > maxDisplay) rawData = rawData.slice(-maxDisplay);

    let processedData = [];
    rawData.forEach(char => {
        if (char === 'T') { 
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; 
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    });

    // Logic Big Road (Vẽ cột)
    let columns = []; let currentCol = []; let lastType = null;
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { columns.push(currentCol); currentCol = []; }
        currentCol.push(item); lastType = item.type;
        if (currentCol.length >= 6) { columns.push(currentCol); currentCol = []; lastType = null; }
    });
    if (currentCol.length > 0) columns.push(currentCol);

    // Fill đủ 12 cột để giao diện đẹp (nếu thiếu)
    while(columns.length < 12) { columns.push([]); }
    
    // Chỉ lấy 12 cột cuối cùng để render -> Vừa khít Card
    let displayCols = columns.slice(-12); 

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
try { socket = io(); } catch(e) { console.log('Socket err'); }

if (socket) {
    socket.on('server_update', (data) => {
        if (data && data.length > 0) renderTables(data);
    });
}

function renderTables(data) {
    if(!grid) return;
    
    // Cập nhật thuật toán tỷ lệ
    updateWinRates(data);

    grid.innerHTML = ''; 
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        let isInterrupted = (!resultStr || resultStr.length < 5 || item.status === 0);
        
        let winRate = rateManager.rates[item.table_id] || 50;
        let isGold = rateManager.goldTables.includes(item.table_id);
        
        // Sắp xếp: Bàn Gold lên đầu, sau đó đến tỷ lệ cao
        let sortScore = (isGold ? 1000 : 0) + winRate;
        if (isInterrupted) sortScore = -1;

        let displayName = item.table_name.toUpperCase().replace("BACCARAT", "").trim();
        if (!displayName.startsWith("BÀN")) displayName = "BÀN " + displayName;

        return { ...item, resultStr, isInterrupted, winRate, isGold, sortScore, displayName };
    });

    // Sắp xếp
    processedData.sort((a, b) => b.sortScore - a.sortScore);

    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, isGold, displayName } = item;
        
        let cardClass = 'casino-card';
        if (isGold && !isInterrupted) cardClass += ' gold-tier';
        
        const card = document.createElement('div');
        card.className = cardClass;
        
        card.onclick = () => {
            if (isInterrupted) return;
            const token = localStorage.getItem('token');
            if (!token) { alert("⛔ VUI LÒNG ĐĂNG NHẬP!"); window.location.href = 'login.html'; return; }
            
            // Hiện Modal xác nhận hoặc vào thẳng
            if(document.getElementById('confirmModal')) {
                 document.getElementById('confirmModal').style.display = 'flex';
                 document.getElementById('btnConfirmAction').onclick = async () => {
                    // Logic vào bàn (copy từ code cũ hoặc API call)
                    window.location.href = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
                 }
            } else {
                window.location.href = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
            }
        };

        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const liveStatus = isInterrupted ? 'OFF' : 'LIVE ●';
        const liveColor = isInterrupted ? '#666' : '#0f0';
        
        let aiTag = isGold ? '<span style="color:black; font-weight:bold;">🏆 VIP</span>' : 'AI GỢI Ý';
        let goldStyle = isGold ? 'style="color:#ffd700; font-weight:bold;"' : '';

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="font-size:0.6rem; color:#aaa; margin-bottom:2px;">${aiTag}</span>
                    <span ${goldStyle} style="font-size:0.7rem; margin-bottom:5px;">CẦU ĐẸP</span>
                    <div class="cc-rate">${rateDisplay}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}