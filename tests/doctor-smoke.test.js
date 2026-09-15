const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: __dirname + '/..',
  env: { ...process.env, PORT: '9098' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProc.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
serverProc.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let index = 0; index < 40; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (serverOutput.includes('http://localhost:9098')) return;
  }
  throw new Error(`Server did not start. Output: ${serverOutput}`);
}

async function request(path, options = {}) {
  const response = await fetch(`http://localhost:9098${path}`, options);
  const body = await response.json();
  return { response, body, cookie: response.headers.get('set-cookie')?.split(';')[0] };
}

(async () => {
  try {
    await waitForServer();
    const suffix = Date.now();
    const password = 'StrongPass123!';
    const patientEmail = `doctor.portal.patient.${suffix}@example.com`;
    const doctorEmail = `doctor.portal.assigned.${suffix}@example.com`;
    const otherDoctorEmail = `doctor.portal.other.${suffix}@example.com`;
    const appointmentDate = `2099-01-${String((suffix % 20) + 10).padStart(2, '0')}`;
    const appointmentTime = `${String((suffix % 8) + 9).padStart(2, '0')}:${String((suffix % 6) * 10).padStart(2, '0')}`;
    const register = (name, email, role) => request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, email, phone: '9876543210', age: 38, password, role }) });
    await register('Doctor Portal Patient', patientEmail, 'patient');
    await register('Dr. Asha Mehta', doctorEmail, 'doctor');
    await register('Dr. Rohan Kapoor', otherDoctorEmail, 'doctor');

    const patientLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: patientEmail, password }) });
    const patientCookie = patientLogin.cookie;
    const appointment = await request('/api/appointments', { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: patientCookie }, body: JSON.stringify({ doctor: 'Dr. Asha Mehta - Cardiology', date: appointmentDate, time: appointmentTime, reason: 'Follow-up consultation', patient: patientEmail }) });
    assert.equal(appointment.response.status, 201);

    const doctorLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: doctorEmail, password }) });
    const dashboard = await request('/api/doctor/dashboard', { headers: { Cookie: doctorLogin.cookie } });
    assert.equal(dashboard.response.status, 200);
    assert.equal(dashboard.body.dashboard.patientList.some((patient) => patient.email === patientEmail), true);

    const assignedStatus = await request(`/api/doctor/appointments/${appointment.body.appointment.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: doctorLogin.cookie }, body: JSON.stringify({ status: 'Confirmed' }) });
    assert.equal(assignedStatus.response.status, 200);

    const otherLogin = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: otherDoctorEmail, password }) });
    const otherStatus = await request(`/api/doctor/appointments/${appointment.body.appointment.id}/status`, { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: otherLogin.cookie }, body: JSON.stringify({ status: 'Cancelled' }) });
    assert.equal(otherStatus.response.status, 403);
    const otherPatient = await request(`/api/doctor/patients/${encodeURIComponent(patientEmail)}`, { headers: { Cookie: otherLogin.cookie } });
    assert.equal(otherPatient.response.status, 403);

    console.log('DOCTOR AUTHORIZATION SMOKE TEST: PASS');
  } catch (error) {
    console.error('DOCTOR AUTHORIZATION SMOKE TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();
