/* --- START OF FILE lobby.js --- */

// Quản lý tỷ lệ thắng giả lập (giữ nguyên tỷ lệ trong 2 phút để không bị nhảy số liên tục)
let rateManager = {
    lastUpdate: 0,
    rates: {}, 
    goldTables: [] 
};

// Biến lưu URL bàn sắp vào (để xử lý khi bấm xác nhận ở Modal)
let pendingTableUrl = "";

// Cập nhật tỷ lệ thắng giả lập
function updateWinRates(tables) {
    const now = Date.now();
    // Cập nhật lại mỗi 120 giây hoặc khi chưa có dữ liệu
    if (Object.keys(rateManager.rates).length === 0 || now - rateManager.lastUpdate > 120000) {
        rateManager.rates = {};
        rateManager.goldTables = [];
        let allIds = tables.map(t => t.table_id);
        
        // Chọn ngẫu nhiên 2 bàn làm "Bàn Vàng" (VIP)
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
                // Bàn VIP: Tỷ lệ từ 91% -> 99%
                rate = Math.floor(Math.random() * (99 - 91 + 1)) + 91;
            } else {
                // Bàn thường: Tỷ lệ từ 40% -> 88%
                rate = Math.floor(Math.random() * (88 - 40 + 1)) + 40;
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

// --- HÀM RENDER CHÍNH (ĐÃ CẬP NHẬT LOGIC MÀU SẮC & VIP) ---
function renderTables(data) {
    if(!grid) return;
    updateWinRates(data);

    grid.innerHTML = ''; 
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        let isInterrupted = (!resultStr || resultStr.length < 5 || item.status === 0);
        
        let winRate = rateManager.rates[item.table_id] || 50;
        
        // Logic sắp xếp: VIP (>90%) ưu tiên lên đầu
        let sortScore = winRate;
        if (winRate > 90) sortScore += 1000;
        if (isInterrupted) sortScore = -1;

        // Xử lý tên bàn cho gọn
        let rawName = item.table_name.toUpperCase();
        rawName = rawName.replace("BACCARAT", "").replace("BÀN", "").trim();
        let displayName = "BÀN BACCARAT " + rawName;

        return { ...item, resultStr, isInterrupted, winRate, sortScore, displayName };
    });

    // Sắp xếp dữ liệu
    processedData.sort((a, b) => b.sortScore - a.sortScore);

    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, displayName } = item;
        
        // 1. XỬ LÝ CLASS CHO THẺ BÀI (VIP LED EFFECT)
        let cardClass = 'casino-card';
        if (!isInterrupted && winRate > 90) {
            cardClass += ' card-vip'; // Thêm class kích hoạt LED chạy
        }

        // 2. XỬ LÝ MÀU SẮC TỶ LỆ (ĐỎ / VÀNG / XANH)
        let rateClass = '';
        let aiLabel = 'AI GỢI Ý';
        
        if (isInterrupted) {
            // Không làm gì
        } else if (winRate > 90) {
            rateClass = 'rate-high'; // Vàng Gold
            aiLabel = '<span style="color:#ffd700; font-weight:bold;">★ SUPER VIP ★</span>';
        } else if (winRate < 70) {
            rateClass = 'rate-low';  // Đỏ
            aiLabel = '<span style="color:#ff003c; font-weight:bold;">RỦI RO CAO</span>';
        } else {
            // Mặc định (Xanh Neon)
        }

        const card = document.createElement('div');
        card.className = cardClass;
        
        // Sự kiện Click
        card.onclick = () => {
            if (isInterrupted) return;
            pendingTableUrl = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
            const modal = document.getElementById('confirmModal');
            if(modal) modal.style.display = 'flex';
        };

        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const liveStatus = isInterrupted ? 'OFF' : 'LIVE ●';
        const liveColor = isInterrupted ? '#666' : '#0f0';
        
        // Render HTML
        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="font-size:0.6rem; color:#888; margin-bottom:5px;">${aiLabel}</span>
                    <span style="font-size:0.6rem; margin-bottom:5px; color:#fff;">TỈ LỆ THẮNG</span>
                    <!-- Thêm class rateClass (rate-low hoặc rate-high) vào đây -->
                    <div class="cc-rate ${rateClass}">${rateDisplay}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Xử lý sự kiện Modal Xác nhận
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
                    // Nếu lỗi mạng vẫn cho vào (demo)
                    window.location.href = pendingTableUrl;
                }
            } else {
                window.location.href = 'login.html';
            }
        };
    }
});