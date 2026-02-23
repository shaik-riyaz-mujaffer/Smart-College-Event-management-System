const express = require('express');
const router = express.Router();
const QRCode = require('qrcode');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { verifyToken, isAdmin } = require('../middleware/auth');
const { generateQrToken } = require('../utils/qrToken');
const { sendRegistrationEmail } = require('../utils/email');

let generateTicketPDF;
try { generateTicketPDF = require('../utils/pdf').generateTicketPDF; } catch (e) { generateTicketPDF = null; }

// GET /api/admin/dashboard
// Fetch aggregate statistics for the admin dashboard
router.get('/dashboard', verifyToken, isAdmin, async (req, res) => {
    try {
        const totalEvents = await Event.countDocuments();
        const totalRegistrations = await Registration.countDocuments();

        // Count confirmed payments (paid or free)
        const totalConfirmed = await Registration.countDocuments({
            paymentStatus: { $in: ['paid', 'free'] }
        });

        // Count attendance
        const totalAttended = await Registration.countDocuments({ attended: true });

        // Calculate revenue
        const revenueResult = await Registration.aggregate([
            { $match: { paymentStatus: 'paid' } },
            { $group: { _id: null, total: { $sum: "$amountPaid" } } }
        ]);
        const totalRevenue = revenueResult.length > 0 ? revenueResult[0].total : 0;

        res.json({
            totalEvents,
            totalRegistrations,
            totalConfirmed,
            totalAttended,
            totalRevenue
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/admin/registrations/:eventId
// Get all registrations for a specific event
router.get('/registrations/:eventId', verifyToken, isAdmin, async (req, res) => {
    try {
        const registrations = await Registration.find({ event: req.params.eventId })
            .populate('user', 'name email registrationNumber phone branch year')
            .sort({ createdAt: -1 });
        res.json(registrations);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/admin/export/:eventId
// Export registrations to CSV
router.get('/export/:eventId', verifyToken, isAdmin, async (req, res) => {
    try {
        const registrations = await Registration.find({ event: req.params.eventId })
            .populate('user', 'name email registrationNumber phone branch year')
            .populate('event', 'title');

        if (registrations.length === 0) {
            return res.status(404).json({ message: 'No registrations found to export.' });
        }

        let csv = 'Student Name,Email,Phone,Reg Number,Branch,Year,Payment Status,Attended,Attended At\n';
        registrations.forEach(reg => {
            const u = reg.user;
            csv += `"${u.name}","${u.email}","${u.phone || ''}","${u.registrationNumber || ''}","${u.branch || ''}","${u.year || ''}","${reg.paymentStatus}","${reg.attended ? 'Yes' : 'No'}","${reg.attendedAt ? reg.attendedAt.toLocaleString() : ''}"\n`;
        });

        res.setHeader('Content-Type', 'text/csv');
        res.setHeader('Content-Disposition', `attachment; filename=registrations_${req.params.eventId}.csv`);
        res.status(200).send(csv);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// ═══════════════════════════════════════════════════════════════
// PAYMENT QUEUE — students who submitted transaction IDs
// ═══════════════════════════════════════════════════════════════

// GET /api/admin/payment-queue
router.get('/payment-queue', verifyToken, isAdmin, async (req, res) => {
    try {
        const queue = await Registration.find({ paymentStatus: 'awaiting_approval' })
            .populate('user', 'name email registrationNumber branch section')
            .populate('event', 'title registrationFee')
            .sort({ createdAt: -1 });
        res.json(queue);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/admin/approve-payment/:id
router.post('/approve-payment/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const registration = await Registration.findById(req.params.id);
        if (!registration) {
            return res.status(404).json({ message: 'Registration not found.' });
        }
        if (registration.paymentStatus !== 'awaiting_approval') {
            return res.status(400).json({ message: 'This registration is not awaiting approval.' });
        }

        // Mark as paid
        registration.paymentStatus = 'paid';
        await registration.save();

        // Generate QR token
        const { token, timestamp } = generateQrToken(
            registration._id.toString(),
            registration.event.toString(),
            registration.user.toString()
        );
        registration.qrToken = token;
        registration.qrTokenTimestamp = timestamp;

        // Generate QR code
        const gateUrl = `${req.protocol}://${req.get('host')}/gate/${token}`;
        registration.qrCode = await QRCode.toDataURL(gateUrl);
        await registration.save();

        // Populate for response + email
        const populated = await Registration.findById(registration._id)
            .populate('user', 'name email')
            .populate('event', 'title date venue');

        // Send confirmation email in background
        const eventDate = new Date(populated.event.date).toLocaleString('en-IN', {
            dateStyle: 'full', timeStyle: 'short'
        });

        let pdfBuffer;
        if (generateTicketPDF) {
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
                console.error('[PDF] Failed:', err.message);
            }
        }

        sendRegistrationEmail({
            to: populated.user.email,
            studentName: populated.user.name,
            eventTitle: populated.event.title,
            eventDate,
            eventVenue: populated.event.venue || 'TBA',
            qrDataUrl: registration.qrCode,
            pdfBuffer
        }).catch(err => console.error('[Email] Failed:', err.message));

        res.json({
            message: 'Payment approved! Student has been notified.',
            registration: populated
        });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/admin/reject-payment/:id
router.post('/reject-payment/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const registration = await Registration.findById(req.params.id);
        if (!registration) {
            return res.status(404).json({ message: 'Registration not found.' });
        }
        if (registration.paymentStatus !== 'awaiting_approval') {
            return res.status(400).json({ message: 'This registration is not awaiting approval.' });
        }

        registration.paymentStatus = 'failed';
        await registration.save();

        res.json({ message: 'Payment rejected.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
