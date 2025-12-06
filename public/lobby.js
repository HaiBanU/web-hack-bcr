/* --- START OF FILE lobby.js --- */

// Quản lý tỷ lệ thắng giả lập
let rateManager = {
    lastUpdate: 0,
    rates: {}, // Lưu { table_id: rate }
    tiers: {}  // Lưu { table_id: 'gold' | 'green' | 'red' }
};

// Biến lưu URL bàn sắp vào
let pendingTableUrl = "";

// Hàm trộn mảng ngẫu nhiên (Fisher-Yates Shuffle)
function shuffleArray(array) {
    for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
    return array;
}

// Cập nhật tỷ lệ thắng theo phân bổ 50% - 40% - 10%
function updateWinRates(tables) {
    const now = Date.now();
    // Chỉ cập nhật lại sau 120s hoặc khi chưa có dữ liệu
    if (Object.keys(rateManager.rates).length === 0 || now - rateManager.lastUpdate > 120000) {
        
        rateManager.rates = {};
        rateManager.tiers = {};
        
        // 1. Lọc ra các bàn ĐANG HOẠT ĐỘNG
        let activeIds = [];
        tables.forEach(t => {
            const resultStr = t.result || "";
            // Điều kiện hoạt động: Có kết quả, dài hơn 5 ván, status = 1
            if (resultStr && resultStr.length >= 5 && t.status !== 0) {
                activeIds.push(t.table_id);
            }
        });

        // 2. Trộn ngẫu nhiên danh sách ID
        activeIds = shuffleArray(activeIds);
        const totalActive = activeIds.length;

        // 3. Tính số lượng cho từng nhóm
        const goldCount = Math.ceil(totalActive * 0.50); // 50%
        const greenCount = Math.floor(totalActive * 0.40); // 40%
        // Số còn lại là Red (khoảng 10%)

        // 4. Gán tỷ lệ và phân loại
        activeIds.forEach((id, index) => {
            let rate, tier;

            if (index < goldCount) {
                // NHÓM GOLD (> 85%): Random 86 - 99
                rate = Math.floor(Math.random() * (99 - 86 + 1)) + 86;
                tier = 'gold';
            } else if (index < goldCount + greenCount) {
                // NHÓM GREEN (70% - 85%): Random 70 - 85
                rate = Math.floor(Math.random() * (85 - 70 + 1)) + 70;
                tier = 'green';
            } else {
                // NHÓM RED (50% - 69%): Random 50 - 69
                rate = Math.floor(Math.random() * (69 - 50 + 1)) + 50;
                tier = 'red';
            }

            rateManager.rates[id] = rate;
            rateManager.tiers[id] = tier;
        });

        rateManager.lastUpdate = now;
    }
}

// Logic vẽ bảng cầu (Big Road) - Giữ nguyên
function generateGridHTML(resultStr) {
    let rawData = resultStr.split('');
    let processedData = []; 
    rawData.forEach(char => {
        if (char === 'T') { 
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; 
        } else { processedData.push({ type: char, hasTie: false }); }
    });

    let maxCols = 12; let columns = []; let currentCol = []; let lastType = null;
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { columns.push(currentCol); currentCol = []; }
        if (currentCol.length >= 6) { columns.push(currentCol); currentCol = []; }
        currentCol.push(item); lastType = item.type;
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
            } else html += `<div class="road-cell"></div>`;
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

// Socket connection
const grid = document.getElementById('tablesGrid');
let socket;
try { socket = io(); } catch(e) {}
if (socket) {
    socket.on('server_update', (data) => {
        if (data && data.length > 0) renderTables(data);
    });
}

// --- HÀM RENDER CHÍNH ---
function renderTables(data) {
    if(!grid) return;
    
    // Tính toán lại tỷ lệ dựa trên data mới
    updateWinRates(data);

    grid.innerHTML = ''; 
    
    // Xử lý dữ liệu để sắp xếp
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        // Xác định bàn lỗi/không hoạt động
        let isInterrupted = (!resultStr || resultStr.length < 5 || item.status === 0);
        
        let winRate = rateManager.rates[item.table_id] || 0;
        let tier = rateManager.tiers[item.table_id] || 'none';

        if (isInterrupted) {
            winRate = 0;
            tier = 'off';
        }

        // Điểm sắp xếp: Gold > Green > Red > Off
        let sortScore = 0;
        if (tier === 'gold') sortScore = 3000 + winRate;
        else if (tier === 'green') sortScore = 2000 + winRate;
        else if (tier === 'red') sortScore = 1000 + winRate;
        else sortScore = -1;

        let rawName = item.table_name.toUpperCase().replace("BACCARAT", "").replace("BÀN", "").trim();
        let displayName = "BÀN BACCARAT " + rawName;

        return { ...item, resultStr, isInterrupted, winRate, tier, sortScore, displayName };
    });

    // Sắp xếp: Bàn xịn lên đầu
    processedData.sort((a, b) => b.sortScore - a.sortScore);

    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, tier, displayName } = item;
        
        // Cấu hình hiển thị theo Tier
        let cardClass = 'casino-card';
        let rateClass = '';
        let aiLabel = '';
        let rateDisplay = `WIN ${winRate}%`;

        if (isInterrupted) {
            rateDisplay = 'BẢO TRÌ';
            aiLabel = '<span style="color:#666;">OFFLINE</span>';
            // Không set rateClass => để mặc định đen/trắng
        } else {
            if (tier === 'gold') {
                // MÀU VÀNG (>85%)
                cardClass += ' card-vip'; // Thêm hiệu ứng viền chạy
                rateClass = 'rate-gold'; 
                aiLabel = '<span style="color:#ffd700; font-weight:bold;">★ SUPER VIP ★</span>';
            } else if (tier === 'green') {
                // MÀU XANH (70-85%)
                rateClass = 'rate-green';
                aiLabel = '<span style="color:#00ff41;">AI GỢI Ý</span>';
            } else {
                // MÀU ĐỎ (<70%)
                rateClass = 'rate-red';
                aiLabel = '<span style="color:#ff003c;">RỦI RO CAO</span>';
            }
        }

        const liveStatus = isInterrupted ? 'OFF ●' : 'LIVE ●';
        const liveColor = isInterrupted ? '#555' : '#0f0';

        // Tạo phần tử HTML
        const card = document.createElement('div');
        card.className = cardClass;
        card.onclick = () => {
            if (isInterrupted) return;
            pendingTableUrl = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
            const modal = document.getElementById('confirmModal');
            if(modal) modal.style.display = 'flex';
        };

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="font-size:0.6rem; margin-bottom:5px;">${aiLabel}</span>
                    <span style="font-size:0.6rem; margin-bottom:5px; color:#aaa;">TỈ LỆ THẮNG</span>
                    <div class="cc-rate ${rateClass}">${rateDisplay}</div>
                </div>
            </div>
        `;
        grid.appendChild(card);
    });
}

// Event Listeners cho Modal
document.addEventListener('DOMContentLoaded', () => {
    const btnCancel = document.querySelector('.btn-cancel');
    if(btnCancel) btnCancel.onclick = () => document.getElementById('confirmModal').style.display = 'none';
    
    const btnConfirm = document.getElementById('btnConfirmAction');
    if(btnConfirm) {
        btnConfirm.onclick = async () => {
            const token = localStorage.getItem('token');
            if(token) {
                try {
                    const res = await fetch('/api/enter-table', {
                        method: 'POST', headers: { 'Authorization': token, 'Content-Type': 'application/json' }
                    });
                    const data = await res.json();
                    if(data.status === 'success') window.location.href = pendingTableUrl;
                    else { alert("❌ " + (data.message || "Lỗi Token!")); document.getElementById('confirmModal').style.display = 'none'; }
                } catch(e) { window.location.href = pendingTableUrl; }
            } else window.location.href = 'login.html';
        };
    }
});