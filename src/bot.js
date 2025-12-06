// --- START OF FILE bot.js (V6 - XỬ LÝ RESET BÀN CƯỢC) ---

const puppeteer = require('puppeteer');
const axios = require('axios');

// =========================================================
// CẤU HÌNH HỆ THỐNG
// =========================================================
const CHROME_DEBUG_URL = 'http://127.0.0.1:9222';
//const REMOTE_SERVER_API = 'https://hack-bcr-vip.onrender.com/api/update';
const REMOTE_SERVER_API = 'http://localhost:3000/api/update'; // Dùng khi test localhost
// BỘ NHỚ LƯU TRỮ TRẠNG THÁI CỦA CÁC BÀN
const lastKnownState = new Map();

// =========================================================
// HÀM TIỆN ÍCH
// =========================================================
function generatePlausibleHistory(p, b, t) {
    const historyArray = [];
    for (let i = 0; i < p; i++) historyArray.push('P');
    for (let i = 0; i < b; i++) historyArray.push('B');
    for (let i = 0; i < t; i++) historyArray.push('T');

    for (let i = historyArray.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [historyArray[i], historyArray[j]] = [historyArray[j], historyArray[i]];
    }
    return historyArray.join('');
}

// =========================================================
// LOGIC BOT CHÍNH
// =========================================================
(async () => {
    try {
        console.clear();
        console.log('╔═══════════════════════════════════════════════╗');
        console.log('║ BOT SNIFFER V6 - NEW SHOE DETECTION ENGINE    ║');
        console.log('╚═══════════════════════════════════════════════╝');
        console.log('1. Đang kết nối vào Chrome Debug...');
        
        const browser = await puppeteer.connect({ browserURL: CHROME_DEBUG_URL, defaultViewport: null });
        console.log('>>> KẾT NỐI CHROME THÀNH CÔNG! <<<');

        const pages = await browser.pages();
        if (pages.length === 0) throw new Error('Không tìm thấy Tab nào!');

        let page = pages.find(p => p.url().toLowerCase().includes('hackbcr99'));
        if (!page) {
            console.log('⚠️ Không tìm thấy tab hackbcr99, lấy tạm Tab đầu tiên...');
            page = pages[0];
        }

        console.log(`✅ Đang theo dõi dữ liệu tại tab: ${page.url()}`);
        console.log(`📡 Đích đến Server: ${REMOTE_SERVER_API}`);
        console.log('--- ĐANG CHỜ GÓI TIN TỪ NHÀ CÁI ---');

        await page.setRequestInterception(false);

        page.on('response', async (response) => {
            if (response.url().includes('tables?web=a') && response.headers()['content-type']?.includes('application/json')) {
                try {
                    const jsonResponse = await response.json();
                    const tablesFromAPI = jsonResponse.data;

                    if (Array.isArray(tablesFromAPI) && tablesFromAPI.length > 0) {
                        const transformedData = [];

                        for (const currentTable of tablesFromAPI) {
                            const tableId = currentTable.id;
                            const previousState = lastKnownState.get(tableId);
                            let newHistory = '';

                            if (previousState) {
                                // Bàn đã tồn tại trong bộ nhớ, tiến hành so sánh
                                const previousTotal = previousState.player + previousState.banker + previousState.tie;
                                const currentTotal = currentTable.player + currentTable.banker + currentTable.tie;

                                // *** LOGIC PHÁT HIỆN RESET BÀN MỚI ***
                                // Điều kiện: Tổng số ván hiện tại nhỏ hơn tổng số ván cũ VÀ nhỏ hơn 10 (để chắc chắn là ván mới)
                                if (currentTotal < previousTotal && currentTotal < 10) {
                                    // -- KỊCH BẢN 1: BÀN ĐÃ RESET --
                                    console.log(`[RESET] Bàn ${tableId} đã bắt đầu ván mới! Đang reset lịch sử...`);
                                    newHistory = generatePlausibleHistory(
                                        currentTable.player,
                                        currentTable.banker,
                                        currentTable.tie
                                    );
                                } else {
                                    // -- KỊCH BẢN 2: BÀN CẬP NHẬT KẾT QUẢ MỚI (BÌNH THƯỜNG) --
                                    let lastResult = '';
                                    if (currentTable.player > previousState.player) lastResult = 'P';
                                    else if (currentTable.banker > previousState.banker) lastResult = 'B';
                                    else if (currentTable.tie > previousState.tie) lastResult = 'T';
                                    newHistory = previousState.history + lastResult;
                                }

                            } else {
                                // -- KỊCH BẢN 3: PHÁT HIỆN BÀN LẦN ĐẦU TIÊN --
                                console.log(`[INIT] Phát hiện bàn mới ${tableId}. Đang tạo lịch sử giả lập...`);
                                newHistory = generatePlausibleHistory(
                                    currentTable.player,
                                    currentTable.banker,
                                    currentTable.tie
                                );
                            }

                            // Cập nhật lại bộ nhớ với trạng thái mới nhất
                            lastKnownState.set(tableId, {
                                player: currentTable.player,
                                banker: currentTable.banker,
                                tie: currentTable.tie,
                                history: newHistory
                            });

                            // Chuyển đổi cấu trúc để gửi đi
                            transformedData.push({
                                table_id: tableId,
                                table_name: `BÀN ${tableId}`,
                                result: newHistory,
                                status: 1
                            });
                        }

                        const time = new Date().toLocaleTimeString();
                        console.log(`[${time}] ⚡ Xử lý thành công ${transformedData.length} bàn. Đang gửi lên server...`);
                        
                        await axios.post(REMOTE_SERVER_API, { data: transformedData })
                            .then(() => console.log(`   ---> ✅ Gửi thành công!`))
                            .catch((err) => console.error(`   ---> ❌ Lỗi khi gửi: ${err.message}`));
                    }
                } catch (e) { /* Bỏ qua lỗi */ }
            }
        });

        browser.on('disconnected', () => {
            console.log('❌ Mất kết nối với Chrome!');
            process.exit();
        });

    } catch (err) {
        console.error('❌ LỖI KẾT NỐI:', err.message);
        console.log('------------------------------------------------');
        console.log('HƯỚNG DẪN: Chạy lại Chrome và khởi động lại bot.');
    }
})();