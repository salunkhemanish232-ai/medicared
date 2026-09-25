if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
if (!document.querySelector('link[rel="manifest"]')) {
    const manifestLink = document.createElement('link');
    manifestLink.rel = 'manifest';
    manifestLink.href = '/manifest.json';
    document.head.appendChild(manifestLink);
}

document.addEventListener('DOMContentLoaded', () => {
    let session = null;
    try {
        session = JSON.parse(localStorage.getItem('medicareCurrentUser') || 'null');
    } catch (error) {
        localStorage.removeItem('medicareCurrentUser');
        localStorage.removeItem('medicareUserRole');
    }
    const api = async (path, options = {}) => {
        let response;
        try {
            const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
            const adminToken = localStorage.getItem('medicareAdminToken');
            if (adminToken) headers.Authorization = 'Bearer ' + adminToken;
            response = await fetch(path, { ...options, credentials: 'same-origin', headers });
        } catch (error) {
            throw new Error('Cannot reach the Medicare server. Please check your connection and try again.');
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Request failed.');
        return data;
    };
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>'"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[character]));
    const showError = (selector, message) => {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = message;
            element.style.display = 'block';
            element.classList.remove('is-success');
        }
    };
    const showSuccess = (selector, message) => {
        const element = document.querySelector(selector);
        if (element) {
            element.textContent = message;
            element.style.display = 'flex';
            element.classList.add('is-success');
        }
    };
    const clearMessage = (selector) => {
        const element = document.querySelector(selector);
        if (element) { element.textContent = ''; element.style.display = 'none'; }
    };
    const clearSessionCookie = (name) => {
        document.cookie = `${name}=; Max-Age=0; Path=/; SameSite=Lax${location.protocol === 'https:' ? '; Secure' : ''}`;
    };
    const applyTheme = (theme) => {
        const resolvedTheme = theme === 'dark' ? 'dark' : 'light';
        document.documentElement.setAttribute('data-theme', resolvedTheme);
        document.body.classList.toggle('theme-dark', resolvedTheme === 'dark');
        const themeToggle = document.querySelector('[data-theme-toggle]');
        if (themeToggle) {
            themeToggle.setAttribute('aria-pressed', String(resolvedTheme === 'dark'));
            themeToggle.innerHTML = resolvedTheme === 'dark'
                ? '<i class="fa-solid fa-sun"></i><span>Light</span>'
                : '<i class="fa-solid fa-moon"></i><span>Dark</span>';
        }
        localStorage.setItem('medicareTheme', resolvedTheme);
    };
    const ensureThemeToggle = () => {
        const navMenu = document.querySelector('#nav-menu');
        if (!navMenu || navMenu.querySelector('[data-theme-toggle]')) return;
        const item = document.createElement('li');
        item.innerHTML = '<button type="button" class="theme-toggle" data-theme-toggle aria-label="Toggle color theme"><i class="fa-solid fa-moon"></i><span>Dark</span></button>';
        navMenu.appendChild(item);
        item.querySelector('[data-theme-toggle]').addEventListener('click', () => {
            const nextTheme = document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark';
            applyTheme(nextTheme);
        });
    };
    const ensureBreadcrumbs = () => {
        if (document.querySelector('.breadcrumbs')) return;
        const pageTitle = document.title.replace('Medicare - ', '').trim();
        const breadcrumbs = document.createElement('nav');
        breadcrumbs.className = 'breadcrumbs';
        breadcrumbs.setAttribute('aria-label', 'Breadcrumb');
        const homeCrumb = '<a href="index.html"><i class="fa-solid fa-house"></i> Home</a>';
        const currentCrumb = `<span aria-current="page">${escapeHtml(pageTitle || 'Care Portal')}</span>`;
        breadcrumbs.innerHTML = `${homeCrumb} <span class="breadcrumb-separator">/</span> ${currentCrumb}`;
        const siteMain = document.querySelector('main') || document.querySelector('.main-content') || document.body.firstElementChild;
        if (siteMain) {
            siteMain.insertBefore(breadcrumbs, siteMain.firstChild);
        } else {
            document.body.insertBefore(breadcrumbs, document.body.firstChild);
        }
    };
    const showToast = (message, type = 'success') => {
        const toast = document.createElement('div');
        toast.className = `site-toast site-toast--${type}`;
        toast.setAttribute('role', 'status');
        toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-circle-check' : 'fa-circle-exclamation'}"></i><span>${escapeHtml(message)}</span>`;
        document.body.appendChild(toast);
        window.setTimeout(() => toast.classList.add('is-visible'), 20);
        window.setTimeout(() => { toast.classList.remove('is-visible'); window.setTimeout(() => toast.remove(), 250); }, 3200);
    };
    const showConfirmDialog = ({ title, message, confirmText = 'Continue', confirmClass = 'btn-danger' }) => new Promise((resolve) => {
        const existing = document.querySelector('.confirm-dialog');
        if (existing) existing.remove();
        const dialog = document.createElement('div');
        dialog.className = 'confirm-dialog';
        dialog.innerHTML = `
            <div class="confirm-dialog-backdrop" aria-hidden="true"></div>
            <div class="confirm-dialog-card" role="dialog" aria-modal="true" aria-labelledby="confirmDialogTitle">
                <div class="confirm-dialog-header">
                    <h2 id="confirmDialogTitle">${escapeHtml(title)}</h2>
                    <button type="button" class="confirm-dialog-close" aria-label="Close confirmation dialog">×</button>
                </div>
                <p>${escapeHtml(message)}</p>
                <div class="confirm-dialog-actions">
                    <button type="button" class="btn btn-outline confirm-dialog-cancel">Cancel</button>
                    <button type="button" class="btn ${confirmClass} confirm-dialog-confirm">${escapeHtml(confirmText)}</button>
                </div>
            </div>
        `;
        document.body.appendChild(dialog);
        const closeDialog = () => { dialog.remove(); resolve(false); };
        dialog.querySelector('.confirm-dialog-close').addEventListener('click', closeDialog);
        dialog.querySelector('.confirm-dialog-cancel').addEventListener('click', closeDialog);
        dialog.querySelector('.confirm-dialog-confirm').addEventListener('click', () => {
            dialog.remove();
            resolve(true);
        });
        document.addEventListener('keydown', (event) => {
            if (event.key === 'Escape' && document.body.contains(dialog)) {
                dialog.remove();
                resolve(false);
            }
        }, { once: true });
    });
    const setLoading = (button, loading, label) => {
        if (!button) return;
        button.disabled = loading;
        button.classList.toggle('is-loading', loading);
        if (loading) {
            button.dataset.originalLabel = button.innerHTML;
            button.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Please wait...';
        } else if (button.dataset.originalLabel) {
            button.innerHTML = button.dataset.originalLabel;
        } else if (label) {
            button.innerHTML = label;
        }
    };
    const validateRegistration = (form) => {
        const values = Object.fromEntries(new FormData(form).entries());
        const errors = {};
        if (String(values.name).trim().length < 2) errors.name = 'Please enter your full name.';
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(values.email).trim())) errors.email = 'Please enter a valid email address.';
        if (!/^\d{10}$/.test(String(values.phone).trim())) errors.phone = 'Enter exactly 10 digits, for example 9876543210.';
        const age = Number(values.age);
        if (!Number.isInteger(age) || age < 1 || age > 120) errors.age = 'Age must be between 1 and 120.';
        if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(String(values.password))) errors.password = 'Use 8+ characters with an uppercase letter, number, and symbol.';
        if (values.password !== values.confirmPassword) errors.confirmPassword = 'Passwords do not match.';
        form.querySelectorAll('small[id$="Error"]').forEach((element) => {
            const key = element.id === 'confirmError' ? 'confirmPassword' : element.id.replace('Error', '');
            const input = form.querySelector(`[name="${key}"]`);
            element.textContent = errors[key] || '';
            element.classList.toggle('field-error', Boolean(errors[key]));
            input?.classList.toggle('field-invalid', Boolean(errors[key]));
        });
        return { values, errors };
    };
    const isAdminDashboard = document.querySelector('.admin-dashboard');
    const isPatientRegistry = document.querySelector('#patients-table-body');
    if ((document.querySelector('.dashboard-container') || isPatientRegistry) && !session) {
        if (isAdminDashboard) {
            window.location.href = 'admin-login.html';
        } else if (isPatientRegistry) {
            window.location.href = 'admin-login.html';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    if ((isAdminDashboard || isPatientRegistry) && session && session.role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
    }

    ensureThemeToggle();
    ensureBreadcrumbs();
    const menuToggle = document.querySelector('#menu-toggle');
    const navMenu = document.querySelector('#nav-menu');
    if (menuToggle && navMenu) {
        menuToggle.setAttribute('aria-controls', 'nav-menu');
        menuToggle.setAttribute('aria-expanded', 'false');
        const setMenuState = (isOpen) => {
            navMenu.classList.toggle('is-open', isOpen);
            menuToggle.setAttribute('aria-expanded', String(isOpen));
        };
        menuToggle.addEventListener('click', () => setMenuState(!navMenu.classList.contains('is-open')));
        navMenu.querySelectorAll('a').forEach((link) => link.addEventListener('click', () => setMenuState(false)));
        window.addEventListener('resize', () => {
            if (window.innerWidth > 900) setMenuState(false);
        });
    }
    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && navMenu) {
            navMenu.classList.remove('is-open');
            menuToggle?.setAttribute('aria-expanded', 'false');
        }
    });
    const savedTheme = localStorage.getItem('medicareTheme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    applyTheme(savedTheme);

    document.querySelectorAll('.nav-link').forEach((link) => {
        const href = link.getAttribute('href');
        const isActive = href && window.location.pathname.endsWith(href);
        if (isActive) link.classList.add('active');
    });

    if (session) {
        document.querySelector('#nav-logout-item')?.style.setProperty('display', '');
        document.querySelector('#nav-login-link')?.style.setProperty('display', 'none');
        document.querySelector('#nav-register-link')?.style.setProperty('display', 'none');
    }
    document.querySelector('#nav-logout-link')?.addEventListener('click', (event) => {
        event.preventDefault();
        clearSessionCookie('medicare_session');
        clearSessionCookie('medicare_admin_session');
        localStorage.removeItem('medicareCurrentUser');
        localStorage.removeItem('medicareUserRole');
        localStorage.removeItem('medicareAdminToken');
        window.location.href = 'index.html';
    });

    document.querySelectorAll('[data-toggle-password]').forEach((toggle) => {
        toggle.addEventListener('click', () => {
            const input = document.querySelector(toggle.dataset.togglePassword);
            if (!input) return;
            const isVisible = input.type === 'text';
            input.type = isVisible ? 'password' : 'text';
            toggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
            toggle.innerHTML = `<i class="fa-solid fa-eye${isVisible ? '' : '-slash'}"></i>`;
        });
    });

    const registerForm = document.querySelector('#registerForm');
    if (registerForm) registerForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const form = new FormData(registerForm);
        clearMessage('#formError');
        clearMessage('#registerSuccess');
        const validation = validateRegistration(registerForm);
        if (Object.keys(validation.errors).length) {
            return showError('#formError', 'Please correct the highlighted fields and try again.');
        }
        const button = document.querySelector('#registerBtn');
        setLoading(button, true);
        try {
            const result = await api('/api/auth/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), phone: form.get('phone'), age: form.get('age'), dateOfBirth: form.get('dateOfBirth'), gender: form.get('gender'), address: form.get('address'), emergencyContact: form.get('emergencyContact'), password: form.get('password'), role: 'patient' }) });
            localStorage.setItem('medicareCurrentUser', JSON.stringify(result.user));
            showSuccess('#registerSuccess', 'Registration successful. Your account is secure and ready.');
            const completion = document.querySelector('#registrationComplete');
            const createdAt = document.querySelector('#registrationCreatedAt');
            if (createdAt && result.user.createdAt) {
                createdAt.textContent = `Created on ${new Date(result.user.createdAt).toLocaleString()}`;
            }
            completion?.classList.add('is-visible');
            completion?.setAttribute('aria-hidden', 'false');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 2000);
        } catch (error) {
            showError('#formError', error.message || 'Registration failed. Please try again.');
            setLoading(button, false);
        }

    });

    const loginForm = document.querySelector('#loginForm');
    if (loginForm) loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage('#loginError');
        clearMessage('#loginSuccess');
        const emailInput = document.querySelector('#loginEmail');
        const passwordInput = document.querySelector('#loginPassword');
        const rememberMe = document.querySelector('#rememberMe');
        if (!emailInput.value.trim() || !emailInput.validity.valid || !passwordInput.value) {
            return showError('#loginError', 'Enter a valid email address and your password.');
        }
        const button = loginForm.querySelector('button[type="submit"]');
        setLoading(button, true);
        try {
            const result = await api('/api/auth/login', { method: 'POST', body: JSON.stringify({ email: emailInput.value, password: passwordInput.value }) });
            if (rememberMe && rememberMe.checked) {
                localStorage.setItem('medicareRememberedEmail', emailInput.value.trim());
            } else {
                localStorage.removeItem('medicareRememberedEmail');
            }
            localStorage.setItem('medicareCurrentUser', JSON.stringify(result.user));
            showSuccess('#loginSuccess', 'Login successful. Welcome back. Redirecting to your dashboard...');
            const destination = result.user?.role === 'doctor'
                ? 'doctor-dashboard.html'
                : result.user?.role === 'staff'
                    ? 'staff-dashboard.html'
                    : 'dashboard.html';
            setTimeout(() => { window.location.href = destination; }, 900);
        } catch (error) {
            showError('#loginError', error.message || 'Login failed. Check your details and try again.');
            setLoading(button, false);
        }
    });

    const rememberedEmail = localStorage.getItem('medicareRememberedEmail');
    if (rememberedEmail) {
        const emailInput = document.querySelector('#loginEmail');
        if (emailInput) emailInput.value = rememberedEmail;
        const rememberMe = document.querySelector('#rememberMe');
        if (rememberMe) rememberMe.checked = true;
    }

    const adminLoginForm = document.querySelector('#adminLoginForm');
    if (adminLoginForm) adminLoginForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        clearMessage('#adminLoginError');
        clearMessage('#adminLoginSuccess');
        const email = document.querySelector('#adminEmail');
        const password = document.querySelector('#adminPassword');
        if (!email.value.trim() || !email.validity.valid || !password.value) {
            return showError('#adminLoginError', 'Enter a valid admin email address and password.');
        }
        const button = adminLoginForm.querySelector('button[type="submit"]');
        setLoading(button, true);
        try {
            const result = await api('/api/admin/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
            localStorage.setItem('medicareCurrentUser', JSON.stringify(result.user));
            localStorage.setItem('medicareUserRole', 'admin');
            localStorage.setItem('medicareAdminToken', result.token);
            showSuccess('#adminLoginSuccess', 'Admin login successful. Redirecting to the staff dashboard...');
            setTimeout(() => { window.location.href = 'admin-dashboard.html'; }, 900);
        } catch (error) {
            showError('#adminLoginError', error.message || 'Admin login failed. Check your details and try again.');
            setLoading(button, false);
        }
    });

    const forgotPasswordForm = document.querySelector('#forgotPasswordForm');
    if (forgotPasswordForm) forgotPasswordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const email = document.querySelector('#forgotEmail').value.trim();
        const success = document.querySelector('#forgotPasswordSuccess');
        const error = document.querySelector('#forgotPasswordError');
        if (!email) return showError('#forgotPasswordError', 'Enter your email address.');
        try {
            const result = await api('/api/auth/forgot-password', { method: 'POST', body: JSON.stringify({ email }) });
            success.textContent = result.message || 'If your account exists, a reset link has been generated.';
            success.style.display = 'block';
            error.style.display = 'none';
        } catch (err) {
            showError('#forgotPasswordError', err.message || 'Unable to process the request.');
        }
    });

    const resetPasswordForm = document.querySelector('#resetPasswordForm');
    if (resetPasswordForm) resetPasswordForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        const password = document.querySelector('#resetPassword').value;
        const confirmPassword = document.querySelector('#resetConfirmPassword').value;
        const success = document.querySelector('#resetPasswordSuccess');
        const error = document.querySelector('#resetPasswordError');
        if (!token) return showError('#resetPasswordError', 'Reset token is missing.');
        if (!password || password.length < 8 || password !== confirmPassword) return showError('#resetPasswordError', 'Use a strong password and confirm it correctly.');
        try {
            const result = await api('/api/auth/reset-password', { method: 'POST', body: JSON.stringify({ token, password }) });
            success.textContent = result.message || 'Password reset successful.';
            success.style.display = 'block';
            error.style.display = 'none';
            setTimeout(() => { window.location.href = 'login.html'; }, 1200);
        } catch (err) {
            showError('#resetPasswordError', err.message || 'Password reset failed.');
        }
    });

    const verifyEmailContainer = document.querySelector('#verifyEmailMessage');
    if (verifyEmailContainer) {
        const params = new URLSearchParams(window.location.search);
        const token = params.get('token');
        if (!token) {
            document.querySelector('#verifyEmailError').textContent = 'Verification token is missing.';
        } else {
            api('/api/auth/verify-email', { method: 'POST', body: JSON.stringify({ token }) })
                .then((result) => {
                    verifyEmailContainer.textContent = result.message || 'Email verified successfully.';
                    verifyEmailContainer.style.display = 'block';
                })
                .catch((err) => {
                    document.querySelector('#verifyEmailError').textContent = err.message || 'Verification failed.';
                });
        }
    }

    const profileForm = document.querySelector('#profileForm');
    if (profileForm) {
        const currentUser = JSON.parse(localStorage.getItem('medicareCurrentUser') || 'null');
        if (!currentUser) {
            window.location.href = 'login.html';
            return;
        }
        api('/api/auth/profile')
            .then(({ user }) => {
                document.querySelector('#profileName').value = user.name || '';
                document.querySelector('#profileEmail').value = user.email || '';
                document.querySelector('#profilePhone').value = user.phone || '';
                document.querySelector('#profileAge').value = user.age || '';
                document.querySelector('#profileDateOfBirth').value = user.dateOfBirth || '';
                document.querySelector('#profileGender').value = user.gender || '';
                document.querySelector('#profileAddress').value = user.address || '';
                document.querySelector('#profileEmergencyContact').value = user.emergencyContact || '';
            })
            .catch(() => {
                window.location.href = 'login.html';
            });

        profileForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                name: document.querySelector('#profileName').value,
                phone: document.querySelector('#profilePhone').value,
                age: document.querySelector('#profileAge').value,
                dateOfBirth: document.querySelector('#profileDateOfBirth').value,
                gender: document.querySelector('#profileGender').value,
                address: document.querySelector('#profileAddress').value,
                emergencyContact: document.querySelector('#profileEmergencyContact').value,
                role: document.querySelector('#profileRole').value,
                currentPassword: document.querySelector('#profileCurrentPassword').value,
                newPassword: document.querySelector('#profileNewPassword').value
            };
            try {
                const result = await api('/api/auth/profile', { method: 'PUT', body: JSON.stringify(payload) });
                localStorage.setItem('medicareCurrentUser', JSON.stringify(result.user));
                document.querySelector('#profileSuccess').textContent = result.message || 'Profile updated successfully.';
                document.querySelector('#profileSuccess').style.display = 'block';
                document.querySelector('#profileError').style.display = 'none';
            } catch (err) {
                showError('#profileError', err.message || 'Profile update failed.');
            }
        });
    }

    const contactForm = document.querySelector('#contact-form');
    if (contactForm) contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(contactForm).entries());
        try {
            await api('/api/messages', { method: 'POST', body: JSON.stringify(fields) });
            contactForm.reset(); const feedback = document.querySelector('#contact-feedback');
            if (feedback) { feedback.textContent = 'Message sent successfully.'; feedback.style.display = 'block'; }
        } catch (error) { showError('#contact-feedback', error.message); }
    });

    async function renderHomeStats() {
        const statDoctors = document.querySelector('#statDoctors');
        const statDepartments = document.querySelector('#statDepartments');
        const statPatients = document.querySelector('#statPatients');
        const statAppointments = document.querySelector('#statAppointments');
        if (!statDoctors && !statDepartments && !statPatients && !statAppointments) return;

        try {
            const [{ doctors }, { departments }, summary] = await Promise.all([
                api('/api/doctors'),
                api('/api/departments'),
                api('/api/dashboard/summary').catch(() => ({ totalAppointments: 0, totalUsers: 0 }))
            ]);

            if (statDoctors) statDoctors.textContent = `${Math.max(doctors.length, 5)}+`;
            if (statDepartments) statDepartments.textContent = String((departments || []).length || 5);
            if (statPatients) statPatients.textContent = `${Math.max(summary.totalUsers || 1000, 1000).toLocaleString()}+`;
            if (statAppointments) statAppointments.textContent = `${Math.max(summary.totalAppointments || 25000, 25000).toLocaleString()}+`;
        } catch (error) {
            if (statDoctors) statDoctors.textContent = '50+';
            if (statDepartments) statDepartments.textContent = '5';
            if (statPatients) statPatients.textContent = '10k+';
            if (statAppointments) statAppointments.textContent = '25k+';
        }
    }

    async function renderHomeDepartments() {
        const container = document.querySelector('#homeDepartmentList');
        if (!container) return;

        try {
            const { departments } = await api('/api/departments');
            const icons = ['fa-heart-pulse', 'fa-bone', 'fa-child', 'fa-flask-vial', 'fa-ear-deaf'];
            container.innerHTML = (departments || []).slice(0, 4).map((department, index) => `
                <article class="feature-card home-department-card">
                    <i class="fa-solid ${icons[index % icons.length]} flow-icon"></i>
                    <h3>${escapeHtml(department.name)}</h3>
                    <p class="subtitle">${escapeHtml(department.description || 'Specialist-led care designed around your needs.')}</p>
                    <a href="services.html" class="text-link">Explore department <i class="fa-solid fa-arrow-right"></i></a>
                </article>
            `).join('');
        } catch (error) {
            container.innerHTML = `
                <article class="feature-card home-department-card">
                    <i class="fa-solid fa-heart-pulse flow-icon"></i>
                    <h3>Cardiology</h3>
                    <p class="subtitle">Heart health, preventive care, and specialist guidance.</p>
                    <a href="services.html" class="text-link">Explore department <i class="fa-solid fa-arrow-right"></i></a>
                </article>
            `;
        }
    }

    async function renderPublicDoctors() {
        const container = document.querySelector('#publicDoctorsList');
        if (!container) return;

        try {
            const { doctors } = await api('/api/doctors');
            container.innerHTML = doctors.map((doctor) => `
                <article class="feature-card doctor-card" data-department="${doctor.department}" data-specialization="${doctor.specialty.toLowerCase()}" data-availability="${doctor.availability}">
                    <div class="doctor-portrait">
                        <img src="${doctor.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80'}" alt="${doctor.name}">
                    </div>
                    <div class="doctor-card-content">
                        <div class="doctor-card-topline">
                            <span class="tag tag--primary">${doctor.department}</span>
                            <span class="doctor-verified"><i class="fa-solid fa-circle-check"></i> Verified</span>
                        </div>
                        <h3>${doctor.name}</h3>
                        <div class="doctor-rating"><span>★★★★★</span> <strong>4.8</strong></div>
                        <p class="subtitle">${doctor.specialty}</p>
                        <div class="doctor-meta">
                            <span><i class="fa-regular fa-calendar"></i> ${doctor.availability}</span>
                            <strong>${doctor.fee}<small> / visit</small></strong>
                        </div>
                        <div class="doctor-card-actions"><a href="doctors-detail.html?id=${encodeURIComponent(doctor.id)}" class="btn btn-outline">View profile</a><a href="appointments.html" class="btn doctor-book-btn">Book appointment</a></div>
                    </div>
                </article>
            `).join('');

            const searchInput = document.querySelector('#doctorSearchInput');
            const resultCount = document.querySelector('#doctorResultCount');
            const specializationFilter = document.querySelector('#doctorSpecializationFilter');
            const availabilityFilter = document.querySelector('#doctorAvailabilityFilter');
            let selectedDepartment = 'all';
            const updateDoctorResults = () => {
                const searchTerm = (searchInput?.value || '').trim().toLowerCase();
                const selectedSpecialization = specializationFilter?.value || 'all';
                const selectedAvailability = availabilityFilter?.value || 'all';
                let visibleCount = 0;
                document.querySelectorAll('.doctor-card').forEach((card) => {
                    const matchesDepartment = selectedDepartment === 'all' || card.dataset.department === selectedDepartment;
                    const matchesSearch = !searchTerm || card.textContent.toLowerCase().includes(searchTerm);
                    const matchesSpecialization = selectedSpecialization === 'all' || card.dataset.specialization.includes(selectedSpecialization);
                    const matchesAvailability = selectedAvailability === 'all' || card.dataset.availability === selectedAvailability;
                    const visible = matchesDepartment && matchesSearch && matchesSpecialization && matchesAvailability;
                    card.style.display = visible ? '' : 'none';
                    if (visible) visibleCount += 1;
                });
                if (resultCount) resultCount.textContent = `${visibleCount} specialist${visibleCount === 1 ? '' : 's'} available`;
            };

            document.querySelectorAll('.filter-btn').forEach((button) => button.addEventListener('click', () => {
                document.querySelectorAll('.filter-btn').forEach((item) => item.classList.remove('active'));
                button.classList.add('active');
                selectedDepartment = button.dataset.department;
                updateDoctorResults();
            }));
            searchInput?.addEventListener('input', updateDoctorResults);
            specializationFilter?.addEventListener('change', updateDoctorResults);
            availabilityFilter?.addEventListener('change', updateDoctorResults);
            updateDoctorResults();
        } catch (error) {
            container.innerHTML = `<div class="form-error" style="display:block;">${error.message}</div>`;
        }
    }

    renderHomeStats();
    renderHomeDepartments();
    renderPublicDoctors();

    const patientReportsContent = document.querySelector('#patientReportsContent');
    if (patientReportsContent && session) {
        api('/api/patient/dashboard').then(({ dashboard }) => {
            const reports = dashboard.labReports || [];
            patientReportsContent.innerHTML = reports.length
                ? reports.map((report) => `<div class="info-row"><strong>${escapeHtml(report.testName)}</strong><span>${escapeHtml(report.date)} · ${escapeHtml(report.status)}</span></div>`).join('')
                : '<p class="subtitle">No diagnostic reports are available for this account yet.</p>';
        }).catch((error) => {
            patientReportsContent.innerHTML = `<p class="form-error" style="display:block;">${escapeHtml(error.message)}</p>`;
        });
    }

    const labOrderForm = document.querySelector('#labOrderForm');
    const labTestSelect = document.querySelector('#labTestSelect');
    const labOrderDate = document.querySelector('#labOrderDate');
    if (labOrderDate) labOrderDate.min = new Date().toISOString().split('T')[0];
    if (labTestSelect) {
        api('/api/lab-tests').then(({ tests }) => {
            labTestSelect.innerHTML = '<option value="">Choose a test...</option>';
            tests.forEach((test) => labTestSelect.add(new Option(`${test.name} · ${test.department} · ${test.fee}`, test.id)));
        }).catch((error) => { labTestSelect.innerHTML = '<option value="">Unable to load tests</option>'; showError('#labOrderError', error.message); });
    }
    if (labOrderForm) labOrderForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        if (!session) return window.location.href = 'login.html';
        const button = document.querySelector('#labOrderBtn');
        clearMessage('#labOrderError');
        clearMessage('#labOrderSuccess');
        setLoading(button, true);
        try {
            const result = await api('/api/patient/lab-orders', { method: 'POST', body: JSON.stringify({ testId: labTestSelect.value, date: labOrderDate.value }) });
            showSuccess('#labOrderSuccess', `Diagnostic request saved for ${result.report.date}.`);
            labOrderForm.reset();
            labOrderDate.min = new Date().toISOString().split('T')[0];
        } catch (error) {
            showError('#labOrderError', error.message);
        } finally {
            setLoading(button, false);
        }
    });

    const storeProducts = document.querySelector('#storeProducts');
    if (storeProducts) {
        const categorySelect = document.querySelector('#storeCategory');
        let products = [];
        const renderStore = () => {
            const category = categorySelect?.value || 'all';
            const visible = products.filter((product) => category === 'all' || product.category === category);
            storeProducts.innerHTML = visible.map((product) => `
                <article class="store-card"><div class="store-icon"><i class="fa-solid ${product.icon}"></i></div><span class="eyebrow">${product.category}</span><h3>${product.name}</h3><p>${product.description}</p><div class="store-card-footer"><strong>${product.price}</strong><button type="button" class="btn btn-small" data-open-chat><i class="fa-solid fa-message"></i> Ask about it</button></div></article>
            `).join('');
            document.querySelectorAll('[data-open-chat]').forEach((button) => button.addEventListener('click', () => document.querySelector('#chatModal')?.classList.add('is-visible')));
        };
        api('/api/store').then((result) => {
            products = result.products || [];
            [...new Set(products.map((product) => product.category))].forEach((category) => categorySelect?.insertAdjacentHTML('beforeend', `<option value="${category}">${category}</option>`));
            renderStore();
        }).catch((error) => { storeProducts.innerHTML = `<div class="form-error" style="display:block;">${error.message}</div>`; });
        categorySelect?.addEventListener('change', renderStore);
    }

    const languageSelect = document.querySelector('#languageSelect');
    const languageCopy = { en: { hero: 'Quality care for every patient, every day.', button: 'Book Appointment', store: 'Care Store' }, hi: { hero: 'हर मरीज के लिए हर दिन बेहतर देखभाल।', button: 'अपॉइंटमेंट बुक करें', store: 'केयर स्टोर' } };
    languageSelect?.addEventListener('change', () => {
        const copy = languageCopy[languageSelect.value] || languageCopy.en;
        const heroTitle = document.querySelector('.site-hero h1');
        const primaryButton = document.querySelector('.site-hero .hero-actions .btn');
        const storeLink = [...document.querySelectorAll('.nav-link')].find((link) => link.getAttribute('href') === 'store.html');
        if (heroTitle) heroTitle.textContent = copy.hero;
        if (primaryButton) primaryButton.innerHTML = `<i class="fa-solid fa-calendar-plus"></i> ${copy.button}`;
        if (storeLink) storeLink.textContent = copy.store;
    });

    const assistantSearchForm = document.querySelector('#assistantSearchForm');
    const assistantResults = document.querySelector('#assistantResults');
    if (assistantSearchForm && assistantResults) assistantSearchForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        assistantResults.innerHTML = '<p class="subtitle">Searching verified guidance...</p>';
        try {
            const query = document.querySelector('#assistantQuery').value.trim();
            const result = await api(`/api/navigation?q=${encodeURIComponent(query)}`);
            const items = [...result.services.map((item) => `<a class="info-row" href="${escapeHtml(item.link)}"><strong>${escapeHtml(item.name)}</strong><span>Open service</span></a>`), ...result.doctors.slice(0, 5).map((item) => `<a class="info-row" href="doctors.html"><strong>${escapeHtml(item.name)}</strong><span>${escapeHtml(item.department)}</span></a>`), ...result.faqs.slice(0, 3).map((item) => `<div class="info-row"><strong>${escapeHtml(item.question)}</strong><span>${escapeHtml(item.answer)}</span></div>`)];
            assistantResults.innerHTML = items.length ? items.join('') : '<p class="subtitle">No verified navigation result found. Contact the care team for help.</p>';
        } catch (error) { assistantResults.innerHTML = `<p class="form-error" style="display:block;">${escapeHtml(error.message)}</p>`; }
    });
    const assistantProviderStatus = document.querySelector('#assistantProviderStatus');
    if (assistantProviderStatus) api('/api/integrations/status').then((status) => { assistantProviderStatus.textContent = status.ai ? 'An external provider is configured. Medical safety boundaries still apply.' : 'No external AI provider is configured. Verified navigation search remains available.'; }).catch(() => { assistantProviderStatus.textContent = 'Provider status is unavailable; verified navigation search remains available.'; });

    const revealItems = document.querySelectorAll('.home-simple .website-section, .home-simple .simple-stats');
    if (revealItems.length && 'IntersectionObserver' in window) {
        const revealObserver = new IntersectionObserver((entries, observer) => {
            entries.forEach((entry) => {
                if (!entry.isIntersecting) return;
                entry.target.classList.add('is-revealed');
                observer.unobserve(entry.target);
            });
        }, { threshold: 0.12 });
        revealItems.forEach((item) => revealObserver.observe(item));
    } else {
        revealItems.forEach((item) => item.classList.add('is-revealed'));
    }

    function createCareOverlays() {
        if (document.querySelector('#medicare-care-tools')) return;
        const container = document.createElement('div');
        container.id = 'medicare-care-tools';
        container.innerHTML = `
            <div class="care-float-actions" aria-label="Medicare support tools">
                <button type="button" class="care-float-button care-float-button--chat" data-open-chat aria-label="Open Medicare chat"><i class="fa-solid fa-comments"></i><span>Chat</span></button>
                <button type="button" class="care-float-button care-float-button--video" data-open-video aria-label="Open video consultation"><i class="fa-solid fa-video"></i><span>Video visit</span></button>
            </div>
            <div class="care-modal" id="chatModal" role="dialog" aria-modal="true" aria-labelledby="chatTitle">
                <div class="care-modal-card chat-card"><button type="button" class="care-modal-close" data-close-care aria-label="Close chat"><i class="fa-solid fa-xmark"></i></button><div class="chat-heading"><span class="care-tool-icon"><i class="fa-solid fa-headset"></i></span><div><span class="eyebrow">Usually replies in minutes</span><h2 id="chatTitle">Medicare support</h2></div></div><div class="chat-messages" id="chatMessages"><div class="chat-bubble">Hi, I am Medicare support. How can I help today?</div></div><form class="chat-form" id="chatForm"><input id="chatInput" aria-label="Message" placeholder="Ask about appointments or services" required><button class="btn btn-small" type="submit" aria-label="Send message"><i class="fa-solid fa-paper-plane"></i></button></form></div>
            </div>
            <div class="care-modal" id="videoModal" role="dialog" aria-modal="true" aria-labelledby="videoTitle"><div class="care-modal-card video-card"><button type="button" class="care-modal-close" data-close-care aria-label="Close video consultation"><i class="fa-solid fa-xmark"></i></button><div class="video-stage"><i class="fa-solid fa-video"></i><span>Virtual care room</span></div><span class="eyebrow">Secure online consultation</span><h2 id="videoTitle">Meet your doctor online</h2><p>Choose an appointment first. When your visit is confirmed, the secure join button will appear here.</p><div class="video-checklist"><span><i class="fa-solid fa-circle-check"></i> Private connection</span><span><i class="fa-solid fa-circle-check"></i> Doctor-led consultation</span><span><i class="fa-solid fa-circle-check"></i> Visit notes in your portal</span></div><a class="btn" href="appointments.html"><i class="fa-solid fa-calendar-plus"></i> Book a video visit</a></div></div>`;
        document.body.appendChild(container);
        document.querySelectorAll('[data-open-chat]').forEach((button) => button.addEventListener('click', () => document.querySelector('#chatModal')?.classList.add('is-visible')));
        document.querySelectorAll('[data-open-video]').forEach((button) => button.addEventListener('click', () => document.querySelector('#videoModal')?.classList.add('is-visible')));
        document.querySelectorAll('[data-close-care]').forEach((button) => button.addEventListener('click', () => button.closest('.care-modal')?.classList.remove('is-visible')));
        document.querySelectorAll('.care-modal').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('is-visible'); }));
        const chatForm = document.querySelector('#chatForm');
        chatForm?.addEventListener('submit', (event) => {
            event.preventDefault();
            const input = document.querySelector('#chatInput');
            const messages = document.querySelector('#chatMessages');
            const text = input.value.trim();
            if (!text) return;
            const userMessage = document.createElement('div');
            userMessage.className = 'chat-bubble chat-bubble--user';
            userMessage.textContent = text;
            const reply = document.createElement('div');
            reply.className = 'chat-bubble';
            reply.textContent = 'Thanks. A Medicare coordinator will help with that shortly.';
            messages.append(userMessage, reply);
            input.value = '';
            messages.scrollTop = messages.scrollHeight;
        });
    }
    createCareOverlays();

    const bookingModal = document.querySelector('#bookingModal');
    const bookingForm = document.querySelector('#bookingForm');
    const doctorSelect = document.querySelector('#doctorSelect');
    const appointmentDate = document.querySelector('#appointmentDate');
    const departmentSelect = document.querySelector('#departmentSelect');
    const patientName = document.querySelector('#patientName');
    const patientEmail = document.querySelector('#patientEmail');
    const patientPhone = document.querySelector('#patientPhone');
    if (session) {
        if (patientName) patientName.value = session.name || '';
        if (patientEmail) patientEmail.value = session.email || '';
        if (patientPhone) patientPhone.value = session.phone || '';
    }
    if (appointmentDate) appointmentDate.min = new Date().toISOString().split('T')[0];
    if (doctorSelect) api('/api/doctors').then(({ doctors }) => doctors.forEach((doctor) => doctorSelect.add(new Option(`${doctor.name} - ${doctor.department}`, `${doctor.name} - ${doctor.department}`)))).catch((error) => showError('#bookingForm', error.message));
    document.querySelector('#openBookingBtn')?.addEventListener('click', () => {
        if (!session) return window.location.href = 'login.html'; bookingModal.style.setProperty('display', 'flex', 'important');
    });
    document.querySelector('#bookingModal #closeModalBtn')?.addEventListener('click', () => bookingModal.style.setProperty('display', 'none', 'important'));
    if (bookingForm) bookingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            const result = await api('/api/appointments', { method: 'POST', body: JSON.stringify({ doctor: doctorSelect.value, department: departmentSelect?.value || '', date: document.querySelector('#appointmentDate').value, time: document.querySelector('#appointmentTime').value, reason: document.querySelector('#reason').value, patient: session.email }) });
            bookingForm.reset(); bookingModal.style.setProperty('display', 'none', 'important'); renderAppointments();
            const bookingSuccess = document.querySelector('#bookingSuccess');
            const bookingSuccessText = document.querySelector('#bookingSuccessText');
            if (bookingSuccessText && result.appointment) bookingSuccessText.textContent = `Your ${result.appointment.date} visit request is saved. Our care team will confirm it shortly.`;
            const bookingAppointmentId = document.querySelector('#bookingAppointmentId');
            if (bookingAppointmentId) bookingAppointmentId.textContent = result.appointment?.id || 'Pending';
            bookingSuccess?.classList.add('is-visible');
            bookingSuccess?.setAttribute('aria-hidden', 'false');
        } catch (error) { showError('#bookingForm', error.message); }
    });

    async function renderAppointments() {
        const body = document.querySelector('#appointmentsBody');
        const searchInput = document.querySelector('#appointmentSearchInput');
        const statusFilter = document.querySelector('#appointmentStatusFilter');
        if (!body || !session) return;

        try {
            const { appointments } = await api(`/api/appointments?email=${encodeURIComponent(session.email)}`);
            const { doctors } = await api('/api/doctors');
            const feeMap = new Map(doctors.map((doctor) => [`${doctor.name} - ${doctor.department}`, doctor.fee]));
            const searchTerm = (searchInput?.value || '').trim().toLowerCase();
            const currentStatus = statusFilter?.value || 'all';

            const filteredAppointments = appointments.filter((item) => {
                const matchesStatus = currentStatus === 'all' || item.status === currentStatus;
                const searchableText = `${item.doctor} ${item.date} ${item.time} ${item.reason}`.toLowerCase();
                const matchesSearch = !searchTerm || searchableText.includes(searchTerm);
                return matchesStatus && matchesSearch;
            });

            document.querySelector('#totalSlots').textContent = filteredAppointments.length;
            document.querySelector('#pendingSlots').textContent = filteredAppointments.filter((item) => item.status === 'Pending').length;
            document.querySelector('#confirmedSlots').textContent = filteredAppointments.filter((item) => item.status === 'Confirmed').length;

            if (!filteredAppointments.length) {
                body.innerHTML = '<tr><td colspan="7" style="text-align:center; padding:30px; color:var(--muted);">No appointments match this filter.</td></tr>';
                return;
            }

            body.innerHTML = filteredAppointments.map((item) => `<tr><td>${escapeHtml(item.doctor)}</td><td>${escapeHtml(item.date)}</td><td>${escapeHtml(item.time)}</td><td>${escapeHtml(item.reason)}</td><td>${escapeHtml(item.status)}</td><td>${escapeHtml(feeMap.get(item.doctor) || 'Rs 0')}</td><td>${['Pending', 'Confirmed'].includes(item.status) ? `<button type="button" class="table-action-btn danger" data-cancel-appointment="${escapeHtml(item.id)}">Cancel</button><button type="button" class="table-action-btn" data-reschedule-appointment="${escapeHtml(item.id)}">Reschedule</button>` : '—'}</td></tr>`).join('');
            body.querySelectorAll('[data-cancel-appointment]').forEach((button) => button.addEventListener('click', async () => {
                if (!window.confirm('Cancel this appointment?')) return;
                try { await api(`/api/patient/appointments/${button.dataset.cancelAppointment}/cancel`, { method: 'POST' }); renderAppointments(); } catch (error) { showToast(error.message, 'error'); }
            }));
            body.querySelectorAll('[data-reschedule-appointment]').forEach((button) => button.addEventListener('click', async () => {
                const date = window.prompt('Enter a new date (YYYY-MM-DD):');
                const time = window.prompt('Enter a new time (HH:MM):');
                if (!date || !time) return;
                try { await api(`/api/patient/appointments/${button.dataset.rescheduleAppointment}/reschedule`, { method: 'PUT', body: JSON.stringify({ date, time }) }); renderAppointments(); } catch (error) { showToast(error.message, 'error'); }
            }));
        } catch (error) { body.innerHTML = `<tr><td colspan="7">${escapeHtml(error.message)}</td></tr>`; }
    }

    const appointmentSearchInput = document.querySelector('#appointmentSearchInput');
    const appointmentStatusFilter = document.querySelector('#appointmentStatusFilter');
    appointmentSearchInput?.addEventListener('input', renderAppointments);
    appointmentStatusFilter?.addEventListener('change', renderAppointments);
    renderAppointments();

    const patientModal = document.querySelector('#patientModal');
    const patientForm = document.querySelector('#patientForm');
    const patientTable = document.querySelector('#patients-table-body');
    const patientModalTitle = document.querySelector('#patientModalTitle');
    let editingPatientId = null;
    let patientList = [];

    async function renderPatients() {
        if (!patientTable) return;
        const { patients } = await api('/api/patients');
        patientList = patients;
        document.querySelector('#patientTotalCount').textContent = patients.length;
        patientTable.innerHTML = patients.map((patient) => `
            <tr>
                <td>${patient.id}</td>
                <td>${patient.name}</td>
                <td>${patient.age}</td>
                <td>${patient.gender}</td>
                <td>
                    <button class="table-action-btn" type="button" data-edit-patient="${patient.id}"><i class="fa-solid fa-pen"></i> Edit</button>
                    <button class="table-action-btn danger" type="button" data-delete-patient="${patient.id}"><i class="fa-solid fa-trash"></i> Delete</button>
                </td>
            </tr>
        `).join('');

        patientTable.querySelectorAll('[data-edit-patient]').forEach((button) => button.addEventListener('click', () => {
            const patient = patientList.find((item) => item.id === button.dataset.editPatient);
            if (!patient) return;
            editingPatientId = patient.id;
            patientModalTitle.textContent = 'Edit Patient';
            document.querySelector('#ptName').value = patient.name;
            document.querySelector('#ptAge').value = patient.age;
            document.querySelector('#ptGender').value = patient.gender;
            patientModal.style.setProperty('display', 'flex', 'important');
        }));

        patientTable.querySelectorAll('[data-delete-patient]').forEach((button) => button.addEventListener('click', async () => {
            if (!window.confirm('Delete this patient record? This action cannot be undone.')) return;
            try {
                await api(`/api/patients/${button.dataset.deletePatient}`, { method: 'DELETE' });
                showToast('Patient record deleted successfully.');
                renderPatients();
            } catch (error) { showToast(error.message, 'error'); }
        }));
    }

    document.querySelector('#openModalBtn')?.addEventListener('click', () => {
        editingPatientId = null;
        patientForm.reset();
        if (patientModalTitle) patientModalTitle.textContent = 'Add Patient';
        patientModal.style.setProperty('display', 'flex', 'important');
    });
    document.querySelector('#patientModal #closeModalBtn')?.addEventListener('click', () => patientModal.style.setProperty('display', 'none', 'important'));
    if (patientForm) patientForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const payload = {
            name: document.querySelector('#ptName').value,
            age: document.querySelector('#ptAge').value,
            gender: document.querySelector('#ptGender').value
        };

        if (!payload.name.trim() || !Number.isInteger(Number(payload.age)) || Number(payload.age) < 1 || !payload.gender) {
            return showToast('Complete the patient name, age, and gender.', 'error');
        }
        try {
            if (editingPatientId) {
                await api(`/api/patients/${editingPatientId}`, { method: 'PUT', body: JSON.stringify(payload) });
                showToast('Patient record updated successfully.');
            } else {
                await api('/api/patients', { method: 'POST', body: JSON.stringify(payload) });
                showToast('Patient record created successfully.');
            }
            patientForm.reset();
            patientModal.style.setProperty('display', 'none', 'important');
            editingPatientId = null;
            if (patientModalTitle) patientModalTitle.textContent = 'Add Patient';
            renderPatients();
        } catch (error) { showToast(error.message, 'error'); }
    });
    renderPatients().catch(() => {});

    const adminWelcome = document.querySelector('#adminWelcomeMessage');
    if (adminWelcome && session && session.role === 'admin') {
        adminWelcome.textContent = `Welcome back, ${session.name}.`;
    }

    const adminAppointmentsBody = document.querySelector('#adminAppointmentsBody');
    const adminPatientsBody = document.querySelector('#adminPatientsBody');
    const adminUsersBody = document.querySelector('#adminUsersBody');
    const adminMessagesList = document.querySelector('#adminMessagesList');
    const refreshMessagesBtn = document.querySelector('#refreshMessagesBtn');
    const refreshUsersBtn = document.querySelector('#refreshUsersBtn');
    const adminDoctorsBody = document.querySelector('#adminDoctorsBody');
    const adminLabReportsBody = document.querySelector('#adminLabReportsBody');
    const doctorModal = document.querySelector('#doctorModal');
    const doctorForm = document.querySelector('#doctorForm');
    const staffAccountForm = document.querySelector('#staffAccountForm');
    const doctorModalTitle = document.querySelector('#doctorModalTitle');
    const openDoctorModalBtn = document.querySelector('#openDoctorModalBtn');
    const closeDoctorModalBtn = document.querySelector('#closeDoctorModalBtn');
    let editingDoctorId = null;

    if (isAdminDashboard) {
        if (staffAccountForm) staffAccountForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            clearMessage('#staffAccountError');
            clearMessage('#staffAccountSuccess');
            const button = document.querySelector('#staffAccountBtn');
            const password = document.querySelector('#staffPassword').value;
            if (!/^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(password)) return showError('#staffAccountError', 'Use 8+ characters with an uppercase letter, number, and symbol.');
            setLoading(button, true);
            try {
                const result = await api('/api/admin/users', { method: 'POST', body: JSON.stringify({
                    name: document.querySelector('#staffName').value.trim(),
                    email: document.querySelector('#staffEmail').value.trim(),
                    phone: document.querySelector('#staffPhone').value.trim(),
                    age: document.querySelector('#staffAge').value,
                    role: document.querySelector('#staffRole').value,
                    password
                }) });
                staffAccountForm.reset();
                showSuccess('#staffAccountSuccess', `${result.user.role} login created successfully.`);
                renderAdminUsers();
            } catch (error) {
                showError('#staffAccountError', error.message || 'Unable to create staff login.');
            } finally {
                setLoading(button, false);
            }
        });
        async function renderAdminUsers() {
            if (!adminUsersBody) return;
            try {
                const { users } = await api('/api/users');
                if (!users.length) {
                    adminUsersBody.innerHTML = '<tr><td colspan="7">No registrations in the live database yet. Register a patient on the live website, then refresh.</td></tr>';
                    return;
                }
                adminUsersBody.innerHTML = users.map((user) => `
                    <tr>
                        <td>${user.name}</td>
                        <td>${user.email}</td>
                        <td>${user.phone}</td>
                        <td>${user.age}</td>
                        <td>${user.createdAt ? new Date(user.createdAt).toLocaleString() : 'Unknown'}</td>
                        <td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Not logged in'}</td>
                        <td><span class="activity-pill ${user.lastLoginAt ? 'is-active' : 'is-new'}"><i class="fa-solid fa-circle"></i> ${user.lastLoginAt ? 'Active' : 'New'}</span></td>
                    </tr>
                `).join('');
            } catch (error) {
                adminUsersBody.innerHTML = `<tr><td colspan="7">Unable to load registered users: ${error.message}</td></tr>`;
            }
        }

        async function renderAdminMessages() {
            if (!adminMessagesList) return;
            try {
                const { messages } = await api('/api/messages');
                if (!messages.length) {
                    adminMessagesList.innerHTML = '<div class="admin-message-empty">No contact messages yet.</div>';
                    return;
                }
                adminMessagesList.innerHTML = messages.slice().reverse().map((message) => `
                    <article class="admin-message-card">
                        <div class="admin-message-heading">
                            <div><strong>${escapeHtml(message.name)}</strong><a href="mailto:${encodeURIComponent(message.email)}">${escapeHtml(message.email)}</a></div>
                                <time>${escapeHtml(message.createdAt ? new Date(message.createdAt).toLocaleString() : 'Unknown time')}</time>
                        </div>
                            <p>${escapeHtml(message.message)}</p>
                    </article>
                `).join('');
            } catch (error) {
                adminMessagesList.innerHTML = `<div class="admin-message-empty">Unable to load messages: ${error.message}</div>`;
            }
        }

        refreshUsersBtn?.addEventListener('click', renderAdminUsers);
        refreshMessagesBtn?.addEventListener('click', renderAdminMessages);

        async function renderAdminDashboard() {
            try {
                const summary = await api('/api/admin/summary');
                document.querySelector('#adminTotalAppointments').textContent = summary.totalAppointments;
                document.querySelector('#adminPendingAppointments').textContent = summary.pendingAppointments;
                document.querySelector('#adminConfirmedAppointments').textContent = summary.confirmedAppointments;
                document.querySelector('#adminTotalPatients').textContent = summary.totalPatients;
                document.querySelector('#adminTotalUsers').textContent = summary.totalUsers;
                const liveStatus = document.querySelector('#adminLiveStatus');
                if (liveStatus) liveStatus.innerHTML = `<i class="fa-solid fa-circle-check"></i> Live data synced at ${new Date().toLocaleTimeString()}`;
                renderAdminUsers();
                renderAdminMessages();

                if (adminAppointmentsBody) {
                    const appointments = summary.upcoming || [];
                    if (!appointments.length) {
                        adminAppointmentsBody.innerHTML = '<tr><td colspan="6">No upcoming appointments.</td></tr>';
                    } else {
                        adminAppointmentsBody.innerHTML = appointments.map((item) => `
                            <tr>
                                <td>${item.doctor}</td>
                                <td>${item.patient || 'Unknown patient'}</td>
                                <td>${item.date}</td>
                                <td>${item.time}</td>
                                <td>${item.createdAt ? new Date(item.createdAt).toLocaleString() : 'Unknown'}</td>
                                <td>
                                    <select class="admin-status-select" data-appointment-id="${item.id}" aria-label="Update appointment status">
                                        <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Waiting for confirmation</option>
                                        <option value="Confirmed" ${item.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
                                        <option value="Completed" ${item.status === 'Completed' ? 'selected' : ''}>Completed</option>
                                        <option value="Cancelled" ${item.status === 'Cancelled' ? 'selected' : ''}>Cancelled</option>
                                    </select>
                                </td>
                            </tr>
                        `).join('');

                        adminAppointmentsBody.querySelectorAll('.admin-status-select').forEach((select) => {
                            select.addEventListener('change', async (event) => {
                                const appointmentId = event.target.dataset.appointmentId;
                                const status = event.target.value;
                                try {
                                    await api(`/api/appointments/${appointmentId}/status`, { method: 'PUT', body: JSON.stringify({ status }) });
                                    renderAdminDashboard();
                                } catch (error) {
                                    alert(error.message);
                                    renderAdminDashboard();
                                }
                            });
                        });
                    }
                }

                if (adminPatientsBody) {
                    const { patients } = await api('/api/patients');
                    if (!patients.length) {
                        adminPatientsBody.innerHTML = '<tr><td colspan="4">No patient records yet.</td></tr>';
                    } else {
                        adminPatientsBody.innerHTML = patients.map((patient) => `
                            <tr>
                                <td>${patient.id}</td>
                                <td>${patient.name}</td>
                                <td>${patient.age}</td>
                                <td>${patient.gender}</td>
                            </tr>
                        `).join('');
                    }
                }

                if (adminDoctorsBody) {
                    const { doctors } = await api('/api/doctors');
                    if (!doctors.length) {
                        adminDoctorsBody.innerHTML = '<tr><td colspan="7">No doctors added yet.</td></tr>';
                    } else {
                        adminDoctorsBody.innerHTML = doctors.map((doctor) => `
                            <tr>
                                <td>${doctor.id}</td>
                                <td>${doctor.name}</td>
                                <td>${doctor.department}</td>
                                <td>${doctor.availability}</td>
                                <td>${doctor.fee}</td>
                                <td>${doctor.specialty}</td>
                                <td>
                                    <button class="table-action-btn" type="button" data-edit-doctor="${doctor.id}"><i class="fa-solid fa-pen"></i></button>
                                    <button class="table-action-btn danger" type="button" data-delete-doctor="${doctor.id}"><i class="fa-solid fa-trash"></i></button>
                                </td>
                            </tr>
                        `).join('');

                        adminDoctorsBody.querySelectorAll('[data-edit-doctor]').forEach((button) => button.addEventListener('click', () => {
                            const doctorId = button.dataset.editDoctor;
                            const doctor = doctors.find((item) => item.id === doctorId);
                            if (!doctor) return;
                            editingDoctorId = doctorId;
                            if (doctorModalTitle) doctorModalTitle.textContent = 'Edit Doctor';
                            if (doctorForm) {
                                doctorForm.querySelector('#doctorName').value = doctor.name;
                                doctorForm.querySelector('#doctorDepartment').value = doctor.department;
                                doctorForm.querySelector('#doctorSpecialty').value = doctor.specialty;
                                doctorForm.querySelector('#doctorFee').value = doctor.fee;
                                doctorForm.querySelector('#doctorAvailability').value = doctor.availability;
                                doctorForm.querySelector('#doctorPhoto').value = doctor.photo || '';
                            }
                            if (doctorModal) doctorModal.style.setProperty('display', 'flex', 'important');
                        }));

                        adminDoctorsBody.querySelectorAll('[data-delete-doctor]').forEach((button) => button.addEventListener('click', async () => {
                            await api(`/api/doctors/${button.dataset.deleteDoctor}`, { method: 'DELETE' });
                            renderAdminDashboard();
                        }));
                    }
                }
                if (adminLabReportsBody) {
                    const { reports } = await api('/api/admin/lab-reports');
                    adminLabReportsBody.innerHTML = reports.length ? reports.map((report) => `<tr><td>${escapeHtml(report.patientEmail)}</td><td>${escapeHtml(report.testName)}</td><td>${escapeHtml(report.date)}</td><td><select class="admin-status-select" data-lab-report-id="${escapeHtml(report.id)}"><option ${report.status === 'Requested' ? 'selected' : ''}>Requested</option><option ${report.status === 'Scheduled' ? 'selected' : ''}>Scheduled</option><option ${report.status === 'Sample collected' ? 'selected' : ''}>Sample collected</option><option ${report.status === 'Processing' ? 'selected' : ''}>Processing</option><option ${report.status === 'Completed' ? 'selected' : ''}>Completed</option></select></td><td>${escapeHtml(report.fileName || 'Not uploaded')}</td></tr>`).join('') : '<tr><td colspan="5">No lab orders or reports yet.</td></tr>';
                    adminLabReportsBody.querySelectorAll('[data-lab-report-id]').forEach((select) => select.addEventListener('change', async () => {
                        try { await api(`/api/admin/lab-reports/${select.dataset.labReportId}/status`, { method: 'PUT', body: JSON.stringify({ status: select.value }) }); showToast('Lab report status updated.'); } catch (error) { showToast(error.message, 'error'); }
                    }));
                }
            } catch (error) {
                if (adminAppointmentsBody) adminAppointmentsBody.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`;
                if (adminPatientsBody) adminPatientsBody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
                if (adminDoctorsBody) adminDoctorsBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
                if (adminLabReportsBody) adminLabReportsBody.innerHTML = `<tr><td colspan="5">${escapeHtml(error.message)}</td></tr>`;
            }
        }

        window.setInterval(renderAdminUsers, 30000);
        window.setInterval(renderAdminMessages, 30000);

        if (openDoctorModalBtn) {
            openDoctorModalBtn.addEventListener('click', () => {
                editingDoctorId = null;
                doctorForm.reset();
                if (doctorModalTitle) doctorModalTitle.textContent = 'Add Doctor';
                if (doctorModal) doctorModal.style.setProperty('display', 'flex', 'important');
            });
        }

        if (closeDoctorModalBtn) {
            closeDoctorModalBtn.addEventListener('click', () => {
                if (doctorModal) doctorModal.style.setProperty('display', 'none', 'important');
            });
        }

        if (doctorForm) doctorForm.addEventListener('submit', async (event) => {
            event.preventDefault();
            const payload = {
                name: doctorForm.querySelector('#doctorName').value,
                department: doctorForm.querySelector('#doctorDepartment').value,
                specialty: doctorForm.querySelector('#doctorSpecialty').value,
                fee: doctorForm.querySelector('#doctorFee').value,
                availability: doctorForm.querySelector('#doctorAvailability').value,
                photo: doctorForm.querySelector('#doctorPhoto').value
            };

            try {
                const wasEditingDoctor = Boolean(editingDoctorId);
                if (editingDoctorId) {
                    await api(`/api/doctors/${editingDoctorId}`, { method: 'PUT', body: JSON.stringify(payload) });
                } else {
                    await api('/api/doctors', { method: 'POST', body: JSON.stringify(payload) });
                }
                doctorForm.reset();
                editingDoctorId = null;
                if (doctorModalTitle) doctorModalTitle.textContent = 'Add Doctor';
                if (doctorModal) doctorModal.style.setProperty('display', 'none', 'important');
                showToast(wasEditingDoctor ? 'Doctor profile updated successfully.' : 'Doctor profile created successfully.');
                renderAdminDashboard();
            } catch (error) {
                showToast(error.message, 'error');
            }
        });

        renderAdminDashboard();
        window.setInterval(() => {
            if (!document.hidden) renderAdminDashboard();
        }, 10000);
    }
});
