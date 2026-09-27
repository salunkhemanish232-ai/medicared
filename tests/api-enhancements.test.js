const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { randomInt } = require('node:crypto');

const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: __dirname + '/..',
  env: { ...process.env, PORT: '9101', ADMIN_EMAIL: 'admin@tests.invalid', ADMIN_PASSWORD: 'TestAdmin123!' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProc.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
serverProc.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (serverOutput.includes('http://localhost:9101')) return;
  }
  throw new Error(`Server did not start. Output: ${serverOutput}`);
}

async function request(path, options = {}) {
  const response = await fetch(`http://localhost:9101${path}`, options);
  const contentType = response.headers.get('content-type') || '';
  const body = contentType.includes('application/json') ? await response.json() : await response.text();
  return { response, body };
}

(async () => {
  try {
    await waitForServer();

    const patientRegister = await request('/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Enhanced API User',
        email: `enhanced.${Date.now()}@example.com`,
        phone: '9876543210',
        age: 32,
        password: 'StrongPass123!'
      })
    });
    assert.equal(patientRegister.response.status, 201, 'Registration should work');

    const adminLogin = await request('/api/admin/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'admin@tests.invalid', password: 'TestAdmin123!' })
    });
    assert.equal(adminLogin.response.status, 200, 'Admin login should work');
    const adminCookie = adminLogin.response.headers.get('set-cookie')?.split(';')[0] || '';

    const doctors = await request('/api/doctors?department=Cardiology&limit=2&page=1');
    assert.equal(doctors.response.status, 200, 'Doctors endpoint should accept filtering and pagination');
    assert.ok(Array.isArray(doctors.body.doctors), 'Doctors response should include an array');
    assert.ok(Number.isInteger(doctors.body.page), 'Doctors response should include page metadata');
    assert.ok(Number.isInteger(doctors.body.limit), 'Doctors response should include limit metadata');
    assert.ok(doctors.body.doctors.length <= 2, 'Pagination limit should be applied');

    const appointmentDate = new Date(Date.UTC(2099, 0, 1 + randomInt(365)));
    const appointmentMinute = randomInt(24 * 60);
    const appointmentPayload = {
      doctor: 'Dr. Asha Mehta - Cardiology',
      date: appointmentDate.toISOString().slice(0, 10),
      time: `${String(Math.floor(appointmentMinute / 60)).padStart(2, '0')}:${String(appointmentMinute % 60).padStart(2, '0')}`,
      reason: 'Enhanced API checkup',
      patient: patientRegister.body.user.email
    };
    const patientLogin = await request('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: patientRegister.body.user.email, password: 'StrongPass123!' })
    });
    const patientCookie = patientLogin.response.headers.get('set-cookie')?.split(';')[0] || '';
    const createAppointment = await request('/api/appointments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: patientCookie },
      body: JSON.stringify(appointmentPayload)
    });
    assert.equal(createAppointment.response.status, 201, 'Patient booking should succeed');

    const appointmentList = await request(`/api/appointments?status=Pending&search=Enhanced&limit=10&page=1`, {
      headers: { Cookie: patientCookie }
    });
    assert.equal(appointmentList.response.status, 200, 'Appointments endpoint should support filters and pagination');
    assert.ok(Array.isArray(appointmentList.body.appointments), 'Appointments response should include a list');
    assert.ok(Number.isInteger(appointmentList.body.page), 'Appointments response should include page metadata');

    console.log('API ENHANCEMENTS TEST: PASS');
  } catch (error) {
    console.error('API ENHANCEMENTS TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();
