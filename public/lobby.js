/* --- START OF FILE lobby.js --- */

let rateManager = {
    lastUpdate: 0,
    rates: {}, 
    goldTables: [] 
};

// Biến lưu URL bàn sắp vào
let pendingTableUrl = "";

// Cập nhật tỷ lệ thắng giả lập
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

// Logic vẽ bảng cầu (Big Road)
function generateGridHTML(resultStr) {
    let rawData = resultStr.split('');
    let processedData = []; 
    
    rawData.forEach(char => {
        if (char === 'T') { 
            if (processedData.length > 0) {
                processedData[processedData.length - 1].hasTie = true; 
            }
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    });

    let maxCols = 12; 
    let columns = []; 
    let currentCol = []; 
    let lastType = null;
    
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) {
            columns.push(currentCol); currentCol = []; 
        }
        if (currentCol.length >= 6) {
            columns.push(currentCol); currentCol = []; 
        }
        currentCol.push(item); 
        lastType = item.type;
    });
    if (currentCol.length > 0) columns.push(currentCol);

    if (columns.length > maxCols) columns = columns.slice(-maxCols);
    while(columns.length < maxCols) columns.push([]);

    let html = '<div class="road-grid-wrapper">';
    columns.forEach(col => {
        html += '<div class="road-col">';
        for (let r = 0; r < 6; r++) {
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

// Kết nối Socket
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

        // --- XỬ LÝ TÊN BÀN TỰ ĐỘNG ---
        let rawName = item.table_name.toUpperCase();
        // Loại bỏ các từ cũ để tránh lặp
        rawName = rawName.replace("BACCARAT", "").replace("BÀN", "").trim();
        // Tạo tên chuẩn mới
        let displayName = "BÀN BACCARAT " + rawName;

        return { ...item, resultStr, isInterrupted, winRate, isGold, sortScore, displayName };
    });

    processedData.sort((a, b) => b.sortScore - a.sortScore);

    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, isGold, displayName } = item;
        
        let cardClass = 'casino-card';
        if (isGold && !isInterrupted) cardClass += ' gold-tier';
        
        const card = document.createElement('div');
        card.className = cardClass;
        
        // SỰ KIỆN CLICK: TRUYỀN TÊN MỚI QUA URL
        card.onclick = () => {
            if (isInterrupted) return;
            pendingTableUrl = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
            const modal = document.getElementById('confirmModal');
            if(modal) modal.style.display = 'flex';
        };

        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const liveStatus = isInterrupted ? 'OFF' : 'LIVE ●';
        const liveColor = isInterrupted ? '#666' : '#0f0';
        
        let aiTag = isGold ? '<span style="color:#ffd700; font-weight:bold;">★ VIP ★</span>' : 'AI GỢI Ý';
        let predictStyle = isGold ? 'background:#ffd700; color:#000; box-shadow:0 0 10px #ffd700;' : '';

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="font-size:0.6rem; color:#666; margin-bottom:5px;">${aiTag}</span>
                    <span style="font-size:0.6rem; margin-bottom:5px; color:#fff;">TỈ LỆ THẮNG</span>
                    <div class="cc-rate" style="${predictStyle}">${rateDisplay}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Xử lý nút Modal
document.addEventListener('DOMContentLoaded', () => {
    const btnCancel = document.querySelector('.btn-cancel');
    if(btnCancel) {
        btnCancel.onclick = () => {
            document.getElementById('confirmModal').style.display = 'none';
        };
    }
    const btnConfirm = document.getElementById('btnConfirmAction');
    if(btnConfirm) {
        btnConfirm.onclick = async () => {
            const token = localStorage.getItem('token');
            if(token) {
                try {
                    const res = await fetch('/api/enter-table', {
                        method: 'POST',
                        headers: { 'Authorization': token, 'Content-Type': 'application/json' }
                    });
                    const data = await res.json();
                    
                    if(data.status === 'success') {
                        window.location.href = pendingTableUrl;
                    } else {
                        alert("❌ " + (data.message || "Lỗi: Không đủ Token!"));
                        document.getElementById('confirmModal').style.display = 'none';
                    }
                } catch(e) {
                    window.location.href = pendingTableUrl;
                }
            } else {
                window.location.href = 'login.html';
            }
        };
    }
});