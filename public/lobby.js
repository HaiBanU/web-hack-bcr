/* --- START OF FILE lobby.js --- */

/* =========================================
   LOBBY MANAGER - V12 (TIE LOGIC FIX)
   ========================================= */

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
        } else { rateManager.goldTables = allIds; }

        allIds.forEach(id => {
            let rate;
            if (rateManager.goldTables.includes(id)) {
                rate = Math.floor(Math.random() * (98 - 92 + 1)) + 92;
            } else {
                rate = Math.floor(Math.random() * (85 - 40 + 1)) + 40;
            }
            rateManager.rates[id] = rate;
        });
        rateManager.lastUpdate = now;
    }
}

// --- LOGIC VẼ CẦU ĐẠI LỘ (BIG ROAD) ---
function generateGridHTML(resultStr) {
    // 1. Phân tích chuỗi kết quả (Xử lý logic Hòa - Tie)
    let rawData = resultStr.split('');
    let processedData = []; // Mảng chứa object { type: 'P'|'B', hasTie: boolean }
    
    // Nếu ván đầu tiên là Tie, Big Road thường bỏ qua hoặc đánh dấu đặc biệt.
    // Ở đây ta tạm bỏ qua các Tie đầu tiên cho đến khi có P hoặc B.
    
    rawData.forEach(char => {
        if (char === 'T') { 
            // Nếu đã có hạt trước đó, gán Tie vào hạt đó (Vạch chéo)
            if (processedData.length > 0) {
                processedData[processedData.length - 1].hasTie = true; 
            }
            // Nếu là Tie ngay đầu, có thể xử lý riêng, nhưng để đơn giản ta bỏ qua hoặc không vẽ
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    });

    // 2. Cắt dữ liệu để hiển thị vừa khung (Lấy khoảng 72 kết quả cuối ~ 12 cột)
    // Mỗi cột 6 dòng.
    let maxCols = 12; // Số cột hiển thị trên card
    let maxItems = maxCols * 6;
    
    // Logic vẽ Big Road (Xuống dòng khi đổi màu)
    let columns = []; 
    let currentCol = []; 
    let lastType = null;
    
    // Thuật toán Big Road đơn giản (không có Dragon Tail ngoặt sang phải)
    // Chỉ đơn giản: Khác màu -> cột mới. Cùng màu -> xuống dòng. Đầy 6 dòng -> cột mới.
    
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) {
            // Đổi màu -> Sang cột mới
            columns.push(currentCol); 
            currentCol = []; 
        }
        
        if (currentCol.length >= 6) {
            // Đầy cột -> Sang cột mới (dù cùng màu)
            columns.push(currentCol); 
            currentCol = []; 
        }

        currentCol.push(item); 
        lastType = item.type;
    });
    if (currentCol.length > 0) columns.push(currentCol);

    // Cắt lấy số cột cuối cùng để hiển thị mới nhất
    if (columns.length > maxCols) {
        columns = columns.slice(-maxCols);
    }
    // Fill cột trống cho đẹp
    while(columns.length < maxCols) { columns.push([]); }

    // 3. Render HTML
    let html = '<div class="road-grid-wrapper">';
    columns.forEach(col => {
        html += '<div class="road-col">';
        for (let r = 0; r < 6; r++) {
            let cellContent = ''; 
            let node = col[r];
            
            if (node) {
                let colorClass = (node.type === 'P') ? 'p' : 'b';
                let tieClass = (node.hasTie) ? 'has-tie' : '';
                html += `<div class="road-cell"><div class="bead ${colorClass} ${tieClass}"></div></div>`;
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
        let predictStyle = isGold ? 'background:#ffd700; color:#000; box-shadow:0 0 10px #ffd700;' : '';

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.8rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="font-size:0.6rem; color:#aaa; margin-bottom:5px;">${aiTag}</span>
                    <span style="font-size:0.7rem; margin-bottom:5px; color:#fff;">CẦU ĐẸP</span>
                    <div class="cc-rate" style="${predictStyle}">${rateDisplay}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}