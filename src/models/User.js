// --- START OF FILE models/User.js ---

const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        minlength: 3, 
        maxlength: 20 
    },
    // --- CẬP NHẬT: THÊM TRƯỜNG PHONE ---
    phone: {
        type: String,
        default: 'Chưa cập nhật'
    },
    // -----------------------------------
    password: { 
        type: String, 
        required: true 
    },
    role: { 
        type: String, 
        enum: ['user', 'admin', 'superadmin'], 
        default: 'user' 
    },
    tokens: { 
        type: Number, 
        default: 0 
    },
    createdBy: { 
        type: mongoose.Schema.Types.ObjectId, 
        ref: 'User' 
    },
    createdAt: { 
        type: Date, 
        default: Date.now 
    }
});

module.exports = mongoose.model('User', UserSchema);