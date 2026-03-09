// ===== Admin Dashboard JavaScript =====

const API = 'https://smart-college-event-management-system.onrender.com/api';

function getUser() {
    return JSON.parse(localStorage.getItem('user'));
}

function authHeaders() {
    const user = getUser();
    return {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + (user ? user.token : '')
    };
}

function authHeadersOnly() {
    const user = getUser();
    return { 'Authorization': 'Bearer ' + (user ? user.token : '') };
}

// ── Init ──
document.addEventListener('DOMContentLoaded', function () {
    var user = getUser();
    if (!user || user.role !== 'admin') {
        window.location.href = 'index.html';
        return;
    }

    document.getElementById('navAdminName').textContent = user.name || 'Admin';
    loadProfile();
    loadMyEvents();

    document.getElementById('logoutBtn').addEventListener('click', function () {
        localStorage.removeItem('user');
        window.location.href = 'index.html';
    });

    initFeeToggle();
    initBannerPreview();

    document.getElementById('profileForm').addEventListener('submit', saveProfile);
    document.getElementById('eventForm').addEventListener('submit', publishEvent);
    document.getElementById('editEventForm').addEventListener('submit', updateEvent);

    // Payment queue delegation
    document.getElementById('paymentQueueContent').addEventListener('click', function (e) {
        var approveBtn = e.target.closest('[data-action="approve-pay"]');
        var rejectBtn = e.target.closest('[data-action="reject-pay"]');
        if (approveBtn) {
            approvePayment(approveBtn.getAttribute('data-id'));
        }
        if (rejectBtn) {
            rejectPayment(rejectBtn.getAttribute('data-id'));
        }
    });


    // Refresh past events on modal open
    document.getElementById('pastEventsModal').addEventListener('show.bs.modal', function () {
        loadPastEvents();
    });

    // Refresh students on modal open
    document.getElementById('myStudentsModal').addEventListener('show.bs.modal', function () {
        loadMyStudents();
    });

    // Student list delegation for coordinator toggle
    document.getElementById('myStudentsModal').addEventListener('click', function (e) {
        var btn = e.target.closest('[data-action="toggle-coordinator"]');
        if (btn) {
            e.preventDefault();
            toggleCoordinator(btn.getAttribute('data-id'));
        }
    });



    // ── Event Delegation for Edit & Delete buttons ──
    document.getElementById('myEventsList').addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-action="edit"]');
        var deleteBtn = e.target.closest('[data-action="delete"]');
        var pqBtn = e.target.closest('[data-action="payment-queue"]');
        var regBtn = e.target.closest('[data-action="view-registrations"]');
        var coordBtn = e.target.closest('[data-action="coordinators"]');

        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            openEditModal(editBtn.getAttribute('data-id'));
        }

        if (deleteBtn) {
            e.preventDefault();
            e.stopPropagation();
            deleteEvent(deleteBtn.getAttribute('data-id'));
        }

        if (pqBtn) {
            e.preventDefault();
            e.stopPropagation();
            openEventPaymentQueue(pqBtn.getAttribute('data-id'), pqBtn.getAttribute('data-title'));
        }

        if (regBtn) {
            e.preventDefault();
            e.stopPropagation();
            openRegistrationsModal(regBtn.getAttribute('data-id'), regBtn.getAttribute('data-title'));
        }

        if (coordBtn) {
            e.preventDefault();
            e.stopPropagation();
            openCoordinatorModal(coordBtn.getAttribute('data-id'), coordBtn.getAttribute('data-title'));
        }
    });

    // Past events delegation (edit + view registrations, no delete)
    document.getElementById('pastEventsList').addEventListener('click', function (e) {
        var editBtn = e.target.closest('[data-action="edit"]');
        var regBtn = e.target.closest('[data-action="view-registrations"]');
        if (editBtn) {
            e.preventDefault();
            e.stopPropagation();
            openEditModal(editBtn.getAttribute('data-id'));
        }
        if (regBtn) {
            e.preventDefault();
            e.stopPropagation();
            openRegistrationsModal(regBtn.getAttribute('data-id'), regBtn.getAttribute('data-title'));
        }
    });
});

// ═══════════════════════════════════════════
// ── FEE TOGGLE ──
// ═══════════════════════════════════════════
var eventType = 'free';

function initFeeToggle() {
    var toggle = document.getElementById('feeToggle');
    var buttons = toggle.querySelectorAll('.fee-btn');
    var paidFields = document.getElementById('paidFields');

    buttons.forEach(function (btn) {
        btn.addEventListener('click', function () {
            buttons.forEach(function (b) { b.classList.remove('active'); });
            btn.classList.add('active');
            eventType = btn.dataset.type;
            paidFields.style.display = eventType === 'paid' ? 'block' : 'none';
        });
    });
}

// ═══════════════════════════════════════════
// ── BANNER PREVIEW ──
// ═══════════════════════════════════════════
function initBannerPreview() {
    var fileInput = document.getElementById('evBanner');
    var previewDiv = document.getElementById('bannerPreview');
    var previewImg = document.getElementById('bannerPreviewImg');

    fileInput.addEventListener('change', function () {
        var file = fileInput.files[0];
        if (file) {
            var reader = new FileReader();
            reader.onload = function (e) {
                previewImg.src = e.target.result;
                previewDiv.style.display = 'block';
            };
            reader.readAsDataURL(file);
        } else {
            previewDiv.style.display = 'none';
        }
    });
}

// ═══════════════════════════════════════════
// ── PROFILE ──
// ═══════════════════════════════════════════
async function loadProfile() {
    try {
        var res = await fetch(API + '/auth/profile', { headers: authHeaders() });
        if (!res.ok) return;
        var user = await res.json();

        document.getElementById('profName').value = user.name || '';
        document.getElementById('profEmail').value = user.email || '';
        document.getElementById('profDepartment').value = user.department || '';
        document.getElementById('profDesignation').value = user.designation || '';
        document.getElementById('profSubject').value = user.teachingSubject || '';
        document.getElementById('profBranch').value = user.adminBranch || '';
        document.getElementById('profPhd').value = user.phdDetails || '';
        document.getElementById('profBtech').value = user.btechDetails || '';

        // Populate target branch dropdowns
        populateBranchDropdowns(user.adminBranch || '');
    } catch (err) {
        console.error('Error loading profile:', err);
    }
}

function populateBranchDropdowns(adminBranch) {
    var selectors = ['evTargetBranch', 'editEvTargetBranch'];
    for (var i = 0; i < selectors.length; i++) {
        var sel = document.getElementById(selectors[i]);
        if (!sel) continue;
        sel.innerHTML = '<option value="ALL">All Branches</option>';
        if (adminBranch) {
            var opt = document.createElement('option');
            opt.value = adminBranch.toUpperCase();
            opt.textContent = adminBranch.toUpperCase() + ' Only';
            sel.appendChild(opt);
        }
    }
}

async function saveProfile(e) {
    e.preventDefault();
    var spinner = document.getElementById('profileSpinner');
    var btn = document.getElementById('saveProfileBtn');
    spinner.classList.remove('d-none');
    btn.disabled = true;

    try {
        var payload = {
            department: document.getElementById('profDepartment').value.trim(),
            designation: document.getElementById('profDesignation').value,
            teachingSubject: document.getElementById('profSubject').value.trim(),
            adminBranch: document.getElementById('profBranch').value,
            phdDetails: document.getElementById('profPhd').value.trim(),
            btechDetails: document.getElementById('profBtech').value.trim()
        };

        var res = await fetch(API + '/auth/profile', {
            method: 'PUT',
            headers: authHeaders(),
            body: JSON.stringify(payload)
        });

        if (res.ok) {
            showToast('Profile updated successfully!', 'success');
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
// ── PUBLISH EVENT ──
// ═══════════════════════════════════════════
async function publishEvent(e) {
    e.preventDefault();
    var spinner = document.getElementById('publishSpinner');
    var btn = document.getElementById('publishBtn');

    var title = document.getElementById('evTitle').value.trim();
    var description = document.getElementById('evDesc').value.trim();
    var venue = document.getElementById('evVenue').value.trim();
    var date = document.getElementById('evDate').value;

    if (!title || !description || !venue || !date) {
        showToast('Please fill in all required fields.', 'error');
        return;
    }

    var formData = new FormData();
    formData.append('title', title);
    formData.append('description', description);
    formData.append('venue', venue);
    formData.append('date', date);

    if (eventType === 'paid') {
        var fee = document.getElementById('evFee').value;
        var upiId = document.getElementById('evUpiId').value.trim();
        if (!fee || Number(fee) <= 0) {
            showToast('Please enter a valid registration fee.', 'error');
            return;
        }
        if (!upiId) {
            showToast('Please enter your UPI ID for paid events.', 'error');
            return;
        }
        formData.append('registrationFee', fee);
        formData.append('upiId', upiId);
    } else {
        formData.append('registrationFee', '0');
    }

    var bannerFile = document.getElementById('evBanner').files[0];
    if (bannerFile) formData.append('banner', bannerFile);

    // Target branch
    formData.append('targetBranch', document.getElementById('evTargetBranch').value || 'ALL');

    spinner.classList.remove('d-none');
    btn.disabled = true;

    try {
        var res = await fetch(API + '/events', {
            method: 'POST',
            headers: authHeadersOnly(),
            body: formData
        });

        if (res.ok) {
            showToast('🎉 Event published successfully!', 'success');
            document.getElementById('eventForm').reset();
            document.getElementById('bannerPreview').style.display = 'none';
            document.getElementById('paidFields').style.display = 'none';
            eventType = 'free';
            var buttons = document.querySelectorAll('#feeToggle .fee-btn');
            buttons.forEach(function (b) { b.classList.remove('active'); });
            buttons[0].classList.add('active');

            // Close modal
            var modal = bootstrap.Modal.getInstance(document.getElementById('postEventModal'));
            if (modal) modal.hide();
            loadMyEvents();
        } else {
            var data = await res.json();
            showToast(data.message || 'Error creating event.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    } finally {
        spinner.classList.add('d-none');
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════
// ── MY EVENTS LIST ──
// ═══════════════════════════════════════════
async function loadMyEvents() {
    try {
        var res = await fetch(API + '/events');
        var allEvents = await res.json();
        var user = getUser();

        // Only show upcoming events in main section
        var myEvents = allEvents.filter(function (ev) {
            if (!ev.createdBy) return false;
            var creatorId = ev.createdBy._id || ev.createdBy;
            return creatorId === user._id && new Date(ev.date) > new Date();
        });

        document.getElementById('eventCount').textContent = myEvents.length;
        var container = document.getElementById('myEventsList');

        if (myEvents.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5">' +
                '<i class="bi bi-calendar-x" style="font-size:2.5rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">No upcoming events. Click <strong>"Post New Event"</strong> to get started!</p></div>';
            return;
        }

        var html = '<div class="row g-3">';
        for (var i = 0; i < myEvents.length; i++) {
            var ev = myEvents[i];
            var date = new Date(ev.date);
            var dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            var timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            var isFree = !ev.registrationFee || ev.registrationFee === 0;
            var regCount = ev.registrations || 0;
            var isUpcoming = date > new Date();
            var bannerHtml = ev.banner ? '<img src="' + ev.banner + '" class="event-card-banner" alt="Banner">' : '';

            html += '<div class="col-12">' +
                '<div class="admin-event-item h-100 d-flex flex-column">' +
                bannerHtml +
                '<div class="admin-event-body d-flex flex-column flex-grow-1">' +
                '<h6 class="mb-1 fw-bold">' + ev.title + '</h6>' +
                '<p class="text-muted small mb-2" style="line-height:1.4;">' +
                (ev.description ? ev.description.substring(0, 100) : '') +
                (ev.description && ev.description.length > 100 ? '...' : '') + '</p>' +
                '<div class="d-flex flex-wrap gap-2 mb-2">' +
                '<span class="event-meta-pill"><i class="bi bi-geo-alt"></i> ' + ev.venue + '</span>' +
                '<span class="event-meta-pill"><i class="bi bi-calendar3"></i> ' + dateStr + '</span>' +
                '<span class="event-meta-pill"><i class="bi bi-clock"></i> ' + timeStr + '</span>' +
                '</div>' +
                '<div class="d-flex flex-wrap gap-2 mb-3">' +
                '<span class="badge ' + (isFree ? 'bg-success' : 'bg-warning text-dark') + '">' + (isFree ? '✨ Free' : '₹' + ev.registrationFee) + '</span>' +
                '<button class="btn btn-sm btn-outline-dark border" data-action="view-registrations" data-id="' + ev._id + '" data-title="' + ev.title.replace(/"/g, '&amp;quot;') + '" style="font-size:.75rem;"><i class="bi bi-people-fill me-1"></i>' + regCount + ' registered</button>' +
                '<span class="badge ' + (isUpcoming ? 'bg-primary' : 'bg-secondary') + '">' + (isUpcoming ? '📅 Upcoming' : '✓ Past') + '</span>' +
                '</div>' +
                '<div class="d-flex flex-wrap gap-2 mt-auto">' +
                (!isFree ? '<button class="btn btn-sm btn-warning" data-action="payment-queue" data-id="' + ev._id + '" data-title="' + ev.title.replace(/"/g, '&amp;quot;') + '" title="Payment Queue">' +
                    '<i class="bi bi-hourglass-split me-1"></i>Payment Queue</button>' : '') +
                '<button class="btn btn-sm btn-outline-success" data-action="coordinators" data-id="' + ev._id + '" data-title="' + ev.title.replace(/"/g, '&amp;quot;') + '" title="Assign Coordinators">' +
                '<i class="bi bi-person-badge me-1"></i>Coordinators</button>' +
                '<button class="btn btn-sm btn-outline-primary" data-action="edit" data-id="' + ev._id + '" title="Edit Event">' +
                '<i class="bi bi-pencil-fill me-1"></i>Edit</button>' +
                '<button class="btn btn-sm btn-outline-danger" data-action="delete" data-id="' + ev._id + '" title="Delete Event">' +
                '<i class="bi bi-trash-fill me-1"></i>Delete</button>' +
                '</div>' +
                '</div></div></div>';
        }
        html += '</div>';

        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading events:', err);
    }
}

// ═══════════════════════════════════════════
// ── PAST EVENTS LIST ──
// ═══════════════════════════════════════════
async function loadPastEvents() {
    try {
        var res = await fetch(API + '/events');
        var allEvents = await res.json();
        var user = getUser();

        var pastEvents = allEvents.filter(function (ev) {
            if (!ev.createdBy) return false;
            var creatorId = ev.createdBy._id || ev.createdBy;
            return creatorId === user._id && new Date(ev.date) <= new Date();
        });

        var container = document.getElementById('pastEventsList');

        if (pastEvents.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5">' +
                '<i class="bi bi-calendar-check" style="font-size:2.5rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">No past events found.</p></div>';
            return;
        }

        var html = '<div class="row g-3">';
        for (var i = 0; i < pastEvents.length; i++) {
            var ev = pastEvents[i];
            var date = new Date(ev.date);
            var dateStr = date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
            var timeStr = date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' });
            var isFree = !ev.registrationFee || ev.registrationFee === 0;
            var regCount = ev.registrations || 0;
            var bannerHtml = ev.banner ? '<img src="' + ev.banner + '" class="event-card-banner" alt="Banner">' : '';

            html += '<div class="col-12">' +
                '<div class="admin-event-item h-100 d-flex flex-column" style="opacity:.85;">' +
                bannerHtml +
                '<div class="admin-event-body d-flex flex-column flex-grow-1">' +
                '<h6 class="mb-1 fw-bold">' + ev.title + '</h6>' +
                '<p class="text-muted small mb-2" style="line-height:1.4;">' +
                (ev.description ? ev.description.substring(0, 100) : '') +
                (ev.description && ev.description.length > 100 ? '...' : '') + '</p>' +
                '<div class="d-flex flex-wrap gap-2 mb-2">' +
                '<span class="event-meta-pill"><i class="bi bi-geo-alt"></i> ' + ev.venue + '</span>' +
                '<span class="event-meta-pill"><i class="bi bi-calendar3"></i> ' + dateStr + '</span>' +
                '<span class="event-meta-pill"><i class="bi bi-clock"></i> ' + timeStr + '</span>' +
                '</div>' +
                '<div class="d-flex flex-wrap gap-2 mb-3">' +
                '<span class="badge ' + (isFree ? 'bg-success' : 'bg-warning text-dark') + '">' + (isFree ? '✨ Free' : '₹' + ev.registrationFee) + '</span>' +
                '<button class="btn btn-sm btn-outline-dark border" data-action="view-registrations" data-id="' + ev._id + '" data-title="' + ev.title.replace(/"/g, '&amp;quot;') + '" style="font-size:.75rem;"><i class="bi bi-people-fill me-1"></i>' + regCount + ' registered</button>' +
                '<span class="badge bg-secondary">✓ Completed</span>' +
                '</div>' +
                '<div class="d-flex flex-wrap gap-2 mt-auto">' +
                '<button class="btn btn-sm btn-outline-primary" data-action="edit" data-id="' + ev._id + '" title="Edit Event">' +
                '<i class="bi bi-pencil-fill me-1"></i>Edit</button>' +
                '</div>' +
                '</div></div></div>';
        }
        html += '</div>';

        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading past events:', err);
    }
}

// ═══════════════════════════════════════════
// ── VIEW REGISTRATIONS ──
// ═══════════════════════════════════════════
var currentRegEventId = null;
var currentRegEventTitle = '';
var currentRegData = [];

function openRegistrationsModal(eventId, eventTitle) {
    currentRegEventId = eventId;
    currentRegEventTitle = eventTitle || 'Event';
    document.getElementById('registrationsModalTitle').innerHTML =
        '<i class="bi bi-people-fill me-2"></i>Registered Students — ' + currentRegEventTitle;
    loadRegistrations(eventId);
    var modal = new bootstrap.Modal(document.getElementById('registrationsModal'));
    modal.show();
}

async function loadRegistrations(eventId) {
    try {
        var res = await fetch(API + '/admin/event-registrations/' + eventId, { headers: authHeaders() });
        if (!res.ok) return;
        var regs = await res.json();
        currentRegData = regs;

        var container = document.getElementById('registrationsContent');
        var downloadBtn = document.getElementById('downloadCsvBtn');

        if (regs.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5">' +
                '<i class="bi bi-people" style="font-size:2.5rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">No confirmed registrations for this event.</p></div>';
            downloadBtn.style.display = 'none';
            return;
        }

        downloadBtn.style.display = 'inline-block';

        var html = '<div class="table-responsive"><table class="table table-custom table-hover mb-0">' +
            '<thead><tr>' +
            '<th>#</th>' +
            '<th>Name</th>' +
            '<th>Registration No.</th>' +
            '<th>Branch</th>' +
            '<th>Section</th>' +
            '<th>Year</th>' +
            '<th>Email</th>' +
            '</tr></thead><tbody>';

        for (var i = 0; i < regs.length; i++) {
            var r = regs[i];
            var u = r.user || {};
            html += '<tr>' +
                '<td>' + (i + 1) + '</td>' +
                '<td>' + (u.name || '-') + '</td>' +
                '<td>' + (u.registrationNumber || '-') + '</td>' +
                '<td>' + (u.branch || '-') + '</td>' +
                '<td>' + (u.section || '-') + '</td>' +
                '<td>' + (u.year || '-') + '</td>' +
                '<td>' + (u.email || '-') + '</td>' +
                '</tr>';
        }

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading registrations:', err);
    }
}

function downloadRegistrationsCsv() {
    if (!currentRegData || currentRegData.length === 0) return;

    var headers = ['S.No', 'Name', 'Registration Number', 'Branch', 'Section', 'Year', 'Email', 'Event Name'];
    var rows = [headers.join(',')];

    for (var i = 0; i < currentRegData.length; i++) {
        var r = currentRegData[i];
        var u = r.user || {};
        var eventName = (r.event && r.event.title) ? r.event.title : currentRegEventTitle;
        var row = [
            i + 1,
            '"' + (u.name || '').replace(/"/g, '""') + '"',
            '"' + (u.registrationNumber || '') + '"',
            '"' + (u.branch || '') + '"',
            '"' + (u.section || '') + '"',
            '"' + (u.year || '') + '"',
            '"' + (u.email || '') + '"',
            '"' + eventName.replace(/"/g, '""') + '"'
        ];
        rows.push(row.join(','));
    }

    var csv = rows.join('\n');
    var blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (currentRegEventTitle || 'registrations').replace(/[^a-zA-Z0-9]/g, '_') + '_registrations.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// Wire download button
document.getElementById('downloadCsvBtn').addEventListener('click', downloadRegistrationsCsv);

// ═══════════════════════════════════════════
// ── EDIT EVENT ──
// ═══════════════════════════════════════════
async function openEditModal(eventId) {
    try {
        var res = await fetch(API + '/events/' + eventId);
        if (!res.ok) { showToast('Event not found.', 'error'); return; }
        var ev = await res.json();

        document.getElementById('editEvId').value = ev._id;
        document.getElementById('editEvTitle').value = ev.title || '';
        document.getElementById('editEvDesc').value = ev.description || '';
        document.getElementById('editEvVenue').value = ev.venue || '';
        document.getElementById('editEvFee').value = ev.registrationFee || 0;
        document.getElementById('editEvUpiId').value = ev.upiId || '';

        if (ev.date) {
            var d = new Date(ev.date);
            var pad = function (n) { return n < 10 ? '0' + n : n; };
            var localStr = d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
                'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
            document.getElementById('editEvDate').value = localStr;
        }

        var editModal = new bootstrap.Modal(document.getElementById('editEventModal'));
        editModal.show();

        // Set target branch dropdown
        var editBranchSel = document.getElementById('editEvTargetBranch');
        if (editBranchSel) editBranchSel.value = (ev.targetBranch || 'ALL').toUpperCase();
    } catch (err) {
        console.error('Error in openEditModal:', err);
        showToast('Error loading event details.', 'error');
    }
}

async function updateEvent(e) {
    e.preventDefault();
    var spinner = document.getElementById('updateSpinner');
    var btn = document.getElementById('updateBtn');
    var eventId = document.getElementById('editEvId').value;

    var formData = new FormData();
    formData.append('title', document.getElementById('editEvTitle').value.trim());
    formData.append('description', document.getElementById('editEvDesc').value.trim());
    formData.append('venue', document.getElementById('editEvVenue').value.trim());
    formData.append('date', document.getElementById('editEvDate').value);
    formData.append('registrationFee', document.getElementById('editEvFee').value || '0');
    formData.append('upiId', document.getElementById('editEvUpiId').value.trim());
    formData.append('targetBranch', document.getElementById('editEvTargetBranch').value || 'ALL');

    var bannerFile = document.getElementById('editEvBanner').files[0];
    if (bannerFile) formData.append('banner', bannerFile);

    spinner.classList.remove('d-none');
    btn.disabled = true;

    try {
        var res = await fetch(API + '/events/' + eventId, {
            method: 'PUT',
            headers: authHeadersOnly(),
            body: formData
        });

        if (res.ok) {
            showToast('✅ Event updated successfully!', 'success');
            var modal = bootstrap.Modal.getInstance(document.getElementById('editEventModal'));
            if (modal) modal.hide();
            loadMyEvents();
        } else {
            var data = await res.json();
            showToast(data.message || 'Error updating event.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    } finally {
        spinner.classList.add('d-none');
        btn.disabled = false;
    }
}

// ═══════════════════════════════════════════
// ── DELETE EVENT ──
// ═══════════════════════════════════════════
async function deleteEvent(id) {
    if (!confirm('Are you sure you want to delete this event? All its registrations will also be removed.')) return;

    try {
        var res = await fetch(API + '/events/' + id, {
            method: 'DELETE',
            headers: authHeaders()
        });

        if (res.ok) {
            showToast('Event deleted.', 'success');
            loadMyEvents();
        } else {
            var data = await res.json();
            showToast(data.message || 'Failed to delete event.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

// ═══════════════════════════════════════════
// ── PAYMENT QUEUE (PER-EVENT) ──
// ═══════════════════════════════════════════
var currentPqEventId = null;

function openEventPaymentQueue(eventId, eventTitle) {
    currentPqEventId = eventId;
    // Update modal title
    var modalTitle = document.querySelector('#paymentQueueModal .modal-title');
    modalTitle.innerHTML = '<i class="bi bi-hourglass-split me-2"></i>Payment Queue — ' + (eventTitle || 'Event');
    loadPaymentQueue(eventId);
    var modal = new bootstrap.Modal(document.getElementById('paymentQueueModal'));
    modal.show();
}

async function loadPaymentQueue(eventId) {
    try {
        var url = API + '/admin/payment-queue';
        if (eventId) url += '?eventId=' + encodeURIComponent(eventId);
        var res = await fetch(url, { headers: authHeaders(), cache: 'no-store' });
        if (!res.ok) return;
        var queue = await res.json();

        var container = document.getElementById('paymentQueueContent');
        if (queue.length === 0) {
            container.innerHTML = '<div class="text-center text-muted py-5">' +
                '<i class="bi bi-inbox" style="font-size:2.5rem;opacity:.3;"></i>' +
                '<p class="mt-2 mb-0">No payments awaiting approval for this event.</p></div>';
            return;
        }

        var html = '<div class="table-responsive"><table class="table table-hover mb-0 pq-table">' +
            '<thead><tr>' +
            '<th>Student</th><th>Reg No</th><th>Email</th><th>Branch</th><th>Section</th>' +
            '<th>Transaction ID</th><th>Screenshot</th><th>Amount</th><th>Actions</th>' +
            '</tr></thead><tbody>';

        for (var i = 0; i < queue.length; i++) {
            var reg = queue[i];
            var u = reg.user || {};
            var txnId = reg.upiTxnId || reg.transactionId || '—';
            var amount = reg.amountPaid ? '₹' + reg.amountPaid : '—';
            var date = new Date(reg.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
            var screenshotHtml = reg.paymentScreenshot
                ? '<a href="' + reg.paymentScreenshot + '" target="_blank" title="View Screenshot">' +
                '<img src="' + reg.paymentScreenshot + '" style="width:50px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #e2e8f0;cursor:pointer;" alt="Screenshot">' +
                '</a>'
                : '<span class="text-muted">—</span>';

            html += '<tr>' +
                '<td><strong>' + (u.name || '—') + '</strong><br><small class="text-muted">' + date + '</small></td>' +
                '<td><code>' + (u.registrationNumber || '—') + '</code></td>' +
                '<td>' + (u.email || '—') + '</td>' +
                '<td>' + (u.branch || '—') + '</td>' +
                '<td>' + (u.section || '—') + '</td>' +
                '<td><code class="text-primary fw-bold">' + txnId + '</code></td>' +
                '<td>' + screenshotHtml + '</td>' +
                '<td>' + amount + '</td>' +
                '<td class="text-nowrap">' +
                '<button class="btn btn-sm btn-success me-1" data-action="approve-pay" data-id="' + reg._id + '">' +
                '<i class="bi bi-check-lg me-1"></i>Confirm</button>' +
                '<button class="btn btn-sm btn-outline-danger" data-action="reject-pay" data-id="' + reg._id + '">' +
                '<i class="bi bi-x-lg"></i></button>' +
                '</td></tr>';
        }

        html += '</tbody></table></div>';
        container.innerHTML = html;
    } catch (err) {
        console.error('Error loading payment queue:', err);
    }
}

async function approvePayment(regId) {
    if (!confirm('Confirm this payment? The student will receive a QR ticket.')) return;
    try {
        var res = await fetch(API + '/admin/approve-payment/' + regId, {
            method: 'POST',
            headers: authHeaders()
        });
        var data = await res.json();
        if (res.ok) {
            showToast('✅ ' + data.message, 'success');
            loadPaymentQueue(currentPqEventId);
        } else {
            showToast(data.message || 'Error approving payment.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

async function rejectPayment(regId) {
    if (!confirm('Reject this payment? The student will need to pay again.')) return;
    try {
        var res = await fetch(API + '/admin/reject-payment/' + regId, {
            method: 'POST',
            headers: authHeaders()
        });
        var data = await res.json();
        if (res.ok) {
            showToast('Payment rejected.', 'success');
            loadPaymentQueue(currentPqEventId);
        } else {
            showToast(data.message || 'Error rejecting payment.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

// ═══════════════════════════════════════════
// ── MY STUDENTS ──
// ═══════════════════════════════════════════
async function loadMyStudents() {
    try {
        var res = await fetch(API + '/admin/students', { headers: authHeaders(), cache: 'no-store' });
        if (!res.ok) {
            var errData = await res.json();
            showToast(errData.message || 'Error loading students.', 'error');
            return;
        }
        var students = await res.json();

        // Group by year
        var grouped = { 1: [], 2: [], 3: [], 4: [] };
        for (var i = 0; i < students.length; i++) {
            var yr = students[i].year || 1;
            if (!grouped[yr]) grouped[yr] = [];
            grouped[yr].push(students[i]);
        }

        for (var y = 1; y <= 4; y++) {
            renderStudentTable(grouped[y] || [], y);
        }
    } catch (err) {
        console.error('Error loading students:', err);
        showToast('Network error loading students.', 'error');
    }
}

function renderStudentTable(students, year) {
    var container = document.getElementById('studentsYear' + year);
    if (students.length === 0) {
        container.innerHTML = '<div class="text-center text-muted py-4">' +
            '<i class="bi bi-person-x" style="font-size:2rem;opacity:.3;"></i>' +
            '<p class="mt-2 mb-0">No students found for Year ' + year + '</p></div>';
        return;
    }

    var html = '<table class="table table-hover mb-0">' +
        '<thead><tr>' +
        '<th>#</th><th>Name</th><th>Reg No</th><th>Phone</th><th>Year</th><th>Branch</th><th>Section</th><th>Coordinator</th>' +
        '</tr></thead><tbody>';

    for (var i = 0; i < students.length; i++) {
        var s = students[i];
        var coordBadge = s.isCoordinator
            ? '<span class="badge bg-success"><i class="bi bi-star-fill me-1"></i>Coordinator</span>'
            : '<span class="badge bg-secondary">Student</span>';
        var coordBtn = s.isCoordinator
            ? '<button class="btn btn-sm btn-outline-danger" data-action="toggle-coordinator" data-id="' + s._id + '">' +
            '<i class="bi bi-x-circle me-1"></i>Remove</button>'
            : '<button class="btn btn-sm btn-outline-success" data-action="toggle-coordinator" data-id="' + s._id + '">' +
            '<i class="bi bi-star me-1"></i>Appoint</button>';

        html += '<tr>' +
            '<td>' + (i + 1) + '</td>' +
            '<td><strong>' + (s.name || '—') + '</strong></td>' +
            '<td><code>' + (s.registrationNumber || '—') + '</code></td>' +
            '<td>' + (s.phone || '—') + '</td>' +
            '<td>' + (s.year || '—') + '</td>' +
            '<td>' + (s.branch || '—') + '</td>' +
            '<td>' + (s.section || '—') + '</td>' +
            '<td>' + coordBadge + ' ' + coordBtn + '</td>' +
            '</tr>';
    }

    html += '</tbody></table>';
    container.innerHTML = html;
}

async function toggleCoordinator(studentId) {
    try {
        var res = await fetch(API + '/admin/toggle-coordinator/' + studentId, {
            method: 'POST',
            headers: authHeaders()
        });
        var data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            loadMyStudents();
        } else {
            showToast(data.message || 'Error toggling coordinator.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

// ═══════════════════════════════════════════
// ── EVENT COORDINATORS ──
// ═══════════════════════════════════════════
var currentCoordEventId = null;

function openCoordinatorModal(eventId, eventTitle) {
    currentCoordEventId = eventId;
    document.getElementById('coordinatorModalTitle').innerHTML =
        '<i class="bi bi-person-badge me-2"></i>Coordinators — ' + (eventTitle || 'Event');
    loadCoordinatorModal(eventId);
    var modal = new bootstrap.Modal(document.getElementById('coordinatorModal'));
    modal.show();
}

async function loadCoordinatorModal(eventId) {
    try {
        // Load current coordinators
        var coordRes = await fetch(API + '/admin/event-coordinators/' + eventId, { headers: authHeaders() });
        var coordinators = coordRes.ok ? await coordRes.json() : [];

        // Load all branch students
        var studRes = await fetch(API + '/admin/students', { headers: authHeaders(), cache: 'no-store' });
        var students = studRes.ok ? await studRes.json() : [];

        // Build set of coordinator IDs for quick lookup
        var coordIds = new Set();
        for (var c = 0; c < coordinators.length; c++) {
            coordIds.add(coordinators[c]._id);
        }

        // Render current coordinators
        var coordContainer = document.getElementById('currentCoordinators');
        if (coordinators.length === 0) {
            coordContainer.innerHTML = '<p class="text-muted small text-center py-2">No coordinators assigned yet.</p>';
        } else {
            var coordHtml = '<div class="d-flex flex-wrap gap-2">';
            for (var i = 0; i < coordinators.length; i++) {
                var co = coordinators[i];
                coordHtml += '<div class="d-inline-flex align-items-center gap-2 px-3 py-2 rounded-pill" ' +
                    'style="background:linear-gradient(135deg,#dcfce7,#bbf7d0);border:1px solid #86efac;">' +
                    '<i class="bi bi-star-fill text-success"></i>' +
                    '<strong>' + (co.name || '—') + '</strong>' +
                    '<small class="text-muted">(' + (co.registrationNumber || '—') + ')</small>' +
                    '<button class="btn btn-sm btn-outline-danger rounded-circle p-0" ' +
                    'style="width:24px;height:24px;line-height:1;" ' +
                    'onclick="removeEventCoordinator(\'' + eventId + '\', \'' + co._id + '\')" title="Remove">' +
                    '<i class="bi bi-x"></i></button>' +
                    '</div>';
            }
            coordHtml += '</div>';
            coordContainer.innerHTML = coordHtml;
        }

        // Render available students (exclude already-assigned coordinators)
        var availContainer = document.getElementById('availableStudentsForCoord');
        var availStudents = students.filter(function (s) { return !coordIds.has(s._id); });

        if (availStudents.length === 0) {
            availContainer.innerHTML = '<p class="text-muted small text-center py-2">No more students available from your branch.</p>';
        } else {
            var tHtml = '<table class="table table-hover mb-0">' +
                '<thead><tr>' +
                '<th>#</th><th>Name</th><th>Reg No</th><th>Year</th><th>Section</th><th>Action</th>' +
                '</tr></thead><tbody>';

            for (var j = 0; j < availStudents.length; j++) {
                var s = availStudents[j];
                tHtml += '<tr>' +
                    '<td>' + (j + 1) + '</td>' +
                    '<td><strong>' + (s.name || '—') + '</strong></td>' +
                    '<td><code>' + (s.registrationNumber || '—') + '</code></td>' +
                    '<td>' + (s.year || '—') + '</td>' +
                    '<td>' + (s.section || '—') + '</td>' +
                    '<td><button class="btn btn-sm btn-success" ' +
                    'onclick="assignEventCoordinator(\'' + eventId + '\', \'' + s._id + '\')">' +
                    '<i class="bi bi-plus-lg me-1"></i>Assign</button></td>' +
                    '</tr>';
            }
            tHtml += '</tbody></table>';
            availContainer.innerHTML = tHtml;
        }
    } catch (err) {
        console.error('Error loading coordinator modal:', err);
        showToast('Error loading coordinator data.', 'error');
    }
}

async function assignEventCoordinator(eventId, studentId) {
    try {
        var res = await fetch(API + '/admin/event-coordinator/' + eventId + '/' + studentId, {
            method: 'POST',
            headers: authHeaders()
        });
        var data = await res.json();
        if (res.ok) {
            showToast('✅ ' + data.message, 'success');
            loadCoordinatorModal(eventId);
        } else {
            showToast(data.message || 'Error assigning coordinator.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

async function removeEventCoordinator(eventId, studentId) {
    if (!confirm('Remove this coordinator?')) return;
    try {
        var res = await fetch(API + '/admin/event-coordinator/' + eventId + '/' + studentId, {
            method: 'DELETE',
            headers: authHeaders()
        });
        var data = await res.json();
        if (res.ok) {
            showToast(data.message, 'success');
            loadCoordinatorModal(eventId);
        } else {
            showToast(data.message || 'Error removing coordinator.', 'error');
        }
    } catch (err) {
        showToast('Network error.', 'error');
    }
}

// Coordinator modal delegation
document.getElementById('coordinatorModal').addEventListener('click', function (e) {
    var assignBtn = e.target.closest('[data-action="assign-coord"]');
    var removeBtn = e.target.closest('[data-action="remove-coord"]');
    if (assignBtn) {
        assignEventCoordinator(currentCoordEventId, assignBtn.getAttribute('data-id'));
    }
    if (removeBtn) {
        removeEventCoordinator(currentCoordEventId, removeBtn.getAttribute('data-id'));
    }
});

// ═══════════════════════════════════════════
// ── TOAST ──
// ═══════════════════════════════════════════
function showToast(message, type) {
    type = type || 'success';
    var id = Date.now();
    var html = '<div id="toast-' + id + '" class="toast align-items-center text-white bg-' +
        (type === 'success' ? 'success' : 'danger') + ' border-0" role="alert">' +
        '<div class="d-flex"><div class="toast-body">' + message + '</div>' +
        '<button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>' +
        '</div></div>';

    document.getElementById('toastContainer').insertAdjacentHTML('beforeend', html);
    var toastElem = document.getElementById('toast-' + id);
    var toast = new bootstrap.Toast(toastElem, { delay: 3000 });
    toast.show();
    toastElem.addEventListener('hidden.bs.toast', function () { toastElem.remove(); });
}
