require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const http = require('http');
const { Server } = require("socket.io");
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('./models/User');

const app = express();
app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// KẾT NỐI MONGODB
mongoose.connect(process.env.MONGO_URI)
    .then(() => console.log('✅ KẾT NỐI DB THÀNH CÔNG'))
    .catch(err => console.log('❌ LỖI DB', err));

const JWT_SECRET = process.env.JWT_SECRET || 'secret';
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

// MIDDLEWARE AUTH
const authenticate = (req, res, next) => {
    const token = req.headers['authorization'];
    if (!token) return res.status(403).json({ message: 'No Token' });
    try {
        const decoded = jwt.verify(token, JWT_SECRET);
        req.user = decoded;
        next();
    } catch (err) { res.status(401).json({ message: 'Token Invalid' }); }
};

// --- AUTH API ---
app.post('/api/register', async (req, res) => {
    const { username, password } = req.body;
    try {
        const exists = await User.findOne({ username });
        if(exists) return res.status(400).json({ message: 'Tên đã tồn tại' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, role: 'user', tokens: 0 });
        res.json({ status: 'success' });
    } catch (err) { res.status(500).json({ message: 'Lỗi server' }); }
});

app.post('/api/login', async (req, res) => {
    const { username, password } = req.body;
    const user = await User.findOne({ username });
    if (!user || !(await bcrypt.compare(password, user.password))) 
        return res.status(400).json({ message: 'Sai thông tin' });
    
    const token = jwt.sign({ userId: user._id, role: user.role, username: user.username }, JWT_SECRET);
    res.json({ status: 'success', token, role: user.role, username: user.username, tokens: user.tokens });
});

app.get('/api/me', authenticate, async (req, res) => {
    try {
        const user = await User.findById(req.user.userId).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found' });
        res.json(user);
    } catch(e) { res.status(500).json({ message: 'Error' }); }
});

// --- QUẢN LÝ USER API ---
app.get('/api/users', authenticate, async (req, res) => {
    let query = {};
    if (req.user.role === 'superadmin') query = { role: 'admin' };
    else if (req.user.role === 'admin') query = { role: 'user', createdBy: req.user.userId };
    else return res.status(403).json({ message: 'Cấm' });
    
    const list = await User.find(query).select('-password').sort({ createdAt: -1 });
    res.json(list);
});

app.post('/api/create-admin', authenticate, async (req, res) => {
    if (req.user.role !== 'superadmin') return res.status(403).json({ message: 'Cấm' });
    try {
        const { username, password } = req.body;
        const exists = await User.findOne({ username });
        if(exists) return res.status(400).json({ message: 'Tên tồn tại' });
        const hashedPassword = await bcrypt.hash(password, 10);
        await User.create({ username, password: hashedPassword, role: 'admin', createdBy: req.user.userId, tokens: 0 });
        res.json({ status: 'success', message: 'Tạo đại lý thành công' });
    } catch(e) { res.status(500).json({ message: 'Lỗi' }); }
});

app.post('/api/import-member', authenticate, async (req, res) => {
    if (req.user.role !== 'admin') return res.status(403).json({ message: 'Cấm' });
    try {
        const target = await User.findOne({ username: req.body.username, role: 'user' });
        if (!target) return res.status(404).json({ message: 'Không tìm thấy User' });
        target.createdBy = req.user.userId;
        await target.save();
        res.json({ status: 'success', message: `Đã thêm ${req.body.username}` });
    } catch(e) { res.status(500).json({ message: 'Lỗi' }); }
});

// --- NẠP RÚT API ---
app.post('/api/add-tokens', authenticate, async (req, res) => {
    const { targetUserId, amount } = req.body;
    const amt = Number(amount);
    try {
        if (req.user.role === 'superadmin') {
            await User.findByIdAndUpdate(targetUserId, { $inc: { tokens: amt } });
            return res.json({ status: 'success', message: 'Đã bơm vốn thành công' });
        }
        if (req.user.role === 'admin') {
            const admin = await User.findById(req.user.userId);
            const user = await User.findById(targetUserId);
            if (admin.tokens < amt) return res.status(400).json({ message: 'Kho không đủ Token!' });
            
            admin.tokens -= amt; user.tokens += amt;
            await admin.save(); await user.save();
            return res.json({ status: 'success', message: 'Đã nạp cho khách' });
        }
        res.status(403).json({ message: 'Cấm' });
    } catch(e) { res.status(500).json({ message: 'Lỗi' }); }
});

app.post('/api/revoke-tokens', authenticate, async (req, res) => {
    const { targetUserId, amount } = req.body;
    const amt = Number(amount);
    try {
        if (req.user.role === 'superadmin') {
            const u = await User.findById(targetUserId);
            if(u.tokens < amt) return res.status(400).json({ message: 'Không đủ để thu hồi' });
            u.tokens -= amt; await u.save();
            return res.json({ status: 'success', message: 'Đã thu hồi' });
        }
        if (req.user.role === 'admin') {
            const admin = await User.findById(req.user.userId);
            const user = await User.findById(targetUserId);
            if (user.tokens < amt) return res.status(400).json({ message: 'Khách không đủ tiền' });
            
            user.tokens -= amt; admin.tokens += amt;
            await user.save(); await admin.save();
            return res.json({ status: 'success', message: 'Đã thu hồi về kho' });
        }
        res.status(403).json({ message: 'Cấm' });
    } catch(e) { res.status(500).json({ message: 'Lỗi' }); }
});

app.post('/api/delete-user', authenticate, async (req, res) => {
    if (req.user.role === 'user') return res.status(403).json({ message: 'Cấm' });
    await User.findByIdAndDelete(req.body.targetId);
    res.json({ status: 'success' });
});

// --- GAME LOGIC (UPDATED FEE = 5) ---
app.post('/api/enter-table', authenticate, async (req, res) => {
    const user = await User.findById(req.user.userId);
    if (user.role === 'superadmin') return res.json({ status: 'success', remaining: 'VIP' });
    
    // CẬP NHẬT: Trừ 5 Token
    if (user.tokens < 5) return res.json({ status: 'fail', message: 'HẾT TOKEN (Cần 5)' });
    user.tokens -= 5; await user.save();
    
    res.json({ status: 'success', remaining: user.tokens });
});

app.post('/api/deduct-periodic', authenticate, async (req, res) => {
    const user = await User.findById(req.user.userId);
    if (!user || user.role === 'superadmin') return res.json({ status: 'success', remaining: 'VIP' });
    
    // CẬP NHẬT: Trừ 5 Token
    if (user.tokens < 5) return res.status(400).json({ status: 'fail' });
    user.tokens -= 5; await user.save();
    
    res.json({ status: 'success', remaining: user.tokens });
});

// REALTIME
let database = [];
io.on('connection', (s) => s.emit('server_update', database));
app.post('/api/update', (req, res) => { if(req.body.data){ database=req.body.data; io.emit('server_update',database); } res.json({status:'ok'}); });
app.get('/api/tables', (req, res) => res.json({status:'success', data:database}));
app.get('/', (req, res) => res.sendFile(path.join(__dirname, '../public/login.html')));

server.listen(process.env.PORT || 3000, () => console.log('>>> SERVER ĐANG CHẠY (FEE 5 TOKEN) <<<'));