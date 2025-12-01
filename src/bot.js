const puppeteer = require('puppeteer');
const axios = require('axios');

// =========================================================
// CẤU HÌNH HỆ THỐNG
// =========================================================

// 1. Cổng Debug của Chrome trên máy tính/VPS (Giữ nguyên)
const CHROME_DEBUG_URL = 'http://127.0.0.1:9222';

// 2. Đường dẫn Server trên Render (Đã cập nhật theo ảnh bạn gửi)
const REMOTE_SERVER_API = 'https://hack-bcr-vip.onrender.com/api/update';

// =========================================================
// LOGIC BOT (KHÔNG CẦN SỬA GÌ DƯỚI NÀY)
// =========================================================

(async () => {
    try {
        console.clear();
        console.log('╔═══════════════════════════════════════════════╗');
        console.log('║        BOT SNIFFER - SYSTEM V3 (HYBRID)       ║');
        console.log('╚═══════════════════════════════════════════════╝');
        console.log('1. Đang kết nối vào Chrome Debug...');
        
        // Kết nối vào Chrome đang mở
        const browser = await puppeteer.connect({
            browserURL: CHROME_DEBUG_URL,
            defaultViewport: null
        });

        console.log('>>> KẾT NỐI CHROME THÀNH CÔNG! <<<');

        // Lấy danh sách tất cả các tab đang mở
        const pages = await browser.pages();
        console.log(`DEBUG: Tìm thấy ${pages.length} tab đang mở.`);

        if (pages.length === 0) {
            console.error('❌ LỖI: Không tìm thấy Tab nào!');
            console.error('👉 Nguyên nhân: Chrome bị treo hoặc bạn chưa mở trang web.');
            return; 
        }

        // Tìm tab Game theo từ khóa (hack, sexy, lobby, casino...)
        // Ưu tiên tìm tab có chữ "sexy" hoặc "casino"
        let page = pages.find(p => 
            p.url().toLowerCase().includes('sexy') || 
            p.url().toLowerCase().includes('casino') || 
            p.url().toLowerCase().includes('lobby') ||
            p.url().toLowerCase().includes('baccarat')
        );

        // Nếu không tìm thấy tab đúng tên, lấy tạm tab đầu tiên
        if (!page) {
            console.log('⚠️ Không tìm thấy tab Game chuẩn, lấy tạm Tab đầu tiên đang mở...');
            page = pages[0];
        }

        console.log(`✅ Đang theo dõi dữ liệu tại tab: ${page.url()}`);
        console.log(`📡 Đích đến Server: ${REMOTE_SERVER_API}`);
        console.log('--- ĐANG CHỜ GÓI TIN TỪ NHÀ CÁI ---');

        // --- PHẦN LẮNG NGHE MẠNG (NETWORK SNIFFING) ---
        await page.setRequestInterception(false); // Đảm bảo không chặn request

        page.on('response', async (response) => {
            const url = response.url();
            const method = response.request().method();
            
            // Chỉ bắt các gói tin GET/POST chứa từ khóa quan trọng
            // (Thường là getnewresult, update, hoặc các api trả về JSON của nhà cái)
            if ((url.includes('getnewresult') || url.includes('GetTableList')) && method !== 'OPTIONS') {
                try {
                    const contentType = response.headers()['content-type'];
                    
                    // Chỉ xử lý nếu là JSON
                    if (contentType && contentType.includes('application/json')) {
                        const json = await response.json();

                        // Kiểm tra cấu trúc data (tùy nhà cái mà json.data hoặc json.message)
                        if (json) {
                            const time = new Date().toLocaleTimeString();
                            
                            // Gửi dữ liệu lên Render
                            console.log(`[${time}] ⚡ Bắt được dữ liệu! Đang bắn lên Render...`);
                            
                            // Gửi request POST lên Server Render
                            await axios.post(REMOTE_SERVER_API, { data: json.data || json })
                                .then(() => {
                                    console.log(`   ---> ✅ Gửi thành công!`);
                                })
                                .catch((err) => {
                                    console.error(`   ---> ❌ Lỗi gửi Render: ${err.message}`);
                                    if(err.response) console.error(`       Status: ${err.response.status}`);
                                });
                        }
                    }
                } catch (e) {
                    // Bỏ qua lỗi parse JSON không quan trọng
                }
            }
        });

        // Giữ kết nối khi Chrome bị tắt đột ngột
        browser.on('disconnected', () => {
            console.log('❌ Mất kết nối với Chrome! Vui lòng chạy lại bot.');
            process.exit();
        });

    } catch (err) {
        console.error('❌ LỖI KẾT NỐI:', err.message);
        console.log('------------------------------------------------');
        console.log('HƯỚNG DẪN CHẠY LẠI:');
        console.log('1. Tắt hết Chrome.');
        console.log('2. Chạy lệnh mở Chrome Debug:');
        console.log('   "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe" --remote-debugging-port=9222 --user-data-dir="C:\\ChromeProfile"');
        console.log('3. Vào web game.');
        console.log('4. Chạy lại: node src/bot.js');
    }
})();