const express = require('express');
const router = express.Router();
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { verifyToken, isAdmin } = require('../middleware/auth');

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

module.exports = router;
