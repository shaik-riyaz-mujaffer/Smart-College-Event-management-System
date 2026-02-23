/**
 * Clean test: Drops test users/registrations/events, then runs all assertions.
 * Uses the MongoDB driver directly for cleanup.
 */
const http = require('http');
const fs = require('fs');
const { MongoClient } = require('mongodb');

const MONGO_URI = 'mongodb://localhost:27017/college_events';

function request(method, path, body, token) {
    return new Promise((resolve, reject) => {
        const data = body ? JSON.stringify(body) : '';
        const headers = { 'Content-Type': 'application/json' };
        if (data) headers['Content-Length'] = Buffer.byteLength(data);
        if (token) headers['Authorization'] = 'Bearer ' + token;
        const req = http.request({ hostname: 'localhost', port: 5000, path, method, headers }, res => {
            let d = '';
            res.on('data', c => d += c);
            res.on('end', () => {
                try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
                catch (e) { resolve({ status: res.statusCode, body: d }); }
            });
        });
        req.on('error', reject);
        if (data) req.write(data);
        req.end();
    });
}
const post = (p, b, t) => request('POST', p, b, t);
const get = (p, t) => request('GET', p, null, t);

const results = [];
function assert(label, condition, detail) {
    const passed = !!condition;
    results.push({ label, passed });
    console.log((passed ? 'PASS' : 'FAIL') + ': ' + label + (detail && !passed ? ' | ' + detail : ''));
}

async function cleanup() {
    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db();

    // Find test users
    const testEmails = ['ta_clean@test.com', 'tb_clean@test.com', 'admin_clean@test.com'];
    const testUsers = await db.collection('users').find({ email: { $in: testEmails } }).toArray();
    const testUserIds = testUsers.map(u => u._id);

    // Delete registrations by these users
    if (testUserIds.length > 0) {
        const delRegs = await db.collection('registrations').deleteMany({ user: { $in: testUserIds } });
        console.log('  Deleted', delRegs.deletedCount, 'registrations by test users');
    }

    // Delete test events by title
    const testTitles = ['CleanAlpha', 'CleanBeta'];
    const testEvents = await db.collection('events').find({ title: { $in: testTitles } }).toArray();
    const testEventIds = testEvents.map(e => e._id);

    if (testEventIds.length > 0) {
        const delEvRegs = await db.collection('registrations').deleteMany({ event: { $in: testEventIds } });
        console.log('  Deleted', delEvRegs.deletedCount, 'registrations by test events');
        await db.collection('events').deleteMany({ _id: { $in: testEventIds } });
    }

    // Delete test users
    const delUsers = await db.collection('users').deleteMany({ email: { $in: testEmails } });
    console.log('  Deleted', delUsers.deletedCount, 'test users');

    await client.close();
    console.log('--- Cleanup complete ---');
}

async function run() {
    // Step 0: Clean old data
    await cleanup();

    // Step 1: Register fresh users
    const regA = await post('/api/auth/register', {
        name: 'Student A', email: 'ta_clean@test.com', password: 'test1234',
        role: 'student', registrationNumber: '22C001', phone: '3030303030',
        branch: 'CSE', year: 2, section: 'A'
    });
    const regB = await post('/api/auth/register', {
        name: 'Student B', email: 'tb_clean@test.com', password: 'test1234',
        role: 'student', registrationNumber: '22C002', phone: '4040404040',
        branch: 'ECE', year: 3, section: 'B'
    });
    const regAdmin = await post('/api/auth/register', {
        name: 'TestAdmin', email: 'admin_clean@test.com', password: 'admin1234',
        role: 'admin'
    });

    assert('Student A registered', regA.status === 201, 'status=' + regA.status + ' body=' + JSON.stringify(regA.body));
    assert('Student B registered', regB.status === 201, 'status=' + regB.status);
    assert('Admin registered', regAdmin.status === 201, 'status=' + regAdmin.status);

    // Step 2: Login
    const loginA = await post('/api/auth/login', { identifier: 'ta_clean@test.com', password: 'test1234' });
    const loginB = await post('/api/auth/login', { identifier: 'tb_clean@test.com', password: 'test1234' });
    const loginAdmin = await post('/api/auth/login', { identifier: 'admin_clean@test.com', password: 'admin1234' });

    assert('Student A logged in', loginA.status === 200 && loginA.body.token);
    assert('Student B logged in', loginB.status === 200 && loginB.body.token);
    assert('Admin logged in', loginAdmin.status === 200 && loginAdmin.body.token);

    const tokenA = loginA.body.token;
    const tokenB = loginB.body.token;
    const tokenAdmin = loginAdmin.body.token;

    // Step 3: Admin creates 2 free events
    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const e1 = await post('/api/events', { title: 'CleanAlpha', description: 'Test event 1', date: tomorrow, venue: 'Hall A', maxParticipants: 100, registrationFee: 0 }, tokenAdmin);
    const e2 = await post('/api/events', { title: 'CleanBeta', description: 'Test event 2', date: tomorrow, venue: 'Hall B', maxParticipants: 100, registrationFee: 0 }, tokenAdmin);
    assert('Event 1 (CleanAlpha) created', e1.status === 201, 'status=' + e1.status + ' body=' + JSON.stringify(e1.body));
    assert('Event 2 (CleanBeta) created', e2.status === 201);
    const ev1 = e1.body._id, ev2 = e2.body._id;
    console.log('Event 1 ID:', ev1, '| Event 2 ID:', ev2);

    // ── TEST 1: Cross-student independence ──
    console.log('\n--- TEST 1: Cross-student independence ---');
    const regA1 = await post('/api/registrations/register-free', { eventId: ev1 }, tokenA);
    assert('A registered for Event 1', regA1.status === 201, 'status=' + regA1.status + ' body=' + JSON.stringify(regA1.body));

    // A should see Event 1 as registered, Event 2 as not
    const vA1 = await get('/api/events/student-view', tokenA);
    const aE1 = vA1.body.find(e => e._id === ev1);
    const aE2 = vA1.body.find(e => e._id === ev2);
    assert('A sees Event1 isRegistered=true', aE1 && aE1.isRegistered === true, 'Found=' + !!aE1 + ' val=' + (aE1 && aE1.isRegistered));
    assert('A sees Event2 isRegistered=false', aE2 && aE2.isRegistered === false);

    // B should NOT see Event 1 as registered
    const vB1 = await get('/api/events/student-view', tokenB);
    const bE1 = vB1.body.find(e => e._id === ev1);
    const bE2 = vB1.body.find(e => e._id === ev2);
    assert('B sees Event1 isRegistered=false (cross-student OK)', bE1 && bE1.isRegistered === false);
    assert('B sees Event2 isRegistered=false', bE2 && bE2.isRegistered === false);

    // ── TEST 2: Cross-event independence ──
    console.log('\n--- TEST 2: Cross-event independence ---');
    const regA2 = await post('/api/registrations/register-free', { eventId: ev2 }, tokenA);
    assert('A registered for Event 2', regA2.status === 201, 'status=' + regA2.status + ' body=' + JSON.stringify(regA2.body));

    const vA2 = await get('/api/events/student-view', tokenA);
    assert('A: Event1 still registered', vA2.body.find(e => e._id === ev1)?.isRegistered === true);
    assert('A: Event2 now registered', vA2.body.find(e => e._id === ev2)?.isRegistered === true);

    // ── TEST 3: B registers independently ──
    console.log('\n--- TEST 3: B registers independently ---');
    const regB1 = await post('/api/registrations/register-free', { eventId: ev1 }, tokenB);
    assert('B registered for Event 1', regB1.status === 201, 'status=' + regB1.status + ' body=' + JSON.stringify(regB1.body));

    // A unchanged
    const vA3 = await get('/api/events/student-view', tokenA);
    assert('A unchanged: Event1 registered', vA3.body.find(e => e._id === ev1)?.isRegistered === true);
    assert('A unchanged: Event2 registered', vA3.body.find(e => e._id === ev2)?.isRegistered === true);

    // B sees only Event 1 registered
    const vB2 = await get('/api/events/student-view', tokenB);
    assert('B sees Event1 registered', vB2.body.find(e => e._id === ev1)?.isRegistered === true);
    assert('B sees Event2 NOT registered', vB2.body.find(e => e._id === ev2)?.isRegistered === false);

    // ── TEST 4: Duplicate blocked ──
    console.log('\n--- TEST 4: Duplicate blocked ---');
    const dup = await post('/api/registrations/register-free', { eventId: ev1 }, tokenA);
    assert('Duplicate blocked (400)', dup.status === 400, 'status=' + dup.status);
    assert('Message says already registered', dup.body.message?.includes('already registered'));

    // ── Summary ──
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;
    console.log('\n===');
    console.log('Total: ' + results.length + ', Passed: ' + passCount + ', Failed: ' + failCount);

    const output = { total: results.length, passed: passCount, failed: failCount, tests: results };
    fs.writeFileSync('test-clean-results.json', JSON.stringify(output, null, 2), 'utf8');

    process.exit(failCount > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
