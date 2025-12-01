/* =========================================
   LOBBY MANAGER - CẬP NHẬT
   ========================================= */
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
function resizeCanvas() { if(canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } }
resizeCanvas(); window.addEventListener('resize', resizeCanvas);

const chars = "01_XY_HACK_99"; 
const drops = canvas ? Array(Math.floor(canvas.width / 20)).fill(1) : [];
function drawMatrix() {
    if(!ctx) return;
    ctx.fillStyle = "rgba(0, 0, 0, 0.1)"; ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "#0F0"; ctx.font = "14px monospace"; 
    for (let i = 0; i < drops.length; i++) {
        const text = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(text, i * 20, drops[i] * 20);
        if (drops[i] * 20 > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
    }
}
setInterval(drawMatrix, 50);

function generateGridHTML(resultStr) {
    let processedData = [];
    let rawData = resultStr.split('');
    if(rawData.length > 80) rawData = rawData.slice(-80);
    rawData.forEach(char => {
        if (char === 'T') { if (processedData.length > 0) processedData[processedData.length - 1].hasTie = true; } 
        else { processedData.push({ type: char, hasTie: false }); }
    });
    let columns = []; let currentCol = []; let lastType = null;
    processedData.forEach(item => {
        if (lastType !== null && item.type !== lastType) { columns.push(currentCol); currentCol = []; }
        currentCol.push(item); lastType = item.type;
        if (currentCol.length >= 6) { columns.push(currentCol); currentCol = []; lastType = null; }
    });
    if (currentCol.length > 0) columns.push(currentCol);
    while(columns.length < 25) { columns.push([]); }

    let html = '<div class="road-grid-wrapper">';
    let displayCols = columns.slice(-25); 
    displayCols.forEach(col => {
        html += '<div class="road-col">';
        for (let r = 0; r < 6; r++) {
            let cellContent = ''; let node = col[r];
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

const grid = document.getElementById('tablesGrid');
let socket;
try { socket = io(); } catch(e) { console.log('Socket err'); }

if (socket) {
    socket.on('server_update', (data) => {
        if (data && data.length > 0) renderTables(data);
        else if(grid) grid.innerHTML = '<div style="color:#0f0; grid-column:1/-1; text-align:center; padding:50px;">WAITING DATA...</div>';
    });
}

function renderTables(data) {
    if(!grid) return;
    grid.innerHTML = ''; 
    data.sort((a, b) => {
        let numA = parseInt(a.table_name.replace(/\D/g, '')) || 0;
        let numB = parseInt(b.table_name.replace(/\D/g, '')) || 0;
        return numA - numB;
    });

    data.forEach(item => {
        const resultStr = item.result || "";
        let displayName = item.table_name.toUpperCase().replace("BACCARAT", "BÀN").trim();
        if (!displayName.includes("BÀN")) displayName = "BÀN " + displayName;
        let winRate = 85 + Math.floor(Math.random() * 14);

        const card = document.createElement('div');
        card.className = 'casino-card';

        // --- SỰ KIỆN CLICK (ĐÃ SỬA DÙNG MODAL) ---
        card.onclick = () => {
            const token = localStorage.getItem('token');
            // 1. CHƯA ĐĂNG NHẬP
            if (!token) {
                if(confirm("⛔ YÊU CẦU ĐĂNG NHẬP!\nBạn cần đăng nhập để xem dữ liệu.")) {
                    window.location.href = 'login.html';
                }
                return;
            }

            // 2. MỞ POPUP XÁC NHẬN (KHÔNG DÙNG ALERT NỮA)
            const modal = document.getElementById('confirmModal');
            const btnYes = document.getElementById('btnConfirmAction');
            
            if(modal) {
                modal.style.display = 'flex'; // Hiện modal
                
                // Gán sự kiện cho nút "XÂM NHẬP NGAY"
                btnYes.onclick = async () => {
                    // Đóng modal trước
                    modal.style.display = 'none';

                    // Gọi API
                    try {
                        const res = await fetch('/api/enter-table', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json', 'Authorization': token }
                        });
                        const respData = await res.json();

                        if (respData.status === 'success') {
                            window.location.href = `tool.html?tableId=${item.table_id}&tableName=${encodeURIComponent(displayName)}`;
                        } else {
                            alert("⚠️ CẢNH BÁO HẾT TOKEN!\n\nVui lòng liên hệ Admin để nạp thêm.");
                        }
                    } catch (e) { alert("Lỗi kết nối!"); }
                };
            }
        };
        // ------------------------------------------

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span><span class="cc-rate">WIN ${winRate}%</span></div>
                <div style="color:#666; font-size:0.7rem;">LIVE ●</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}</div>
                <div class="cc-predict-area"><span style="color:#aaa; font-size:0.6rem;">AI GỢI Ý</span><span style="color:#0f0;">Cầu Đẹp</span></div>
            </div>
            <div class="cc-footer"><span>Dữ liệu: ${resultStr.length}</span><button class="btn-join">XÂM NHẬP</button></div>
        `;
        grid.appendChild(card);
    });
}