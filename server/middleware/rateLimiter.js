const rateLimit = require('express-rate-limit');
const jwt = require('jsonwebtoken');

// ── Helper: extract user ID from JWT for per-user rate limiting ──
// Falls back to IP when no valid token is present.
// This prevents one student from being blocked by other students
// registering on the same college WiFi (shared NAT IP).
function userOrIpKey(req) {
    try {
        const authHeader = req.headers.authorization;
        if (authHeader && authHeader.startsWith('Bearer ')) {
            const token = authHeader.split(' ')[1];
            const decoded = jwt.verify(token, process.env.JWT_SECRET);
            if (decoded && decoded.id) return 'user_' + decoded.id;
        }
    } catch (_) { /* fall through to IP */ }
    return req.ip;
}

// Scanner endpoint: max 120 scans/minute per user (or IP)
const scannerLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 120,
    keyGenerator: userOrIpKey,
    message: { message: 'Too many scan attempts. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Gate-check endpoint: max 300 requests/minute per IP
const gateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    message: { message: 'Too many requests. Please try again shortly.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Registration endpoint: max 20 registrations/minute per user
// (each user can only realistically register for a handful of events,
//  but we allow headroom for retries and UPI flow)
const registrationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 20,
    keyGenerator: userOrIpKey,
    message: { message: 'Too many registration attempts. Please wait.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { scannerLimiter, gateLimiter, registrationLimiter };
