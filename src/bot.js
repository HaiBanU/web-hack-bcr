const puppeteer = require('puppeteer');
const axios = require('axios');

// CẤU HÌNH
const CHROME_DEBUG_URL = 'http://127.0.0.1:9222';
const LOCAL_SERVER_API = 'http://localhost:3000/api/update'; // Đường dẫn Server nội bộ

(async () => {
    try {
        console.log('1. Đang kết nối vào Chrome Debug...');
        
        // Kết nối vào Chrome đang mở
        const browser = await puppeteer.connect({
            browserURL: CHROME_DEBUG_URL,
            defaultViewport: null
        });

        console.log('>>> ĐÃ KẾT NỐI THÀNH CÔNG! <<<');

        // --- PHẦN XỬ LÝ TÌM TAB (ĐÃ SỬA LỖI CHỐNG SẬP) ---
        
        // Lấy danh sách tất cả các tab đang mở
        const pages = await browser.pages();
        console.log(`DEBUG: Tìm thấy ${pages.length} tab đang mở.`);

        // Kiểm tra nếu không có tab nào
        if (pages.length === 0) {
            console.error('❌ LỖI: Không tìm thấy Tab nào!');
            console.error('👉 Nguyên nhân: Chrome bị treo hoặc bạn chưa mở trang web.');
            console.error('👉 Khắc phục: Tắt hết Chrome (Task Manager) rồi chạy lại lệnh mở Chrome Debug.');
            return; 
        }

        // Tìm tab Game theo từ khóa (hack, sexy, lobby, casino...)
        let page = pages.find(p => 
            p.url().includes('hack') || 
            p.url().includes('sexy') || 
            p.url().includes('casino') || 
            p.url().includes('lobby')
        );

        // Nếu không tìm thấy tab đúng tên, lấy tạm tab đầu tiên
        if (!page) {
            console.log('⚠️ Không tìm thấy tab Game chuẩn, lấy tạm Tab đầu tiên...');
            page = pages[0];
        }

        // Kiểm tra lần cuối
        if (!page) {
            console.error('❌ Lỗi không xác định: Không thể truy cập vào Tab.');
            return;
        }

        console.log('✅ Đang theo dõi dữ liệu tại tab:', page.url());
        console.log('--- ĐANG CHỜ GÓI TIN TỪ NHÀ CÁI ---');

        // --- PHẦN LẮNG NGHE MẠNG (NETWORK SNIFFING) ---
        
        page.on('response', async (response) => {
            const url = response.url();
            
            // Chỉ bắt các gói tin chứa 'getnewresult' (hoặc từ khóa khác nếu nhà cái đổi)
            // Và loại bỏ các request OPTIONS (preflight)
            if (url.includes('getnewresult') && response.request().method() !== 'OPTIONS') {
                try {
                    // Kiểm tra xem nội dung trả về có phải JSON không
                    const contentType = response.headers()['content-type'];
                    if (contentType && contentType.includes('application/json')) {
                        
                        // Lấy dữ liệu JSON
                        const json = await response.json();

                        // Kiểm tra xem đúng cấu trúc data bàn chơi không
                        if (json && json.data) {
                            const time = new Date().toLocaleTimeString();
                            console.log(`[${time}] ⚡ Bắt được dữ liệu! Đang gửi về Server...`);

                            // Gửi về Server Local (server.js)
                            await axios.post(LOCAL_SERVER_API, { data: json.data });
                        }
                    }
                } catch (e) {
                    // Lỗi nhỏ khi parse JSON hoặc kết nối server (bỏ qua để bot chạy tiếp)
                    // console.error('Lỗi xử lý gói tin:', e.message);
                }
            }
        });

        // Giữ cho process không bị tắt (thực ra puppeteer.connect đã giữ rồi, nhưng thêm log đóng)
        browser.on('disconnected', () => {
            console.log('❌ Mất kết nối với Chrome! Vui lòng chạy lại.');
            process.exit();
        });

    } catch (err) {
        console.error('❌ LỖI KẾT NỐI NGHIÊM TRỌNG:', err.message);
        console.log('------------------------------------------------');
        console.log('HƯỚNG DẪN SỬA LỖI:');
        console.log('1. Vào Task Manager -> Tắt sạch sẽ mọi tiến trình chrome.exe');
        console.log('2. Chạy lại lệnh mở Chrome Debug trong CMD/Run.');
        console.log('3. Mở trang web hackbcr lên trước.');
        console.log('4. Chạy lại: node src/bot.js');
    }
})();