// ===== Student Dashboard JavaScript =====
// Fixed: per-student registration state, no cross-student/cross-event pollution

var API = window.location.origin + '/api';

function getUser() {
    return JSON.parse(localStorage.getItem('user'));
}

function authHeaders() {
    var user = getUser();
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (user ? user.token : '')
    };
}

// Global State
var allEvents = [];       // from /api/events/student-view (includes isRegistered per-student)
var myRegistrations = []; // from /api/registrations/my (detailed, with QR codes)
var profileLocked = false; // whether phone/branch are locked
var pollTimer = null;

// ═══════════════════════════════════════════
// ── INIT ──
// ═══════════════════════════════════════════
document.addEventListener('DOMContentLoaded', function () {
    var user = getUser();
    if (!user || user.role !== 'student') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('userName').textContent = user.name || 'Student';

    loadProfile();

    // Load BOTH datasets in parallel, then render once both are ready.
    // This eliminates the race where events render before registrations.
    refreshAll();

    // Logout
    document.getElementById('logoutBtn').addEventListener('click', function () {
        localStorage.removeItem('user');
        if (pollTimer) clearInterval(pollTimer);
        window.location.href = 'index.html';
    });

    // Profile form
    document.getElementById('studentProfileForm').addEventListener('submit', saveProfile);

    // Event delegation for Register buttons
    document.getElementById('eventsList').addEventListener('click', function (e) {
        // Register button
        var btn = e.target.closest('[data-action="register"]');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            var eventId = btn.getAttribute('data-event-id');
            var fee = Number(btn.getAttribute('data-fee'));
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
            handleRegistration(eventId, fee, btn);
            return;
        }
        // Card click → open detail modal (only for upcoming cards)
        var card = e.target.closest('.student-event-card[data-event-id]');
        if (card) {
            e.preventDefault();
            openEventDetail(card.getAttribute('data-event-id'));
        }
    });

    // Delegation for retry payment
    document.getElementById('regsList').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="retry-payment"]');
        if (btn) {
            e.preventDefault();
            var eventId = btn.getAttribute('data-event-id');
            var fee = Number(btn.getAttribute('data-fee'));
            handleRegistration(eventId, fee, btn);
        }
    });

    // UPI confirm button
    document.getElementById('confirmUpiBtn').addEventListener('click', confirmUpiPayment);

    // Register button inside event detail modal
    document.getElementById('eventDetailActions').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="register"]');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            var eventId = btn.getAttribute('data-event-id');
            var fee = Number(btn.getAttribute('data-fee'));
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
            // Close detail modal first
            var modalEl = document.getElementById('eventDetailModal');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            handleRegistration(eventId, fee, btn);
        }
    });

    // Auto-refresh every 15s
    pollTimer = setInterval(function () { refreshAll(); }, 15000);

    // Refresh on tab visibility
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            refreshAll();
        }
    });
});

// ── Refresh BOTH datasets in parallel, render only after both complete ──
async function refreshAll() {
    try {
        // Fetch both endpoints simultaneously
        var [eventsRes, regsRes] = await Promise.all([
            fetch(API + '/events/student-view', {
                headers: authHeaders(),
                cache: 'no-store'
            }),
            fetch(API + '/registrations/my', {
                headers: authHeaders(),
                cache: 'no-store'
            })
        ]);

        if (eventsRes.ok) {
            allEvents = await eventsRes.json();
        }
        if (regsRes.ok) {
            myRegistrations = await regsRes.json();
        }

        // Render AFTER both datasets are loaded — no race condition
        renderEvents();
        renderPastEvents();
        renderRegistrations();
    } catch (err) {
        console.error('Error refreshing data:', err);
    }
}

// ═══════════════════════════════════════════
// ── PROFILE ──
// ═══════════════════════════════════════════
async function loadProfile() {
    try {
        var res = await fetch(API + '/auth/profile', {
            headers: authHeaders(),
            cache: 'no-store'
        });
        if (!res.ok) return;
        var user = await res.json();

        document.getElementById('profName').value = user.name || '';
        document.getElementById('profEmail').value = user.email || '';
        document.getElementById('profRegNo').value = user.registrationNumber || '';
        document.getElementById('profPhone').value = user.phone || '';
        document.getElementById('profBranch').value = (user.branch || '').toUpperCase();
        document.getElementById('profYear').value = user.year || '';
        document.getElementById('profSection').value = (user.section || '').toUpperCase();

        // Lock phone and branch if student has registrations
        profileLocked = user.hasRegistered === true;
        if (profileLocked) {
            document.getElementById('profPhone').disabled = true;
            document.getElementById('profPhone').style.background = '#f1f5f9';
            document.getElementById('profBranch').disabled = true;
            document.getElementById('profBranch').style.background = '#f1f5f9';
            document.getElementById('profileLockedAlert').classList.remove('d-none');
        } else {
            document.getElementById('profPhone').disabled = false;
            document.getElementById('profPhone').style.background = '';
            document.getElementById('profBranch').disabled = false;
            document.getElementById('profBranch').style.background = '';
            document.getElementById('profileLockedAlert').classList.add('d-none');
        }
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

async function saveProfile(e) {
    e.preventDefault();
    var spinner = document.getElementById('studentProfileSpinner');
    var btn = document.getElementById('saveStudentProfileBtn');
    spinner.classList.remove('d-none');
    btn.disabled = true;

    try {
        var payload = {
            name: document.getElementById('profName').value.trim(),
            year: document.getElementById('profYear').value ? Number(document.getElementById('profYear').value) : undefined,
            section: document.getElementById('profSection').value
        };

        // Only send phone/branch if not locked
        if (!profileLocked) {
            payload.phone = document.getElementById('profPhone').value.trim();
            payload.branch = document.getElementById('profBranch').value;
        }

        var res = await fetch(API + '/auth/profile', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Profile updated!', 'success');
            var data = await res.json();
            if (data.name) document.getElementById('userName').textContent = data.name;
        } else {
            var data = await res.json();
            showToast(data.message || 'Error saving profile.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    } finally {
        spinner.classList.add('d-none');
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════
// ── HELPER: Split events into upcoming and past ──
// Past = event date has passed
// ═══════════════════════════════════════════
function splitEvents() {
    var now = new Date();
    var upcoming = [];
    var past = [];

    for (var i = 0; i < allEvents.length; i++) {
        var event = allEvents[i];
        var eventDate = new Date(event.date);

        if (eventDate > now) {
            upcoming.push(event);
        } else {
            past.push(event);
        }
    }

    return { upcoming: upcoming, past: past };
}

// ═══════════════════════════════════════════
// ── RENDER EVENTS (Upcoming only) ──
// Uses `event.isRegistered` from the server (per-student),
// NOT a client-side comparison against myRegistrations.
// ═══════════════════════════════════════════
function renderEvents() {
    var eventsList = document.getElementById('eventsList');
    var badge = document.getElementById('eventCountBadge');
    var split = splitEvents();
    var upcomingEvents = split.upcoming;

    badge.textContent = upcomingEvents.length + ' Event' + (upcomingEvents.length !== 1 ? 's' : '');

    if (upcomingEvents.length === 0) {
        eventsList.innerHTML = '<div class="col-12">' +
            '<div class="text-center py-5">' +
            '<i class="bi bi-calendar-x" style="font-size:3rem;opacity:.2;color:var(--primary);"></i>' +
            '<p class="mt-3 text-muted fw-medium">No upcoming events right now</p>' +
            '<p class="text-muted small">Check back later for new events!</p>' +
            '</div></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < upcomingEvents.length; i++) {
        html += buildEventCard(upcomingEvents[i], false);
    }

    eventsList.innerHTML = html;
}

// ═══════════════════════════════════════════
// ── RENDER PAST EVENTS ──
// ═══════════════════════════════════════════
function renderPastEvents() {
    var pastList = document.getElementById('pastList');
    var badge = document.getElementById('pastCountBadge');
    var split = splitEvents();
    var pastEvents = split.past;

    badge.textContent = pastEvents.length + ' Event' + (pastEvents.length !== 1 ? 's' : '');

    if (pastEvents.length === 0) {
        pastList.innerHTML = '<div class="col-12">' +
            '<div class="text-center py-5">' +
            '<i class="bi bi-clock-history" style="font-size:3rem;opacity:.2;color:var(--gray);"></i>' +
            '<p class="mt-3 text-muted fw-medium">No past events yet</p>' +
            '<p class="text-muted small">Events will appear here after they conclude.</p>' +
            '</div></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < pastEvents.length; i++) {
        html += buildEventCard(pastEvents[i], true);
    }

    pastList.innerHTML = html;
}

// ═══════════════════════════════════════════
// ── BUILD EVENT CARD (shared for upcoming & past) ──
// ═══════════════════════════════════════════
function buildEventCard(event, isPast) {
    var isRegistered = event.isRegistered === true;
    var fee = Number(event.registrationFee) || 0;
    var dateObj = new Date(event.date);
    var day = dateObj.getDate();
    var month = dateObj.toLocaleString('en', { month: 'short' }).toUpperCase();
    var timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    var bannerSrc = event.banner
        ? window.location.origin + event.banner
        : '';

    // Button styles (inline to bypass Bootstrap overrides)
    var regBtnStyle = 'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;padding:8px 22px;border-radius:20px;font-weight:600;font-size:.85rem;box-shadow:0 2px 8px rgba(99,102,241,.25);cursor:pointer;';
    var regdBtnStyle = 'background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;padding:8px 18px;border-radius:20px;font-weight:600;font-size:.85rem;cursor:default;';
    var endedBtnStyle = 'background:#94a3b8;color:#fff;border:none;padding:8px 18px;border-radius:20px;font-weight:600;font-size:.85rem;cursor:default;opacity:.8;';

    var registerBtn = '';
    if (isPast) {
        if (isRegistered) {
            registerBtn = '<button class="btn btn-sm" style="' + regdBtnStyle + '" disabled>' +
                '<i class="bi bi-check-circle-fill me-1"></i>Attended</button>';
        } else {
            registerBtn = '<button class="btn btn-sm" style="' + endedBtnStyle + '" disabled>' +
                '<i class="bi bi-clock-history me-1"></i>Event Ended</button>';
        }
    } else if (isRegistered) {
        registerBtn = '<button class="btn btn-sm" style="' + regdBtnStyle + '" disabled>' +
            '<i class="bi bi-check-circle-fill me-1"></i>Registered</button>';
    } else {
        registerBtn = '<button class="btn btn-sm" style="' + regBtnStyle + '" data-action="register" data-event-id="' +
            event._id + '" data-fee="' + fee + '">' +
            '<i class="bi bi-lightning-charge-fill me-1"></i>' +
            (fee > 0 ? 'Register \u00b7 \u20b9' + fee : 'Register Now') + '</button>';
    }

    var feeBadge = fee === 0
        ? '<span class="student-event-badge free">FREE</span>'
        : '<span class="student-event-badge paid">\u20b9' + fee + '</span>';

    var feeInfoLine = fee === 0
        ? '<div class="student-event-fee free-event"><i class="bi bi-gift-fill me-1"></i>Free Event</div>'
        : '<div class="student-event-fee paid-event"><i class="bi bi-currency-rupee me-1"></i>Registration Fee: <strong>\u20b9' + fee + '</strong></div>';

    var bannerBlock = bannerSrc
        ? '<div class="student-event-banner"><img src="' + bannerSrc + '" alt="' + event.title + '">' + feeBadge + '</div>'
        : '<div class="student-event-banner no-banner"><div class="student-event-date-big">' +
        '<span class="day">' + day + '</span><span class="month">' + month + '</span></div>' + feeBadge + '</div>';

    // Dim past event cards and make non-clickable
    var cardStyle = isPast ? ' style="opacity:.7;pointer-events:none;cursor:default;filter:grayscale(20%);"' : '';
    var cardDataAttr = isPast ? '' : ' data-event-id="' + event._id + '"';
    var cardCursor = isPast ? '' : 'cursor:pointer;';

    return '<div class="col-md-6 col-lg-4">' +
        '<div class="student-event-card"' + cardDataAttr + ' style="' + cardCursor + '"' + cardStyle + '>' +
        bannerBlock +
        '<div class="student-event-body">' +
        '<h5 class="student-event-title">' + event.title + '</h5>' +
        '<div class="student-event-meta">' +
        '<span><i class="bi bi-calendar3"></i> ' + day + ' ' + month + ', ' + timeStr + '</span>' +
        '<span><i class="bi bi-geo-alt-fill"></i> ' + event.venue + '</span>' +
        '</div>' +
        (event.createdBy && event.createdBy.name
            ? '<div class="small text-muted mb-2" style="font-size:.78rem;"><i class="bi bi-person-fill me-1"></i>Posted by: <strong>' + event.createdBy.name + '</strong></div>'
            : '') +
        '<p class="student-event-desc">' + (event.description || '').substring(0, 100) +
        (event.description && event.description.length > 100 ? '...' : '') + '</p>' +
        feeInfoLine +
        '<div class="student-event-footer">' +
        registerBtn +
        '</div>' +
        '</div>' +
        '</div>' +
        '</div>';
}

// ═══════════════════════════════════════════
// ── OPEN EVENT DETAIL MODAL ──
// ═══════════════════════════════════════════
function openEventDetail(eventId) {
    var event = null;
    for (var i = 0; i < allEvents.length; i++) {
        if (allEvents[i]._id === eventId) {
            event = allEvents[i];
            break;
        }
    }
    if (!event) return;

    var dateObj = new Date(event.date);
    var dateStr = dateObj.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
    var timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
    var fee = Number(event.registrationFee) || 0;
    var isRegistered = event.isRegistered === true;

    // Banner
    var bannerEl = document.getElementById('eventDetailBanner');
    if (event.banner) {
        bannerEl.innerHTML = '<img src="' + window.location.origin + event.banner + '" style="width:100%;height:280px;object-fit:cover;" alt="Banner">';
        bannerEl.style.display = 'block';
    } else {
        bannerEl.innerHTML = '';
        bannerEl.style.display = 'none';
    }

    // Title, date, time, venue
    document.getElementById('eventDetailName').textContent = event.title;
    document.getElementById('eventDetailDate').textContent = dateStr;
    document.getElementById('eventDetailTime').textContent = timeStr;
    document.getElementById('eventDetailVenue').textContent = event.venue;

    // Fee badge
    if (fee === 0) {
        document.getElementById('eventDetailFeeBadge').innerHTML = '<span class="badge bg-success px-3 py-2"><i class="bi bi-gift-fill me-1"></i>Free Event</span>';
    } else {
        document.getElementById('eventDetailFeeBadge').innerHTML = '<span class="badge bg-warning text-dark px-3 py-2"><i class="bi bi-currency-rupee me-1"></i>Registration Fee: \u20b9' + fee + '</span>';
    }

    // Posted by
    if (event.createdBy && event.createdBy.name) {
        document.getElementById('eventDetailPostedBy').innerHTML = '<i class="bi bi-person-fill me-1"></i>Posted by: <strong>' + event.createdBy.name + '</strong>';
    } else {
        document.getElementById('eventDetailPostedBy').innerHTML = '';
    }

    // Description
    document.getElementById('eventDetailDesc').textContent = event.description || 'No description available.';

    // Action button
    var actionsEl = document.getElementById('eventDetailActions');
    if (isRegistered) {
        actionsEl.innerHTML = '<button class="btn btn-lg px-5 py-3" style="background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;border-radius:30px;font-weight:700;font-size:1rem;cursor:default;" disabled>' +
            '<i class="bi bi-check-circle-fill me-2"></i>Already Registered</button>';
    } else {
        actionsEl.innerHTML = '<button class="btn btn-lg px-5 py-3" style="background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;border-radius:30px;font-weight:700;font-size:1rem;box-shadow:0 4px 15px rgba(99,102,241,.3);"' +
            ' data-action="register" data-event-id="' + event._id + '" data-fee="' + fee + '">' +
            '<i class="bi bi-lightning-charge-fill me-2"></i>' + (fee > 0 ? 'Register \u00b7 \u20b9' + fee : 'Register Now') + '</button>';
    }

    // Show modal
    var modal = new bootstrap.Modal(document.getElementById('eventDetailModal'));
    modal.show();
}

// ═══════════════════════════════════════════
// ── RENDER REGISTRATIONS ──
// ═══════════════════════════════════════════
function renderRegistrations() {
    var regsList = document.getElementById('regsList');
    var now = new Date();

    // Split into active (upcoming event) and inactive (deleted or past event)
    var activeRegs = [];
    var inactiveRegs = [];
    for (var i = 0; i < myRegistrations.length; i++) {
        var r = myRegistrations[i];
        if (!r.event) {
            // Event was deleted
            r._inactiveReason = 'deleted';
            inactiveRegs.push(r);
        } else if (new Date(r.event.date) < now) {
            // Event date has passed
            r._inactiveReason = r.attended ? 'attended' : 'expired';
            inactiveRegs.push(r);
        } else {
            activeRegs.push(r);
        }
    }

    if (myRegistrations.length === 0) {
        regsList.innerHTML = '<div class="col-12">' +
            '<div class="text-center py-5">' +
            '<i class="bi bi-ticket-perforated" style="font-size:3rem;opacity:.2;color:var(--primary);"></i>' +
            '<p class="mt-3 text-muted fw-medium">No registrations yet</p>' +
            '<p class="text-muted small">Browse events and register to get started!</p>' +
            '</div></div>';
        return;
    }

    var html = '';

    // ── Active Registrations Section ──
    if (activeRegs.length > 0) {
        html += '<div class="col-12 mb-3">' +
            '<div class="d-flex align-items-center gap-2">' +
            '<h6 class="mb-0 fw-bold"><i class="bi bi-check-circle-fill text-success me-1"></i>Active Registrations</h6>' +
            '<span class="badge bg-success rounded-pill">' + activeRegs.length + '</span>' +
            '</div><hr class="mt-2 mb-0"></div>';

        for (var i = 0; i < activeRegs.length; i++) {
            var reg = activeRegs[i];
            var event = reg.event;
            var statusBadge = '', paymentInfo = '', qrSection = '';
            var dateStr = new Date(event.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
            var regDate = new Date(reg.createdAt).toLocaleDateString();

            if (reg.paymentStatus === 'free' || reg.paymentStatus === 'paid') {
                statusBadge = '<span class="badge bg-success"><i class="bi bi-check-circle me-1"></i>Confirmed</span>';
                qrSection = '<div class="student-qr-block">' +
                    '<p class="small text-muted mb-2"><i class="bi bi-qr-code-scan me-1"></i> Attendance QR</p>' +
                    '<img src="' + reg.qrCode + '" class="img-fluid rounded mb-2" style="max-width:160px;" alt="QR">' +
                    '<p class="small fw-bold mb-0" style="font-family:monospace;color:var(--primary);">' + reg._id + '</p>' +
                    '<div class="alert alert-info py-1 px-3 mt-2 mb-0" style="font-size:.72rem;border-radius:8px;">' +
                    '<i class="bi bi-info-circle me-1"></i> Show this QR at the gate for entry (one-time scan only)</div></div>';
            } else if (reg.paymentStatus === 'awaiting_approval') {
                statusBadge = '<span class="badge" style="background:linear-gradient(135deg,#f59e0b,#ef4444);color:#fff;"><i class="bi bi-hourglass-split me-1"></i>Awaiting Approval</span>';
                paymentInfo = '<div class="alert alert-warning py-2 mt-3 mb-0 small" style="border-radius:8px;">' +
                    '<i class="bi bi-clock-history me-1"></i> Your payment has been submitted. ' +
                    'The admin will verify your transaction ID and approve your registration. ' +
                    'You will receive a confirmation email with your QR ticket once approved.</div>';
            } else if (reg.paymentStatus === 'pending') {
                statusBadge = '<span class="badge bg-warning text-dark"><i class="bi bi-hourglass-split me-1"></i>Pending</span>';
                paymentInfo = '<div class="alert alert-warning py-2 mt-3 mb-0 small" style="border-radius:8px;">' +
                    '<i class="bi bi-exclamation-triangle me-1"></i> Payment pending. ' +
                    '<button class="btn btn-link btn-sm p-0 fw-semibold" data-action="retry-payment" data-event-id="' +
                    event._id + '" data-fee="' + event.registrationFee + '">Complete Payment</button></div>';
            } else if (reg.paymentStatus === 'failed') {
                statusBadge = '<span class="badge bg-danger"><i class="bi bi-x-circle me-1"></i>Failed</span>';
                paymentInfo = '<div class="alert alert-danger py-2 mt-3 mb-0 small" style="border-radius:8px;">' +
                    '<i class="bi bi-x-circle me-1"></i> Payment failed. ' +
                    '<button class="btn btn-link btn-sm p-0 fw-semibold" data-action="retry-payment" data-event-id="' +
                    event._id + '" data-fee="' + event.registrationFee + '">Try Again</button></div>';
            }

            html += '<div class="col-md-6 mb-4">' +
                '<div class="student-reg-card">' +
                '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<div><h5 class="mb-1 fw-bold">' + event.title + '</h5>' +
                '<p class="text-muted small mb-0"><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</p></div>' +
                statusBadge + '</div>' +
                '<p class="small text-muted mb-1"><i class="bi bi-geo-alt me-1"></i> ' + event.venue + '</p>' +
                paymentInfo + qrSection +
                '<div class="mt-3 pt-2 border-top d-flex justify-content-between align-items-center">' +
                '<span class="small text-muted">Registered: ' + regDate + '</span>' +
                '</div></div></div>';
        }
    }

    // ── Inactive Registrations Section ──
    if (inactiveRegs.length > 0) {
        html += '<div class="col-12 mb-3 ' + (activeRegs.length > 0 ? 'mt-2' : '') + '">' +
            '<div class="d-flex align-items-center gap-2">' +
            '<h6 class="mb-0 fw-bold"><i class="bi bi-archive-fill me-1" style="color:#64748b;"></i>Inactive Registrations</h6>' +
            '<span class="badge rounded-pill" style="background:#64748b;">' + inactiveRegs.length + '</span>' +
            '</div><hr class="mt-2 mb-0"></div>';

        for (var j = 0; j < inactiveRegs.length; j++) {
            var reg = inactiveRegs[j];
            var regDate = new Date(reg.createdAt).toLocaleDateString();
            var reason = reg._inactiveReason;

            if (reason === 'deleted') {
                // ── Deleted event card ──
                var snap = reg.eventSnapshot || {};
                var title = snap.title || 'Unknown Event';
                var dateStr = snap.date ? new Date(snap.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' }) : 'Date unavailable';
                var venue = snap.venue || 'Venue unavailable';
                var reasonBadge = '<span class="badge" style="background:linear-gradient(135deg,#ef4444,#dc2626);color:#fff;font-size:.72rem;"><i class="bi bi-trash3-fill me-1"></i>Event Deleted by Admin</span>';
                var borderColor = '#ef4444';
                var alertHtml = '<div class="alert alert-danger py-2 mt-2 mb-0 small" style="border-radius:8px;">' +
                    '<i class="bi bi-exclamation-triangle-fill me-1"></i> This event has been removed by the admin. ' +
                    'Your registration is no longer active.</div>';
                var titleStyle = 'text-decoration:line-through;';

            } else {
                // ── Past event card (attended or expired) ──
                var event = reg.event;
                var title = event.title;
                var dateStr = new Date(event.date).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
                var venue = event.venue;
                var titleStyle = '';

                if (reason === 'attended') {
                    var reasonBadge = '<span class="badge" style="background:linear-gradient(135deg,#0ea5e9,#6366f1);color:#fff;font-size:.72rem;"><i class="bi bi-person-check-fill me-1"></i>Attended</span>';
                    var borderColor = '#0ea5e9';
                    var alertHtml = '<div class="alert alert-info py-2 mt-2 mb-0 small" style="border-radius:8px;">' +
                        '<i class="bi bi-check-circle-fill me-1"></i> You attended this event. Thank you for participating!</div>';
                } else {
                    var reasonBadge = '<span class="badge" style="background:linear-gradient(135deg,#94a3b8,#64748b);color:#fff;font-size:.72rem;"><i class="bi bi-clock-history me-1"></i>Expired</span>';
                    var borderColor = '#94a3b8';
                    var alertHtml = '<div class="alert alert-secondary py-2 mt-2 mb-0 small" style="border-radius:8px;">' +
                        '<i class="bi bi-clock-history me-1"></i> This event has ended.</div>';
                }
            }

            html += '<div class="col-md-6 mb-4">' +
                '<div class="student-reg-card" style="border-left:4px solid ' + borderColor + ';opacity:.85;">' +
                '<div class="d-flex justify-content-between align-items-start mb-2">' +
                '<div><h5 class="mb-1 fw-bold text-muted" style="' + titleStyle + '">' + title + '</h5>' +
                '<p class="text-muted small mb-0"><i class="bi bi-calendar3 me-1"></i>' + dateStr + '</p></div>' +
                '<div class="d-flex flex-column align-items-end gap-1">' +
                reasonBadge +
                '</div></div>' +
                '<p class="small text-muted mb-1"><i class="bi bi-geo-alt me-1"></i> ' + venue + '</p>' +
                alertHtml +
                '<div class="mt-3 pt-2 border-top">' +
                '<span class="small text-muted">Registered: ' + regDate + '</span>' +
                '</div></div></div>';
        }
    }

    regsList.innerHTML = html;
}

// ═══════════════════════════════════════════
// ── REGISTRATION HANDLER ──
// ═══════════════════════════════════════════
async function handleRegistration(eventId, fee, buttonElem) {
    if (fee <= 0) {
        await registerFree(eventId, buttonElem);
    } else {
        await startUpiPayment(eventId, buttonElem);
    }
}

// ── Free Registration ──
async function registerFree(eventId, buttonElem) {
    try {
        var res = await fetch(API + '/registrations/register-free', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ eventId: eventId }),
            cache: 'no-store'
        });
        var data = await res.json();
        if (res.ok) {
            showToast('Registration successful! Check your email for the QR ticket.', 'success');
            // Immediately update local state so UI updates instantly
            markEventRegistered(eventId);
            renderEvents();
            renderPastEvents();
            // Then fetch fresh data in background
            refreshAll();
            // Reload profile to check lock status
            loadProfile();
        } else {
            showToast(data.message || 'Registration failed.', 'error');
            resetBtn(buttonElem);
        }
    } catch (error) {
        showToast('Network error. Please try again.', 'error');
        resetBtn(buttonElem);
    }
}

// ── UPI QR Payment ──
async function startUpiPayment(eventId, buttonElem) {
    try {
        var res = await fetch(API + '/registrations/register-upi', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({ eventId: eventId }),
            cache: 'no-store'
        });
        var data = await res.json();

        if (!res.ok) {
            showToast(data.message || 'Failed to start payment.', 'error');
            resetBtn(buttonElem);
            return;
        }

        // Populate the UPI modal
        document.getElementById('upiEventTitle').textContent = data.eventTitle;
        document.getElementById('upiQrImage').src = data.upiQrCode;
        document.getElementById('upiAmount').textContent = data.amount;
        document.getElementById('upiIdDisplay').textContent = data.upiId;
        document.getElementById('upiRegistrationId').value = data.registrationId;
        document.getElementById('upiTxnIdInput').value = '';

        // Show the modal
        var modal = new bootstrap.Modal(document.getElementById('upiPaymentModal'));
        modal.show();

        resetBtn(buttonElem);
    } catch (error) {
        showToast('Error starting payment.', 'error');
        resetBtn(buttonElem);
    }
}

// ── Confirm UPI Payment ──
async function confirmUpiPayment() {
    var registrationId = document.getElementById('upiRegistrationId').value;
    var upiTxnId = document.getElementById('upiTxnIdInput').value.trim();

    if (!upiTxnId) {
        showToast('Please enter the UTR/Transaction ID from your UPI app.', 'error');
        return;
    }

    var btn = document.getElementById('confirmUpiBtn');
    btn.disabled = true;
    btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Verifying...';

    try {
        var res = await fetch(API + '/registrations/confirm-upi', {
            method: 'POST',
            headers: authHeaders(),
            body: JSON.stringify({
                registrationId: registrationId,
                upiTxnId: upiTxnId
            }),
            cache: 'no-store'
        });
        var data = await res.json();

        if (res.ok) {
            showToast('Payment submitted! Awaiting admin approval.', 'success');
            // Close modal
            var modalEl = document.getElementById('upiPaymentModal');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            // Refresh everything
            refreshAll();
            loadProfile();
        } else {
            showToast(data.message || 'Payment confirmation failed.', 'error');
        }
    } catch (error) {
        showToast('Network error.', 'error');
    } finally {
        btn.disabled = false;
        btn.innerHTML = '<i class="bi bi-check-circle me-2"></i>I Have Paid';
    }
}

// ── Instantly mark an event as registered in local state ──
// This gives immediate UI feedback before the server round-trip completes.
function markEventRegistered(eventId) {
    for (var i = 0; i < allEvents.length; i++) {
        if (allEvents[i]._id === eventId) {
            allEvents[i].isRegistered = true;
            break;
        }
    }
}

function resetBtn(btn) {
    if (btn) {
        btn.disabled = false;
        var fee = Number(btn.getAttribute('data-fee')) || 0;
        btn.innerHTML = '<i class="bi bi-lightning-charge-fill me-1"></i>' +
            (fee > 0 ? 'Register \u00b7 \u20b9' + fee : 'Register Now');
    }
}

// ═══════════════════════════════════════════
// ── TOAST ──
// ═══════════════════════════════════════════
function showToast(message, type) {
    type = type || 'success';
    var id = Date.now();
    var html = '<div id="toast-' + id + '" class="toast align-items-center text-white bg-' +
        (type === 'success' ? 'success' : 'danger') + ' border-0" role="alert">' +
        '<div class="d-flex"><div class="toast-body">' +
        (type === 'success' ? '<i class="bi bi-check-circle me-2"></i>' : '<i class="bi bi-exclamation-triangle me-2"></i>') +
        message + '</div>' +
        '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>' +
        '</div></div>';
    document.getElementById('toastContainer').insertAdjacentHTML('beforeend', html);
    var toastElem = document.getElementById('toast-' + id);
    var toast = new bootstrap.Toast(toastElem, { delay: 4000 });
    toast.show();
    toastElem.addEventListener('hidden.bs.toast', function () { toastElem.remove(); });
}
