/* --- START OF FILE lobby.js (VERSION 2.2 - SESSION RATES STORAGE) --- */

// Quản lý tỷ lệ thắng giả lập (Đã cập nhật để lưu phiên)
let rateManager;
const savedRateManager = sessionStorage.getItem('rateManager');

if (savedRateManager) {
    // Nếu có dữ liệu đã lưu, lấy ra sử dụng
    rateManager = JSON.parse(savedRateManager);
} else {
    // Nếu không có, khởi tạo mới
    rateManager = {
        lastUpdate: 0,
        rates: {}, // Lưu { table_id: rate }
        tiers: {}  // Lưu { table_id: 'gold' | 'green' | 'red' }
    };
}

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

// Cập nhật tỷ lệ thắng theo phân bổ (Đã sửa đổi)
function updateWinRates(tables) {
    const now = Date.now();
    // Thay 120000 (2 phút) thành 60000 (1 phút)
    if (Object.keys(rateManager.rates).length === 0 || now - rateManager.lastUpdate > 60000) {
        rateManager.rates = {};
        rateManager.tiers = {};
        let activeIds = [];
        tables.forEach(t => {
            const resultStr = t.result || "";
            if (resultStr && resultStr.length >= 5 && t.status !== 0) {
                activeIds.push(t.table_id);
            }
        });
        activeIds = shuffleArray(activeIds);
        const totalActive = activeIds.length;
        const goldCount = Math.ceil(totalActive * 0.50);
        const greenCount = Math.floor(totalActive * 0.40);
        activeIds.forEach((id, index) => {
            let rate, tier;
            if (index < goldCount) {
                rate = Math.floor(Math.random() * (99 - 86 + 1)) + 86;
                tier = 'gold';
            } else if (index < goldCount + greenCount) {
                rate = Math.floor(Math.random() * (85 - 70 + 1)) + 70;
                tier = 'green';
            } else {
                rate = Math.floor(Math.random() * (69 - 50 + 1)) + 50;
                tier = 'red';
            }
            rateManager.rates[id] = rate;
            rateManager.tiers[id] = tier;
        });
        rateManager.lastUpdate = now;

        // THÊM DÒNG QUAN TRỌNG: Lưu trạng thái mới vào sessionStorage
        sessionStorage.setItem('rateManager', JSON.stringify(rateManager));
    }
}


// ====================================================================
// === START: HÀM VẼ BẢNG CẦU ĐÃ HỖ TRỢ "ĐUÔI RỒNG" (DRAGON TAIL) ===
// ====================================================================
function generateGridHTML(resultStr) {
    // Bước 1: Xử lý chuỗi kết quả thô để gán các ván Hòa (Tie) vào kết quả trước đó.
    let processedData = [];
    resultStr.split('').forEach(char => {
        if (char === 'T') {
            if (processedData.length > 0) {
                processedData[processedData.length - 1].hasTie = true;
            }
        } else if (char === 'P' || char === 'B') {
            processedData.push({ type: char, hasTie: false });
        }
    });

    // Bước 2: Xây dựng các cột dữ liệu (các chuỗi bệt).
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

    // Bước 3: Chuẩn bị một lưới 2D rỗng để vẽ.
    const maxCols = 12; // Số cột hiển thị trên sảnh
    const numRows = 6;
    let displayGrid = Array(numRows).fill(null).map(() => Array(maxCols).fill(null));

    // Bước 4: Đặt các kết quả vào lưới, xử lý logic "đuôi rồng".
    let currentGridCol = 0;
    for (const columnData of columns.slice(-maxCols)) { // Chỉ xử lý các cột cuối cùng
        if (currentGridCol >= maxCols) break;
        for (let i = 0; i < columnData.length; i++) {
            const item = columnData[i];
            if (i < numRows) {
                // Đi theo chiều dọc như bình thường
                displayGrid[i][currentGridCol] = item;
            } else {
                // Bắt đầu "đuôi rồng": bẻ lái sang phải ở hàng cuối cùng
                let turnCol = currentGridCol + (i - (numRows - 1));
                if (turnCol < maxCols) {
                    displayGrid[numRows - 1][turnCol] = item;
                }
            }
        }
        currentGridCol++;
    }

    // Bước 5: Tạo HTML từ lưới đã được xử lý.
    let html = '<div class="road-grid-wrapper">';
    for (let c = 0; c < maxCols; c++) {
        html += '<div class="road-col">';
        for (let r = 0; r < numRows; r++) {
            const node = displayGrid[r][c];
            if (node) {
                let colorClass = (node.type === 'P') ? 'p' : 'b';
                let tieClass = (node.hasTie) ? 'has-tie' : '';
                html += `<div class="road-cell"><div class="bead ${colorClass} ${tieClass}"></div></div>`;
            } else {
                html += `<div class="road-cell"></div>`;
            }
        }
        html += '</div>';
    }
    html += '</div>';
    return html;
}
// ==================================================================
// === END: HÀM VẼ BẢNG CẦU ĐÃ HỖ TRỢ "ĐUÔI RỒNG" (DRAGON TAIL) ===
// ==================================================================


// Socket connection
const grid = document.getElementById('tablesGrid');
let socket;
try { socket = io(); } catch(e) {}
if (socket) {
    socket.on('server_update', (data) => {
        if (data && data.length > 0) renderTables(data);
    });
}

// --- HÀM RENDER CHÍNH (ĐÃ CẬP NHẬT GIAO DIỆN MỚI) ---
function renderTables(data) {
    if(!grid) return;
    updateWinRates(data);
    grid.innerHTML = ''; 
    
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        let isInterrupted = (!resultStr || resultStr.length < 5 || item.status === 0);
        let winRate = rateManager.rates[item.table_id] || 0;
        let tier = rateManager.tiers[item.table_id] || 'none';
        if (isInterrupted) {
            winRate = 0;
            tier = 'off';
        }
        let sortScore = 0;
        if (tier === 'gold') sortScore = 3000 + winRate;
        else if (tier === 'green') sortScore = 2000 + winRate;
        else if (tier === 'red') sortScore = 1000 + winRate;
        else sortScore = -1;
        let rawName = item.table_name.toUpperCase().replace("BACCARAT", "").replace("BÀN", "").trim();
        let displayName = "BÀN BACCARAT " + rawName;
        return { ...item, resultStr, isInterrupted, winRate, tier, sortScore, displayName };
    });

    processedData.sort((a, b) => b.sortScore - a.sortScore);

    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, tier, displayName } = item;
        let cardClass = 'casino-card';
        let rateClass = '';
        let aiLabel = '';
        let rateDisplay = `WIN ${winRate}%`;
        if (isInterrupted) {
            rateDisplay = 'BẢO TRÌ';
            aiLabel = '<span style="color:#666;">OFFLINE</span>';
        } else {
            if (tier === 'gold') {
                cardClass += ' card-vip';
                rateClass = 'rate-gold'; 
                aiLabel = '<span style="color:#ffd700; font-weight:bold;">★ SUPER VIP ★</span>';
            } else if (tier === 'green') {
                rateClass = 'rate-green';
                aiLabel = '<span style="color:#00ff41;">AI GỢI Ý</span>';
            } else {
                rateClass = 'rate-red';
                aiLabel = '<span style="color:#ff003c;">RỦI RO CAO</span>';
            }
        }
        const liveStatus = isInterrupted ? 'OFF ●' : 'LIVE ●';
        const liveColor = isInterrupted ? '#555' : '#0f0';

        // Tính toán số liệu thống kê
        const pCount = (resultStr.match(/P/g) || []).length;
        const bCount = (resultStr.match(/B/g) || []).length;
        const tCount = (resultStr.match(/T/g) || []).length;

        const card = document.createElement('div');
        card.className = cardClass;
        card.onclick = () => {
            if (isInterrupted) return;
            pendingTableUrl = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
            const modal = document.getElementById('confirmModal');
            if(modal) modal.style.display = 'flex';
        };
        
        // =========================================================
        // === START: CẬP NHẬT INNERHTML VỚI CẤU TRÚC ĐÃ SỬA ĐỔI ===
        // =========================================================
        card.innerHTML = `
            <div class="cc-header">
                <!-- Item 1: Tên bàn (căn trái) -->
                <div class="cc-name-wrapper">
                    <span class="cc-name">${displayName}</span>
                </div>
                
                <!-- Item 2: Khối bên phải (chứa stats và live) -->
                <div class="cc-header-right">
                    <!-- Khối thống kê đã được chuyển vào đây -->
                    <div class="inline-stats">
                        <div class="stat-item-inline player">
                            <span class="stat-count-inline">${pCount}</span>
                            <span class="stat-label-inline">PLAYER</span>
                        </div>
                        <div class="stat-item-inline tie">
                            <span class="stat-count-inline">${tCount}</span>
                            <span class="stat-label-inline">HÒA</span>
                        </div>
                        <div class="stat-item-inline banker">
                            <span class="stat-count-inline">${bCount}</span>
                            <span class="stat-label-inline">BANKER</span>
                        </div>
                    </div>

                    <!-- Trạng thái Live -->
                    <div class="live-status" style="color:${liveColor};">${liveStatus}</div>
                </div>
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
        // =======================================================
        
        grid.appendChild(card);
    });
}

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