/* --- START OF FILE lobby.js --- */

/* =========================================
   LOBBY MANAGER - FULL LOGIC & POPUP HANDLE
   ========================================= */

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

// Logic vẽ bảng cầu (Big Road) có xử lý Tie
function generateGridHTML(resultStr) {
    let rawData = resultStr.split('');
    let processedData = []; 
    
    // Logic Tie: Gạch chéo lên hạt trước
    rawData.forEach(char => {
        if (char === 'T') { 
            if (processedData.length > 0) {
                processedData[processedData.length - 1].hasTie = true; 
            }
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    });

    // Big Road Logic
    let maxCols = 12; // Số cột hiển thị trên Lobby
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

    // Cắt lấy dữ liệu mới nhất
    if (columns.length > maxCols) columns = columns.slice(-maxCols);
    while(columns.length < maxCols) columns.push([]);

    // Render HTML
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
        
        // --- SỰ KIỆN CLICK BÀN (HIỆN POPUP) ---
        card.onclick = () => {
            if (isInterrupted) return;
            
            // 1. Lưu địa chỉ bàn
            pendingTableUrl = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
            
            // 2. Hiện Modal (display: flex để căn giữa)
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

// --- LOGIC XỬ LÝ NÚT TRONG POPUP ---
document.addEventListener('DOMContentLoaded', () => {
    // Nút Hủy
    const btnCancel = document.querySelector('.btn-cancel');
    if(btnCancel) {
        btnCancel.onclick = () => {
            document.getElementById('confirmModal').style.display = 'none';
        };
    }

    // Nút Xác Nhận (Hack Ngay)
    const btnConfirm = document.getElementById('btnConfirmAction');
    if(btnConfirm) {
        btnConfirm.onclick = async () => {
            const token = localStorage.getItem('token');
            if(token) {
                try {
                    // Gọi API trừ tiền
                    const res = await fetch('/api/enter-table', {
                        method: 'POST',
                        headers: { 'Authorization': token, 'Content-Type': 'application/json' }
                    });
                    const data = await res.json();
                    
                    if(data.status === 'success') {
                        // Thành công -> Vào bàn
                        window.location.href = pendingTableUrl;
                    } else {
                        alert("❌ " + (data.message || "Lỗi: Không đủ Token!"));
                        document.getElementById('confirmModal').style.display = 'none';
                    }
                } catch(e) {
                    // Lỗi mạng -> Vẫn cho vào (test) hoặc chặn
                    window.location.href = pendingTableUrl;
                }
            } else {
                window.location.href = 'login.html';
            }
        };
    }
});