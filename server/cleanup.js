// cleanup.js - Drop all test data
const { MongoClient } = require('mongodb');

(async () => {
    const c = new MongoClient('mongodb://localhost:27017/college_events');
    await c.connect();
    const db = c.db();

    const testEmails = ['ta_clean@test.com', 'tb_clean@test.com', 'admin_clean@test.com'];
    const users = await db.collection('users').find({ email: { $in: testEmails } }).toArray();
    const uids = users.map(u => u._id);
    console.log('Found', uids.length, 'test users');

    if (uids.length > 0) {
        const r1 = await db.collection('registrations').deleteMany({ user: { $in: uids } });
        console.log('Deleted', r1.deletedCount, 'registrations by user');
    }

    const events = await db.collection('events').find({ title: { $in: ['CleanAlpha', 'CleanBeta'] } }).toArray();
    const eids = events.map(e => e._id);
    console.log('Found', eids.length, 'test events');

    if (eids.length > 0) {
        const r2 = await db.collection('registrations').deleteMany({ event: { $in: eids } });
        console.log('Deleted', r2.deletedCount, 'registrations by event');
        await db.collection('events').deleteMany({ _id: { $in: eids } });
    }

    const r3 = await db.collection('users').deleteMany({ email: { $in: testEmails } });
    console.log('Deleted', r3.deletedCount, 'users');

    // Also drop stale indexes
    try {
        await db.collection('registrations').dropIndex('user_id_1_event_id_1');
        console.log('Dropped stale index user_id_1_event_id_1');
    } catch (e) {
        // Index may not exist
    }
    try {
        await db.collection('registrations').dropIndex('event_id_1');
        console.log('Dropped stale index event_id_1');
    } catch (e) {
        // Index may not exist
    }

    console.log('Cleanup complete');
    await c.close();
})();
