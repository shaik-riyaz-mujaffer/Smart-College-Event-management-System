const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const QRCode = require('qrcode');
const Registration = require('../models/Registration');
const Event = require('../models/Event');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { registrationLimiter, scannerLimiter, gateLimiter } = require('../middleware/rateLimiter');
const razorpay = require('../config/razorpay');
const { generateQrToken } = require('../utils/qrToken');
const { sendRegistrationEmail } = require('../utils/email');
const { generateTicketPDF } = require('../utils/pdf');

// ─── Helper: generate QR code + token + email for a registration ───
async function finalizeRegistration(registration, req) {
    // Generate secure token
    const { token, timestamp } = generateQrToken(
        registration._id.toString(),
        registration.event._id ? registration.event._id.toString() : registration.event.toString(),
        registration.user._id ? registration.user._id.toString() : registration.user.toString()
    );

    registration.qrToken = token;
    registration.qrTokenTimestamp = timestamp;

    // Generate QR code with gate URL
    const gateUrl = `${req.protocol}://${req.get('host')}/gate/${token}`;
    registration.qrCode = await QRCode.toDataURL(gateUrl);

    await registration.save();

    // Populate for email
    const populated = await Registration.findById(registration._id)
        .populate('user', 'name email')
        .populate('event', 'title date venue');

    // Send email asynchronously (don't block response)
    const eventDate = new Date(populated.event.date).toLocaleString('en-IN', {
        dateStyle: 'full', timeStyle: 'short'
    });

    // Generate PDF ticket
    let pdfBuffer;
    try {
        pdfBuffer = await generateTicketPDF({
            studentName: populated.user.name,
            eventTitle: populated.event.title,
            eventDate,
            eventVenue: populated.event.venue || 'TBA',
            registrationId: populated._id.toString(),
            qrDataUrl: registration.qrCode
        });
    } catch (err) {
        console.error('[PDF] Failed to generate ticket:', err.message);
    }

    // Send email in background
    sendRegistrationEmail({
        to: populated.user.email,
        studentName: populated.user.name,
        eventTitle: populated.event.title,
        eventDate,
        eventVenue: populated.event.venue || 'TBA',
        qrDataUrl: registration.qrCode,
        pdfBuffer
    }).catch(err => console.error('[Email] Background send failed:', err.message));

    return populated;
}

// ═══════════════════════════════════════════════════════════════
// 1. REGISTER FOR FREE EVENT
// ═══════════════════════════════════════════════════════════════
router.post('/register-free', verifyToken, registrationLimiter, async (req, res) => {
    try {
        const { eventId } = req.body;
        const event = await Event.findById(eventId);

        if (!event) return res.status(404).json({ message: 'Event not found.' });

        // Must be a free event
        const fee = Number(event.registrationFee) || 0;
        if (fee > 0) {
            return res.status(400).json({ message: 'This is a paid event. Please use the payment flow.' });
        }

        // Check capacity
        const regCount = await Registration.countDocuments({ event: eventId });
        if (regCount >= event.maxParticipants) {
            return res.status(400).json({ message: 'Event is full. Registration closed.' });
        }

        // Check duplicate
        const existing = await Registration.findOne({ event: eventId, user: req.user._id });
        if (existing) {
            return res.status(400).json({ message: 'You have already registered for this event.' });
        }

        // Create registration
        const registration = await Registration.create({
            event: eventId,
            user: req.user._id,
            paymentStatus: 'free',
            amountPaid: 0
        });

        // Generate QR + send email
        const populated = await finalizeRegistration(registration, req);

        res.status(201).json({
            message: 'Registration successful! Check your email for the QR ticket.',
            registration: populated
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You have already registered for this event.' });
        }
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 1b. REGISTER WITH UPI QR PAYMENT
//     Generates a UPI QR code → student scans & pays → confirm
// ═══════════════════════════════════════════════════════════════
router.post('/register-upi', verifyToken, registrationLimiter, async (req, res) => {
    try {
        const { eventId } = req.body;
        const event = await Event.findById(eventId);

        if (!event) return res.status(404).json({ message: 'Event not found.' });

        const fee = Number(event.registrationFee) || 0;

        // Check capacity
        const regCount = await Registration.countDocuments({ event: eventId });
        if (regCount >= event.maxParticipants) {
            return res.status(400).json({ message: 'Event is full. Registration closed.' });
        }

        // Check duplicate
        const existing = await Registration.findOne({ event: eventId, user: req.user._id });
        if (existing) {
            if (existing.paymentStatus === 'paid' || existing.paymentStatus === 'free') {
                return res.status(400).json({ message: 'You have already registered for this event.' });
            }
            // Delete old pending/failed registration
            await Registration.findByIdAndDelete(existing._id);
        }

        // Generate a unique transaction reference
        const txnRef = 'CE' + Date.now() + Math.floor(Math.random() * 1000);

        // Use event-specific UPI ID or fallback to env
        const upiId = event.upiId || process.env.UPI_ID || '';
        const upiName = process.env.UPI_NAME || 'CampusEvents';

        if (!upiId) {
            return res.status(500).json({ message: 'Payment not configured. Contact admin.' });
        }

        // Build UPI deep link
        const upiLink = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${fee}&cu=INR&tn=${encodeURIComponent('Event: ' + event.title)}&tr=${txnRef}`;

        // Generate QR code image from UPI link
        const upiQrDataUrl = await QRCode.toDataURL(upiLink, { width: 300, margin: 2 });

        // Create pending registration
        const registration = await Registration.create({
            event: eventId,
            user: req.user._id,
            paymentStatus: 'pending',
            amountPaid: fee,
            upiTxnRef: txnRef
        });

        res.status(201).json({
            registrationId: registration._id,
            upiQrCode: upiQrDataUrl,
            upiLink: upiLink,
            upiId: upiId,
            amount: fee,
            txnRef: txnRef,
            eventTitle: event.title
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You have already registered for this event.' });
        }
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 1c. CONFIRM UPI PAYMENT
//     Student clicks "I have paid" → marks registration as paid
// ═══════════════════════════════════════════════════════════════
router.post('/confirm-upi', verifyToken, async (req, res) => {
    try {
        const { registrationId, upiTxnId } = req.body;

        const registration = await Registration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({ message: 'Registration not found.' });
        }

        if (registration.user.toString() !== req.user._id.toString()) {
            return res.status(403).json({ message: 'Unauthorized.' });
        }

        if (registration.paymentStatus === 'paid' || registration.paymentStatus === 'free') {
            return res.status(400).json({ message: 'Payment already confirmed.' });
        }

        // Mark as paid
        registration.paymentStatus = 'paid';
        if (upiTxnId) registration.upiTxnId = upiTxnId;
        await registration.save();

        // Generate QR ticket + send email
        const populated = await finalizeRegistration(registration, req);

        res.json({
            message: 'Payment confirmed! Your QR ticket has been sent to your email.',
            registration: populated
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 2. CREATE RAZORPAY ORDER (for paid events)
// ═══════════════════════════════════════════════════════════════
router.post('/create-order', verifyToken, registrationLimiter, async (req, res) => {
    try {
        const { eventId } = req.body;
        const event = await Event.findById(eventId);

        if (!event) return res.status(404).json({ message: 'Event not found.' });

        const fee = Number(event.registrationFee) || 0;
        if (fee <= 0) {
            return res.status(400).json({ message: 'This is a free event. Use the free registration endpoint.' });
        }

        // Check capacity
        const regCount = await Registration.countDocuments({ event: eventId });
        if (regCount >= event.maxParticipants) {
            return res.status(400).json({ message: 'Event is full. Registration closed.' });
        }

        // Check duplicate
        const existing = await Registration.findOne({ event: eventId, user: req.user._id });
        if (existing) {
            if (existing.paymentStatus === 'paid') {
                return res.status(400).json({ message: 'You have already registered and paid for this event.' });
            }
            if (existing.paymentStatus === 'pending') {
                // Return existing order if still pending
                return res.json({
                    orderId: existing.razorpayOrderId,
                    amount: fee * 100,
                    currency: 'INR',
                    key: process.env.RAZORPAY_KEY_ID,
                    registrationId: existing._id,
                    eventTitle: event.title
                });
            }
            // If failed, delete old and create new
            await Registration.findByIdAndDelete(existing._id);
        }

        // Create Razorpay order (amount in paisa)
        const order = await razorpay.orders.create({
            amount: fee * 100,
            currency: 'INR',
            receipt: `reg_${Date.now()}`,
            notes: {
                eventId: eventId,
                userId: req.user._id.toString(),
                eventTitle: event.title
            }
        });

        // Create pending registration
        const registration = await Registration.create({
            event: eventId,
            user: req.user._id,
            paymentStatus: 'pending',
            razorpayOrderId: order.id,
            amountPaid: fee
        });

        res.json({
            orderId: order.id,
            amount: fee * 100,
            currency: 'INR',
            key: process.env.RAZORPAY_KEY_ID,
            registrationId: registration._id,
            eventTitle: event.title
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ message: 'You have already registered for this event.' });
        }
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 3. VERIFY RAZORPAY PAYMENT
// ═══════════════════════════════════════════════════════════════
router.post('/verify-payment', verifyToken, async (req, res) => {
    try {
        const { razorpay_order_id, razorpay_payment_id, razorpay_signature, registrationId } = req.body;

        // Find the registration
        const registration = await Registration.findById(registrationId);
        if (!registration) {
            return res.status(404).json({ message: 'Registration not found.' });
        }

        // Verify signature
        const expectedSignature = crypto
            .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
            .update(`${razorpay_order_id}|${razorpay_payment_id}`)
            .digest('hex');

        if (expectedSignature !== razorpay_signature) {
            registration.paymentStatus = 'failed';
            await registration.save();
            return res.status(400).json({ message: 'Payment verification failed. Invalid signature.' });
        }

        // Payment verified!
        registration.paymentStatus = 'paid';
        registration.razorpayPaymentId = razorpay_payment_id;
        registration.razorpaySignature = razorpay_signature;
        await registration.save();

        // Generate QR + send email
        const populated = await finalizeRegistration(registration, req);

        res.json({
            message: 'Payment verified! Registration confirmed. Check your email.',
            registration: populated
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 4. GET MY REGISTRATIONS
// ═══════════════════════════════════════════════════════════════
router.get('/my', verifyToken, async (req, res) => {
    try {
        const registrations = await Registration.find({ user: req.user._id })
            .populate('event', 'title description date venue maxParticipants registrationFee banner')
            .sort({ createdAt: -1 });

        res.json(registrations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 5. GATE CHECK — public endpoint for QR scanning at entrance
//    Scanned by phone camera → opens gate.html → calls this
// ═══════════════════════════════════════════════════════════════
router.post('/gate-check/:token', gateLimiter, async (req, res) => {
    try {
        const { token } = req.params;

        const registration = await Registration.findOne({ qrToken: token })
            .populate('user', 'name email registrationNumber branch year')
            .populate('event', 'title date venue');

        if (!registration) {
            return res.status(404).json({
                code: 'NOT_FOUND',
                message: 'Invalid QR code. Registration not found.'
            });
        }

        // Check payment
        if (registration.paymentStatus === 'pending') {
            return res.status(400).json({
                code: 'PAYMENT_PENDING',
                message: 'Payment not yet completed. Entry denied.',
                student: registration.user.name,
                event: registration.event.title
            });
        }

        if (registration.paymentStatus === 'failed') {
            return res.status(400).json({
                code: 'PAYMENT_REJECTED',
                message: 'Payment failed. Entry denied.',
                student: registration.user.name,
                event: registration.event.title
            });
        }

        // Check if already entered
        if (registration.attended) {
            return res.status(400).json({
                code: 'ALREADY_ENTERED',
                message: 'This student has already entered the event.',
                student: registration.user.name,
                event: registration.event.title,
                enteredAt: registration.attendedAt
            });
        }

        // Mark attendance
        registration.attended = true;
        registration.attendedAt = new Date();
        await registration.save();

        res.json({
            code: 'ENTRY_CONFIRMED',
            message: 'Entry confirmed! Welcome.',
            registration
        });
    } catch (error) {
        res.status(500).json({
            code: 'ERROR',
            message: error.message
        });
    }
});

// ═══════════════════════════════════════════════════════════════
// 6. SCANNER SCAN — authenticated endpoint for scanner dashboard
// ═══════════════════════════════════════════════════════════════
router.post('/scan', verifyToken, isAdmin, scannerLimiter, async (req, res) => {
    try {
        const { token } = req.body;

        const registration = await Registration.findOne({ qrToken: token })
            .populate('user', 'name email registrationNumber branch year phone')
            .populate('event', 'title date venue');

        if (!registration) {
            return res.status(404).json({
                code: 'NOT_FOUND',
                message: 'Invalid QR code.'
            });
        }

        if (registration.paymentStatus === 'pending' || registration.paymentStatus === 'failed') {
            return res.status(400).json({
                code: 'PAYMENT_ISSUE',
                message: `Payment ${registration.paymentStatus}. Cannot mark attendance.`,
                student: registration.user.name,
                event: registration.event.title
            });
        }

        if (registration.attended) {
            return res.status(400).json({
                code: 'ALREADY_ENTERED',
                message: 'Attendance already recorded. Duplicate entry not allowed.',
                student: registration.user.name,
                event: registration.event.title,
                enteredAt: registration.attendedAt
            });
        }

        registration.attended = true;
        registration.attendedAt = new Date();
        await registration.save();

        res.json({
            code: 'SUCCESS',
            message: 'Attendance marked successfully!',
            registration
        });
    } catch (error) {
        res.status(500).json({ code: 'ERROR', message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// 7. VALIDATE QR — admin text-based validation (legacy)
// ═══════════════════════════════════════════════════════════════
router.post('/validate-qr', verifyToken, isAdmin, async (req, res) => {
    try {
        const { registrationId } = req.body;

        const registration = await Registration.findById(registrationId)
            .populate('user', 'name email registrationNumber')
            .populate('event', 'title date registrationFee');

        if (!registration) {
            return res.status(404).json({ message: 'Registration not found. Invalid QR code.' });
        }

        if (registration.paymentStatus === 'pending') {
            return res.status(400).json({ message: 'Payment not yet verified for this registration.' });
        }

        if (registration.paymentStatus === 'failed') {
            return res.status(400).json({ message: 'Payment failed. Student needs to re-register.' });
        }

        if (registration.attended) {
            return res.status(400).json({
                message: 'Attendance already recorded. Duplicate entry.',
                registration
            });
        }

        registration.attended = true;
        registration.attendedAt = new Date();
        await registration.save();

        res.json({ message: 'Attendance marked successfully!', registration });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
