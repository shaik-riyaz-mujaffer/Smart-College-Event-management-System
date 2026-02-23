// Test script: plain ASCII output, writes results to JSON
const http = require('http');
const fs = require('fs');

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
function assert(label, condition) {
    results.push({ label, passed: !!condition });
}

async function run() {
    // Register (may fail if exists)
    await post('/api/auth/register', { name: 'Student A', email: 'ta@t.com', password: 'test1234', role: 'student', registrationNumber: '22T001', phone: '1010101010', branch: 'CSE', year: 2, section: 'A' });
    await post('/api/auth/register', { name: 'Student B', email: 'tb@t.com', password: 'test1234', role: 'student', registrationNumber: '22T002', phone: '2020202020', branch: 'ECE', year: 3, section: 'B' });
    await post('/api/auth/register', { name: 'Admin', email: 'ta_admin@t.com', password: 'admin1234', role: 'admin' });

    const loginA = await post('/api/auth/login', { identifier: 'ta@t.com', password: 'test1234' });
    const loginB = await post('/api/auth/login', { identifier: 'tb@t.com', password: 'test1234' });
    const loginAdmin = await post('/api/auth/login', { identifier: 'ta_admin@t.com', password: 'admin1234' });

    assert('Student A logged in', loginA.status === 200 && loginA.body.token);
    assert('Student B logged in', loginB.status === 200 && loginB.body.token);
    assert('Admin logged in', loginAdmin.status === 200 && loginAdmin.body.token);

    const tokenA = loginA.body.token;
    const tokenB = loginB.body.token;
    const tokenAdmin = loginAdmin.body.token;

    const tomorrow = new Date(Date.now() + 86400000).toISOString();
    const e1 = await post('/api/events', { title: 'Alpha', description: 'T1', date: tomorrow, venue: 'H1', maxParticipants: 100, registrationFee: 0 }, tokenAdmin);
    const e2 = await post('/api/events', { title: 'Beta', description: 'T2', date: tomorrow, venue: 'H2', maxParticipants: 100, registrationFee: 0 }, tokenAdmin);
    assert('Event 1 created', e1.status === 201);
    assert('Event 2 created', e2.status === 201);
    const ev1 = e1.body._id, ev2 = e2.body._id;

    // TEST 1: A registers Event 1
    const regA1 = await post('/api/registrations/register-free', { eventId: ev1 }, tokenA);
    assert('A registered Event 1', regA1.status === 201);

    // A sees registered for Event 1
    const vA1 = await get('/api/events/student-view', tokenA);
    const aE1 = vA1.body.find(e => e._id === ev1);
    const aE2 = vA1.body.find(e => e._id === ev2);
    assert('A sees Event1 isRegistered=true', aE1 && aE1.isRegistered === true);
    assert('A sees Event2 isRegistered=false', aE2 && aE2.isRegistered === false);

    // B should NOT see registered (cross-student bug)
    const vB1 = await get('/api/events/student-view', tokenB);
    const bE1 = vB1.body.find(e => e._id === ev1);
    const bE2 = vB1.body.find(e => e._id === ev2);
    assert('B sees Event1 isRegistered=false (not polluted)', bE1 && bE1.isRegistered === false);
    assert('B sees Event2 isRegistered=false', bE2 && bE2.isRegistered === false);

    // TEST 2: A registers Event 2 (cross-event)
    const regA2 = await post('/api/registrations/register-free', { eventId: ev2 }, tokenA);
    assert('A registered Event 2 (cross-event OK)', regA2.status === 201);

    const vA2 = await get('/api/events/student-view', tokenA);
    assert('A sees Event1 still registered', vA2.body.find(e => e._id === ev1)?.isRegistered === true);
    assert('A sees Event2 now registered', vA2.body.find(e => e._id === ev2)?.isRegistered === true);

    // TEST 3: B registers Event 1 independently
    const regB1 = await post('/api/registrations/register-free', { eventId: ev1 }, tokenB);
    assert('B registered Event 1', regB1.status === 201);

    const vA3 = await get('/api/events/student-view', tokenA);
    assert('A unchanged: Event1 registered', vA3.body.find(e => e._id === ev1)?.isRegistered === true);
    assert('A unchanged: Event2 registered', vA3.body.find(e => e._id === ev2)?.isRegistered === true);

    const vB2 = await get('/api/events/student-view', tokenB);
    assert('B sees Event1 registered', vB2.body.find(e => e._id === ev1)?.isRegistered === true);
    assert('B sees Event2 NOT registered', vB2.body.find(e => e._id === ev2)?.isRegistered === false);

    // TEST 4: Duplicate blocked
    const dup = await post('/api/registrations/register-free', { eventId: ev1 }, tokenA);
    assert('Duplicate blocked (400)', dup.status === 400);
    assert('Says already registered', dup.body.message?.includes('already registered'));

    // Write results
    const passCount = results.filter(r => r.passed).length;
    const failCount = results.filter(r => !r.passed).length;
    const output = { total: results.length, passed: passCount, failed: failCount, tests: results };
    fs.writeFileSync('test-results.json', JSON.stringify(output, null, 2), 'utf8');

    // Print summary in ASCII
    results.forEach(r => console.log((r.passed ? 'PASS' : 'FAIL') + ': ' + r.label));
    console.log('---');
    console.log('Total: ' + results.length + ', Passed: ' + passCount + ', Failed: ' + failCount);
    process.exit(failCount > 0 ? 1 : 0);
}

run().catch(e => { console.error('FATAL:', e.message); process.exit(1); });
