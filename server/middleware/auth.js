/**
 * middleware/auth.js — JWT Authentication & Role Authorization Middleware
 *
 * Provides two Express middleware functions:
 *   1. verifyToken  — Validates the JWT from the Authorization header and
 *                      attaches the full user object (minus password) to req.user.
 *   2. isAdmin      — Ensures the authenticated user has the 'admin' role.
 *
 * Usage in routes:
 *   router.get('/protected', verifyToken, handler);
 *   router.post('/admin-only', verifyToken, isAdmin, handler);
 */
const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify the JWT token sent in the "Authorization: Bearer <token>" header.
 * On success, populates req.user with the user document (excluding password).
 * On failure, returns 401 (missing/invalid token) or 404 (user deleted after token issued).
 */
const verifyToken = async (req, res, next) => {
    try {
        // Extract the Authorization header and ensure it uses the Bearer scheme
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ message: 'Access denied. No token provided.' });
        }

        // Decode the JWT and look up the user in the database
        const token = authHeader.split(' ')[1];
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findById(decoded.id).select('-password');
        if (!user) {
            return res.status(404).json({ message: 'User not found.' });
        }

        // Attach user to the request so downstream handlers can access it
        req.user = user;
        next();
    } catch (error) {
        res.status(401).json({ message: 'Invalid token.' });
    }
};

/**
 * Role guard: ensures req.user (set by verifyToken) has role === 'admin'.
 * Must be used AFTER verifyToken in the middleware chain.
 */
const isAdmin = (req, res, next) => {
    if (req.user && req.user.role === 'admin') {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admin only.' });
    }
};

module.exports = { verifyToken, isAdmin };
