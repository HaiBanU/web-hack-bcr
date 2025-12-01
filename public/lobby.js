/* =========================================
   LOBBY MANAGER - UPDATED V4.0
   ========================================= */

// --- 1. HIỆU ỨNG NỀN MATRIX ---
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;

function resizeCanvas() { 
    if(canvas) { 
        canvas.width = window.innerWidth; 
        canvas.height = window.innerHeight; 
    } 
}
resizeCanvas(); 
window.addEventListener('resize', resizeCanvas);

const chars = "01_XY_HACK_99_SYSTEM_CONNECT"; 
const drops = canvas ? Array(Math.floor(canvas.width / 20)).fill(1) : [];

function drawMatrix() {
    if(!ctx) return;
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; 
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.fillStyle = "#0F0"; 
    ctx.font = "14px monospace"; 
    
    for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 20, drops[i] * 20);
        if (drops[i] * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
    }
}
setInterval(drawMatrix, 50);

// --- 2. HÀM VẼ CẦU (GRID) ---
function generateGridHTML(resultStr) {
    let processedData = [];
    let rawData = resultStr.split('');
    if(rawData.length > 80) rawData = rawData.slice(-80);
    
    rawData.forEach(char => {
        if (char === 'T') { 
            if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; 
        } else { 
            processedData.push({ type: char, hasTie: false }); 
        }
    });

    let columns = []; 
    let currentCol = []; 
    let lastType = null;

    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { 
            columns.push(currentCol); 
            currentCol = []; 
        }
        currentCol.push(item); 
        lastType = item.type;
        
        if (currentCol.length >= 6) { 
            columns.push(currentCol); 
            currentCol = []; 
            lastType = null; 
        }
    });
    
    if (currentCol.length > 0) columns.push(currentCol);
    while(columns.length < 25) { columns.push([]); }

    let html = '<div class="road-grid-wrapper">';
    let displayCols = columns.slice(-25); 
    
    displayCols.forEach(col => {
        html += '<div class="road-col">';
        for (let r = 0; r < 6; r++) {
            let cellContent = ''; 
            let node = col[r];
            if (node) {
                let colorClass = (node.type === 'P') ? 'p' : 'b';
                let tieClass = node.hasTie ? 'tie-slash' : '';
                cellContent = `<div class="bead ${colorClass} ${tieClass}"></div>`;
            }
            html += `<div class="road-cell">${cellContent}</div>`;
        }
        html += '</div>';
    });
    html += '</div>';
    return html;
}

// --- 3. KẾT NỐI SOCKET & RENDER ---
const grid = document.getElementById('tablesGrid');
let socket;
try { socket = io(); } catch(e) { console.log('Socket err'); }

if (socket) {
    socket.on('server_update', (data) => {
        if (data && data.length > 0) renderTables(data);
        else if(grid) grid.innerHTML = '<div style="color:#0f0; grid-column:1/-1; text-align:center; padding:50px;">ĐANG QUÉT DỮ LIỆU TỪ NHÀ CÁI...</div>';
    });
}

// --- [LOGIC MỚI] RENDER TABLE CẬP NHẬT ---
function renderTables(data) {
    if(!grid) return;
    grid.innerHTML = ''; 

    // BƯỚC 1: XỬ LÝ DỮ LIỆU (Tạo Win Rate & Kiểm tra lỗi)
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        
        // Logic 1: Xác định bàn lỗi/gián đoạn (Nếu dữ liệu rỗng hoặc quá ngắn < 3 ký tự)
        const isInterrupted = (!resultStr || resultStr.length < 3);

        // Logic 2: Random tỷ lệ thắng từ 70% đến 95%
        // Công thức: Math.floor(Math.random() * (Max - Min + 1)) + Min
        let winRate = Math.floor(Math.random() * (95 - 70 + 1)) + 70;

        // Nếu bàn bị gián đoạn, set tỷ lệ về -1 để nó chìm xuống dưới cùng khi sort
        let sortRate = isInterrupted ? -1 : winRate;

        // Làm đẹp tên bàn
        let displayName = item.table_name.toUpperCase().replace("BACCARAT", "BÀN").trim();
        if (!displayName.includes("BÀN")) displayName = "BÀN " + displayName;

        return { ...item, resultStr, isInterrupted, winRate, sortRate, displayName };
    });

    // BƯỚC 2: SẮP XẾP (Win Rate cao xếp trên)
    processedData.sort((a, b) => b.sortRate - a.sortRate);

    // BƯỚC 3: RENDER HTML
    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, displayName } = item;

        // Tạo thẻ Card
        const card = document.createElement('div');
        
        // Thêm class 'high-rate' nếu tỷ lệ >= 90% (Bàn VIP)
        // Thêm class 'interrupted-card' nếu lỗi
        let cardClass = 'casino-card';
        if (!isInterrupted && winRate >= 90) cardClass += ' high-rate';
        if (isInterrupted) cardClass += ' interrupted-card';
        
        card.className = cardClass;

        // --- SỰ KIỆN CLICK ---
        card.onclick = () => {
            if (isInterrupted) {
                // Không cho vào bàn lỗi
                // alert("⚠️ Bàn này đang mất tín hiệu, vui lòng chọn bàn khác!");
                return;
            }
            
            const token = localStorage.getItem('token');
            // 1. CHƯA ĐĂNG NHẬP
            if (!token) {
                if(confirm("⛔ YÊU CẦU ĐĂNG NHẬP!\nBạn cần đăng nhập để xem dữ liệu.")) {
                    window.location.href = 'login.html';
                }
                return;
            }

            // 2. MỞ POPUP XÁC NHẬN
            const modal = document.getElementById('confirmModal');
            const btnYes = document.getElementById('btnConfirmAction');
            
            if(modal) {
                modal.style.display = 'flex'; 
                btnYes.onclick = async () => {
                    modal.style.display = 'none';
                    try {
                        const res = await fetch('/api/enter-table', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': token }
                        });
                        const respData = await res.json();

                        if (respData.status === 'success') {
                            window.location.href = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
                        } else {
                            alert("⚠️ CẢNH BÁO HẾT TOKEN!\n\nVui lòng liên hệ Admin để nạp thêm.");
                        }
                    } catch (e) { alert("Lỗi kết nối!"); }
                };
            }
        };

        // --- NỘI DUNG CARD ---
        
        // Hiển thị tỷ lệ thắng
        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const rateClass = isInterrupted ? 'rate-error' : 'cc-rate';

        // Nội dung Body: Grid hoặc Thông báo lỗi
        let bodyContent = '';
        if (isInterrupted) {
            bodyContent = `
                <div class="interrupted-box">
                    <div class="warn-icon">⚠️</div>
                    <div class="warn-text">MẤT TÍN HIỆU</div>
                    <div class="warn-sub">Đang dò tìm tần số máy chủ...</div>
                </div>
            `;
        } else {
            bodyContent = `
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area">
                    <span style="color:#aaa; font-size:0.6rem;">AI GỢI Ý</span>
                    <span style="color:#0f0; font-weight:bold;">Cầu Đẹp</span>
                </div>
            `;
        }

        // Render Card HTML
        card.innerHTML = `
            <div class="cc-header">
                <div>
                    <span class="cc-name">${displayName}</span>
                    <span class="${rateClass}">${rateDisplay}</span>
                </div>
                <div style="color:${isInterrupted ? '#666' : '#0f0'}; font-size:0.7rem;">
                    ${isInterrupted ? 'OFFLINE ●' : 'LIVE ●'}
                </div>
            </div>
            <div class="cc-body">
                ${bodyContent}
            </div>
            <div class="cc-footer">
                <span>Dữ liệu: ${isInterrupted ? '0' : resultStr.length}</span>
                <button class="btn-join" ${isInterrupted ? 'disabled style="opacity:0.5; background:#555; color:#aaa; cursor:not-allowed;"' : ''}>
                    ${isInterrupted ? 'CHỜ KẾT NỐI' : 'XÂM NHẬP'}
                </button>
            </div>
        `;
        grid.appendChild(card);
    });
}