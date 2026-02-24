const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    email: {
        type: String,
        required: [true, 'Email is required'],
        unique: true,
        trim: true,
        lowercase: true
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: 6
    },
    role: {
        type: String,
        enum: ['student', 'admin'],
        default: 'student'
    },
    // ── Student-specific fields ──
    registrationNumber: {
        type: String,
        unique: true,
        sparse: true, // allows null for admins
        trim: true,
        uppercase: true
    },
    phone: {
        type: String,
        unique: true,
        sparse: true,
        trim: true
    },
    branch: {
        type: String,
        trim: true,
        uppercase: true
    },
    year: {
        type: Number,
        min: 1,
        max: 4
    },
    section: {
        type: String,
        trim: true,
        uppercase: true
    },
    isCoordinator: {
        type: Boolean,
        default: false
    },
    // ── Admin profile fields (all optional) ──
    department: {
        type: String,
        trim: true
    },
    designation: {
        type: String,
        enum: ['HOD', 'Professor', 'Assistant Professor', 'Principal', ''],
        default: ''
    },
    teachingSubject: {
        type: String,
        trim: true
    },
    adminBranch: {
        type: String,
        trim: true
    },
    phdDetails: {
        type: String,
        trim: true
    },
    btechDetails: {
        type: String,
        trim: true
    }
}, { timestamps: true });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    const salt = await bcrypt.genSalt(10);
    this.password = await bcrypt.hash(this.password, salt);
    next();
});

// Compare entered password with hashed password
userSchema.methods.matchPassword = async function (enteredPassword) {
    return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);
