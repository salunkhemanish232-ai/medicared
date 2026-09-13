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
            response = await fetch(path, { headers: { 'Content-Type': 'application/json' }, ...options });
        } catch (error) {
            throw new Error('Cannot reach the Medicare server. Please check your connection and try again.');
        }
        const data = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(data.error || 'Request failed.');
        return data;
    };
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
        if (!/^[+()\d\s-]{7,20}$/.test(String(values.phone).trim())) errors.phone = 'Please enter a valid phone number.';
        const age = Number(values.age);
        if (!Number.isInteger(age) || age < 1 || age > 120) errors.age = 'Age must be between 1 and 120.';
        if (String(values.password).length < 6) errors.password = 'Use at least 6 characters.';
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
    if (document.querySelector('.dashboard-container') && !session) {
        if (isAdminDashboard) {
            window.location.href = 'admin-login.html';
        } else {
            window.location.href = 'login.html';
        }
        return;
    }

    if (isAdminDashboard && session && session.role !== 'admin') {
        window.location.href = 'dashboard.html';
        return;
    }

    const menuToggle = document.querySelector('#menu-toggle');
    const navMenu = document.querySelector('#nav-menu');
    if (menuToggle && navMenu) menuToggle.addEventListener('click', () => navMenu.classList.toggle('is-open'));

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
        localStorage.removeItem('medicareCurrentUser');
        localStorage.removeItem('medicareUserRole');
        window.location.href = 'index.html';
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
            const result = await api('/api/register', { method: 'POST', body: JSON.stringify({ name: form.get('name'), email: form.get('email'), phone: form.get('phone'), age: form.get('age'), password: form.get('password') }) });
            localStorage.setItem('medicareCurrentUser', JSON.stringify(result.user));
            showSuccess('#registerSuccess', 'Registration successful. Your account is ready. Redirecting to your dashboard...');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
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
        const email = document.querySelector('#loginEmail');
        const password = document.querySelector('#loginPassword');
        if (!email.value.trim() || !email.validity.valid || !password.value) {
            return showError('#loginError', 'Enter a valid email address and your password.');
        }
        const button = loginForm.querySelector('button[type="submit"]');
        setLoading(button, true);
        try {
            const result = await api('/api/login', { method: 'POST', body: JSON.stringify({ email: email.value, password: password.value }) });
            localStorage.setItem('medicareCurrentUser', JSON.stringify(result.user));
            showSuccess('#loginSuccess', 'Login successful. Welcome back. Redirecting to your dashboard...');
            setTimeout(() => { window.location.href = 'dashboard.html'; }, 900);
        } catch (error) {
            showError('#loginError', error.message || 'Login failed. Check your details and try again.');
            setLoading(button, false);
        }
    });

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
            showSuccess('#adminLoginSuccess', 'Admin login successful. Redirecting to the staff dashboard...');
            setTimeout(() => { window.location.href = 'admin-dashboard.html'; }, 900);
        } catch (error) {
            showError('#adminLoginError', error.message || 'Admin login failed. Check your details and try again.');
            setLoading(button, false);
        }
    });

    const contactForm = document.querySelector('#contact-form');
    if (contactForm) contactForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        const fields = contactForm.querySelectorAll('input, textarea');
        try {
            await api('/api/messages', { method: 'POST', body: JSON.stringify({ name: fields[0].value, email: fields[1].value, message: fields[2].value }) });
            contactForm.reset(); const feedback = document.querySelector('#contact-feedback');
            if (feedback) { feedback.textContent = 'Message sent successfully.'; feedback.style.display = 'block'; }
        } catch (error) { showError('#contact-feedback', error.message); }
    });

    async function renderPublicDoctors() {
        const container = document.querySelector('#publicDoctorsList');
        if (!container) return;

        try {
            const { doctors } = await api('/api/doctors');
            container.innerHTML = doctors.map((doctor) => `
                <article class="feature-card doctor-card" data-department="${doctor.department}">
                    <div class="doctor-portrait">
                        <img src="${doctor.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80'}" alt="${doctor.name}">
                    </div>
                    <div class="doctor-card-content">
                        <div class="doctor-card-topline">
                            <span class="tag tag--primary">${doctor.department}</span>
                            <span class="doctor-verified"><i class="fa-solid fa-circle-check"></i> Verified</span>
                        </div>
                        <h3>${doctor.name}</h3>
                        <p class="subtitle">${doctor.specialty}</p>
                        <div class="doctor-meta">
                            <span><i class="fa-regular fa-calendar"></i> ${doctor.availability}</span>
                            <strong>${doctor.fee}<small> / visit</small></strong>
                        </div>
                        <a href="appointments.html" class="btn doctor-book-btn">Book consultation <i class="fa-solid fa-arrow-right"></i></a>
                    </div>
                </article>
            `).join('');

            const searchInput = document.querySelector('#doctorSearchInput');
            const resultCount = document.querySelector('#doctorResultCount');
            let selectedDepartment = 'all';
            const updateDoctorResults = () => {
                const searchTerm = (searchInput?.value || '').trim().toLowerCase();
                let visibleCount = 0;
                document.querySelectorAll('.doctor-card').forEach((card) => {
                    const matchesDepartment = selectedDepartment === 'all' || card.dataset.department === selectedDepartment;
                    const matchesSearch = !searchTerm || card.textContent.toLowerCase().includes(searchTerm);
                    const visible = matchesDepartment && matchesSearch;
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
            updateDoctorResults();
        } catch (error) {
            container.innerHTML = `<div class="form-error" style="display:block;">${error.message}</div>`;
        }
    }

    renderPublicDoctors();

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
        document.querySelectorAll('[data-open-chat]').forEach((button) => button.addEventListener('click', () => document.querySelector('#chatModal').classList.add('is-visible')));
        document.querySelectorAll('[data-open-video]').forEach((button) => button.addEventListener('click', () => document.querySelector('#videoModal').classList.add('is-visible')));
        document.querySelectorAll('[data-close-care]').forEach((button) => button.addEventListener('click', () => button.closest('.care-modal').classList.remove('is-visible')));
        document.querySelectorAll('.care-modal').forEach((modal) => modal.addEventListener('click', (event) => { if (event.target === modal) modal.classList.remove('is-visible'); }));
        document.querySelector('#chatForm').addEventListener('submit', (event) => {
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
    if (doctorSelect) api('/api/doctors').then(({ doctors }) => doctors.forEach((doctor) => doctorSelect.add(new Option(`${doctor.name} - ${doctor.department}`, `${doctor.name} - ${doctor.department}`)))).catch((error) => showError('#bookingForm', error.message));
    document.querySelector('#openBookingBtn')?.addEventListener('click', () => {
        if (!session) return window.location.href = 'login.html'; bookingModal.style.setProperty('display', 'flex', 'important');
    });
    document.querySelector('#bookingModal #closeModalBtn')?.addEventListener('click', () => bookingModal.style.setProperty('display', 'none', 'important'));
    if (bookingForm) bookingForm.addEventListener('submit', async (event) => {
        event.preventDefault();
        try {
            await api('/api/appointments', { method: 'POST', body: JSON.stringify({ doctor: doctorSelect.value, date: document.querySelector('#appointmentDate').value, time: document.querySelector('#appointmentTime').value, reason: document.querySelector('#reason').value, patient: session.email }) });
            bookingForm.reset(); bookingModal.style.setProperty('display', 'none', 'important'); renderAppointments();
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
                body.innerHTML = '<tr><td colspan="6" style="text-align:center; padding:30px; color:var(--muted);">No appointments match this filter.</td></tr>';
                return;
            }

            body.innerHTML = filteredAppointments.map((item) => `<tr><td>${item.doctor}</td><td>${item.date}</td><td>${item.time}</td><td>${item.reason}</td><td>${item.status}</td><td>${feeMap.get(item.doctor) || 'Rs 0'}</td></tr>`).join('');
        } catch (error) { body.innerHTML = `<tr><td colspan="6">${error.message}</td></tr>`; }
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

        patientTable.querySelectorAll('[data-delete-patient]').forEach((button) => button.addEventListener('click', async () => { await api(`/api/patients/${button.dataset.deletePatient}`, { method: 'DELETE' }); renderPatients(); }));
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

        if (editingPatientId) {
            await api(`/api/patients/${editingPatientId}`, { method: 'PUT', body: JSON.stringify(payload) });
        } else {
            await api('/api/patients', { method: 'POST', body: JSON.stringify(payload) });
        }

        patientForm.reset();
        patientModal.style.setProperty('display', 'none', 'important');
        editingPatientId = null;
        if (patientModalTitle) patientModalTitle.textContent = 'Add Patient';
        renderPatients();
    });
    renderPatients().catch(() => {});

    const adminWelcome = document.querySelector('#adminWelcomeMessage');
    if (adminWelcome && session && session.role === 'admin') {
        adminWelcome.textContent = `Welcome back, ${session.name}.`;
    }

    const adminAppointmentsBody = document.querySelector('#adminAppointmentsBody');
    const adminPatientsBody = document.querySelector('#adminPatientsBody');
    const adminUsersBody = document.querySelector('#adminUsersBody');
    const adminDoctorsBody = document.querySelector('#adminDoctorsBody');
    const doctorModal = document.querySelector('#doctorModal');
    const doctorForm = document.querySelector('#doctorForm');
    const doctorModalTitle = document.querySelector('#doctorModalTitle');
    const openDoctorModalBtn = document.querySelector('#openDoctorModalBtn');
    const closeDoctorModalBtn = document.querySelector('#closeDoctorModalBtn');
    let editingDoctorId = null;

    if (isAdminDashboard) {
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

                if (adminAppointmentsBody) {
                    const appointments = summary.upcoming || [];
                    if (!appointments.length) {
                        adminAppointmentsBody.innerHTML = '<tr><td colspan="5">No upcoming appointments.</td></tr>';
                    } else {
                        adminAppointmentsBody.innerHTML = appointments.map((item) => `
                            <tr>
                                <td>${item.doctor}</td>
                                <td>${item.patient || 'Unknown patient'}</td>
                                <td>${item.date}</td>
                                <td>${item.time}</td>
                                <td>
                                    <select class="admin-status-select" data-appointment-id="${item.id}" aria-label="Update appointment status">
                                        <option value="Pending" ${item.status === 'Pending' ? 'selected' : ''}>Pending</option>
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

                if (adminUsersBody) {
                    const { users } = await api('/api/users');
                    if (!users.length) {
                        adminUsersBody.innerHTML = '<tr><td colspan="5">No registered users yet.</td></tr>';
                    } else {
                        adminUsersBody.innerHTML = users.map((user) => `
                            <tr>
                                <td>${user.name}</td>
                                <td>${user.email}</td>
                                <td>${user.phone}</td>
                                <td>${user.age}</td>
                                <td>${user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : 'Not logged in'}</td>
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
            } catch (error) {
                if (adminAppointmentsBody) adminAppointmentsBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
                if (adminPatientsBody) adminPatientsBody.innerHTML = `<tr><td colspan="4">${error.message}</td></tr>`;
                if (adminDoctorsBody) adminDoctorsBody.innerHTML = `<tr><td colspan="7">${error.message}</td></tr>`;
                if (adminUsersBody) adminUsersBody.innerHTML = `<tr><td colspan="5">${error.message}</td></tr>`;
            }
        }

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
                if (editingDoctorId) {
                    await api(`/api/doctors/${editingDoctorId}`, { method: 'PUT', body: JSON.stringify(payload) });
                } else {
                    await api('/api/doctors', { method: 'POST', body: JSON.stringify(payload) });
                }
                doctorForm.reset();
                editingDoctorId = null;
                if (doctorModalTitle) doctorModalTitle.textContent = 'Add Doctor';
                if (doctorModal) doctorModal.style.setProperty('display', 'none', 'important');
                renderAdminDashboard();
            } catch (error) {
                alert(error.message);
            }
        });

        renderAdminDashboard();
        window.setInterval(() => {
            if (!document.hidden) renderAdminDashboard();
        }, 10000);
    }
});
