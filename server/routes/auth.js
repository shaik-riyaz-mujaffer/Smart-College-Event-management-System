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

        // Check if user exists by email
        const existingEmail = await User.findOne({ email });
        if (existingEmail) {
            return res.status(400).json({ message: 'User already exists with this email.' });
        }

        // For students, also check registration number and phone uniqueness
        if (role !== 'admin') {
            if (registrationNumber) {
                const existingReg = await User.findOne({ registrationNumber: registrationNumber.toUpperCase() });
                if (existingReg) {
                    return res.status(400).json({ message: 'This registration number is already in use.' });
                }
            }
            if (phone) {
                const existingPhone = await User.findOne({ phone });
                if (existingPhone) {
                    return res.status(400).json({ message: 'This phone number is already in use.' });
                }
            }
        }

        // Build user data
        const userData = { name, email, password, role: role || 'student' };

        // Add student-specific fields
        if (role !== 'admin') {
            if (registrationNumber) userData.registrationNumber = registrationNumber.toUpperCase();
            if (phone) userData.phone = phone;
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
