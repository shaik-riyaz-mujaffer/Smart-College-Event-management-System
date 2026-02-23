// ===== Auth JavaScript (Login & Register) =====

const API = window.location.origin + '/api';

// Show alert
function showAlert(box, message, type = 'danger') {
    box.innerHTML = `
    <div class="alert alert-${type} alert-dismissible fade show py-2 px-3" role="alert" style="font-size:.88rem;border-radius:10px;">
      <i class="bi bi-${type === 'danger' ? 'exclamation-triangle-fill' : 'check-circle-fill'} me-2"></i>
      ${message}
      <button type="button" class="btn-close btn-close-sm" data-bs-dismiss="alert" style="font-size:.7rem;padding:.7rem;"></button>
    </div>`;
}

// ── Role Toggle Logic ──
function initRoleToggle(toggleContainer, callback) {
    if (!toggleContainer) return;

    const buttons = toggleContainer.querySelectorAll('.role-btn');

    buttons.forEach(btn => {
        btn.addEventListener('click', () => {
            buttons.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            const role = btn.dataset.role;
            toggleContainer.dataset.active = role;
            if (callback) callback(role);
        });
    });
}

// ── Password Toggle ──
function initPasswordToggle() {
    const toggleBtn = document.getElementById('togglePassword');
    if (!toggleBtn) return;

    toggleBtn.addEventListener('click', () => {
        // Find the password input in the same wrapper
        const wrapper = toggleBtn.closest('.input-icon-wrapper');
        const input = wrapper.querySelector('input[type="password"], input[type="text"]');
        const icon = toggleBtn.querySelector('i');

        if (input.type === 'password') {
            input.type = 'text';
            icon.classList.replace('bi-eye', 'bi-eye-slash');
        } else {
            input.type = 'password';
            icon.classList.replace('bi-eye-slash', 'bi-eye');
        }
    });
}

// Redirect if already logged in
document.addEventListener('DOMContentLoaded', () => {
    const user = JSON.parse(localStorage.getItem('user'));
    if (user && user.token) {
        window.location.href = user.role === 'admin' ? 'admin.html' : 'student.html';
        return;
    }

    initPasswordToggle();

    // ═══════════════════════════════════════════
    // ── LOGIN PAGE ──
    // ═══════════════════════════════════════════
    const loginForm = document.getElementById('loginForm');
    if (loginForm) {
        const studentGroup = document.getElementById('studentIdentifierGroup');
        const adminGroup = document.getElementById('adminIdentifierGroup');
        let currentRole = 'student';

        initRoleToggle(document.getElementById('roleToggle'), (role) => {
            currentRole = role;
            if (role === 'admin') {
                studentGroup.classList.add('d-none');
                adminGroup.classList.remove('d-none');
                document.getElementById('identifier').removeAttribute('required');
                document.getElementById('adminIdentifier').setAttribute('required', '');
            } else {
                studentGroup.classList.remove('d-none');
                adminGroup.classList.add('d-none');
                document.getElementById('identifier').setAttribute('required', '');
                document.getElementById('adminIdentifier').removeAttribute('required');
            }
        });

        loginForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('alertBox');
            const spinner = document.getElementById('loginSpinner');
            const btn = document.getElementById('loginBtn');

            let identifier;
            if (currentRole === 'admin') {
                identifier = document.getElementById('adminIdentifier').value.trim();
            } else {
                identifier = document.getElementById('identifier').value.trim();
            }
            const password = document.getElementById('password').value;

            if (!identifier || !password) {
                showAlert(alertBox, 'Please fill in all fields.');
                return;
            }

            spinner.classList.remove('d-none');
            btn.disabled = true;

            try {
                const res = await fetch(`${API}/auth/login`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ identifier, password })
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Login failed');
                }

                // Verify role matches selection
                if (data.role !== currentRole) {
                    throw new Error(`This account is registered as ${data.role}. Please switch to the ${data.role} tab.`);
                }

                localStorage.setItem('user', JSON.stringify(data));
                window.location.href = data.role === 'admin' ? 'admin.html' : 'student.html';
            } catch (error) {
                showAlert(alertBox, error.message);
            } finally {
                spinner.classList.add('d-none');
                btn.disabled = false;
            }
        });
    }

    // ═══════════════════════════════════════════
    // ── REGISTER PAGE ──
    // ═══════════════════════════════════════════
    const registerForm = document.getElementById('registerForm');
    if (registerForm) {
        const studentFields = document.getElementById('studentFields');
        let currentRole = 'student';

        initRoleToggle(document.getElementById('roleToggle'), (role) => {
            currentRole = role;
            if (role === 'admin') {
                studentFields.style.display = 'none';
            } else {
                studentFields.style.display = 'block';
            }
        });

        registerForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const alertBox = document.getElementById('alertBox');
            const spinner = document.getElementById('registerSpinner');
            const btn = document.getElementById('registerBtn');

            const name = document.getElementById('name').value.trim();
            const email = document.getElementById('email').value.trim();
            const password = document.getElementById('password').value;

            if (!name || !email || !password) {
                showAlert(alertBox, 'Please fill in all required fields.');
                return;
            }

            // Build payload
            const payload = { name, email, password, role: currentRole };

            // Add student fields if student
            if (currentRole !== 'admin') {
                const registrationNumber = document.getElementById('registrationNumber').value.trim();
                const phone = document.getElementById('phone').value.trim();
                const branch = document.getElementById('branch').value;
                const year = document.getElementById('year').value;
                const section = document.getElementById('section').value;

                if (!registrationNumber || !phone || !branch || !year || !section) {
                    showAlert(alertBox, 'Please fill in all student details (Registration Number, Mobile, Branch, Year, Section).');
                    return;
                }

                if (!/^[0-9]{10}$/.test(phone)) {
                    showAlert(alertBox, 'Please enter a valid 10-digit mobile number.');
                    return;
                }

                payload.registrationNumber = registrationNumber;
                payload.phone = phone;
                payload.branch = branch;
                payload.year = year;
                payload.section = section;
            }

            spinner.classList.remove('d-none');
            btn.disabled = true;

            try {
                const res = await fetch(`${API}/auth/register`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(payload)
                });

                const data = await res.json();

                if (!res.ok) {
                    throw new Error(data.message || 'Registration failed');
                }

                // Show success overlay (do NOT auto-login)
                const overlay = document.getElementById('successOverlay');
                if (overlay) {
                    overlay.classList.remove('d-none');
                    // Redirect to login after 2 seconds
                    setTimeout(() => {
                        window.location.href = 'index.html';
                    }, 2000);
                } else {
                    // Fallback if no overlay element
                    alert('Account created successfully!');
                    window.location.href = 'index.html';
                }
            } catch (error) {
                showAlert(alertBox, error.message);
            } finally {
                spinner.classList.add('d-none');
                btn.disabled = false;
            }
        });
    }
});
