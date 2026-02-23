require('dotenv').config();
const mongoose = require('mongoose');
const Registration = require('./models/Registration');
const Event = require('./models/Event');

async function run() {
    await mongoose.connect(process.env.MONGO_URI);
    const regs = await Registration.find();
    let count = 0;
    for (const r of regs) {
        const ev = await Event.findById(r.event);
        if (!ev) {
            await Registration.findByIdAndDelete(r._id);
            count++;
        }
    }
    console.log('Removed ' + count + ' orphan registration(s)');
    process.exit(0);
}

run().catch(err => { console.error(err); process.exit(1); });
