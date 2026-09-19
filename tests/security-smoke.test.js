const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const serverProc = spawn(process.execPath, ['server.js'], { cwd: __dirname + '/..', env: { ...process.env, PORT: '9097' }, stdio: ['ignore', 'pipe', 'pipe'] });
let output = '';
serverProc.stdout.on('data', (chunk) => { output += chunk.toString(); });
serverProc.stderr.on('data', (chunk) => { output += chunk.toString(); });

async function waitForServer() {
  for (let index = 0; index < 40; index += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (output.includes('http://localhost:9097')) return;
  }
  throw new Error(`Server did not start: ${output}`);
}

async function request(path, options = {}) {
  const response = await fetch(`http://localhost:9097${path}`, options);
  return { response, body: await response.json().catch(() => ({})) };
}

(async () => {
  try {
    await waitForServer();
    const originAttack = await request('/api/appointments', { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' });
    assert.equal(originAttack.response.status, 403);

    const suffix = Date.now();
    const email = `security.${suffix}@example.com`;
    const password = 'StrongPass123!';
    const register = await request('/api/auth/register', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: 'Security Patient', email, phone: '9876543210', age: 31, password, role: 'admin' }) });
    assert.equal(register.response.status, 201);
    assert.equal(register.body.user.role, 'patient', 'Public registration must not provision elevated roles');
    const login = await request('/api/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    const cookie = login.response.headers.get('set-cookie').split(';')[0];
    const profileEscalation = await request('/api/auth/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json', Cookie: cookie }, body: JSON.stringify({ name: 'Security Patient', phone: '9876543210', age: 31, role: 'doctor' }) });
    assert.equal(profileEscalation.response.status, 200);
    assert.equal(profileEscalation.body.user.role, 'patient', 'Profile updates must not change account roles');
    const reset = await request('/api/auth/forgot-password', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email }) });
    assert.equal(reset.response.status, 200);
    assert.equal(Object.prototype.hasOwnProperty.call(reset.body, 'resetToken'), false);
    const appointments = await request('/api/appointments?email=someone-else@example.com', { headers: { Cookie: cookie } });
    assert.equal(appointments.response.status, 403);
    console.log('SECURITY SMOKE TEST: PASS');
  } catch (error) {
    console.error('SECURITY SMOKE TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();
