const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Generate JWT
const generateToken = (id) => {
    return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: '7d' });
};

// POST /api/auth/register
router.post('/register', async (req, res) => {
    try {
        const { name, email, password, role, registrationNumber, phone, branch, year, section } = req.body;

        // ── Basic required-field validation ──
        if (!name || !email || !password) {
            return res.status(400).json({ message: 'Name, email and password are required.' });
        }

        // For students, registrationNumber and phone are mandatory
        if (role !== 'admin') {
            if (!registrationNumber || !registrationNumber.trim()) {
                return res.status(400).json({ message: 'Registration number is required for students.' });
            }
            if (!phone || !phone.trim()) {
                return res.status(400).json({ message: 'Phone number is required for students.' });
            }
        }

        // ── Uniqueness checks (all case-insensitive where applicable) ──
        const existingEmail = await User.findOne({ email: email.toLowerCase() });
        if (existingEmail) {
            return res.status(400).json({ message: 'A student with this email already exists.' });
        }

        if (role !== 'admin') {
            // Check name uniqueness (case-insensitive, students only)
            const escapedName = name.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const existingName = await User.findOne({
                name: { $regex: new RegExp('^' + escapedName + '$', 'i') },
                role: 'student'
            });
            if (existingName) {
                return res.status(400).json({ message: 'A student with this name already exists. Please use your full name to differentiate.' });
            }

            // Check registration number uniqueness
            const existingReg = await User.findOne({ registrationNumber: registrationNumber.trim().toUpperCase() });
            if (existingReg) {
                return res.status(400).json({ message: 'This registration number is already in use.' });
            }

            // Check phone uniqueness
            const existingPhone = await User.findOne({ phone: phone.trim() });
            if (existingPhone) {
                return res.status(400).json({ message: 'This phone number is already in use.' });
            }
        }

        // ── Build user data ──
        const userData = { name: name.trim(), email: email.toLowerCase().trim(), password, role: role || 'student' };

        if (role !== 'admin') {
            userData.registrationNumber = registrationNumber.trim().toUpperCase();
            userData.phone = phone.trim();
            if (branch) userData.branch = branch.toUpperCase();
            if (year) userData.year = Number(year);
            if (section) userData.section = section.toUpperCase();
        }

        const user = await User.create(userData);

        res.status(201).json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            registrationNumber: user.registrationNumber,
            phone: user.phone,
            branch: user.branch,
            year: user.year,
            section: user.section,
            token: generateToken(user._id)
        });
    } catch (error) {
        // Handle MongoDB duplicate key errors with friendly messages
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            const messages = {
                email: 'A student with this email already exists.',
                registrationNumber: 'This registration number is already in use.',
                phone: 'This phone number is already in use.'
            };
            return res.status(400).json({ message: messages[field] || 'Duplicate value detected for: ' + field });
        }
        res.status(500).json({ message: error.message });
    }
});

// POST /api/auth/login
// Supports login via email, phone number, or registration number
router.post('/login', async (req, res) => {
    try {
        const { identifier, password } = req.body;

        if (!identifier || !password) {
            return res.status(400).json({ message: 'Please provide your credentials.' });
        }

        // Try to find user by email, phone, or registration number
        const user = await User.findOne({
            $or: [
                { email: identifier.toLowerCase() },
                { phone: identifier },
                { registrationNumber: identifier.toUpperCase() }
            ]
        });

        if (!user) {
            return res.status(401).json({ message: 'Invalid credentials. Account not found.' });
        }

        const isMatch = await user.matchPassword(password);
        if (!isMatch) {
            return res.status(401).json({ message: 'Invalid credentials. Wrong password.' });
        }

        res.json({
            _id: user._id,
            name: user.name,
            email: user.email,
            role: user.role,
            registrationNumber: user.registrationNumber,
            phone: user.phone,
            branch: user.branch,
            year: user.year,
            section: user.section,
            token: generateToken(user._id)
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

const { verifyToken } = require('../middleware/auth');

const Registration = require('../models/Registration');

// GET /api/auth/profile
router.get('/profile', verifyToken, async (req, res) => {
    try {
        const user = await User.findById(req.user._id).select('-password');
        if (!user) return res.status(404).json({ message: 'User not found.' });

        const userObj = user.toObject();

        // For students, check if they have any registrations
        if (user.role === 'student') {
            const regCount = await Registration.countDocuments({ user: user._id });
            userObj.hasRegistered = regCount > 0;
        }

        res.json(userObj);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/auth/profile
router.put('/profile', verifyToken, async (req, res) => {
    try {
        const { name, department, designation, teachingSubject, adminBranch, phdDetails, btechDetails,
            phone, branch, year, section } = req.body;
        const user = await User.findById(req.user._id);
        if (!user) return res.status(404).json({ message: 'User not found.' });

        // Admin fields
        if (department !== undefined) user.department = department;
        if (designation !== undefined) user.designation = designation;
        if (teachingSubject !== undefined) user.teachingSubject = teachingSubject;
        if (adminBranch !== undefined) user.adminBranch = adminBranch;
        if (phdDetails !== undefined) user.phdDetails = phdDetails;
        if (btechDetails !== undefined) user.btechDetails = btechDetails;

        // Student fields — always allow name, year, section
        if (name !== undefined) user.name = name;
        if (year !== undefined) user.year = year;
        if (section !== undefined) user.section = section;

        // Phone and branch: only allow if student has NO registrations yet
        if (user.role === 'student') {
            const regCount = await Registration.countDocuments({ user: user._id });
            if (regCount === 0) {
                if (phone !== undefined) user.phone = phone;
                if (branch !== undefined) user.branch = branch;
            }
            // If regCount > 0, silently ignore phone/branch changes
        } else {
            // Admin can always change phone/branch
            if (phone !== undefined) user.phone = phone;
            if (branch !== undefined) user.branch = branch;
        }

        await user.save();

        const updated = user.toObject();
        delete updated.password;
        res.json(updated);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
