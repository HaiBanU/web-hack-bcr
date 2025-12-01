const mongoose = require('mongoose');

const UserSchema = new mongoose.Schema({
    username: { 
        type: String, 
        required: true, 
        unique: true, 
        minlength: 3, // <--- SỬA THÀNH 3 CHO DỄ TEST
        maxlength: 20 
    },
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