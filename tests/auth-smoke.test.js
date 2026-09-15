const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');

const serverProc = spawn(process.execPath, ['server.js'], {
  cwd: __dirname + '/..',
  env: { ...process.env, PORT: '9099' },
  stdio: ['ignore', 'pipe', 'pipe']
});

let serverOutput = '';
serverProc.stdout.on('data', (chunk) => { serverOutput += chunk.toString(); });
serverProc.stderr.on('data', (chunk) => { serverOutput += chunk.toString(); });

async function waitForServer() {
  for (let i = 0; i < 40; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    if (serverOutput.includes('http://localhost:9099')) return;
  }
  throw new Error(`Server did not start. Output: ${serverOutput}`);
}

(async () => {
  try {
    await waitForServer();

    const email = `auth.tester.${Date.now()}@example.com`;

    const registerResponse = await fetch('http://localhost:9099/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Auth Tester',
        email,
        phone: '9876543210',
        age: 29,
        password: 'StrongPass123!',
        role: 'patient'
      })
    });

    const registerBody = await registerResponse.json();
    console.log('register status:', registerResponse.status, registerBody);
    assert.equal(registerResponse.status, 201, 'User registration should succeed');
    assert.equal(registerBody.user.email, email);

    const loginResponse = await fetch('http://localhost:9099/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password: 'StrongPass123!'
      })
    });

    const loginBody = await loginResponse.json();
    console.log('login status:', loginResponse.status, loginBody);
    assert.equal(loginResponse.status, 200, 'User login should succeed');
    assert.equal(loginBody.user.email, email);

    const setCookieHeader = loginResponse.headers.get('set-cookie');
    assert.ok(setCookieHeader, 'Login should set a session cookie');

    const patientRouteResponse = await fetch('http://localhost:9099/patient/dashboard', { method: 'GET' });
    const patientRouteText = await patientRouteResponse.text();
    console.log('patient dashboard route status:', patientRouteResponse.status, patientRouteText.includes('Patient Portal') ? 'OK' : 'missing title');
    assert.equal(patientRouteResponse.status, 200, 'Patient dashboard route should resolve to the portal page');

    const profileResponse = await fetch('http://localhost:9099/api/auth/profile', {
      method: 'GET',
      headers: { Cookie: setCookieHeader.split(';')[0] }
    });

    const profileBody = await profileResponse.json();
    console.log('profile status:', profileResponse.status, profileBody);
    assert.equal(profileResponse.status, 200, 'Profile retrieval should work for a logged-in user');
    assert.equal(profileBody.user.email, email);

    console.log('AUTH SMOKE TEST: PASS');
  } catch (error) {
    console.error('AUTH SMOKE TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();
