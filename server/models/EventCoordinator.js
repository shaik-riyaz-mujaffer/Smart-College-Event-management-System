const mongoose = require('mongoose');

/**
 * EventCoordinator Model
 * Links a student user to a specific event as a coordinator.
 * Coordinators can scan attendance QR codes at the event entrance.
 */
const eventCoordinatorSchema = new mongoose.Schema({
    event: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Event',
        required: true
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { timestamps: true });

// One coordinator assignment per user per event
eventCoordinatorSchema.index({ event: 1, user: 1 }, { unique: true });
// Fast lookup: all coordinators for an event
eventCoordinatorSchema.index({ event: 1 });
// Fast lookup: all events a user coordinates
eventCoordinatorSchema.index({ user: 1 });

module.exports = mongoose.model('EventCoordinator', eventCoordinatorSchema);
