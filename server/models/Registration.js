const mongoose = require('mongoose');

const registrationSchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    // ── Payment (Razorpay) ──
    paymentStatus: {
        type: String,
        enum: ['free', 'pending', 'paid', 'failed'],
        default: 'free'
    },
    razorpayOrderId: { type: String },
    razorpayPaymentId: { type: String },
    razorpaySignature: { type: String },
    amountPaid: { type: Number, default: 0 },

    // ── QR Token (encrypted, tamper-proof) ──
    qrToken: {
        type: String,
        unique: true,
        sparse: true // allow null before payment
    },
    qrTokenTimestamp: { type: String },
    qrCode: { type: String }, // base64 data URL of QR image

    // ── Attendance ──
    attended: { type: Boolean, default: false },
    attendedAt: { type: Date },

    // ── Legacy fields (kept for backward compatibility) ──
    transactionId: { type: String },
    upiQrCode: { type: String },
    upiTxnRef: { type: String },  // unique reference sent in UPI QR
    upiTxnId: { type: String }    // transaction ID from student after payment

}, { timestamps: true });

// Compound index: one registration per user per event
registrationSchema.index({ event: 1, user: 1 }, { unique: true });
// Fast token lookups for gate scanning
registrationSchema.index({ qrToken: 1 });

module.exports = mongoose.model('Registration', registrationSchema);
