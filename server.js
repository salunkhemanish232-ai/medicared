const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATABASE_DIR = path.join(ROOT, 'database');
const DATABASE_FILE = path.join(DATABASE_DIR, 'medicare-db.json');
const DB_CONFIG = {
    host: process.env.DB_HOST || '127.0.0.1',
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'medicare_db',
    waitForConnections: true,
    connectionLimit: 10,
    charset: 'utf8mb4'
};
const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.ico': 'image/x-icon',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml'
};

const DEFAULT_DOCTORS = [
    {
        id: 'D001',
        name: 'Dr. Asha Mehta',
        department: 'Cardiology',
        specialty: 'Heart care, blood pressure, chest pain, and preventive cardiology.',
        fee: 'Rs 800',
        availability: 'Mon-Fri',
        photo: 'https://images.unsplash.com/photo-1559839734-2b71ea197ec2?auto=format&fit=crop&w=500&q=80'
    },
    {
        id: 'D002',
        name: 'Dr. Rohan Kapoor',
        department: 'Orthopedics',
        specialty: 'Bone, joint, back pain, injury care, and mobility consultation.',
        fee: 'Rs 700',
        availability: 'Mon-Sat',
        photo: 'https://images.unsplash.com/photo-1612349317150-e413f6a5b16d?auto=format&fit=crop&w=500&q=80'
    },
    {
        id: 'D003',
        name: 'Dr. Neha Sharma',
        department: 'Pediatrics',
        specialty: 'Child health, vaccination guidance, fever, growth, and family care.',
        fee: 'Rs 600',
        availability: 'Tue-Sat',
        photo: 'https://images.unsplash.com/photo-1594824476967-48c8b964273f?auto=format&fit=crop&w=500&q=80'
    },
    {
        id: 'D004',
        name: 'Dr. Imran Ali',
        department: 'Dermatology',
        specialty: 'Skin allergy, acne, hair care, infection, and cosmetic skin advice.',
        fee: 'Rs 650',
        availability: 'Mon-Fri',
        photo: 'https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&w=500&q=80'
    },
    {
        id: 'D005',
        name: 'Dr. Kavya Rao',
        department: 'ENT',
        specialty: 'Ear pain, throat infection, sinus, hearing, and voice concerns.',
        fee: 'Rs 550',
        availability: 'Mon-Sat',
        photo: 'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=500&q=80'
    }
];

const STORE_PRODUCTS = [
    { id: 'M001', name: 'Digital thermometer', category: 'Home monitoring', price: 'Rs 249', icon: 'fa-temperature-half', description: 'Fast temperature checks for home care.' },
    { id: 'M002', name: 'Pulse oximeter', category: 'Home monitoring', price: 'Rs 899', icon: 'fa-heart-pulse', description: 'Track oxygen saturation and pulse rate.' },
    { id: 'M003', name: 'First-aid essentials kit', category: 'Care essentials', price: 'Rs 599', icon: 'fa-kit-medical', description: 'Everyday dressing and basic care supplies.' },
    { id: 'M004', name: 'Reusable hot and cold pack', category: 'Recovery', price: 'Rs 199', icon: 'fa-snowflake', description: 'Comfort support for everyday aches and recovery.' },
    { id: 'M005', name: 'Surgical face masks', category: 'Protection', price: 'Rs 149', icon: 'fa-head-side-mask', description: 'Comfortable protection for visits and travel.' },
    { id: 'M006', name: 'Electrolyte care pack', category: 'Wellness', price: 'Rs 99', icon: 'fa-glass-water', description: 'Hydration support. Ask your clinician when needed.' }
];

const VALID_STATUS = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
let mysqlPool = null;
const adminSessions = new Map();
const loginAttempts = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function getDefaultDatabase() {
    return {
        users: [],
        admins: [],
        appointments: [],
        patients: [],
        messages: [],
        doctors: DEFAULT_DOCTORS
    };
}

function readLegacyDatabase() {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });
    if (!fs.existsSync(DATABASE_FILE)) {
        const database = getDefaultDatabase();
        saveLegacyDatabase(database);
        return database;
    }

    try {
        const raw = fs.readFileSync(DATABASE_FILE, 'utf8');
        const parsed = JSON.parse(raw);
        const database = getDefaultDatabase();
        if (Array.isArray(parsed.users)) database.users = parsed.users;
        if (Array.isArray(parsed.admins)) database.admins = parsed.admins;
        if (Array.isArray(parsed.appointments)) database.appointments = parsed.appointments;
        if (Array.isArray(parsed.patients)) database.patients = parsed.patients;
        if (Array.isArray(parsed.messages)) database.messages = parsed.messages;
        if (Array.isArray(parsed.doctors)) database.doctors = parsed.doctors;
        return database;
    } catch (error) {
        const emptyDatabase = getDefaultDatabase();
        saveLegacyDatabase(emptyDatabase);
        return emptyDatabase;
    }
}

function saveLegacyDatabase(database) {
    const temporaryFile = `${DATABASE_FILE}.tmp`;
    fs.writeFileSync(temporaryFile, JSON.stringify(database, null, 2), 'utf8');
    fs.renameSync(temporaryFile, DATABASE_FILE);
}

async function getMysqlPool() {
    if (mysqlPool) return mysqlPool;

    try {
        const serverPool = mysql.createPool({
            host: DB_CONFIG.host,
            port: DB_CONFIG.port,
            user: DB_CONFIG.user,
            password: DB_CONFIG.password,
            waitForConnections: true,
            connectionLimit: 1
        });
        await serverPool.query(`CREATE DATABASE IF NOT EXISTS \`${DB_CONFIG.database.replace(/`/g, '')}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
        await serverPool.end();

        mysqlPool = mysql.createPool(DB_CONFIG);
        const connection = await mysqlPool.getConnection();
        await connection.ping();
        connection.release();
        return mysqlPool;
    } catch (error) {
        mysqlPool = null;
        console.warn('MySQL not available, using JSON fallback:', error.message);
        return null;
    }
}

async function ensureDatabase() {
    fs.mkdirSync(DATABASE_DIR, { recursive: true });

    const pool = await getMysqlPool();
    if (!pool) {
        const database = readLegacyDatabase();
        const existingDoctorNames = new Set((database.doctors || []).map((doctor) => doctor.name));
        const missingDoctors = DEFAULT_DOCTORS.filter((doctor) => !existingDoctorNames.has(doctor.name));
        if (missingDoctors.length) {
            database.doctors = [...(database.doctors || []), ...missingDoctors.map((doctor) => ({ ...doctor }))];
        }
        if (!database.admins.some((admin) => admin.email === 'admin@medicare.com')) {
            database.admins.push({
                id: crypto.randomUUID(),
                name: 'System Administrator',
                email: 'admin@medicare.com',
                role: 'admin',
                password: hashPassword('admin123'),
                createdAt: new Date().toISOString()
            });
        }
        saveLegacyDatabase(database);
        return database;
    }

    await pool.query(`
        CREATE TABLE IF NOT EXISTS users (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            phone VARCHAR(255) NOT NULL,
            age INT NOT NULL,
            password TEXT NOT NULL,
            createdAt DATETIME NOT NULL,
            lastLoginAt DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query('ALTER TABLE users ADD COLUMN IF NOT EXISTS lastLoginAt DATETIME NULL');

    await pool.query(`
        CREATE TABLE IF NOT EXISTS admins (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL UNIQUE,
            role VARCHAR(50) NOT NULL,
            password TEXT NOT NULL,
            createdAt DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS appointments (
            id VARCHAR(255) PRIMARY KEY,
            doctor VARCHAR(255) NOT NULL,
            date VARCHAR(255) NOT NULL,
            time VARCHAR(255) NOT NULL,
            reason TEXT NOT NULL,
            patient VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            createdAt DATETIME NOT NULL,
            updatedAt DATETIME NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS patients (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            age INT NOT NULL,
            gender VARCHAR(50) NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS messages (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            email VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            createdAt DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS doctors (
            id VARCHAR(255) PRIMARY KEY,
            name VARCHAR(255) NOT NULL,
            department VARCHAR(255) NOT NULL,
            specialty TEXT NOT NULL,
            fee VARCHAR(255) NOT NULL,
            availability VARCHAR(255) NOT NULL,
            photo TEXT NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    const [doctorRows] = await pool.query('SELECT * FROM doctors');
    const existingDoctorNames = new Set((doctorRows || []).map((doctor) => doctor.name));
    const missingDoctors = DEFAULT_DOCTORS.filter((doctor) => !existingDoctorNames.has(doctor.name));
    for (const doctor of missingDoctors) {
        await pool.query('INSERT INTO doctors (id, name, department, specialty, fee, availability, photo) VALUES (?, ?, ?, ?, ?, ?, ?)', [doctor.id, doctor.name, doctor.department, doctor.specialty, doctor.fee, doctor.availability, doctor.photo]);
    }

    const [adminRows] = await pool.query('SELECT * FROM admins WHERE email = ?', ['admin@medicare.com']);
    if (!adminRows.length) {
        await pool.query('INSERT INTO admins (id, name, email, role, password, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [crypto.randomUUID(), 'System Administrator', 'admin@medicare.com', 'admin', hashPassword('admin123'), new Date().toISOString()]);
    }

    const [users] = await pool.query('SELECT * FROM users ORDER BY createdAt ASC');
    const [admins] = await pool.query('SELECT * FROM admins ORDER BY createdAt ASC');
    const [appointments] = await pool.query('SELECT * FROM appointments ORDER BY createdAt ASC');
    const [patients] = await pool.query('SELECT * FROM patients ORDER BY id ASC');
    const [messages] = await pool.query('SELECT * FROM messages ORDER BY createdAt ASC');
    const [doctors] = await pool.query('SELECT * FROM doctors ORDER BY id ASC');

    return { users, admins, appointments, patients, messages, doctors };
}

async function readDatabase() {
    const pool = await getMysqlPool();
    if (!pool) {
        return readLegacyDatabase();
    }
    return ensureDatabase();
}

async function writeDatabase(database) {
    const pool = await getMysqlPool();
    if (!pool) {
        saveLegacyDatabase(database);
        return;
    }

    await pool.query('DELETE FROM users');
    await pool.query('DELETE FROM admins');
    await pool.query('DELETE FROM appointments');
    await pool.query('DELETE FROM patients');
    await pool.query('DELETE FROM messages');
    await pool.query('DELETE FROM doctors');

    for (const user of database.users || []) {
        await pool.query('INSERT INTO users (id, name, email, phone, age, password, createdAt, lastLoginAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [user.id, user.name, user.email, user.phone, Number(user.age), user.password, user.createdAt, user.lastLoginAt || null]);
    }

    for (const admin of database.admins || []) {
        await pool.query('INSERT INTO admins (id, name, email, role, password, createdAt) VALUES (?, ?, ?, ?, ?, ?)', [admin.id, admin.name, admin.email, admin.role || 'admin', admin.password, admin.createdAt]);
    }

    for (const appointment of database.appointments || []) {
        await pool.query('INSERT INTO appointments (id, doctor, date, time, reason, patient, status, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [appointment.id, appointment.doctor, appointment.date, appointment.time, appointment.reason, appointment.patient, appointment.status, appointment.createdAt, appointment.updatedAt || null]);
    }

    for (const patient of database.patients || []) {
        await pool.query('INSERT INTO patients (id, name, age, gender) VALUES (?, ?, ?, ?)', [patient.id, patient.name, Number(patient.age), patient.gender]);
    }

    for (const message of database.messages || []) {
        await pool.query('INSERT INTO messages (id, name, email, message, createdAt) VALUES (?, ?, ?, ?, ?)', [message.id, message.name, message.email, message.message, message.createdAt]);
    }

    for (const doctor of database.doctors || []) {
        await pool.query('INSERT INTO doctors (id, name, department, specialty, fee, availability, photo) VALUES (?, ?, ?, ?, ?, ?, ?)', [doctor.id, doctor.name, doctor.department, doctor.specialty, doctor.fee, doctor.availability, doctor.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80']);
    }
}

function sendJson(response, status, payload) {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
    response.end(JSON.stringify(payload));
}

function sendError(response, status, message) {
    sendJson(response, status, { error: message });
}

function readBody(request) {
    return new Promise((resolve, reject) => {
        let body = '';
        request.on('data', (chunk) => {
            body += chunk;
            if (body.length > 1000000) request.destroy();
        });
        request.on('end', () => {
            try {
                resolve(body ? JSON.parse(body) : {});
            } catch (error) {
                reject(new Error('Request body must be valid JSON.'));
            }
        });
        request.on('error', reject);
    });
}

function publicUser(user) {
    return { id: user.id, name: user.name, email: user.email, phone: user.phone, age: user.age, lastLoginAt: user.lastLoginAt || null };
}

function publicAdmin(admin) {
    return { id: admin.id, name: admin.name, email: admin.email, role: admin.role || 'admin' };
}

function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) {
    const hash = crypto.scryptSync(password, salt, 64).toString('hex');
    return `${salt}:${hash}`;
}

function passwordMatches(password, storedPassword) {
    try {
        const [salt, storedHash] = String(storedPassword || '').split(':');
        if (!salt || !/^[a-f0-9]{128}$/i.test(storedHash)) return false;
        const hash = crypto.scryptSync(String(password || ''), salt, 64).toString('hex');
        return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(storedHash, 'hex'));
    } catch (error) {
        return false;
    }
}

function buildDashboardSummary(database) {
    const totalAppointments = database.appointments.length;
    const pendingAppointments = database.appointments.filter((item) => item.status === 'Pending').length;
    const confirmedAppointments = database.appointments.filter((item) => item.status === 'Confirmed').length;
    const totalPatients = database.patients.length;
    const totalUsers = database.users.length;
    const totalMessages = database.messages.length;
    const upcoming = [...database.appointments].sort((a, b) => new Date(a.date) - new Date(b.date)).slice(0, 5);

    return {
        totalAppointments,
        pendingAppointments,
        confirmedAppointments,
        totalPatients,
        totalUsers,
        totalMessages,
        upcoming
    };
}

function sanitizeEmail(email) {
    return String(email || '').trim().toLowerCase();
}

function getClientAddress(request) {
    return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function loginRateKey(request, email, type) {
    return `${type}:${getClientAddress(request)}:${email}`;
}

function isLoginRateLimited(key) {
    const attempt = loginAttempts.get(key);
    if (!attempt) return false;
    if (Date.now() - attempt.startedAt >= LOGIN_WINDOW_MS) {
        loginAttempts.delete(key);
        return false;
    }
    return attempt.count >= MAX_LOGIN_ATTEMPTS;
}

function recordLoginFailure(key) {
    const now = Date.now();
    const attempt = loginAttempts.get(key);
    if (!attempt || now - attempt.startedAt >= LOGIN_WINDOW_MS) {
        loginAttempts.set(key, { startedAt: now, count: 1 });
        return;
    }
    attempt.count += 1;
}

function clearLoginFailures(key) {
    loginAttempts.delete(key);
}

function isAdminRequest(request) {
    const authorization = String(request.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
    const session = token ? adminSessions.get(token) : null;
    if (!session) return false;
    if (Date.now() - session.createdAt > 8 * 60 * 60 * 1000) {
        adminSessions.delete(token);
        return false;
    }
    return true;
}

function requiresAdmin(route, method) {
    return (method === 'GET' && ['/api/admin/summary', '/api/users', '/api/messages', '/api/patients'].includes(route))
        || (route.startsWith('/api/patients/') && ['PUT', 'DELETE'].includes(method))
        || (route.startsWith('/api/doctors/') && ['PUT', 'DELETE'].includes(method))
        || (method === 'POST' && ['/api/patients', '/api/doctors'].includes(route))
        || (method === 'DELETE' && route.startsWith('/api/messages/'))
        || (method === 'PUT' && route.startsWith('/api/appointments/'));
}

async function handleApi(request, response, requestUrl) {
    const route = requestUrl.pathname;
    const method = request.method;

    if (requiresAdmin(route, method) && !isAdminRequest(request)) {
        return sendError(response, 401, 'Admin authentication is required for this action.');
    }

    const database = await readDatabase();

    if (method === 'GET' && route === '/api/health') {
        return sendJson(response, 200, { status: 'ok', service: 'Medicare API', timestamp: new Date().toISOString() });
    }

    if (method === 'GET' && route === '/api/doctors') {
        return sendJson(response, 200, { doctors: database.doctors });
    }

    if (method === 'GET' && route === '/api/store') {
        return sendJson(response, 200, { products: STORE_PRODUCTS });
    }

    if (method === 'GET' && route === '/api/dashboard/summary') {
        return sendJson(response, 200, buildDashboardSummary(database));
    }

    if (method === 'GET' && route === '/api/admin/summary') {
        return sendJson(response, 200, buildDashboardSummary(database));
    }

    if (method === 'GET' && route === '/api/messages') {
        return sendJson(response, 200, { messages: database.messages });
    }

    if (method === 'GET' && route === '/api/users') {
        return sendJson(response, 200, { users: database.users.map(publicUser) });
    }

    let body;
    if (method !== 'GET') {
        try {
            body = await readBody(request);
        } catch (error) {
            return sendError(response, 400, error.message);
        }
    }

    if (method === 'POST' && route === '/api/register') {
        const name = String(body.name || '').trim();
        const email = sanitizeEmail(body.email);
        const phone = String(body.phone || '').trim();
        const age = Number(body.age);
        const password = String(body.password || '');

        if (!name || !email || !phone || !Number.isInteger(age) || age < 1 || age > 120 || password.length < 6) {
            return sendError(response, 400, 'Enter valid registration details. Password must be at least 6 characters.');
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(email)) {
            return sendError(response, 400, 'Please enter a valid email address.');
        }

        if (database.users.some((user) => user.email === email)) {
            return sendError(response, 409, 'An account with this email already exists.');
        }

        const user = {
            id: crypto.randomUUID(),
            name,
            email,
            phone,
            age,
            password: hashPassword(password),
            createdAt: new Date().toISOString()
        };

        database.users.push(user);
        await writeDatabase(database);
        return sendJson(response, 201, { user: publicUser(user) });
    }

    if (method === 'POST' && route === '/api/login') {
        const email = sanitizeEmail(body.email);
        const password = String(body.password || '');
        const rateKey = loginRateKey(request, email, 'patient');
        if (isLoginRateLimited(rateKey)) {
            return sendError(response, 429, 'Too many login attempts. Please try again in 15 minutes.');
        }
        const user = database.users.find((item) => item.email === email);

        if (!user || !passwordMatches(password, user.password)) {
            recordLoginFailure(rateKey);
            return sendError(response, 401, 'Email or password is incorrect.');
        }

        clearLoginFailures(rateKey);
        user.lastLoginAt = new Date().toISOString();
        await writeDatabase(database);

        return sendJson(response, 200, { user: { ...publicUser(user), role: 'patient' } });
    }

    if (method === 'POST' && route === '/api/admin/login') {
        const email = sanitizeEmail(body.email);
        const password = String(body.password || '');
        const rateKey = loginRateKey(request, email, 'admin');
        if (isLoginRateLimited(rateKey)) {
            return sendError(response, 429, 'Too many login attempts. Please try again in 15 minutes.');
        }
        const admin = database.admins.find((item) => item.email === email);

        if (!admin || !passwordMatches(password, admin.password)) {
            recordLoginFailure(rateKey);
            return sendError(response, 401, 'Admin email or password is incorrect.');
        }

        clearLoginFailures(rateKey);
        const token = crypto.randomBytes(32).toString('hex');
        adminSessions.set(token, { adminId: admin.id, createdAt: Date.now() });
        return sendJson(response, 200, { user: publicAdmin(admin), token });
    }

    if (method === 'GET' && route === '/api/appointments') {
        const email = sanitizeEmail(requestUrl.searchParams.get('email'));
        return sendJson(response, 200, { appointments: database.appointments.filter((item) => !email || item.patient === email) });
    }

    if (method === 'POST' && route === '/api/appointments') {
        const appointment = {
            id: crypto.randomUUID(),
            doctor: String(body.doctor || '').trim(),
            date: String(body.date || '').trim(),
            time: String(body.time || '').trim(),
            reason: String(body.reason || '').trim(),
            patient: sanitizeEmail(body.patient),
            status: 'Pending',
            createdAt: new Date().toISOString()
        };

        const validDoctorNames = database.doctors.map((doctor) => `${doctor.name} - ${doctor.department}`);
        if (!validDoctorNames.includes(appointment.doctor) || !appointment.date || !appointment.time || !appointment.reason || !appointment.patient) {
            return sendError(response, 400, 'Complete all appointment fields.');
        }

        database.appointments.push(appointment);
        await writeDatabase(database);
        return sendJson(response, 201, { appointment });
    }

    const appointmentStatusMatch = route.match(/^\/api\/appointments\/([^/]+)\/status$/);
    if (method === 'PUT' && appointmentStatusMatch) {
        const targetedId = appointmentStatusMatch[1];
        const status = String(body.status || '').trim();

        if (!VALID_STATUS.includes(status)) {
            return sendError(response, 400, 'Status must be one of Pending, Confirmed, Completed, or Cancelled.');
        }

        const appointment = database.appointments.find((item) => item.id === targetedId);
        if (!appointment) return sendError(response, 404, 'Appointment not found.');

        appointment.status = status;
        appointment.updatedAt = new Date().toISOString();
        await writeDatabase(database);
        return sendJson(response, 200, { appointment });
    }

    if (method === 'GET' && route === '/api/patients') {
        return sendJson(response, 200, { patients: database.patients });
    }

    if (method === 'POST' && route === '/api/doctors') {
        const doctor = {
            id: `D${String(database.doctors.length + 1).padStart(3, '0')}`,
            name: String(body.name || '').trim(),
            department: String(body.department || '').trim(),
            specialty: String(body.specialty || '').trim(),
            fee: String(body.fee || '').trim(),
            availability: String(body.availability || '').trim(),
            photo: String(body.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80').trim()
        };

        if (!doctor.name || !doctor.department || !doctor.specialty || !doctor.fee || !doctor.availability) {
            return sendError(response, 400, 'Complete all doctor fields.');
        }

        database.doctors.push(doctor);
        await writeDatabase(database);
        return sendJson(response, 201, { doctor });
    }

    const doctorMatch = route.match(/^\/api\/doctors\/([^/]+)$/);
    if (method === 'PUT' && doctorMatch) {
        const doctor = database.doctors.find((item) => item.id === doctorMatch[1]);
        if (!doctor) return sendError(response, 404, 'Doctor not found.');

        doctor.name = String(body.name || doctor.name).trim();
        doctor.department = String(body.department || doctor.department).trim();
        doctor.specialty = String(body.specialty || doctor.specialty).trim();
        doctor.fee = String(body.fee || doctor.fee).trim();
        doctor.availability = String(body.availability || doctor.availability).trim();
        doctor.photo = String(body.photo || doctor.photo || 'https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=500&q=80').trim();

        if (!doctor.name || !doctor.department || !doctor.specialty || !doctor.fee || !doctor.availability) {
            return sendError(response, 400, 'Complete all doctor fields.');
        }

        await writeDatabase(database);
        return sendJson(response, 200, { doctor });
    }

    if (method === 'DELETE' && doctorMatch) {
        const originalLength = database.doctors.length;
        database.doctors = database.doctors.filter((doctor) => doctor.id !== doctorMatch[1]);

        if (database.doctors.length === originalLength) {
            return sendError(response, 404, 'Doctor not found.');
        }

        await writeDatabase(database);
        return sendJson(response, 200, { doctors: database.doctors });
    }

    if (method === 'POST' && route === '/api/patients') {
        const patient = {
            id: `P${String(database.patients.length + 1).padStart(3, '0')}`,
            name: String(body.name || '').trim(),
            age: Number(body.age),
            gender: String(body.gender || '').trim()
        };

        if (!patient.name || !Number.isInteger(patient.age) || patient.age < 1 || !patient.gender) {
            return sendError(response, 400, 'Complete all patient fields.');
        }

        database.patients.push(patient);
        await writeDatabase(database);
        return sendJson(response, 201, { patient });
    }

    const patientMatch = route.match(/^\/api\/patients\/([^/]+)$/);
    if (method === 'PUT' && patientMatch) {
        const patient = database.patients.find((item) => item.id === patientMatch[1]);

        if (!patient) {
            return sendError(response, 404, 'Patient not found.');
        }

        const updatedName = String(body.name || patient.name).trim();
        const updatedAge = Number(body.age ?? patient.age);
        const updatedGender = String(body.gender || patient.gender).trim();

        if (!updatedName || !Number.isInteger(updatedAge) || updatedAge < 1 || !updatedGender) {
            return sendError(response, 400, 'Complete all patient fields.');
        }

        patient.name = updatedName;
        patient.age = updatedAge;
        patient.gender = updatedGender;
        await writeDatabase(database);
        return sendJson(response, 200, { patient });
    }

    if (method === 'DELETE' && patientMatch) {
        const originalLength = database.patients.length;
        database.patients = database.patients.filter((patient) => patient.id !== patientMatch[1]);

        if (database.patients.length === originalLength) {
            return sendError(response, 404, 'Patient not found.');
        }

        await writeDatabase(database);
        return sendJson(response, 200, { patients: database.patients });
    }

    if (method === 'POST' && route === '/api/messages') {
        const message = {
            id: crypto.randomUUID(),
            name: String(body.name || '').trim(),
            email: sanitizeEmail(body.email),
            message: String(body.message || '').trim(),
            createdAt: new Date().toISOString()
        };

        if (!message.name || !message.email || !message.message) {
            return sendError(response, 400, 'Complete all message fields.');
        }

        database.messages.push(message);
        await writeDatabase(database);
        return sendJson(response, 201, { message: 'Message received successfully.' });
    }

    const messageMatch = route.match(/^\/api\/messages\/([^/]+)$/);
    if (method === 'DELETE' && messageMatch) {
        const originalLength = database.messages.length;
        database.messages = database.messages.filter((message) => message.id !== messageMatch[1]);

        if (database.messages.length === originalLength) {
            return sendError(response, 404, 'Message not found.');
        }

        await writeDatabase(database);
        return sendJson(response, 200, { messages: database.messages });
    }

    sendError(response, 404, 'API route not found.');
}

function serveStatic(request, response, requestUrl) {
    const requestedPath = requestUrl.pathname === '/' ? '/index.html' : requestUrl.pathname;
    const filePath = path.resolve(PUBLIC_DIR, `.${requestedPath}`);
    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        return sendError(response, 404, 'Page not found.');
    }

    response.writeHead(200, { 'Content-Type': MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(response);
}

ensureDatabase();
const server = http.createServer(async (request, response) => {
    const requestUrl = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    response.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

    if (request.method === 'OPTIONS') {
        response.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization'
        });
        return response.end();
    }

    try {
        if (requestUrl.pathname.startsWith('/api/')) {
            await handleApi(request, response, requestUrl);
        } else {
            serveStatic(request, response, requestUrl);
        }
    } catch (error) {
        console.error(error);
        sendError(response, 500, 'Internal server error.');
    }
});

server.listen(PORT, () => console.log(`Medicare server running at http://localhost:${PORT}`));
