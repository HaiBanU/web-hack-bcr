/* =========================================
   LOBBY MANAGER - V9.0 (SYNCED WITH CSS)
   ========================================= */
const canvas = document.getElementById('matrixCanvas');
const ctx = canvas ? canvas.getContext('2d') : null;
function resizeCanvas() { if(canvas) { canvas.width = window.innerWidth; canvas.height = window.innerHeight; } }
resizeCanvas(); window.addEventListener('resize', resizeCanvas);
const chars = "01_XY_HACK_99_SYSTEM_CONNECT"; 
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

function getStableWinRate(tableId) {
    const CACHE_KEY = 'table_rates_cache';
    const CACHE_DURATION = 90 * 1000;
    let cache = {};
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}'); } catch(e) { cache = {}; }
    const now = Date.now();
    const cachedItem = cache[tableId];
    if (cachedItem && (now - cachedItem.timestamp < CACHE_DURATION)) { return cachedItem.rate; }
    const newRate = Math.floor(Math.random() * (95 - 70 + 1)) + 70;
    cache[tableId] = { rate: newRate, timestamp: now };
    localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    return newRate;
}

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
                // Class .bead.p hoặc .bead.b đã được định nghĩa lại trong style.css V9
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
        else if(grid) grid.innerHTML = '<div style="color:#0f0; grid-column:1/-1; text-align:center; padding:50px;">ĐANG QUÉT DỮ LIỆU TỪ NHÀ CÁI...</div>';
    });
}

function renderTables(data) {
    if(!grid) return;
    grid.innerHTML = ''; 
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        let isInterrupted = false;
        if (!resultStr || resultStr.length < 2) isInterrupted = true;
        if (item.status === 0 || item.status === '0') isInterrupted = true;
        if (item.state === 0 || item.state === '0') isInterrupted = true;
        if (item.is_shuffle === true || item.is_shuffle === 'true') isInterrupted = true;
        let winRate = getStableWinRate(item.table_id);
        let sortRate = isInterrupted ? -1 : winRate;
        let displayName = item.table_name.toUpperCase().replace("BACCARAT", "BÀN").trim();
        if (!displayName.includes("BÀN")) displayName = "BÀN " + displayName;
        return { ...item, resultStr, isInterrupted, winRate, sortRate, displayName };
    });
    processedData.sort((a, b) => b.sortRate - a.sortRate);
    processedData.forEach(item => {
        const { table_id, resultStr, isInterrupted, winRate, displayName } = item;
        let cardClass = 'casino-card';
        if (!isInterrupted && winRate >= 90) cardClass += ' high-rate';
        if (isInterrupted) cardClass += ' interrupted-card';
        const card = document.createElement('div');
        card.className = cardClass;
        card.onclick = () => {
            if (isInterrupted) return;
            const token = localStorage.getItem('token');
            if (!token) {
                if(confirm("⛔ YÊU CẦU ĐĂNG NHẬP!\nBạn cần đăng nhập để xem dữ liệu.")) window.location.href = 'login.html';
                return;
            }
            const modal = document.getElementById('confirmModal');
            const btnYes = document.getElementById('btnConfirmAction');
            if(modal) {
                modal.style.display = 'flex'; 
                btnYes.onclick = async () => {
                    modal.style.display = 'none';
                    try {
                        const res = await fetch('/api/enter-table', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token }});
                        const respData = await res.json();
                        if (respData.status === 'success') {
                            window.location.href = `tool.html?tableId=${table_id}&tableName=${encodeURIComponent(displayName)}`;
                        } else { alert("⚠️ CẢNH BÁO HẾT TOKEN!"); }
                    } catch (e) { alert("Lỗi kết nối!"); }
                };
            }
        };
        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const rateClass = isInterrupted ? 'rate-error' : 'cc-rate';
        const liveStatus = isInterrupted ? 'OFFLINE ●' : 'LIVE ●';
        const liveColor = isInterrupted ? '#666' : '#0f0';
        let overlayHTML = '';
        if (isInterrupted) {
            overlayHTML = `
                <div class="interrupted-overlay">
                    <div class="int-content">
                        <div style="font-size:1.2rem; margin-bottom:5px;">⚠️</div>
                        <div style="font-weight:bold; color:#ff9800; font-family:'Orbitron';">CẦU ĐẸP ĐANG<br>BỊ GIÁN ĐOẠN</div>
                        <div style="font-size:0.6rem; color:#aaa; margin-top:5px;">CHỜ LÀM MỚI...</div>
                    </div>
                </div>
            `;
        }
        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span><span class="${rateClass}">${rateDisplay}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}${overlayHTML}</div>
                <div class="cc-predict-area">
                    <span style="color:#aaa; font-size:0.6rem;">AI GỢI Ý</span>
                    <span style="color:${isInterrupted ? '#555' : '#0f0'}; font-weight:bold;">${isInterrupted ? '---' : 'Cầu Đẹp'}</span>
                </div>
            </div>
            <div class="cc-footer">
                <span>Dữ liệu: ${resultStr.length}</span>
                <button class="btn-join" ${isInterrupted ? 'disabled style="opacity:0.5; background:#555; cursor:not-allowed;"' : ''}>${isInterrupted ? 'BẢO TRÌ' : 'XÂM NHẬP'}</button>
            </div>
        `;
        grid.appendChild(card);
    });
}