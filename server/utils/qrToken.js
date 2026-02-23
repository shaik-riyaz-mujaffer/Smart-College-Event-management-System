const crypto = require('crypto');

const QR_SECRET = process.env.QR_ENCRYPTION_SECRET || 'default_qr_secret_change_me';

/**
 * Generate a secure, tamper-proof QR token for a registration.
 * Token = HMAC-SHA256( secret, registrationId:eventId:userId:timestamp )
 * Returns { token, timestamp }
 */
function generateQrToken(registrationId, eventId, userId) {
    const timestamp = Date.now().toString();
    const payload = `${registrationId}:${eventId}:${userId}:${timestamp}`;
    const token = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
    return { token, timestamp };
}

/**
 * Verify a QR token matches the expected data.
 * Used as an extra validation layer — primary lookup is by token in DB.
 */
function verifyQrToken(token, registrationId, eventId, userId, timestamp) {
    const payload = `${registrationId}:${eventId}:${userId}:${timestamp}`;
    const expected = crypto.createHmac('sha256', QR_SECRET).update(payload).digest('hex');
    return crypto.timingSafeEqual(Buffer.from(token), Buffer.from(expected));
}

module.exports = { generateQrToken, verifyQrToken };
