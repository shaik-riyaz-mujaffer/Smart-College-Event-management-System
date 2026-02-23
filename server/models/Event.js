const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
    title: {
        type: String,
        required: [true, 'Event title is required'],
        trim: true
    },
    description: {
        type: String,
        required: [true, 'Event description is required']
    },
    date: {
        type: Date,
        required: [true, 'Event date is required']
    },
    venue: {
        type: String,
        required: [true, 'Venue is required'],
        trim: true
    },
    maxParticipants: {
        type: Number,
        default: 9999,
        min: 1
    },
    registrationFee: {
        type: Number,
        default: 0,
        min: 0
    },
    banner: {
        type: String,  // path to uploaded banner image
        default: ''
    },
    upiId: {
        type: String,  // admin's UPI ID for paid events
        trim: true,
        default: ''
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true, toJSON: { virtuals: true }, toObject: { virtuals: true } });

// Virtual for registration count (populated separately)
eventSchema.virtual('registrations', {
    ref: 'Registration',
    localField: '_id',
    foreignField: 'event',
    count: true
});

module.exports = mongoose.model('Event', eventSchema);
