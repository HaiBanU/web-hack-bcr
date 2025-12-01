/* =========================================
   LOBBY MANAGER - V9.0 (FIXED)
   ========================================= */

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
    if(rawData.length > 70) rawData = rawData.slice(-70); // Show ít hơn chút cho đẹp card
    
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
    while(columns.length < 20) { columns.push([]); } // Fill ô trống

    // Sử dụng class tương tự như Tool page để đồng bộ CSS
    let html = '<div class="road-grid-wrapper">';
    let displayCols = columns.slice(-20); 
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
        else if(grid) grid.innerHTML = '<div style="color:#0f0; text-align:center; padding:50px;">ĐANG QUÉT DỮ LIỆU TỪ NHÀ CÁI...</div>';
    });
}

function renderTables(data) {
    if(!grid) return;
    grid.innerHTML = ''; 
    let processedData = data.map(item => {
        const resultStr = item.result || "";
        let isInterrupted = false;
        // Logic lọc bàn rác
        if (!resultStr || resultStr.length < 5) isInterrupted = true;
        if (item.status === 0 || item.status === '0') isInterrupted = true;
        
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
        // Hiệu ứng bàn đẹp
        if (!isInterrupted && winRate >= 90) cardClass += ' high-rate';
        
        const card = document.createElement('div');
        card.className = cardClass;
        
        // --- SỰ KIỆN CLICK BÀN ---
        card.onclick = () => {
            if (isInterrupted) return;
            const token = localStorage.getItem('token');
            if (!token) {
                alert("⛔ VUI LÒNG ĐĂNG NHẬP!");
                window.location.href = 'login.html';
                return;
            }
            // Hiện Modal
            const modal = document.getElementById('confirmModal');
            const btnYes = document.getElementById('btnConfirmAction');
            if(modal) {
                modal.style.display = 'flex'; // Dùng Flex để căn giữa
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
                            alert("⚠️ " + (respData.message || "HẾT TOKEN!")); 
                        }
                    } catch (e) { alert("Lỗi kết nối!"); }
                };
            }
        };

        const rateDisplay = isInterrupted ? 'N/A' : `WIN ${winRate}%`;
        const liveStatus = isInterrupted ? 'OFFLINE ●' : 'LIVE ●';
        const liveColor = isInterrupted ? '#666' : '#0f0';
        
        let overlayHTML = '';
        if (isInterrupted) {
            overlayHTML = `
                <div style="position:absolute;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);display:flex;justify-content:center;align-items:center;z-index:5;">
                    <div style="color:#666; font-family:'Orbitron';">BẢO TRÌ</div>
                </div>
            `;
        }

        card.innerHTML = `
            <div class="cc-header">
                <div><span class="cc-name">${displayName}</span></div>
                <div style="color:${liveColor}; font-size:0.7rem; font-weight:bold;">${liveStatus}</div>
            </div>
            <div class="cc-body">
                <div class="cc-grid-area">${generateGridHTML(resultStr)}${overlayHTML}</div>
                <div class="cc-predict-area">
                    <span style="color:#aaa; font-size:0.6rem;">AI GỢI Ý</span>
                    <span style="color:${isInterrupted ? '#555' : '#0f0'}; font-weight:bold; margin-top:5px;">CẦU ĐẸP</span>
                    <div class="cc-rate" style="margin-top:10px;">${rateDisplay}</div>
                </div>
            </div>
            <div class="cc-footer">
                <span>Dữ liệu: ${resultStr.length} phiên</span>
                <button class="btn-join" ${isInterrupted ? 'disabled style="opacity:0.3"' : ''}>${isInterrupted ? 'LOCKED' : 'HACK'}</button>
            </div>
        `;
        grid.appendChild(card);
    });
}