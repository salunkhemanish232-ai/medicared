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
        dateOfBirth: '1997-04-12',
        gender: 'female',
        address: 'Demo address',
        emergencyContact: 'Demo contact 9876543210',
        password: 'StrongPass123!',
        role: 'patient'
      })
    });

    const registerBody = await registerResponse.json();
    console.log('register status:', registerResponse.status, registerBody);
    assert.equal(registerResponse.status, 201, 'User registration should succeed');
    assert.equal(registerBody.user.email, email);
    assert.equal(registerBody.user.gender, 'female');
    assert.equal(registerBody.user.emergencyContact, 'Demo contact 9876543210');

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

    const labTestsResponse = await fetch('http://localhost:9099/api/lab-tests');
    const labTestsBody = await labTestsResponse.json();
    assert.equal(labTestsResponse.status, 200, 'Lab catalog should be available');
    assert.ok(labTestsBody.tests.length > 0, 'Lab catalog should contain tests');

    const labOrderResponse = await fetch('http://localhost:9099/api/patient/lab-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: setCookieHeader.split(';')[0] },
      body: JSON.stringify({ testId: labTestsBody.tests[0].id, date: '2099-12-15' })
    });
    const labOrderBody = await labOrderResponse.json();
    assert.equal(labOrderResponse.status, 201, 'Patient lab order should succeed');
    assert.equal(labOrderBody.report.patientEmail, email);

    const reportsResponse = await fetch('http://localhost:9099/api/patient/lab-reports', { headers: { Cookie: setCookieHeader.split(';')[0] } });
    const reportsBody = await reportsResponse.json();
    assert.equal(reportsResponse.status, 200, 'Patient lab reports should be private and available');
    assert.equal(reportsBody.reports.some((report) => report.id === labOrderBody.report.id), true);

    const integrationsResponse = await fetch('http://localhost:9099/api/integrations/status');
    assert.equal(integrationsResponse.status, 200, 'Integration status should be public and non-secret');

    console.log('AUTH SMOKE TEST: PASS');
  } catch (error) {
    console.error('AUTH SMOKE TEST: FAIL');
    console.error(error);
    process.exitCode = 1;
  } finally {
    serverProc.kill('SIGTERM');
  }
})();
