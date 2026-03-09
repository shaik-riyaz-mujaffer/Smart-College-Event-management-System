const jwt = require('jsonwebtoken');
const User = require('../models/User');

const verifyToken = async (req, res, next) => {
    const token = req.header('Authorization')?.replace('Bearer ', '');
    if (!token) {
        return res.status(401).json({ message: 'Access denied. No token provided.' });
    }
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({ message: 'Invalid token.' });
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

/**
 * Role guard: allows access if the user is an admin OR a student coordinator.
 * Must be used AFTER verifyToken in the middleware chain.
 */
const isAdminOrCoordinator = (req, res, next) => {
    if (req.user && (req.user.role === 'admin' || req.user.isCoordinator)) {
        next();
    } else {
        res.status(403).json({ message: 'Access denied. Admin or Coordinator only.' });
    }
};

module.exports = { verifyToken, isAdmin, isAdminOrCoordinator };
