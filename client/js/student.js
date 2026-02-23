// ===== Student Dashboard JavaScript =====

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
var allEvents = [];
var myRegistrations = [];
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
    loadEvents();
    loadMyRegistrations();

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
        var btn = e.target.closest('[data-action="register"]');
        if (btn) {
            e.preventDefault();
            e.stopPropagation();
            var eventId = btn.getAttribute('data-event-id');
            var fee = Number(btn.getAttribute('data-fee'));
            btn.disabled = true;
            btn.innerHTML = '<span class="spinner-border spinner-border-sm me-1"></span>Processing...';
            handleRegistration(eventId, fee, btn);
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

    // Auto-refresh every 15s
    pollTimer = setInterval(function () { loadEvents(); }, 15000);

    // Refresh on tab visibility
    document.addEventListener('visibilitychange', function () {
        if (!document.hidden) {
            loadEvents();
            loadMyRegistrations();
        }
    });
});

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
            phone: document.getElementById('profPhone').value.trim(),
            branch: document.getElementById('profBranch').value,
            year: document.getElementById('profYear').value ? Number(document.getElementById('profYear').value) : undefined,
            section: document.getElementById('profSection').value
        };

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
// ── LOAD EVENTS ──
// ═══════════════════════════════════════════
async function loadEvents() {
    try {
        var res = await fetch(API + '/events');
        allEvents = await res.json();
        renderEvents();
    } catch (error) {
        console.error('Error loading events:', error);
    }
}

// ═══════════════════════════════════════════
// ── RENDER EVENTS ──
// ═══════════════════════════════════════════
function renderEvents() {
    var eventsList = document.getElementById('eventsList');
    var badge = document.getElementById('eventCountBadge');
    badge.textContent = allEvents.length + ' Event' + (allEvents.length !== 1 ? 's' : '');

    if (allEvents.length === 0) {
        eventsList.innerHTML = '<div class="col-12">' +
            '<div class="text-center py-5">' +
            '<i class="bi bi-calendar-x" style="font-size:3rem;opacity:.2;color:var(--primary);"></i>' +
            '<p class="mt-3 text-muted fw-medium">No upcoming events right now</p>' +
            '<p class="text-muted small">Check back later for new events!</p>' +
            '</div></div>';
        return;
    }

    var html = '';
    for (var i = 0; i < allEvents.length; i++) {
        var event = allEvents[i];
        var isRegistered = myRegistrations.some(function (reg) {
            return reg.event && reg.event._id === event._id &&
                (reg.paymentStatus === 'paid' || reg.paymentStatus === 'free');
        });
        var fee = Number(event.registrationFee) || 0;
        var dateObj = new Date(event.date);
        var isUpcoming = dateObj > new Date();
        var day = dateObj.getDate();
        var month = dateObj.toLocaleString('en', { month: 'short' }).toUpperCase();
        var timeStr = dateObj.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
        var bannerSrc = event.banner
            ? window.location.origin + event.banner
            : '';

        // Button styles (inline to bypass Bootstrap overrides)
        var regBtnStyle = 'background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;border:none;padding:8px 22px;border-radius:20px;font-weight:600;font-size:.85rem;box-shadow:0 2px 8px rgba(99,102,241,.25);cursor:pointer;';
        var regdBtnStyle = 'background:linear-gradient(135deg,#22c55e,#16a34a);color:#fff;border:none;padding:8px 18px;border-radius:20px;font-weight:600;font-size:.85rem;cursor:default;';

        var registerBtn = '';
        if (isRegistered) {
            registerBtn = '<button class="btn btn-sm" style="' + regdBtnStyle + '" disabled>' +
                '<i class="bi bi-check-circle-fill me-1"></i>Registered</button>';
        } else if (!isUpcoming) {
            registerBtn = '<button class="btn btn-sm btn-secondary" disabled>Event Ended</button>';
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

        html += '<div class="col-md-6 col-lg-4">' +
            '<div class="student-event-card">' +
            bannerBlock +
            '<div class="student-event-body">' +
            '<h5 class="student-event-title">' + event.title + '</h5>' +
            '<div class="student-event-meta">' +
            '<span><i class="bi bi-calendar3"></i> ' + day + ' ' + month + ', ' + timeStr + '</span>' +
            '<span><i class="bi bi-geo-alt-fill"></i> ' + event.venue + '</span>' +
            '</div>' +
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

    eventsList.innerHTML = html;
}

// ═══════════════════════════════════════════
// ── LOAD & RENDER REGISTRATIONS ──
// ═══════════════════════════════════════════
async function loadMyRegistrations() {
    try {
        var res = await fetch(API + '/registrations/my', {
            headers: authHeaders(),
            cache: 'no-store'  // prevent serving another user's cached registrations
        });
        myRegistrations = await res.json();
        renderRegistrations();
        renderEvents(); // update button states
    } catch (error) {
        console.error('Error loading registrations:', error);
    }
}

function renderRegistrations() {
    var regsList = document.getElementById('regsList');
    var badge = document.getElementById('regCountBadge');
    badge.textContent = myRegistrations.length + ' Registration' + (myRegistrations.length !== 1 ? 's' : '');

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
    for (var i = 0; i < myRegistrations.length; i++) {
        var reg = myRegistrations[i];
        var event = reg.event;
        if (!event) continue;

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
            (reg.attended ? '<span class="badge bg-info"><i class="bi bi-person-check me-1"></i>Attended</span>' : '') +
            '</div></div></div>';
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
            body: JSON.stringify({ eventId: eventId })
        });
        var data = await res.json();
        if (res.ok) {
            showToast('Registration successful! Check your email for the QR ticket.', 'success');
            loadMyRegistrations();
            loadEvents();
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
            body: JSON.stringify({ eventId: eventId })
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
            })
        });
        var data = await res.json();

        if (res.ok) {
            showToast('Payment confirmed! QR ticket sent to your email.', 'success');
            // Close modal
            var modalEl = document.getElementById('upiPaymentModal');
            var modal = bootstrap.Modal.getInstance(modalEl);
            if (modal) modal.hide();
            loadMyRegistrations();
            loadEvents();
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
