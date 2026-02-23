const rateLimit = require('express-rate-limit');

// Scanner endpoint: max 30 scans/minute per IP
const scannerLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30,
    message: { message: 'Too many scan attempts. Please wait a moment.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Gate-check endpoint: max 60 requests/minute per IP
const gateLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 60,
    message: { message: 'Too many requests. Please try again shortly.' },
    standardHeaders: true,
    legacyHeaders: false
});

// Registration endpoint: max 10 registrations/minute per IP
const registrationLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 10,
    message: { message: 'Too many registration attempts. Please wait.' },
    standardHeaders: true,
    legacyHeaders: false
});

module.exports = { scannerLimiter, gateLimiter, registrationLimiter };
