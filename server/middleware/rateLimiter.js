/**
 * middleware/rateLimiter.js — Per-User & Per-IP Rate Limiting
 *
 * Creates rate-limiting middleware using express-rate-limit. The key innovation
 * here is the userOrIpKey function: it extracts the user ID from the JWT token
 * and uses that as the rate-limit key. This prevents students on the same
 * college WiFi (shared NAT IP) from blocking each other's registrations.
 *
 * If no valid JWT is present, it falls back to IP-based rate limiting.
 *
 * Exports three limiters with different windows and limits:
 *   - registrationLimiter: for event registration endpoints (generous per-user limit)
 *   - scannerLimiter:      for QR scanner endpoints (frequent scans expected)
 *   - gateLimiter:         for public gate-check endpoint (stricter, no auth)
 */
const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// Get the built-in IPv6-safe IP key generator from express-rate-limit
const ipKeyGenerator = rateLimit.default?.ipKeyGenerator;

/**
 * Extract user ID from the JWT for per-user rate limiting.
 * Falls back to IP when no valid token is present.
 * This prevents one student from being blocked by other students
 * registering on the same college WiFi (shared NAT IP).
 *
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @returns {string} Rate limit key (user ID or IP address)
 */
function userOrIpKey(req, res) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded && decoded.id) return decoded.id;
        }
    } catch (_) {
        // Token invalid or expired — fall back to IP-based limiting
    }
    // Fallback: use the built-in IP key generator if available, else raw IP
    if (ipKeyGenerator) return ipKeyGenerator(req, res);
    return req.ip;
}

/**
 * Registration rate limiter — attached to event registration endpoints.
 * Allows 10 registrations per user per 60-second window.
 * Uses per-user key so students on shared WiFi don't block each other.
 */
const registrationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many registration attempts. Please wait a moment and try again.' }
});

/**
 * Scanner rate limiter — attached to the admin QR scanner endpoint.
 * Allows 30 scans per 60-second window (admins scan many tickets quickly).
 */
const scannerLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    keyGenerator: userOrIpKey,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Scanner rate limit exceeded. Please wait a moment.' }
});

/**
 * Gate rate limiter — attached to the public gate-check endpoint.
 * Allows 20 checks per 60-second window per IP (no auth required).
 * Slightly stricter since this is a public-facing endpoint.
 */
const gateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    standardHeaders: true,
    legacyHeaders: false,
    message: { message: 'Too many gate check attempts. Please wait.' }
});

module.exports = { registrationLimiter, scannerLimiter, gateLimiter };
