const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { URL } = require('node:url');
const mysql = require('mysql2/promise');

const PORT = Number(process.env.PORT) || 8080;
const ROOT = __dirname;
const PUBLIC_DIR = path.join(ROOT, 'public');
const DATABASE_DIR = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(ROOT, 'database');
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

const VERIFIED_FAQS = [
    { question: 'How do I book an appointment?', answer: 'Choose a doctor, select an available date and time, then submit your reason for visit. Your request appears in your portal after submission.' },
    { question: 'How do I reschedule or cancel?', answer: 'Open Appointments from your patient portal and use the available action on the appointment. The care team is notified of the change.' },
    { question: 'Where can I find my reports?', answer: 'Authorized lab reports, prescriptions, and consultation notes appear in your private patient dashboard.' },
    { question: 'Can the assistant diagnose me?', answer: 'No. Medicare navigation provides verified service information and appointment guidance only. Speak with a qualified clinician for medical advice.' }
];

const VALID_STATUS = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const VALID_ROLES = ['patient', 'doctor', 'admin', 'staff'];
let mysqlPool = null;
let storageMode = 'json';
const adminSessions = new Map();
const patientSessions = new Map();
const authSessions = new Map();
const loginAttempts = new Map();
const passwordResetTokens = new Map();
const emailVerificationTokens = new Map();
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS = 5;

function getDefaultDatabase() {
    return {
        users: [],
        admins: [],
        appointments: [],
        patients: [],
        messages: [],
        doctors: DEFAULT_DOCTORS,
        medicalRecords: [],
        labReports: [],
        prescriptions: [],
        notifications: [],
        auditLogs: []
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
        if (Array.isArray(parsed.medicalRecords)) database.medicalRecords = parsed.medicalRecords;
        if (Array.isArray(parsed.labReports)) database.labReports = parsed.labReports;
        if (Array.isArray(parsed.prescriptions)) database.prescriptions = parsed.prescriptions;
        if (Array.isArray(parsed.notifications)) database.notifications = parsed.notifications;
        if (Array.isArray(parsed.auditLogs)) database.auditLogs = parsed.auditLogs;
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
        storageMode = 'mysql';
        return mysqlPool;
    } catch (error) {
        mysqlPool = null;
        storageMode = 'json';
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

    await pool.query(`
        CREATE TABLE IF NOT EXISTS medical_records (
            id VARCHAR(255) PRIMARY KEY,
            patientEmail VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            summary TEXT NOT NULL,
            date VARCHAR(255) NOT NULL,
            doctor VARCHAR(255) NOT NULL,
            accessLevel VARCHAR(50) NOT NULL,
            createdAt DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS lab_reports (
            id VARCHAR(255) PRIMARY KEY,
            patientEmail VARCHAR(255) NOT NULL,
            testName VARCHAR(255) NOT NULL,
            status VARCHAR(50) NOT NULL,
            date VARCHAR(255) NOT NULL,
            fileName VARCHAR(255) NOT NULL,
            createdAt DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS prescriptions (
            id VARCHAR(255) PRIMARY KEY,
            patientEmail VARCHAR(255) NOT NULL,
            medication VARCHAR(255) NOT NULL,
            dosage VARCHAR(255) NOT NULL,
            instructions TEXT NOT NULL,
            doctor VARCHAR(255) NOT NULL,
            date VARCHAR(255) NOT NULL,
            createdAt DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS notifications (
            id VARCHAR(255) PRIMARY KEY,
            patientEmail VARCHAR(255) NOT NULL,
            title VARCHAR(255) NOT NULL,
            message TEXT NOT NULL,
            type VARCHAR(50) NOT NULL,
            isRead BOOLEAN NOT NULL DEFAULT false,
            createdAt DATETIME NOT NULL
        ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
    `);

    await pool.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
            id VARCHAR(255) PRIMARY KEY,
            action VARCHAR(100) NOT NULL,
            resource VARCHAR(100) NOT NULL,
            resourceId VARCHAR(255) NOT NULL,
            actor VARCHAR(255) NOT NULL,
            ip VARCHAR(255) NOT NULL,
            createdAt DATETIME NOT NULL
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
    const [medicalRecords] = await pool.query('SELECT * FROM medical_records ORDER BY createdAt ASC');
    const [labReports] = await pool.query('SELECT * FROM lab_reports ORDER BY createdAt ASC');
    const [prescriptions] = await pool.query('SELECT * FROM prescriptions ORDER BY createdAt ASC');
    const [notifications] = await pool.query('SELECT * FROM notifications ORDER BY createdAt ASC');
    const [auditLogs] = await pool.query('SELECT * FROM audit_logs ORDER BY createdAt ASC');

    return { users, admins, appointments, patients, messages, doctors, medicalRecords, labReports, prescriptions, notifications, auditLogs };
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
    await pool.query('DELETE FROM medical_records');
    await pool.query('DELETE FROM lab_reports');
    await pool.query('DELETE FROM prescriptions');
    await pool.query('DELETE FROM notifications');
    await pool.query('DELETE FROM audit_logs');

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

    for (const record of database.medicalRecords || []) {
        await pool.query('INSERT INTO medical_records (id, patientEmail, title, summary, date, doctor, accessLevel, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [record.id, record.patientEmail, record.title, record.summary, record.date, record.doctor, record.accessLevel || 'authorized', record.createdAt]);
    }

    for (const report of database.labReports || []) {
        await pool.query('INSERT INTO lab_reports (id, patientEmail, testName, status, date, fileName, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [report.id, report.patientEmail, report.testName, report.status, report.date, report.fileName, report.createdAt]);
    }

    for (const prescription of database.prescriptions || []) {
        await pool.query('INSERT INTO prescriptions (id, patientEmail, medication, dosage, instructions, doctor, date, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [prescription.id, prescription.patientEmail, prescription.medication, prescription.dosage, prescription.instructions, prescription.doctor, prescription.date, prescription.createdAt]);
    }

    for (const notification of database.notifications || []) {
        await pool.query('INSERT INTO notifications (id, patientEmail, title, message, type, isRead, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [notification.id, notification.patientEmail, notification.title, notification.message, notification.type, notification.isRead ? 1 : 0, notification.createdAt]);
    }

    for (const auditLog of database.auditLogs || []) {
        await pool.query('INSERT INTO audit_logs (id, action, resource, resourceId, actor, ip, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?)', [auditLog.id, auditLog.action, auditLog.resource, auditLog.resourceId, auditLog.actor, auditLog.ip, auditLog.createdAt]);
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

function sanitizeRole(role) {
    const normalizedRole = String(role || 'patient').trim().toLowerCase();
    return VALID_ROLES.includes(normalizedRole) ? normalizedRole : 'patient';
}

function isStrongPassword(password) {
    return /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(String(password || ''));
}

function publicUser(user) {
    return {
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone,
        age: user.age,
        role: user.role || 'patient',
        emailVerified: Boolean(user.emailVerified),
        createdAt: user.createdAt || null,
        lastLoginAt: user.lastLoginAt || null
    };
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

function addNotification(database, patientEmail, title, message, type = 'update') {
    database.notifications = database.notifications || [];
    database.notifications.push({
        id: crypto.randomUUID(),
        patientEmail: sanitizeEmail(patientEmail),
        title,
        message,
        type,
        isRead: false,
        createdAt: new Date().toISOString()
    });
}

function addAuditLog(database, request, action, resource, resourceId, actor) {
    database.auditLogs = database.auditLogs || [];
    database.auditLogs.push({
        id: crypto.randomUUID(),
        action,
        resource,
        resourceId,
        actor: actor || 'system',
        ip: getClientAddress(request),
        createdAt: new Date().toISOString()
    });
}

function isSameOriginRequest(request) {
    const origin = String(request.headers.origin || '');
    if (!origin) return true;
    const expectedOrigin = `http://${request.headers.host || 'localhost'}`;
    const expectedSecureOrigin = `https://${request.headers.host || 'localhost'}`;
    return origin === expectedOrigin || origin === expectedSecureOrigin;
}

function getClientAddress(request) {
    return String(request.headers['x-forwarded-for'] || request.socket.remoteAddress || 'unknown').split(',')[0].trim();
}

function getRequestCookies(request) {
    const cookieHeader = String(request.headers.cookie || '');
    const cookies = {};
    for (const chunk of cookieHeader.split(';')) {
        const [key, ...rest] = chunk.split('=');
        if (!key) continue;
        const cookieName = key.trim();
        if (!cookieName) continue;
        cookies[cookieName] = rest.join('=').trim();
    }
    return cookies;
}

function appendCookie(response, cookieValue) {
    const existing = response.getHeader('Set-Cookie');
    if (Array.isArray(existing)) {
        response.setHeader('Set-Cookie', [...existing, cookieValue]);
        return;
    }
    if (existing) {
        response.setHeader('Set-Cookie', [String(existing), cookieValue]);
        return;
    }
    response.setHeader('Set-Cookie', cookieValue);
}

function setSessionCookie(response, name, value, maxAgeSeconds = 60 * 60 * 24 * 7) {
    let cookieValue = `${name}=${value}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSeconds}`;
    if (process.env.NODE_ENV === 'production') {
        cookieValue += '; Secure';
    }
    appendCookie(response, cookieValue);
}

function getRequestSession(request) {
    const cookies = getRequestCookies(request);
    const patientSession = patientSessions.get(cookies.medicare_session || '');
    const adminSession = adminSessions.get(cookies.medicare_admin_session || '');
    const authSession = authSessions.get(cookies.medicare_session || '');
    return { patient: patientSession || authSession || null, admin: adminSession || null };
}

function getAuthenticatedUserSession(request) {
    const cookies = getRequestCookies(request);
    const token = cookies.medicare_session || '';
    const session = token ? authSessions.get(token) : null;
    if (!session) return null;
    if (Date.now() - session.createdAt > 7 * 24 * 60 * 60 * 1000) {
        authSessions.delete(token);
        return null;
    }
    return session;
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
    const cookies = getRequestCookies(request);
    const adminCookieToken = cookies.medicare_admin_session || '';
    const authorization = String(request.headers.authorization || '');
    const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : adminCookieToken;
    const session = token ? adminSessions.get(token) : null;
    if (!session) return false;
    if (Date.now() - session.createdAt > 8 * 60 * 60 * 1000) {
        adminSessions.delete(token);
        return false;
    }
    return true;
}

function isPatientRequest(request, patientEmail) {
    const cookies = getRequestCookies(request);
    const token = cookies.medicare_session || '';
    const session = token ? patientSessions.get(token) : null;
    if (!session) return false;
    if (Date.now() - session.createdAt > 7 * 24 * 60 * 60 * 1000) {
        patientSessions.delete(token);
        return false;
    }
    if (patientEmail && session.email !== patientEmail) return false;
    return true;
}

function getAuthenticatedRoleSession(request, role) {
    const session = getAuthenticatedUserSession(request);
    return session && session.role === role ? session : null;
}

function getAuthorizedDoctorContext(request, database) {
    const session = getAuthenticatedRoleSession(request, 'doctor');
    if (!session) return null;
    const user = database.users.find((item) => item.id === session.userId && item.role === 'doctor');
    if (!user) return null;
    const doctor = database.doctors.find((item) => item.name.toLowerCase() === String(user.name || '').toLowerCase());
    const doctorNames = new Set([user.name, doctor?.name].filter(Boolean).map((name) => String(name).trim().toLowerCase()));
    const ownsAppointment = (appointment) => doctorNames.has(String(appointment.doctor || '').split(' - ')[0].trim().toLowerCase());
    return { session, user, doctor, doctorNames, ownsAppointment };
}

function getDoctorPatientEmails(database, doctorContext) {
    return new Set(database.appointments.filter(doctorContext.ownsAppointment).map((appointment) => sanitizeEmail(appointment.patient)));
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
    let body;
    if (method !== 'GET') {
        try {
            body = await readBody(request);
        } catch (error) {
            return sendError(response, 400, error.message);
        }
    }

    if (method === 'GET' && route === '/api/health') {
        return sendJson(response, 200, { status: 'ok', service: 'Medicare API', storage: storageMode, persistentDataDirectory: DATABASE_DIR, timestamp: new Date().toISOString() });
    }

    if (method === 'GET' && route === '/api/doctors') {
        const search = String(requestUrl.searchParams.get('search') || '').trim().toLowerCase();
        const specialty = String(requestUrl.searchParams.get('specialty') || '').trim().toLowerCase();
        const doctors = database.doctors.filter((doctor) => {
            const searchable = `${doctor.name} ${doctor.department} ${doctor.specialty}`.toLowerCase();
            return (!search || searchable.includes(search)) && (!specialty || doctor.specialty.toLowerCase().includes(specialty) || doctor.department.toLowerCase().includes(specialty));
        });
        return sendJson(response, 200, { doctors });
    }

    if (method === 'GET' && route === '/api/availability') {
        const doctorName = String(requestUrl.searchParams.get('doctor') || '').trim().toLowerCase();
        const date = String(requestUrl.searchParams.get('date') || '').trim();
        const doctor = database.doctors.find((item) => item.name.toLowerCase() === doctorName || `${item.name} - ${item.department}`.toLowerCase() === doctorName);
        if (!doctor) return sendError(response, 404, 'Doctor not found.');
        const bookedTimes = database.appointments.filter((item) => item.doctor.toLowerCase() === `${doctor.name} - ${doctor.department}`.toLowerCase() && item.date === date && ['Pending', 'Confirmed'].includes(item.status)).map((item) => item.time);
        return sendJson(response, 200, { doctor, date, bookedTimes, available: bookedTimes.length < 20 });
    }

    if (method === 'GET' && route === '/api/navigation') {
        const query = String(requestUrl.searchParams.get('q') || '').trim().toLowerCase();
        const services = [
            { name: 'Appointments', link: '/appointments.html', keywords: 'book schedule visit' },
            { name: 'Diagnostics', link: '/diagnostics.html', keywords: 'lab report test results' },
            { name: 'Health resources', link: '/health-resources.html', keywords: 'education prevention wellness' },
            { name: 'Emergency guidance', link: '/emergency.html', keywords: 'urgent emergency help' }
        ];
        const departments = [...new Set(database.doctors.map((doctor) => doctor.department))];
        const doctors = database.doctors.filter((doctor) => !query || `${doctor.name} ${doctor.department} ${doctor.specialty}`.toLowerCase().includes(query));
        const matchingServices = services.filter((service) => !query || `${service.name} ${service.keywords}`.toLowerCase().includes(query));
        const faqs = VERIFIED_FAQS.filter((faq) => !query || `${faq.question} ${faq.answer}`.toLowerCase().includes(query));
        addAuditLog(database, request, 'navigation_search', 'verified_navigation', query || 'all', 'public');
        await writeDatabase(database);
        return sendJson(response, 200, { departments, doctors, services: matchingServices, faqs, disclaimer: 'Navigation information is not diagnosis or treatment advice.' });
    }

    if (method === 'GET' && route === '/api/notifications') {
        const session = getAuthenticatedRoleSession(request, 'patient');
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Patient account not found.');
        return sendJson(response, 200, { notifications: (database.notifications || []).filter((item) => item.patientEmail === user.email) });
    }

    const notificationMatch = route.match(/^\/api\/notifications\/([^/]+)\/read$/);
    if (method === 'PUT' && notificationMatch) {
        const session = getAuthenticatedRoleSession(request, 'patient');
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        const notification = (database.notifications || []).find((item) => item.id === notificationMatch[1] && item.patientEmail === user?.email);
        if (!notification) return sendError(response, 404, 'Notification not found.');
        notification.isRead = true;
        addAuditLog(database, request, 'notification_read', 'notification', notification.id, user.email);
        await writeDatabase(database);
        return sendJson(response, 200, { notification });
    }

    if (method === 'GET' && route === '/api/patient/dashboard') {
        const session = getAuthenticatedRoleSession(request, 'patient');
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Patient account not found.');

        const patientEmail = user.email;
        const upcomingAppointments = database.appointments
            .filter((item) => item.patient === patientEmail && ['Pending', 'Confirmed'].includes(item.status))
            .sort((a, b) => new Date(a.date) - new Date(b.date));
        const appointmentHistory = database.appointments
            .filter((item) => item.patient === patientEmail)
            .sort((a, b) => new Date(b.date) - new Date(a.date));
        const consultations = database.doctors.map((doctor) => ({
            id: doctor.id,
            doctor: doctor.name,
            department: doctor.department,
            specialty: doctor.specialty,
            nextSlot: doctor.availability,
            fee: doctor.fee
        })).slice(0, 3);
        const medicalRecords = (database.medicalRecords || []).filter((record) => record.patientEmail === patientEmail);
        const labReports = (database.labReports || []).filter((report) => report.patientEmail === patientEmail);
        const prescriptions = (database.prescriptions || []).filter((prescription) => prescription.patientEmail === patientEmail);
        const notifications = (database.notifications || []).filter((notification) => notification.patientEmail === patientEmail).slice(0, 5);

        return sendJson(response, 200, {
            dashboard: {
                user: publicUser(user),
                upcomingAppointments,
                appointmentHistory,
                consultations,
                medicalRecords,
                labReports,
                prescriptions,
                notifications,
                healthResources: [
                    { title: 'Preventive care', link: '/health-resources.html' },
                    { title: 'Telemedicine', link: '/telemedicine.html' },
                    { title: 'Diagnostics', link: '/diagnostics.html' }
                ],
                support: [{ title: 'Contact care team', link: '/contact.html' }, { title: 'Emergency guidance', link: '/emergency.html' }]
            }
        });
    }

    if (route === '/api/doctor/dashboard' && method === 'GET') {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');

        const doctorAppointments = database.appointments.filter(doctorContext.ownsAppointment);
        const patientEmails = getDoctorPatientEmails(database, doctorContext);
        const patients = database.users
            .filter((user) => user.role === 'patient' && patientEmails.has(sanitizeEmail(user.email)))
            .map(publicUser);
        const today = new Date().toISOString().slice(0, 10);
        const patientDetails = patients.map((patient) => ({
            ...patient,
            appointments: doctorAppointments.filter((item) => sanitizeEmail(item.patient) === sanitizeEmail(patient.email)),
            records: (database.medicalRecords || []).filter((item) => item.patientEmail === patient.email && doctorContext.doctorNames.has(String(item.doctor || '').split(' - ')[0].trim().toLowerCase())),
            prescriptions: (database.prescriptions || []).filter((item) => item.patientEmail === patient.email && doctorContext.doctorNames.has(String(item.doctor || '').split(' - ')[0].trim().toLowerCase()))
        }));

        return sendJson(response, 200, {
            dashboard: {
                user: publicUser(doctorContext.user),
                doctor: doctorContext.doctor,
                todayAppointments: doctorAppointments.filter((item) => item.date === today),
                upcomingAppointments: doctorAppointments.filter((item) => item.date >= today && item.status !== 'Cancelled').sort((a, b) => new Date(a.date) - new Date(b.date)),
                patientList: patients,
                patientDetails,
                authorizedLabReports: (database.labReports || []).filter((report) => patientEmails.has(sanitizeEmail(report.patientEmail))),
                consultationNotes: (database.medicalRecords || []).filter((record) => doctorContext.doctorNames.has(String(record.doctor || '').split(' - ')[0].trim().toLowerCase())),
                availability: doctorContext.doctor?.availability || 'Contact administration to set availability',
                unreadMessages: database.messages.filter((message) => message.doctorEmail === doctorContext.user.email && !message.isRead).length
            }
        });
    }

    const doctorAppointmentMatch = route.match(/^\/api\/doctor\/appointments\/([^/]+)\/status$/);
    if (method === 'PUT' && doctorAppointmentMatch) {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');
        const status = String(body.status || '').trim();
        if (!VALID_STATUS.includes(status)) return sendError(response, 400, 'Invalid appointment status.');
        const appointment = database.appointments.find((item) => item.id === doctorAppointmentMatch[1] && doctorContext.ownsAppointment(item));
        if (!appointment) return sendError(response, 403, 'You are not authorized to update this appointment.');
        appointment.status = status;
        appointment.updatedAt = new Date().toISOString();
        addNotification(database, appointment.patient, `Appointment ${status.toLowerCase()}`, `${appointment.doctor} on ${appointment.date} at ${appointment.time}.`, status.toLowerCase());
        addAuditLog(database, request, 'appointment_status_updated', 'appointment', appointment.id, doctorContext.user.email);
        await writeDatabase(database);
        return sendJson(response, 200, { appointment });
    }

    const doctorNoteMatch = route.match(/^\/api\/doctor\/appointments\/([^/]+)\/notes$/);
    if (method === 'POST' && doctorNoteMatch) {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');
        const appointment = database.appointments.find((item) => item.id === doctorNoteMatch[1] && doctorContext.ownsAppointment(item));
        if (!appointment) return sendError(response, 403, 'You are not authorized to add notes for this appointment.');
        const summary = String(body.summary || '').trim();
        if (!summary) return sendError(response, 400, 'Consultation notes are required.');
        const note = {
            id: crypto.randomUUID(),
            patientEmail: sanitizeEmail(appointment.patient),
            title: String(body.title || 'Consultation note').trim(),
            summary,
            date: appointment.date,
            doctor: doctorContext.user.name,
            accessLevel: 'authorized',
            createdAt: new Date().toISOString()
        };
        database.medicalRecords.push(note);
        addAuditLog(database, request, 'consultation_note_created', 'medical_record', note.id, doctorContext.user.email);
        await writeDatabase(database);
        return sendJson(response, 201, { note });
    }

    const doctorPrescriptionMatch = route.match(/^\/api\/doctor\/appointments\/([^/]+)\/prescriptions$/);
    if (method === 'POST' && doctorPrescriptionMatch) {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');
        const appointment = database.appointments.find((item) => item.id === doctorPrescriptionMatch[1] && doctorContext.ownsAppointment(item));
        if (!appointment) return sendError(response, 403, 'You are not authorized to prescribe for this appointment.');
        const prescription = {
            id: crypto.randomUUID(),
            patientEmail: sanitizeEmail(appointment.patient),
            medication: String(body.medication || '').trim(),
            dosage: String(body.dosage || '').trim(),
            instructions: String(body.instructions || '').trim(),
            doctor: doctorContext.user.name,
            date: appointment.date,
            createdAt: new Date().toISOString()
        };
        if (!prescription.medication || !prescription.dosage || !prescription.instructions) return sendError(response, 400, 'Complete all prescription fields.');
        database.prescriptions.push(prescription);
        addAuditLog(database, request, 'prescription_created', 'prescription', prescription.id, doctorContext.user.email);
        await writeDatabase(database);
        return sendJson(response, 201, { prescription });
    }

    const doctorPatientMatch = route.match(/^\/api\/doctor\/patients\/([^/]+)$/);
    if (method === 'GET' && doctorPatientMatch) {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');
        const patientEmail = sanitizeEmail(decodeURIComponent(doctorPatientMatch[1]));
        const patientEmails = getDoctorPatientEmails(database, doctorContext);
        if (!patientEmails.has(patientEmail)) return sendError(response, 403, 'You are not authorized to view this patient.');
        const patient = database.users.find((user) => sanitizeEmail(user.email) === patientEmail && user.role === 'patient');
        if (!patient) return sendError(response, 404, 'Patient not found.');
        addAuditLog(database, request, 'patient_record_viewed', 'patient', patientEmail, doctorContext.user.email);
        await writeDatabase(database);
        return sendJson(response, 200, {
            patient: publicUser(patient),
            appointments: database.appointments.filter((item) => sanitizeEmail(item.patient) === patientEmail && doctorContext.ownsAppointment(item)),
            records: (database.medicalRecords || []).filter((item) => item.patientEmail === patientEmail && doctorContext.doctorNames.has(String(item.doctor || '').split(' - ')[0].trim().toLowerCase())),
            prescriptions: (database.prescriptions || []).filter((item) => item.patientEmail === patientEmail && doctorContext.doctorNames.has(String(item.doctor || '').split(' - ')[0].trim().toLowerCase())),
            labReports: (database.labReports || []).filter((item) => item.patientEmail === patientEmail)
        });
    }

    if (method === 'PUT' && route === '/api/doctor/availability') {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');
        const availability = String(body.availability || '').trim();
        if (!availability) return sendError(response, 400, 'Availability is required.');
        if (!doctorContext.doctor) return sendError(response, 404, 'Doctor profile not found.');
        doctorContext.doctor.availability = availability;
        await writeDatabase(database);
        return sendJson(response, 200, { availability });
    }

    if (method === 'PUT' && route === '/api/doctor/profile') {
        const doctorContext = getAuthorizedDoctorContext(request, database);
        if (!doctorContext) return sendError(response, 401, 'Doctor authentication is required.');
        const previousName = doctorContext.user.name;
        doctorContext.user.name = String(body.name || doctorContext.user.name).trim();
        doctorContext.user.phone = String(body.phone || doctorContext.user.phone || '').trim();
        doctorContext.user.age = Number(body.age || doctorContext.user.age);
        if (!doctorContext.user.name || !Number.isInteger(doctorContext.user.age) || doctorContext.user.age < 18) return sendError(response, 400, 'Complete the doctor profile fields.');
        if (doctorContext.doctor && doctorContext.doctor.name.toLowerCase() === previousName.toLowerCase()) doctorContext.doctor.name = doctorContext.user.name;
        await writeDatabase(database);
        return sendJson(response, 200, { user: publicUser(doctorContext.user) });
    }

    if (method === 'GET' && route === '/api/patient/appointments') {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Patient account not found.');
        const appointments = database.appointments.filter((item) => item.patient === user.email);
        return sendJson(response, 200, { appointments });
    }

    if (method === 'POST' && route === '/api/patient/appointments') {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Patient account not found.');
        const appointment = {
            id: crypto.randomUUID(),
            doctor: String(body.doctor || '').trim(),
            date: String(body.date || '').trim(),
            time: String(body.time || '').trim(),
            reason: String(body.reason || '').trim(),
            patient: user.email,
            status: 'Pending',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
        };
        if (!appointment.doctor || !appointment.date || !appointment.time || !appointment.reason) {
            return sendError(response, 400, 'Complete all appointment fields.');
        }
        database.appointments.push(appointment);
        await writeDatabase(database);
        return sendJson(response, 201, { appointment });
    }

    const patientAppointmentMatch = route.match(/^\/api\/patient\/appointments\/([^/]+)\/cancel$/);
    if (method === 'POST' && patientAppointmentMatch) {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Patient account not found.');
        const appointment = database.appointments.find((item) => item.id === patientAppointmentMatch[1] && item.patient === user.email);
        if (!appointment) return sendError(response, 404, 'Appointment not found.');
        appointment.status = 'Cancelled';
        appointment.updatedAt = new Date().toISOString();
        await writeDatabase(database);
        return sendJson(response, 200, { appointment });
    }

    const patientRescheduleMatch = route.match(/^\/api\/patient\/appointments\/([^/]+)\/reschedule$/);
    if (method === 'PUT' && patientRescheduleMatch) {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Patient authentication is required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Patient account not found.');
        const appointment = database.appointments.find((item) => item.id === patientRescheduleMatch[1] && item.patient === user.email);
        if (!appointment) return sendError(response, 404, 'Appointment not found.');
        appointment.date = String(body.date || appointment.date).trim();
        appointment.time = String(body.time || appointment.time).trim();
        appointment.updatedAt = new Date().toISOString();
        await writeDatabase(database);
        return sendJson(response, 200, { appointment });
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

    if (method === 'POST' && route === '/api/auth/register') {
        const name = String(body.name || '').trim();
        const email = sanitizeEmail(body.email);
        const phone = String(body.phone || '').trim();
        const age = Number(body.age);
        const password = String(body.password || '');
        const role = sanitizeRole(body.role);

        if (!name || !email || !/^\d{10}$/.test(phone) || !Number.isInteger(age) || age < 1 || age > 120 || !isStrongPassword(password)) {
            return sendError(response, 400, 'Enter valid details. Use a strong password with at least 8 characters, one uppercase, one number, and one symbol.');
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
            role,
            password: hashPassword(password),
            emailVerified: false,
            createdAt: new Date().toISOString()
        };

        database.users.push(user);
        await writeDatabase(database);

        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionData = { userId: user.id, email: user.email, role, createdAt: Date.now() };
        authSessions.set(sessionToken, sessionData);
        patientSessions.set(sessionToken, sessionData);
        setSessionCookie(response, 'medicare_session', sessionToken, 60 * 60 * 24 * 7);

        return sendJson(response, 201, { user: publicUser(user), message: 'Registration successful.' });
    }

    if (method === 'POST' && route === '/api/register') {
        return handleApi({ ...request, url: '/api/auth/register' }, response, new URL('/api/auth/register', `http://${request.headers.host || 'localhost'}`));
    }

    if (method === 'POST' && route === '/api/auth/login') {
        const email = sanitizeEmail(body.email);
        const password = String(body.password || '');
        const rateKey = loginRateKey(request, email, 'auth');
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

        const sessionToken = crypto.randomBytes(32).toString('hex');
        const sessionData = { userId: user.id, email: user.email, role: user.role || 'patient', createdAt: Date.now() };
        authSessions.set(sessionToken, sessionData);
        patientSessions.set(sessionToken, sessionData);
        setSessionCookie(response, 'medicare_session', sessionToken, 60 * 60 * 24 * 7);

        return sendJson(response, 200, { user: { ...publicUser(user), role: user.role || 'patient' }, message: 'Login successful.' });
    }

    if (method === 'POST' && route === '/api/login') {
        return handleApi({ ...request, url: '/api/auth/login' }, response, new URL('/api/auth/login', `http://${request.headers.host || 'localhost'}`));
    }

    if (method === 'POST' && route === '/api/auth/logout') {
        const cookies = getRequestCookies(request);
        const token = cookies.medicare_session || '';
        if (token) {
            authSessions.delete(token);
            patientSessions.delete(token);
        }
        const adminToken = cookies.medicare_admin_session || '';
        if (adminToken) adminSessions.delete(adminToken);
        response.setHeader('Set-Cookie', [
            'medicare_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0',
            'medicare_admin_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0'
        ]);
        return sendJson(response, 200, { message: 'Logged out successfully.' });
    }

    if (method === 'GET' && route === '/api/auth/profile') {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Authentication required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Account not found.');
        return sendJson(response, 200, { user: publicUser(user) });
    }

    if (method === 'PUT' && route === '/api/auth/profile') {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Authentication required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Account not found.');

        const nextName = String(body.name || user.name).trim();
        const nextPhone = String(body.phone || user.phone).trim();
        const nextAge = Number(body.age ?? user.age);
        const nextRole = sanitizeRole(body.role || user.role || 'patient');

        if (!nextName || !/^\d{10}$/.test(nextPhone) || !Number.isInteger(nextAge) || nextAge < 1 || nextAge > 120) {
            return sendError(response, 400, 'Complete valid profile information.');
        }

        user.name = nextName;
        user.phone = nextPhone;
        user.age = nextAge;
        user.role = nextRole;

        if (body.newPassword) {
            const currentPassword = String(body.currentPassword || '');
            if (!passwordMatches(currentPassword, user.password)) {
                return sendError(response, 400, 'Current password is incorrect.');
            }
            if (!isStrongPassword(body.newPassword)) {
                return sendError(response, 400, 'New password must include uppercase, number, and symbol.');
            }
            user.password = hashPassword(String(body.newPassword));
        }

        await writeDatabase(database);
        return sendJson(response, 200, { user: publicUser(user), message: 'Profile updated successfully.' });
    }

    if (method === 'POST' && route === '/api/auth/forgot-password') {
        const email = sanitizeEmail(body.email);
        if (!email) return sendError(response, 400, 'Email is required.');
        const user = database.users.find((item) => item.email === email);
        if (!user) {
            return sendJson(response, 200, { message: 'If the account exists, a password reset link has been generated.' });
        }
        const token = crypto.randomBytes(24).toString('hex');
        passwordResetTokens.set(token, { userId: user.id, expiresAt: Date.now() + 60 * 60 * 1000 });
        return sendJson(response, 200, { message: 'If the account exists, a password reset link has been generated.' });
    }

    if (method === 'POST' && route === '/api/auth/reset-password') {
        const token = String(body.token || '').trim();
        const password = String(body.password || '');
        if (!token || !isStrongPassword(password)) {
            return sendError(response, 400, 'A valid reset token and a strong password are required.');
        }
        const resetRequest = passwordResetTokens.get(token);
        if (!resetRequest || resetRequest.expiresAt < Date.now()) {
            return sendError(response, 400, 'This reset link is invalid or expired.');
        }
        const user = database.users.find((item) => item.id === resetRequest.userId);
        if (!user) return sendError(response, 404, 'User not found.');
        user.password = hashPassword(password);
        passwordResetTokens.delete(token);
        await writeDatabase(database);
        return sendJson(response, 200, { message: 'Password reset successful.' });
    }

    if (method === 'POST' && route === '/api/auth/verify-email') {
        const token = String(body.token || '').trim();
        if (!token) return sendError(response, 400, 'Verification token is required.');
        const verification = emailVerificationTokens.get(token);
        if (!verification || verification.expiresAt < Date.now()) {
            return sendError(response, 400, 'This verification link is invalid or expired.');
        }
        const user = database.users.find((item) => item.id === verification.userId);
        if (!user) return sendError(response, 404, 'Account not found.');
        user.emailVerified = true;
        emailVerificationTokens.delete(token);
        await writeDatabase(database);
        return sendJson(response, 200, { user: publicUser(user), message: 'Email verified successfully.' });
    }

    if (method === 'POST' && route === '/api/auth/send-verification') {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Authentication required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Account not found.');
        const token = crypto.randomBytes(20).toString('hex');
        emailVerificationTokens.set(token, { userId: user.id, expiresAt: Date.now() + 24 * 60 * 60 * 1000 });
        return sendJson(response, 200, { message: 'Verification email generated.' });
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
        setSessionCookie(response, 'medicare_admin_session', token, 60 * 60 * 8);
        return sendJson(response, 200, { user: publicAdmin(admin), token });
    }

    if (method === 'GET' && route === '/api/auth/validate') {
        const session = getAuthenticatedUserSession(request);
        if (!session) return sendError(response, 401, 'Authentication required.');
        const user = database.users.find((item) => item.id === session.userId);
        if (!user) return sendError(response, 404, 'Account not found.');
        return sendJson(response, 200, { authenticated: true, user: publicUser(user) });
    }

    if (method === 'GET' && route === '/api/appointments') {
        const email = sanitizeEmail(requestUrl.searchParams.get('email'));
        const isAdmin = isAdminRequest(request);
        const session = getAuthenticatedUserSession(request);
        const isCurrentPatient = email ? isPatientRequest(request, email) : session?.role === 'patient';
        if (!isAdmin && !session) {
            return sendError(response, 401, 'Authentication required to view appointments.');
        }
        if (email && !isAdmin && !isCurrentPatient) {
            return sendError(response, 403, 'Patient session required to view this appointment list.');
        }
        if (!isAdmin && session.role === 'doctor') {
            const doctorContext = getAuthorizedDoctorContext(request, database);
            if (!doctorContext) return sendError(response, 403, 'Doctor authorization is required.');
            return sendJson(response, 200, { appointments: database.appointments.filter(doctorContext.ownsAppointment) });
        }
        return sendJson(response, 200, { appointments: database.appointments.filter((item) => isAdmin ? (!email || item.patient === email) : item.patient === session.email) });
    }

    if (method === 'POST' && route === '/api/appointments') {
        const existingSession = getRequestSession(request).patient;
        const requestedPatient = sanitizeEmail(body.patient);
        const isAdmin = isAdminRequest(request);
        if (!isAdmin && (!existingSession || existingSession.email !== requestedPatient)) {
            return sendError(response, 403, 'Patient session required to book an appointment for this account.');
        }
        const appointment = {
            id: crypto.randomUUID(),
            doctor: String(body.doctor || '').trim(),
            date: String(body.date || '').trim(),
            time: String(body.time || '').trim(),
            reason: String(body.reason || '').trim(),
            patient: requestedPatient,
            status: 'Pending',
            createdAt: new Date().toISOString()
        };

        const validDoctorNames = database.doctors.map((doctor) => `${doctor.name} - ${doctor.department}`);
        const appointmentDate = new Date(`${appointment.date}T00:00:00`);
        const today = new Date();
        today.setHours(0, 0, 0, 0);
        const validTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(appointment.time);
        if (!validDoctorNames.includes(appointment.doctor) || !appointment.date || Number.isNaN(appointmentDate.getTime()) || appointmentDate < today || !validTime || !appointment.reason || appointment.reason.length < 3 || !appointment.patient) {
            return sendError(response, 400, 'Complete all appointment fields.');
        }

        const hasConflict = database.appointments.some((item) => item.date === appointment.date && item.time === appointment.time && item.doctor === appointment.doctor && ['Pending', 'Confirmed'].includes(item.status));
        const patientConflict = database.appointments.some((item) => item.date === appointment.date && item.time === appointment.time && item.patient === appointment.patient && ['Pending', 'Confirmed'].includes(item.status));
        if (hasConflict || patientConflict) return sendError(response, 409, 'That appointment time is no longer available. Choose another time.');

        database.appointments.push(appointment);
        addNotification(database, appointment.patient, 'Appointment request received', `${appointment.doctor} on ${appointment.date} at ${appointment.time}.`, 'appointment');
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
        if (appointment.patient) addNotification(database, appointment.patient, `Appointment ${status.toLowerCase()}`, `${appointment.doctor} on ${appointment.date} at ${appointment.time}.`, status.toLowerCase());
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

function resolvePublicFilePath(requestedPath) {
    const normalizedPath = requestedPath === '/' ? '/index.html' : requestedPath;
    const withoutTrailingSlash = normalizedPath.endsWith('/') ? normalizedPath.slice(0, -1) : normalizedPath;

    if (path.extname(withoutTrailingSlash)) {
        return withoutTrailingSlash;
    }

    const aliasCandidates = [
        `${withoutTrailingSlash}.html`,
        `${withoutTrailingSlash}/index.html`,
        `${withoutTrailingSlash}/.html`
    ];

    for (const candidate of aliasCandidates) {
        const resolvedPath = path.resolve(PUBLIC_DIR, `.${candidate}`);
        if (resolvedPath.startsWith(PUBLIC_DIR) && fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
            return candidate;
        }
    }

    if (/^\/doctors\//.test(withoutTrailingSlash)) {
        const detailPage = '/doctors-detail.html';
        const resolvedPath = path.resolve(PUBLIC_DIR, `.${detailPage}`);
        if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
            return detailPage;
        }
    }

    if (/^\/services\//.test(withoutTrailingSlash)) {
        const detailPage = '/services-detail.html';
        const resolvedPath = path.resolve(PUBLIC_DIR, `.${detailPage}`);
        if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
            return detailPage;
        }
    }

    if (/^\/patient(?:\/|$)/.test(withoutTrailingSlash)) {
        const patientDashboardPage = '/patient-dashboard.html';
        const resolvedPath = path.resolve(PUBLIC_DIR, `.${patientDashboardPage}`);
        if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
            return patientDashboardPage;
        }
    }

    if (/^\/doctor(?:\/|$)/.test(withoutTrailingSlash)) {
        const doctorDashboardPage = '/doctor-dashboard.html';
        const resolvedPath = path.resolve(PUBLIC_DIR, `.${doctorDashboardPage}`);
        if (fs.existsSync(resolvedPath) && !fs.statSync(resolvedPath).isDirectory()) {
            return doctorDashboardPage;
        }
    }

    return withoutTrailingSlash;
}

function serveStatic(request, response, requestUrl) {
    const requestedPath = requestUrl.pathname;
    const publicFilePath = resolvePublicFilePath(requestedPath);
    const filePath = path.resolve(PUBLIC_DIR, `.${publicFilePath}`);

    if (!filePath.startsWith(PUBLIC_DIR) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
        const fallback404 = path.resolve(PUBLIC_DIR, '404.html');
        if (fs.existsSync(fallback404) && !fs.statSync(fallback404).isDirectory()) {
            response.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
            return fs.createReadStream(fallback404).pipe(response);
        }
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
    response.setHeader('Cache-Control', requestUrl.pathname.startsWith('/api/') ? 'no-store' : 'no-cache');
    response.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com; img-src 'self' data: https:; font-src 'self' https://cdnjs.cloudflare.com; connect-src 'self'; object-src 'none'; base-uri 'self'; frame-ancestors 'none'");

    if (request.method === 'OPTIONS') {
        response.writeHead(204, {
            'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Authorization',
            'Access-Control-Allow-Origin': `http://${request.headers.host || 'localhost'}`
        });
        return response.end();
    }

    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method) && !isSameOriginRequest(request)) {
        return sendError(response, 403, 'Cross-origin state changes are not allowed.');
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
