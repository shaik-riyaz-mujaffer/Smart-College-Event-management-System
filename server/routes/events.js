const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const QRCode = require('qrcode');
const Event = require('../models/Event');
const Registration = require('../models/Registration');
const { verifyToken, isAdmin } = require('../middleware/auth');

// ── Multer config for banner uploads ──────────────
const uploadsDir = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadsDir),
    filename: (req, file, cb) => {
        const uniqueName = `banner_${Date.now()}${path.extname(file.originalname)}`;
        cb(null, uniqueName);
    }
});

const fileFilter = (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const ext = allowed.test(path.extname(file.originalname).toLowerCase());
    const mime = allowed.test(file.mimetype);
    if (ext && mime) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (jpg, png, gif, webp) are allowed.'));
    }
};

const upload = multer({ storage, fileFilter, limits: { fileSize: 5 * 1024 * 1024 } }); // 5 MB max

// GET /api/events – list all events (public)
router.get('/', async (req, res) => {
    try {
        const events = await Event.find()
            .populate('registrations')
            .populate('createdBy', 'name')
            .sort({ date: 1 });
        res.json(events);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// GET /api/events/:id – single event
router.get('/:id', async (req, res) => {
    try {
        const event = await Event.findById(req.params.id)
            .populate('registrations')
            .populate('createdBy', 'name');
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        res.json(event);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// POST /api/events – create event (admin only, with optional banner upload)
router.post('/', verifyToken, isAdmin, upload.single('banner'), async (req, res) => {
    try {
        const { title, description, date, venue, maxParticipants, registrationFee, upiId } = req.body;
        const eventData = {
            title,
            description,
            date,
            venue,
            maxParticipants: maxParticipants || 9999,
            registrationFee: registrationFee || 0,
            upiId: upiId || '',
            createdBy: req.user._id
        };

        if (req.file) {
            eventData.banner = `/uploads/${req.file.filename}`;
        }

        const event = await Event.create(eventData);
        res.status(201).json(event);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// PUT /api/events/:id – update event (admin only, with optional banner upload)
router.put('/:id', verifyToken, isAdmin, upload.single('banner'), async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }

        const { title, description, date, venue, maxParticipants, registrationFee, upiId } = req.body;
        event.title = title || event.title;
        event.description = description || event.description;
        event.date = date || event.date;
        event.venue = venue || event.venue;
        event.maxParticipants = maxParticipants || event.maxParticipants;
        event.registrationFee = registrationFee !== undefined ? registrationFee : event.registrationFee;
        if (upiId !== undefined) event.upiId = upiId;

        if (req.file) {
            // Delete old banner if it exists
            if (event.banner) {
                const oldPath = path.join(__dirname, '..', event.banner);
                if (fs.existsSync(oldPath)) {
                    fs.unlinkSync(oldPath);
                }
            }
            event.banner = `/uploads/${req.file.filename}`;
        }

        const updatedEvent = await event.save();

        // If fee changed, sync pending registrations with the new amount & regenerate UPI QRs
        const newFee = Number(updatedEvent.registrationFee) || 0;
        const pendingRegs = await Registration.find({ event: event._id, paymentStatus: 'pending' });
        if (pendingRegs.length > 0 && newFee > 0) {
            const upiId = process.env.UPI_ID;
            const upiName = process.env.UPI_NAME || 'CampusEvents';
            const amount = newFee.toFixed(2);

            for (const reg of pendingRegs) {
                reg.amountPaid = newFee;
                const txnNote = `${updatedEvent.title}-Reg-${reg._id}`;
                const upiUrl = `upi://pay?pa=${encodeURIComponent(upiId)}&pn=${encodeURIComponent(upiName)}&am=${amount}&tn=${encodeURIComponent(txnNote)}&cu=INR`;
                reg.upiQrCode = await QRCode.toDataURL(upiUrl);
                await reg.save();
            }
        }

        res.json(updatedEvent);
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

// DELETE /api/events/:id – delete event (admin only)
router.delete('/:id', verifyToken, isAdmin, async (req, res) => {
    try {
        const event = await Event.findById(req.params.id);
        if (!event) {
            return res.status(404).json({ message: 'Event not found.' });
        }
        // Delete banner file if exists
        if (event.banner) {
            const bannerPath = path.join(__dirname, '..', event.banner);
            if (fs.existsSync(bannerPath)) {
                fs.unlinkSync(bannerPath);
            }
        }
        await Event.findByIdAndDelete(req.params.id);
        res.json({ message: 'Event deleted successfully.' });
    } catch (error) {
        res.status(500).json({ message: error.message });
    }
});

module.exports = router;
